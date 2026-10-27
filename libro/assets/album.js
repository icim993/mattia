/* Il libro di Mattia — V2: pagine vere, foto singole, sfoglio responsive.
 * Non contiene contenuti privati: tutti i file sono scaricati con sessione/RLS. */
(function () {
  'use strict';
  const M = window.Mattia;
  const $ = M.$, n = M.node;
  const state = { chapters:[], memories:[], media:[], notes:[], selected:null, pageIndex:0, turning:false };
  const mobile = matchMedia('(max-width: 760px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const PERMITTED_LAYOUTS = new Set(['full','polaroid','paper','film','gallery','letter']);
  const clamp = (value,min,max,fallback) => Number.isFinite(Number(value)) ? Math.min(max,Math.max(min,Number(value))) : fallback;

  function memoryMedia(id) {
    return state.media.filter(x => x.memory_id === id)
      .sort((a,b) => Number(a.sort_order||0)-Number(b.sort_order||0) || String(a.id).localeCompare(String(b.id)));
  }
  function chapterPages(chapterId) {
    const chapter = state.chapters.find(x=>x.id===chapterId);
    if (!chapter) return [];
    const result = [{type:'chapter',chapter}];
    const memories = state.memories.filter(x=>x.chapter_id===chapterId).sort((a,b)=>{
      const ao=a.page_order===null||a.page_order===undefined?9999:Number(a.page_order);
      const bo=b.page_order===null||b.page_order===undefined?9999:Number(b.page_order);
      return ao-bo || String(a.memory_date).localeCompare(String(b.memory_date)) || String(a.created_at).localeCompare(String(b.created_at));
    });
    memories.forEach(memory=>{
      result.push({type:'story',memory});
      memoryMedia(memory.id).forEach((media,index)=>result.push({type:'photo',memory,media,index}));
    });
    // Only the two owners may read guestbook texts. The public song view is never
    // used as a backdoor to the private board, even when the chapter is visible.
    if (chapterId===5 && M.ctx.role==='owner') {
      state.notes.forEach((entry,index)=>result.push({type:'guestbook',entry,index}));
    }
    result.push({type:'end',chapter});
    return result;
  }

  function section(tag,className,text) { return n(tag,className,text); }
  function leafHeading(leaf,overline,title,body) {
    const head=section('div','book-leaf-copy');
    head.appendChild(section('p','book-kicker',overline));
    head.appendChild(section('h3','book-leaf-title',title));
    if(body) head.appendChild(section('p','book-leaf-body',body));
    leaf.appendChild(head);
  }
  function setPhotoAppearance(img,settings) {
    const x=clamp(settings.x,0,100,50), y=clamp(settings.y,0,100,50);
    img.style.objectPosition=`${x}% ${y}%`;
    img.style.transform=`scale(${clamp(settings.zoom,1,1.8,1)}) rotate(${clamp(settings.rotate,-15,15,0)}deg)`;
    img.style.filter=`brightness(${clamp(settings.brightness,70,135,100)}%) contrast(${clamp(settings.contrast,70,140,100)}%) saturate(${clamp(settings.saturation,0,160,100)}%) sepia(${clamp(settings.sepia,0,100,0)}%) grayscale(${clamp(settings.grayscale,0,100,0)}%)`;
  }
  function photoPage(leaf,page) {
    const {memory,media,index} = page;
    const layout = PERMITTED_LAYOUTS.has(media.layout)?media.layout:'paper';
    const photo = section('div',`book-photo book-photo--${layout}`);
    const frame=section('div','book-photo-window');
    if(media.media_kind==='image'){
      const img=section('img','book-photo-image');
      img.alt=media.caption || `Fotografia autentica: ${memory.title}`;
      img.loading='lazy';
      img.decoding='async';
      const settings=media.photo_settings && typeof media.photo_settings==='object'?media.photo_settings:{};
      setPhotoAppearance(img,settings);
      frame.appendChild(img);
      M.secureMediaUrl(media.storage_path).then(url=>{if(img.isConnected)img.src=url;})
        .catch(()=>{if(img.isConnected){img.alt='Fotografia non disponibile';frame.classList.add('book-photo-error');}});
      const open=section('button','book-photo-open','Ingrandisci');
      open.type='button';
      open.setAttribute('aria-label',`Apri fotografia ${index+1}: ${memory.title}`);
      open.addEventListener('click',()=>M.openLightbox([media]));
      photo.append(frame,open);
    } else {
      const play=section('button','book-video-open','▶ Guarda il video');
      play.type='button';
      play.addEventListener('click',()=>M.openLightbox([media]));
      frame.appendChild(play);
      photo.appendChild(frame);
    }
    leaf.appendChild(photo);
    const caption=section('div','book-photo-caption');
    caption.appendChild(section('span','book-photo-collection',memory.title));
    if(media.caption)caption.appendChild(section('p','',media.caption));
    leaf.appendChild(caption);
  }
  function makeLeaf(page,globalNumber) {
    const leaf=section('article',`book-leaf book-leaf--${page.type}`);
    leaf.setAttribute('aria-label',`Pagina ${globalNumber}`);
    if(page.type==='chapter'){
      leaf.appendChild(section('span','book-bloom','✳'));
      leafHeading(leaf,`CAPITOLO ${String(page.chapter.id).padStart(2,'0')}`,page.chapter.title,
        page.chapter.introduction || page.chapter.subtitle);
      leaf.appendChild(section('div','book-ornament','♡ · · ·'));
    } else if(page.type==='story'){
      leafHeading(leaf,M.fmtDate(page.memory.memory_date),page.memory.title,page.memory.body);
      leaf.appendChild(section('div','book-script','Con amore, mamma e papà'));
    } else if(page.type==='photo') {
      photoPage(leaf,page);
    } else if(page.type==='guestbook'){
      leafHeading(leaf,`UN PENSIERO PER MATTIA · ${new Date(page.entry.created_at).toLocaleDateString('it-IT')}`,
        `Da ${page.entry.nome || 'una persona cara'}`,
        page.entry.testo || '');
    } else if(page.type==='end'){
      leaf.appendChild(section('div','book-end-signet','♡'));
      leafHeading(leaf,'IL NOSTRO RACCONTO','E la storia continua…','Ogni giorno un nuovo ricordo, ogni istante una pagina da custodire.');
    }
    leaf.appendChild(section('span','book-leaf-number',String(globalNumber).padStart(2,'0')));
    return leaf;
  }
  function buildBook(pages,perSpread){
    const list=$('memories-list');M.empty(list);
    list.classList.add('book-stage');
    const spine=section('div','book-spine');
    const spread=section('div','book-spread');
    const visible=pages.slice(state.pageIndex,state.pageIndex+perSpread);
    visible.forEach((p,i)=>spread.appendChild(makeLeaf(p,state.pageIndex+i+1)));
    if(perSpread===2 && visible.length===1){const blank=section('div','book-leaf book-leaf--blank');blank.appendChild(section('span','book-bloom','✳'));spread.appendChild(blank);}
    list.append(spread,spine);
  }
  function renderChapters(){
    const box=$('chapter-grid');M.empty(box);
    if(!state.chapters.length){box.appendChild(section('p','empty-state','Il libro aspetta il suo primo capitolo.'));return;}
    for(const chapter of state.chapters){
      const count=state.memories.filter(m=>m.chapter_id===chapter.id).length;
      const btn=section('button','chapter-card');btn.type='button';
      btn.setAttribute('aria-label','Sfoglia il capitolo '+chapter.title);
      btn.appendChild(section('span','chapter-number',`CAPITOLO ${String(chapter.id).padStart(2,'0')}`));
      btn.appendChild(section('h3','',chapter.title));
      btn.appendChild(section('span','chapter-subtitle',chapter.subtitle));
      const end=section('span','chapter-end');
      end.appendChild(section('span','',count===1?'1 ricordo':`${count} ricordi`));
      end.appendChild(section('span','',chapter.visible?'Sfoglia ↗':'Solo genitori'));
      btn.appendChild(end);
      btn.addEventListener('click',()=>openChapter(chapter.id,true));
      box.appendChild(btn);
    }
  }
  function renderCurrent(){
    const pages=chapterPages(state.selected);
    if(!pages.length)return;
    const per=mobile.matches?1:2;
    state.pageIndex=Math.min(Math.floor(state.pageIndex/per)*per,Math.max(0,Math.floor((pages.length-1)/per)*per));
    buildBook(pages,per);
    $('page-count').textContent=per===2?
      `Pagine ${state.pageIndex+1}–${Math.min(state.pageIndex+2,pages.length)} di ${pages.length}`:
      `Pagina ${state.pageIndex+1} di ${pages.length}`;
    $('page-nav').hidden=false;
    $('prev-page').disabled=state.pageIndex===0;
    $('next-page').disabled=state.pageIndex+per>=pages.length;
  }
  async function turn(direction){
    if(state.selected===null || state.turning)return;
    const pages=chapterPages(state.selected),per=mobile.matches?1:2;
    const next=state.pageIndex+direction*per;
    if(next<0 || next>=pages.length)return;
    state.turning=true;
    const spread=$('memories-list').querySelector('.book-spread');
    try{
      if(!reduced.matches && spread){
        const target=direction>0?(spread.lastElementChild||spread):(spread.firstElementChild||spread);
        await target.animate([
          {transform:'perspective(1200px) rotateY(0deg)',opacity:1},
          {transform:`perspective(1200px) rotateY(${direction>0?-68:68}deg)`,opacity:0.13}
        ],{duration:230,easing:'cubic-bezier(.5,0,.8,.4)'}).finished.catch(()=>{});
      }
      state.pageIndex=next;renderCurrent();
      const newSpread=$('memories-list').querySelector('.book-spread');
      if(!reduced.matches && newSpread){
        const target=direction>0?(newSpread.firstElementChild||newSpread):(newSpread.lastElementChild||newSpread);
        await target.animate([
          {transform:`perspective(1200px) rotateY(${direction>0?47:-47}deg)`,opacity:0.2},
          {transform:'perspective(1200px) rotateY(0deg)',opacity:1}
        ],{duration:250,easing:'cubic-bezier(.2,.6,.2,1)'}).finished.catch(()=>{});
      }
    } finally {state.turning=false;}
  }
  function openChapter(id,scroll){
    const chapter=state.chapters.find(c=>c.id===id);if(!chapter)return;
    if(state.selected!==id)state.pageIndex=0;
    state.selected=id;
    $('selected-number').textContent=`CAPITOLO ${String(id).padStart(2,'0')}`;
    $('selected-title').textContent=chapter.title;
    $('selected-intro').textContent=chapter.introduction||chapter.subtitle;
    $('memory-section').hidden=false;
    renderCurrent();
    if(scroll)$('memory-section').scrollIntoView({behavior:reduced.matches?'auto':'smooth',block:'start'});
  }
  async function loadBook(){
    const results=await Promise.all([
      M.sb.from('album_chapters').select('id,slug,title,subtitle,introduction,visible').order('id'),
      M.sb.from('album_memories').select('id,chapter_id,title,body,memory_date,created_at,created_by,page_order').order('created_at'),
      M.sb.from('album_media').select('id,memory_id,storage_path,media_kind,sort_order,caption,layout,photo_settings').order('sort_order')
    ]);
    const failure=results.find(r=>r.error);if(failure)throw failure.error;
    state.chapters=results[0].data||[];state.memories=results[1].data||[];state.media=results[2].data||[];
    state.notes=[];
    if(state.chapters.some(c=>c.id===5) && M.ctx.role==='owner'){
      try{
        const privateNotes=await M.sb.from('guestbook_private').select('nome,testo,canzone,created_at').order('created_at',{ascending:false});
        if(!privateNotes.error)state.notes=(privateNotes.data||[]).filter(x=>x.testo);
      }catch{state.notes=[];}
    }
    renderChapters();
    if(state.selected!==null){
      if(state.chapters.some(c=>c.id===state.selected))openChapter(state.selected,false);
      else $('memory-section').hidden=true;
    }
  }
  $('prev-page').addEventListener('click',()=>turn(-1));
  $('next-page').addEventListener('click',()=>turn(1));
  let touch=null;
  $('memories-list').addEventListener('touchstart',e=>{if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
  $('memories-list').addEventListener('touchend',e=>{
    if(!touch||!e.changedTouches.length)return;
    const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;
    if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.5)turn(dx<0?1:-1);
  },{passive:true});
  document.addEventListener('keydown',e=>{
    if($('memory-section').hidden || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
    if(e.key==='ArrowRight')turn(1);
    if(e.key==='ArrowLeft')turn(-1);
  });
  const mediaResize=()=>{if(state.selected!==null && !$('memory-section').hidden)renderCurrent();};
  if(mobile.addEventListener) mobile.addEventListener('change',mediaResize);
  else mobile.addListener(mediaResize);
  $('back-chapters').addEventListener('click',()=>{
    $('memory-section').hidden=true;state.selected=null;
    $('chapters').scrollIntoView({behavior:reduced.matches?'auto':'smooth'});
  });
  $('open-book').addEventListener('click',e=>{if($('private-content').hidden){e.preventDefault();$('gate').scrollIntoView({behavior:'smooth'});}});
  M.start({
    onAccessCleared:()=>{state.chapters=[];state.memories=[];state.media=[];state.notes=[];state.selected=null;M.empty($('memories-list'));$('memory-section').hidden=true;},
    onAuthorized:async()=>{try{await loadBook();}catch(error){console.error('Caricamento libro',error);M.empty($('chapter-grid'));$('chapter-grid').appendChild(section('p','empty-state','Non è stato possibile caricare il libro. Riprova.'));}}
  });
})();
