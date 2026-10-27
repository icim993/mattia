/* Il libro di Mattia · funzionalità comuni · nessuna credenziale segreta nel frontend. */
(function (global) {
  'use strict';
  const cfg = global.MATTIA_CONFIG || {};
  function sessionFetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET';
    if (method.toUpperCase() === 'GET' && url.origin === new URL(cfg.url).origin &&
        /^\/storage\/v1\/(?:object|render\/image)\/authenticated\//.test(url.pathname)) {
      url.searchParams.set('cacheNonce', global.crypto.randomUUID());
      const request = typeof input === 'string' ? url.href : new Request(url.href, input);
      return global.fetch(request, { ...init, cache: 'no-store' });
    }
    return global.fetch(input, init);
  }
  const configured = !!(cfg.url && cfg.anonKey && !cfg.url.includes('__SUPABASE_') && !cfg.anonKey.includes('__SUPABASE_'));
  const sb = configured && global.supabase ? global.supabase.createClient(cfg.url, cfg.anonKey, {
    global: { fetch: sessionFetch },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'mattia-family-book-session' }
  }) : null;
  const $ = (id) => document.getElementById(id);
  const bookBase = new URL(document.querySelector('meta[name="book-base"]')?.content || './', location.href);
  const mediaCache = new Map();
  const mediaPromises = new Map();
  let mediaVersion = 0;
  const ctx = { sb, bookBase, user: null, role: null, signedInEmail: null, accessVersion:0 };

  function node(tag, className, content) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (content !== undefined && content !== null) e.textContent = String(content);
    return e;
  }
  function empty(element) { if (element) element.replaceChildren(); }
  function status(id, message, kind) {
    const e = $(id); if (!e) return;
    e.textContent = message || '';
    e.classList.remove('ok', 'error');
    if (kind) e.classList.add(kind);
  }
  function readableError(error) { return (error && typeof error.message === 'string') ? error.message : 'Operazione non riuscita. Riprova.'; }
  function fmtDate(date) {
    if (!date) return '';
    const [year, month, day] = String(date).split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? String(date) : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function closeMedia() {
    const box = $('lightbox');
    if (box) { box.hidden = true; empty($('lightbox-media')); document.body.style.overflow = ''; }
  }
  function revokeMedia() {
    ++mediaVersion;
    closeMedia();
    for (const url of mediaCache.values()) URL.revokeObjectURL(url);
    mediaCache.clear(); mediaPromises.clear();
  }
  async function secureMediaUrl(storagePath) {
    if (mediaCache.has(storagePath)) return mediaCache.get(storagePath);
    if (mediaPromises.has(storagePath)) return mediaPromises.get(storagePath);
    if (!sb || !ctx.role) throw new Error('Accesso privato non disponibile.');
    const version=mediaVersion;
    const promise = (async () => {
      const { data, error } = await sb.storage.from('mattia-album').download(storagePath);
      if (error) throw error;
      if (version !== mediaVersion || !ctx.role) throw new Error('Sessione cambiata.');
      const url = URL.createObjectURL(data);
      mediaCache.set(storagePath, url);
      return url;
    })();
    mediaPromises.set(storagePath, promise);
    try { return await promise; } finally { if(mediaPromises.get(storagePath)===promise) mediaPromises.delete(storagePath); }
  }
  async function openLightbox(mediaList) {
    const box = $('lightbox'), target = $('lightbox-media');
    if (!box || !target || !mediaList.length) return;
    empty(target); box.hidden = false; document.body.style.overflow = 'hidden';
    for (const item of mediaList) {
      const tile = node('div', 'media-tile');
      const wait = node('span', '', 'Caricamento…'); tile.appendChild(wait); target.appendChild(tile);
      try {
        const url = await secureMediaUrl(item.storage_path);
        const visual = item.media_kind === 'video' ? node('video') : node('img');
        visual.src = url;
        if (item.media_kind === 'video') { visual.controls = true; visual.preload = 'metadata'; }
        else visual.alt = 'Fotografia del ricordo';
        wait.remove(); tile.appendChild(visual);
      } catch (error) { wait.textContent = 'Non è stato possibile caricare il file.'; }
    }
  }

  function showArea(area) {
    if (area !== 'private-content') {
      handler?.onAccessCleared?.();
      document.dispatchEvent(new CustomEvent('mattia:access-cleared'));
    }
    for (const id of ['gate','denied','private-content']) {
      const el = $(id); if (el) el.hidden = id !== area;
    }
    const logout = $('logout-button'); if (logout) logout.hidden = area === 'gate';
    const admin = $('admin-link'); if (admin) admin.hidden = !(area === 'private-content' && ['owner','contributor'].includes(ctx.role));
  }
  async function signOut() {
    ++refreshCounter;
    ++ctx.accessVersion;
    ctx.user = null; ctx.role = null; revokeMedia(); showArea('gate');
    if (sb) await sb.auth.signOut();
    status('auth-message', 'Hai effettuato la disconnessione.', 'ok');
  }
  function setupLogin() {
    const form = $('login-form'), codeForm = $('code-form');
    form?.addEventListener('submit', async function (event) {
      event.preventDefault();
      const email = $('login-email').value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return status('auth-message','Inserisci un indirizzo email valido.','error');
      if (!sb) return status('auth-message','Configurazione del sito da completare.','error');
      const button = $('login-submit'); button.disabled = true;
      status('auth-message','Invio del link in corso…');
      try {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: bookBase.href, shouldCreateUser: true } });
        if (error) throw error;
        status('auth-message','Controlla la tua email: riceverai un link personale. Se la tua email usa un codice, inseriscilo qui sotto.','ok');
      } catch (error) { status('auth-message',readableError(error),'error'); }
      finally { button.disabled = false; }
    });
    codeForm?.addEventListener('submit', async function (event) {
      event.preventDefault();
      const email = $('login-email').value.trim().toLowerCase(), token = $('login-code').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(token)) return status('auth-message','Inserisci email e codice di 6 cifre.','error');
      const button = $('code-submit'); button.disabled = true;
      try {
        const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
        if (error) throw error;
        await refresh();
      } catch (error) { status('auth-message',readableError(error),'error'); }
      finally { button.disabled = false; }
    });
    $('google-login')?.addEventListener('click', async () => {
      if (!sb) return status('auth-message','Configurazione da completare.','error');
      const button = $('google-login'); button.disabled = true;
      try {
        const {error} = await sb.auth.signInWithOAuth({ provider:'google', options:{redirectTo:bookBase.href} });
        if (error) throw error;
      } catch(error) { status('auth-message','Accesso Google non disponibile: verifica che sia attivo in Supabase. '+readableError(error),'error'); button.disabled=false; }
    });
    $('password-form')?.addEventListener('submit',async event => {
      event.preventDefault();
      const email = $('password-email').value.trim().toLowerCase(), password = $('password-value').value;
      if (!email || !password) return status('auth-message','Inserisci email e password personale.','error');
      if (!sb) return status('auth-message','Configurazione da completare.','error');
      const button = $('password-submit'); button.disabled=true;
      try {
        const {error} = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        $('password-value').value = '';
        await refresh();
      } catch(error) { status('auth-message',readableError(error),'error'); }
      finally { button.disabled=false; }
    });
    $('logout-button')?.addEventListener('click',signOut);
    $('denied-logout')?.addEventListener('click',signOut);
  }

  let handler = null;
  let refreshCounter = 0;
  async function refresh() {
    const thisRun = ++refreshCounter;
    ++ctx.accessVersion;
    revokeMedia(); ctx.user=null; ctx.role=null; showArea('gate');
    if (!sb) { showArea('gate'); status('auth-message','Configurazione non ancora attivata: esegui apply_to_repo.py.','error'); return; }
    try {
      const sessionResult = await sb.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      if (thisRun !== refreshCounter) return;
      if (!sessionResult.data.session) {
        revokeMedia(); ctx.user = null; ctx.role = null; showArea('gate'); return;
      }
      const { data: { user }, error } = await sb.auth.getUser();
      if (error) throw error;
      if (thisRun !== refreshCounter) return;
      revokeMedia(); ctx.user = null; ctx.role = null;
      if (!user) { showArea('gate'); return; }
      const r = await sb.rpc('album_role');
      if (r.error) throw r.error;
      if (thisRun !== refreshCounter) return;
      ctx.user = user; ctx.role = r.data || null; ctx.signedInEmail = user.email || '';
      if (!ctx.role || (handler?.requiresEditor && !['owner','contributor'].includes(ctx.role))) {
        showArea('denied'); if ($('denied-email')) $('denied-email').textContent = ctx.signedInEmail;
        return;
      }
      if ($('welcome-name')) $('welcome-name').textContent = (ctx.role === 'owner' ? 'Marco e Angela' : 'Ciao') ;
      if ($('role-label')) $('role-label').textContent = ctx.role === 'owner' ? 'Genitore' : ctx.role === 'contributor' ? 'Collaboratore' : 'Famiglia';
      showArea('private-content');
      document.dispatchEvent(new CustomEvent('mattia:authorized'));
      if (handler?.onAuthorized) await handler.onAuthorized({ ...ctx });
    } catch (error) {
      if (thisRun !== refreshCounter) return;
      ctx.user = null; ctx.role = null; revokeMedia();
      console.error('Errore accesso album',error);
      showArea('gate'); status('auth-message','Impossibile verificare l’accesso. Controlla il database e riprova.','error');
    }
  }
  function start(options) {
    handler = options || {};
    setupLogin(); showArea('gate');
    if (sb) sb.auth.onAuthStateChange(() => { global.setTimeout(refresh, 0); });
    refresh();
    $('lightbox-close')?.addEventListener('click',closeMedia);
    $('lightbox')?.addEventListener('click', (event) => { if (event.target.id === 'lightbox') closeMedia(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMedia(); });
  }
  global.Mattia = { ...ctx, ctx, sb, $, node, empty, status, fmtDate, readableError, secureMediaUrl, openLightbox, revokeMedia, start, refresh, bookBase };
})(window);
