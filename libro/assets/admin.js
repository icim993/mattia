/* Gestione editoriale dell'album: la sicurezza risiede nelle policy SQL, non qui. */
(function () {
  'use strict';
  const M = window.Mattia, $ = M.$, n = M.node;
  const data = { chapters: [], memories: [], media: [], access: [], editingId: null };
  const canEditMemory = memory => M.ctx.role === 'owner' || (M.ctx.role === 'contributor' && memory.created_by === M.ctx.user?.id);
  let lastInvitedEmail = null;
  let boardVersion = 0;
  const boardPhotoUrls = new Set();
  function clearPrivateBoard() {
    lastInvitedEmail = null;
    $('copy-whatsapp-invite').disabled = true;
    $('invite-copy-text').value = '';
    $('invite-copy-fallback').hidden = true;
    ++boardVersion;
    $('private-board').hidden = true;
    M.empty($('private-board-list'));
    message('private-board-status', '');
    for (const url of boardPhotoUrls) URL.revokeObjectURL(url);
    boardPhotoUrls.clear();
  }
  function guestbookPhotoPath(value) {
    const url = new URL(value);
    if (url.origin !== new URL(window.MATTIA_CONFIG.url).origin) throw Error('Origine foto non valida.');
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|authenticated|sign)\/foto\/(.+)$/);
    if (!match) throw Error('Percorso foto non valido.');
    const path = decodeURIComponent(match[1]);
    if (path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw Error('Percorso foto non valido.');
    return path;
  }
  async function loadPrivateBoard() {
    clearPrivateBoard();
    if (M.ctx.role !== 'owner') return;
    const version = boardVersion;
    const active = () => version === boardVersion && M.ctx.role === 'owner';
    $('private-board').hidden = false;
    message('private-board-status', 'Caricamento delle dediche…');
    try {
      const {data: entries, error} = await M.sb.from('guestbook_private')
        .select('nome,created_at,testo,canzone,foto').order('created_at', {ascending:false});
      if (!active()) return;
      if (error) throw error;
      message('private-board-status', entries?.length ? '' : 'Non ci sono ancora dediche.');
      const photos = [];
      for (const entry of entries || []) {
        const card = n('article', 'private-note');
        card.appendChild(n('h3', '', entry.nome || 'Una persona speciale'));
        if (entry.created_at) {
          const date = new Date(entry.created_at);
          const time = n('time', 'muted', Number.isNaN(date.getTime()) ? '' : date.toLocaleString('it-IT'));
          if (!Number.isNaN(date.getTime())) time.dateTime = date.toISOString();
          card.appendChild(time);
        }
        if (entry.testo) card.appendChild(n('p', 'private-note-text', entry.testo));
        if (entry.canzone) card.appendChild(n('p', 'muted', '♪ ' + entry.canzone));
        if (entry.foto) {
          const placeholder = n('p', 'muted', 'Caricamento fotografia…');
          card.appendChild(placeholder);
          photos.push({entry, card, placeholder});
        }
        $('private-board-list').appendChild(card);
      }
      // Only authenticated downloads: the old URL is metadata, never an image src.
      for (const {entry, card, placeholder} of photos) {
        if (!active()) return;
        try {
          const path = guestbookPhotoPath(entry.foto);
          const result = await M.sb.storage.from('foto').download(path);
          if (!active()) return;
          if (result.error) throw result.error;
          const url = URL.createObjectURL(result.data);
          boardPhotoUrls.add(url);
          const image = n('img'); image.src = url; image.alt = 'Fotografia allegata alla dedica';
          image.addEventListener('error', () => { image.remove(); placeholder.textContent = 'Fotografia non disponibile.'; });
          image.addEventListener('load', () => placeholder.remove());
          card.appendChild(image);
        } catch {
          if (active()) placeholder.textContent = 'Fotografia non disponibile. La dedica resta leggibile.';
        }
      }
    } catch {
      if (active()) message('private-board-status', 'Non è stato possibile caricare le dediche private. Riprova più tardi.', 'error');
    }
  }
  window.addEventListener('pagehide', clearPrivateBoard);

  function setDateToday() {
    // data locale corretta anche quando l'utente non si trova in UTC.
    const now = new Date();
    $('memory-date').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  }
  function message(id, text, kind) { M.status(id,text,kind); }
  async function loadAll() {
    const queries = [
      M.sb.from('album_chapters').select('id,title,subtitle,visible').order('id'),
      M.sb.from('album_memories').select('id,title,body,chapter_id,memory_date,created_at,created_by').order('memory_date',{ascending:false}),
      M.sb.from('album_media').select('id,memory_id,storage_path,media_kind,created_by').order('created_at')
    ];
    if (M.ctx.role === 'owner') queries.push(M.sb.from('album_access').select('email,display_name,role,active').order('role').order('email'));
    const res = await Promise.all(queries);
    const bad = res.find(x => x.error); if (bad) throw bad.error;
    data.chapters = res[0].data || []; data.memories = res[1].data || []; data.media = res[2].data || [];
    data.access = M.ctx.role === 'owner' ? (res[3].data || []) : [];
    $('owner-only').hidden = M.ctx.role !== 'owner';
    populateChapterSelect(); renderMemories(); renderInvites(); renderChapterVisibility();
  }
  function populateChapterSelect() {
    const select = $('memory-chapter'), prev = select.value; M.empty(select);
    for (const ch of data.chapters) {
      const option = n('option','',`${String(ch.id).padStart(2,'0')} · ${ch.title}${!ch.visible ? ' (riservato ai genitori)' : ''}`);
      option.value = String(ch.id); select.appendChild(option);
    }
    if (data.chapters.some(c => String(c.id) === prev)) select.value = prev;
  }
  function renderMemories() {
    const list = $('admin-memory-list'); M.empty(list);
    if (!data.memories.length) return list.appendChild(n('p','muted','Non ci sono ancora ricordi. Scriviamo la prima pagina!'));
    for (const item of data.memories) {
      const line = n('div','manage-item');
      const copy = n('div'); copy.appendChild(n('h3','manage-item-title',item.title));
      const ch = data.chapters.find(c => c.id === item.chapter_id);
      copy.appendChild(n('span','item-sub',`${M.fmtDate(item.memory_date)} · ${ch?.title || 'Capitolo'} · ${data.media.filter(p=>p.memory_id===item.id).length} file`));
      line.appendChild(copy);
      if (canEditMemory(item)) {
        const actions = n('div','item-actions');
        const edit = n('button','small-btn','Modifica'); edit.type='button'; edit.addEventListener('click',()=>beginEdit(item));
        const del = n('button','small-btn danger','Elimina'); del.type='button'; del.addEventListener('click',()=>deleteMemory(item));
        actions.append(edit,del); line.appendChild(actions);
      }
      list.appendChild(line);
    }
  }
  function resetEditor() {
    data.editingId = null; $('memory-form').reset(); setDateToday();
    $('existing-media').hidden = true; M.empty($('existing-media'));
    $('cancel-edit').hidden = true; $('memory-form-title').textContent = 'Aggiungi un ricordo';
    $('memory-submit').textContent = 'Salva il ricordo'; message('memory-status','');
  }
  function beginEdit(memory) {
    if (!canEditMemory(memory)) return;
    data.editingId = memory.id;
    $('memory-chapter').value = String(memory.chapter_id);
    $('memory-date').value = memory.memory_date;
    $('memory-title').value = memory.title;
    $('memory-body').value = memory.body || '';
    $('memory-files').value = '';
    $('memory-form-title').textContent = 'Modifica il ricordo';
    $('memory-submit').textContent = 'Salva le modifiche';
    $('cancel-edit').hidden = false;
    message('memory-status','');
    renderExistingMedia(memory.id);
    $('memory-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderExistingMedia(memoryId) {
    const box = $('existing-media'); M.empty(box);
    const items = data.media.filter(m => m.memory_id === memoryId);
    box.hidden = !items.length;
    if (items.length) box.appendChild(n('h3','','File già presenti nel ricordo'));
    items.forEach((item,i) => {
      const row = n('div','media-line');
      row.appendChild(n('span','',`${item.media_kind === 'image' ? 'Fotografia' : 'Video'} ${i+1}`));
      const del = n('button','small-btn danger','Rimuovi'); del.type='button';
      del.addEventListener('click',()=>removeMedia(item)); row.appendChild(del); box.appendChild(row);
    });
  }
  async function removeMedia(item) {
    if (!confirm('Rimuovere definitivamente questo file dal libro?')) return;
    try {
      // Elimina prima il blob: la lettura del file privato dipende dal record metadata.
      // Se si eliminasse prima la relazione, il file non sarebbe piu' visibile
      // all'autore con ruolo contributor e la rimozione potrebbe fallire.
      const delFile = await M.sb.storage.from('mattia-album').remove([item.storage_path]);
      if (delFile.error) throw delFile.error;
      const delMeta = await M.sb.from('album_media').delete().eq('id',item.id).select('id');
      if (delMeta.error) throw delMeta.error;
      if (!delMeta.data?.length) throw Error('Il file e stato cancellato dallo storage ma il collegamento risulta ancora presente: ricarica la pagina.');
      message('memory-status','File rimosso.','ok');
    } catch (error) { message('memory-status',M.readableError(error),'error'); }
    await safeReload();
    if (data.editingId) renderExistingMedia(data.editingId);
  }
  async function deleteMemory(memory) {
    if (!confirm(`Eliminare definitivamente «${memory.title}» e tutte le sue foto/video?`)) return;
    const files = data.media.filter(p=>p.memory_id === memory.id).map(p=>p.storage_path);
    try {
      // Cancella lo storage prima della memoria per evitare oggetti privati orfani.
      if (files.length) {
        const res = await M.sb.storage.from('mattia-album').remove(files);
        if (res.error) throw res.error;
      }
      const res = await M.sb.from('album_memories').delete().eq('id',memory.id).select('id');
      if (res.error) throw res.error;
      if (!res.data?.length) throw Error('Non hai i permessi per eliminare questo ricordo.');
      if (data.editingId === memory.id) resetEditor();
      await safeReload(); message('memory-status','Ricordo eliminato.','ok');
    } catch (error) { message('memory-status',M.readableError(error),'error'); }
  }
  async function compressImage(file) {
    const source = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve,reject) => {
        const e = new Image(); e.onload = () => resolve(e); e.onerror = () => reject(Error('Foto non leggibile: per HEIC prova a convertirla in JPG.')); e.src = source;
      });
      const scale = Math.min(1, 1920 / Math.max(img.naturalWidth,img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1,Math.round(img.naturalWidth*scale)); canvas.height = Math.max(1,Math.round(img.naturalHeight*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const blob = await new Promise((resolve,reject) => canvas.toBlob(v => v ? resolve(v) : reject(Error('Conversione foto non riuscita.')),'image/jpeg',.84));
      return {blob, mime:'image/jpeg',extension:'jpg',kind:'image'};
    } finally { URL.revokeObjectURL(source); }
  }
  async function prepareFile(file) {
    if (file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) return compressImage(file);
    const mov = file.type === 'video/quicktime' || /\.mov$/i.test(file.name);
    const mp4 = file.type === 'video/mp4' || /\.mp4$/i.test(file.name);
    if (!mov && !mp4) throw Error('Formato non supportato: usa foto JPG/PNG/HEIC oppure video MP4/MOV.');
    if (file.size > 20*1024*1024) throw Error('Video troppo grande: massimo 20 MB per file.');
    return {blob:file,mime:mov?'video/quicktime':'video/mp4',extension:mov?'mov':'mp4',kind:'video'};
  }
  async function uploadFiles(memoryId, files) {
    if (!files.length) return;
    if (files.length > 10) throw Error('Carica al massimo 10 file per operazione.');
    for (let i=0; i<files.length; i++) {
      message('memory-status',`Caricamento file ${i+1} di ${files.length}…`);
      const prepared = await prepareFile(files[i]);
      if (prepared.blob.size > 20*1024*1024) throw Error('Il file supera 20 MB dopo la conversione.');
      const path = `${M.ctx.user.id}/${memoryId}/${crypto.randomUUID()}.${prepared.extension}`;
      const upload = await M.sb.storage.from('mattia-album').upload(path,prepared.blob,{contentType:prepared.mime,upsert:false,cacheControl:'3600'});
      if (upload.error) throw upload.error;
      const ins = await M.sb.from('album_media').insert({ memory_id:memoryId, storage_path:path, media_kind:prepared.kind, mime_type:prepared.mime, sort_order:i, created_by:M.ctx.user.id });
      if (ins.error) {
        await M.sb.storage.from('mattia-album').remove([path]);
        throw ins.error;
      }
    }
  }
  $('memory-form').addEventListener('submit', async event => {
    event.preventDefault();
    const title = $('memory-title').value.trim();
    const chapterId = Number($('memory-chapter').value), date = $('memory-date').value;
    if (!title || title.length > 160 || !chapterId || !/^\d{4}-\d\d-\d\d$/.test(date)) return message('memory-status','Compila titolo, capitolo e data.','error');
    const files = [...$('memory-files').files];
    const button = $('memory-submit'); button.disabled = true;
    const original = button.textContent; button.textContent = 'Salvataggio…';
    let committed = false;
    try {
      const row = { title, body:$('memory-body').value.trim(), chapter_id:chapterId, memory_date:date };
      let memoryId = data.editingId;
      if (memoryId) {
        const result = await M.sb.from('album_memories').update(row).eq('id',memoryId).select('id').single();
        if (result.error) throw result.error;
      } else {
        const result = await M.sb.from('album_memories').insert({...row,created_by:M.ctx.user.id}).select('id').single();
        if (result.error) throw result.error;
        memoryId = result.data.id;
      }
      committed = true;
      await uploadFiles(memoryId,files);
      resetEditor(); await loadAll();
      message('memory-status','Ricordo salvato nel libro. ♡','ok');
    } catch (error) {
      message('memory-status',(committed ? 'Il testo è stato salvato, ma alcuni file potrebbero mancare. ' : '') + M.readableError(error),'error');
      await safeReload();
    } finally { button.disabled=false; if (button.textContent==='Salvataggio…') button.textContent=original; }
  });
  $('cancel-edit').addEventListener('click',resetEditor);

  function renderInvites() {
    const box = $('invites-list'); M.empty(box);
    const last = data.access.find(person => person.email === lastInvitedEmail && person.active);
    $('copy-whatsapp-invite').disabled = M.ctx.role !== 'owner' || !last;
    if (M.ctx.role !== 'owner') return;
    const label = n('p','overline','PERSONE AUTORIZZATE'); label.style.marginTop='26px'; box.appendChild(label);
    for (const person of data.access) {
      const line=n('div','invite-item'), copy=n('div');
      copy.appendChild(n('strong','',person.display_name || person.email));
      copy.appendChild(n('div','item-sub',`${person.email} · ${person.role==='owner'?'Genitore':person.role==='contributor'?'Collaboratore':'Lettore'} · ${person.active?'Attivo':'Revocato'}`));
      line.appendChild(copy);
      if (person.role !== 'owner') {
        const actions = n('div', 'item-actions');
        if (person.active) {
          const copyInvite = n('button', 'small-btn', 'Copia invito WhatsApp'); copyInvite.type='button';
          copyInvite.addEventListener('click', () => copyWhatsAppInvite(person)); actions.appendChild(copyInvite);
        }
        const btn=n('button',person.active?'small-btn danger':'small-btn',person.active?'Revoca':'Riattiva'); btn.type='button';
        btn.addEventListener('click',()=>setInviteActive(person,!person.active)); actions.appendChild(btn); line.appendChild(actions);
      }
      box.appendChild(line);
    }
  }
  async function setInviteActive(person,active) {
    if (!confirm(active ? `Riattivare l'accesso di ${person.email}?` : `Revocare l'accesso di ${person.email}?`)) return;
    try {
      const res=await M.sb.from('album_access').update({active}).eq('email',person.email);
      if (res.error) throw res.error;
      await loadAll(); message('invite-status',active?'Accesso riattivato.':'Accesso revocato.','ok');
    } catch(error) {message('invite-status',M.readableError(error),'error');}
  }
  $('invite-form').addEventListener('submit',async event => {
    event.preventDefault();
    if (M.ctx.role !== 'owner') return;
    const email=$('invite-email').value.trim().toLowerCase(), role=$('invite-role').value;
    const displayName=$('invite-name').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email) || !['viewer','contributor'].includes(role)) return message('invite-status','Controlla email e permessi.','error');
    const existing=data.access.find(p=>p.email===email);
    if (existing?.role==='owner') return message('invite-status','I proprietari non si modificano da questo modulo.','error');
    const button=$('invite-submit');button.disabled=true;
    try {
      const res=await M.sb.from('album_access').upsert({email,display_name:displayName,role,active:true,created_by:M.ctx.user.id},{onConflict:'email'});
      if (res.error) throw res.error;
      lastInvitedEmail = email;
      $('invite-form').reset(); await loadAll();
      message('invite-status',`Email autorizzata: ${email}. Ora copia l'invito WhatsApp e condividilo. Non è stata inviata alcuna email.`,'ok');
    } catch(error) {message('invite-status',M.readableError(error),'error');}
    finally {button.disabled=false;}
  });
  $('copy-invite-link').addEventListener('click',async()=>{
    try {await navigator.clipboard.writeText(M.bookBase.href);message('invite-status','Link copiato: puoi inviarlo su WhatsApp.','ok');}
    catch {message('invite-status','Copia questo indirizzo: '+M.bookBase.href,'ok');}
  });
  async function copyWhatsAppInvite(person) {
    if (M.ctx.role !== 'owner' || !data.access.some(p => p.email === person?.email && p.active && p.role !== 'owner')) return;
    const text = `Ciao${person.display_name ? ' ' + person.display_name : ''}! ♡ Ti invitiamo nel libro di Mattia: ${M.bookBase.href}\n\nAccedi usando la stessa email che abbiamo autorizzato: ${person.email}. ${person.role === 'contributor' ? 'Puoi sfogliare i capitoli aperti e aggiungere i tuoi ricordi.' : 'Puoi sfogliare i capitoli che apriremo alla famiglia.'}\n\nCon amore, Marco e Angela`;
    $('invite-copy-fallback').hidden = true;
    $('invite-copy-text').value = '';
    try {
      await navigator.clipboard.writeText(text);
      message('invite-status', 'Invito copiato. Incollalo su WhatsApp e invialo tu alla persona. Nessuna email è stata inviata.', 'ok');
    } catch {
      if (M.ctx.role !== 'owner') return;
      $('invite-copy-text').value = text;
      $('invite-copy-fallback').hidden = false;
      message('invite-status', 'Copia il testo qui sotto e condividilo su WhatsApp. Nessun messaggio è stato inviato automaticamente.');
    }
  }
  $('copy-whatsapp-invite').addEventListener('click', () => {
    copyWhatsAppInvite(data.access.find(person => person.email === lastInvitedEmail));
  });
  function renderChapterVisibility() {
    const box=$('chapter-visibility-list'); M.empty(box);
    if (M.ctx.role !== 'owner') return;
    for(const ch of data.chapters){
      const line=n('div','visibility-item'), copy=n('div');
      copy.appendChild(n('span','visibility-name',ch.title));
      copy.appendChild(n('div','item-sub',ch.visible?'Visibile ai familiari':'Riservato a voi due'));
      const label=n('label','toggle');
      const checkbox=n('input');checkbox.type='checkbox';checkbox.checked=ch.visible;
      checkbox.addEventListener('change',async()=>{
        checkbox.disabled=true;
        try {
          const res=await M.sb.from('album_chapters').update({visible:checkbox.checked}).eq('id',ch.id);
          if(res.error)throw res.error;
          await loadAll(); message('chapter-status','Visibilità aggiornata.','ok');
        } catch(error){checkbox.checked=!checkbox.checked;message('chapter-status',M.readableError(error),'error');}
        finally {checkbox.disabled=false;}
      });
      label.append(checkbox,n('span','','Visibile'));line.append(copy,label);box.appendChild(line);
    }
  }
  async function safeReload() {
    try { await loadAll(); }
    catch(error) { console.error(error); message('memory-status','Impossibile aggiornare l’elenco. Ricarica la pagina.','error'); }
  }
  setDateToday();
  M.start({ requiresEditor: true, onAccessCleared: clearPrivateBoard, onAuthorized: async () => {
    const board = loadPrivateBoard();
    try { await loadAll(); }
    catch(error) { console.error(error);message('memory-status','Errore caricamento. Verifica la connessione e riprova.','error'); }
    await board;
  }});
})();
