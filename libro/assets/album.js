/* Lettura interattiva del libro: tutti i dati provengono da Supabase con RLS. */
(function () {
  'use strict';
  const M = window.Mattia, $ = M.$, n = M.node;
  const state = { chapters: [], memories: [], media: [], guestbook: [], selectedChapter: null, pageIndex: 0 };
  const lazyObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      lazyObserver.unobserve(entry.target);
      const img = entry.target, path = img.dataset.path;
      M.secureMediaUrl(path).then(url => { if (img.isConnected) img.src = url; })
        .catch(() => { img.alt = 'Fotografia non disponibile'; img.classList.add('image-error'); });
    }
  }, { rootMargin: '300px' }) : null;

  async function loadBook() {
    const results = await Promise.all([
      M.sb.from('album_chapters').select('id,slug,title,subtitle,introduction,visible').order('id'),
      M.sb.from('album_memories').select('id,chapter_id,title,body,memory_date,created_at,created_by').order('memory_date', { ascending: false }),
      M.sb.from('album_media').select('id,memory_id,storage_path,media_kind,sort_order').order('sort_order')
    ]);
    const error = results.find(r => r.error);
    if (error) throw error.error;
    state.chapters = results[0].data || [];
    state.memories = results[1].data || [];
    state.media = results[2].data || [];
    // Il guestbook pubblico è facoltativo: un problema alla fonte non blocca l'album.
    if (state.chapters.some(c => c.id === 5)) {
      try {
        const guest = await M.sb.from('messages').select('nome,testo,canzone,created_at').order('created_at', {ascending:false});
        state.guestbook = guest.error ? [] : (guest.data || []);
      } catch { state.guestbook = []; }
    }
    renderChapters();
    if (state.selectedChapter && state.chapters.some(c => c.id === state.selectedChapter)) openChapter(state.selectedChapter, false);
  }
  function renderChapters() {
    const box = $('chapter-grid'); M.empty(box);
    if (!state.chapters.length) {
      box.appendChild(n('p', 'empty-state', 'Il primo capitolo è in preparazione.')); return;
    }
    for (const chapter of state.chapters) {
      const count = currentPages(chapter.id).length;
      const btn = n('button','chapter-card'); btn.type='button';
      btn.setAttribute('aria-label','Apri il capitolo '+chapter.title);
      const num = n('span','chapter-number',`CAPITOLO ${String(chapter.id).padStart(2,'0')}`);
      const h = n('h3','',chapter.title);
      const sub = n('span','chapter-subtitle',chapter.subtitle);
      const end = n('span','chapter-end');
      end.appendChild(n('span','',count === 1 ? '1 ricordo' : `${count} ricordi`));
      end.appendChild(n('span','',!chapter.visible ? 'Solo genitori' : 'Scopri →'));
      btn.append(num,h,sub,end);
      btn.addEventListener('click', () => openChapter(chapter.id, true));
      box.appendChild(btn);
    }
  }
  function renderMemory(memory) {
    const mediaList = state.media.filter(p => p.memory_id === memory.id);
    const card = n('article','memory-card' + (mediaList.length ? ' with-image' : ''));
    if (mediaList.length) {
      const first = mediaList[0], button = n('button','memory-cover-btn'); button.type = 'button';
      button.setAttribute('aria-label','Apri fotografie o video del ricordo: '+memory.title);
      if (first.media_kind === 'image') {
        const img = n('img'); img.alt = 'Fotografia originale: '+memory.title; img.loading = 'lazy';
        img.dataset.path = first.storage_path;
        if (lazyObserver) lazyObserver.observe(img);
        else M.secureMediaUrl(first.storage_path).then(url => { if(img.isConnected) img.src=url; }).catch(()=>{ img.alt='Fotografia non disponibile'; });
        button.appendChild(img);
      } else {
        button.appendChild(n('span','','▶ Video del ricordo'));
        button.appendChild(n('span','play-icon','▶'));
      }
      if (mediaList.length > 1) button.appendChild(n('span','media-count',`${mediaList.length} foto/video`));
      button.addEventListener('click', () => M.openLightbox(mediaList));
      card.appendChild(button);
    }
    const copy = n('div','memory-text');
    copy.appendChild(n('span','memory-date',M.fmtDate(memory.memory_date)));
    copy.appendChild(n('h3','',memory.title));
    if (memory.body) copy.appendChild(n('p','',memory.body));
    copy.appendChild(n('span','author','Un ricordo da conservare ♡'));
    card.appendChild(copy);
    return card;
  }
  function currentPages(chapterId) {
    const list = state.memories.filter(m => m.chapter_id === chapterId);
    if (chapterId === 5) {
      // Dediche già presenti sul sito pubblico, mostrate solo quando questo capitolo è aperto.
      // Le immagini del guestbook NON sono importate nel bucket privato.
      const wishes = state.guestbook.filter(x => x.testo).map((x,i) => ({
        id:'guestbook-'+i, chapter_id:5, title:'Le parole di '+(x.nome || 'una persona speciale'),
        body:x.testo + (x.canzone ? '\n\n♪ '+x.canzone : ''),
        memory_date:String(x.created_at || '').slice(0,10) || '2026-10-26', fromGuestbook:true
      }));
      return [...list, ...wishes].sort((a,b) => String(b.memory_date).localeCompare(String(a.memory_date)));
    }
    return list;
  }
  function renderCurrentPage() {
    const list = $('memories-list'); M.empty(list);
    const pages = currentPages(state.selectedChapter);
    if (!pages.length) {
      const empty = n('div','empty-state');
      empty.appendChild(n('strong','','Questa pagina aspetta una storia.'));
      empty.appendChild(n('p','','Presto qui custodiremo nuovi momenti di Mattia.'));
      list.appendChild(empty); $('page-nav').hidden = true; return;
    }
    state.pageIndex = Math.max(0,Math.min(pages.length-1,state.pageIndex));
    const card = renderMemory(pages[state.pageIndex]); card.classList.add('page-enter');
    list.appendChild(card);
    $('page-count').textContent = `Pagina ${state.pageIndex + 1} di ${pages.length}`;
    $('prev-page').disabled = state.pageIndex <= 0;
    $('next-page').disabled = state.pageIndex >= pages.length - 1;
    $('page-nav').hidden = false;
  }
  function changePage(amount) {
    if (state.selectedChapter === null) return;
    const max = currentPages(state.selectedChapter).length - 1;
    const next = Math.max(0,Math.min(max,state.pageIndex+amount));
    if (next === state.pageIndex) return;
    state.pageIndex = next; renderCurrentPage();
    $('memory-section').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }
  function openChapter(id, scroll) {
    const ch = state.chapters.find(c => c.id === id);
    if (!ch) return;
    if (state.selectedChapter !== id) state.pageIndex = 0;
    state.selectedChapter = id;
    $('selected-number').textContent = `CAPITOLO ${String(ch.id).padStart(2,'0')}`;
    $('selected-title').textContent = ch.title;
    $('selected-intro').textContent = ch.introduction || ch.subtitle;
    renderCurrentPage(); $('memory-section').hidden = false;
    if (scroll) $('memory-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  $('prev-page').addEventListener('click',()=>changePage(-1));
  $('next-page').addEventListener('click',()=>changePage(1));
  let touchStart = null;
  $('memories-list').addEventListener('touchstart',e=>{
    if(e.touches.length===1)touchStart={x:e.touches[0].clientX,y:e.touches[0].clientY};
  },{passive:true});
  $('memories-list').addEventListener('touchend',e=>{
    if(!touchStart || !e.changedTouches.length)return;
    const dx=e.changedTouches[0].clientX-touchStart.x, dy=e.changedTouches[0].clientY-touchStart.y;
    touchStart=null;
    if(Math.abs(dx)>65 && Math.abs(dx)>Math.abs(dy)*1.6)changePage(dx<0?1:-1);
  },{passive:true});
  document.addEventListener('keydown', e=>{
    if ($('memory-section').hidden || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    if(e.key==='ArrowRight')changePage(1);
    if(e.key==='ArrowLeft')changePage(-1);
  });
  $('back-chapters').addEventListener('click', () => {
    $('memory-section').hidden=true;
    state.selectedChapter=null;
    $('chapters').scrollIntoView({behavior:'smooth'});
  });
  $('open-book').addEventListener('click', event => {
    if ($('private-content').hidden) {
      event.preventDefault(); $('gate').scrollIntoView({behavior:'smooth'});
    }
  });
  M.start({
    onAuthorized: async () => {
      try { await loadBook(); }
      catch (error) {
        console.error('Errore caricamento libro',error);
        const box = $('chapter-grid'); M.empty(box);
        box.appendChild(n('p','empty-state','Non è stato possibile caricare i capitoli. Verifica la connessione e riprova.'));
      }
    }
  });
})();
