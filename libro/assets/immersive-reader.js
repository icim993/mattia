/* Libro di Mattia: lettura immersiva responsiva e orientamento quando consentito.
 * Non puo' forzare l'orientamento su Safari iPhone: usa un invito a girare il telefono. */
(function(){
  'use strict';
  const M=window.Mattia;
  const section=document.getElementById('memory-section');
  const chapterGrid=document.getElementById('chapter-grid');
  const stage=document.getElementById('memories-list');
  const toolbar=document.getElementById('immersive-toolbar');
  const mediaOverlay=document.getElementById('immersive-media');
  const mediaContainer=document.getElementById('immersive-media-content');
  if(!M||!section||!chapterGrid||!stage||!toolbar||!mediaOverlay||!mediaContainer)return;

  let active=false,fullscreenOwned=false,orientationLocked=false;
  let edition=0,mediaEdition=0,resizeFrame=0;
  const $=id=>document.getElementById(id);

  function handheld(){
    const isTouch=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
    return isTouch&&Math.min(innerWidth,innerHeight)<=720;
  }

  function scheduleLayout(){
    if(!active||resizeFrame)return;
    resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;sizeBook();});
  }

  function sizeBook(){
    if(!active||section.hidden)return;
    const spread=stage.querySelector('.book-spread');
    if(!spread)return;
    const aspect=spread.style.aspectRatio.match(/^\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*$/);
    const numerator=aspect?Number(aspect[1]):0;
    const denominator=aspect?Number(aspect[2]||1):1;
    const ratio=(numerator>0&&denominator>0&&numerator/denominator<8)?numerator/denominator:1.62;
    const availableWidth=stage.clientWidth-12;
    const availableHeight=stage.clientHeight-12;
    if(availableWidth<50||availableHeight<50)return;
    const width=Math.floor(Math.min(availableWidth,availableHeight*ratio));
    const height=Math.floor(width/ratio);
    if(width<40||height<40)return;
    spread.style.width=width+'px';
    spread.style.height=height+'px';
    spread.style.aspectRatio=String(ratio);
    stage.style.setProperty('--immersive-book-height',height+'px');
  }

  function closeMedia(){
    ++mediaEdition;
    mediaOverlay.hidden=true;
    mediaContainer.replaceChildren();
  }

  async function openMedia(item){
    if(!active||!M.ctx.role)return M.openLightbox([item]);
    const token=++mediaEdition,access=M.ctx.accessVersion;
    mediaContainer.replaceChildren();
    const message=document.createElement('p');
    message.textContent='Caricamento della fotografia privata…';
    mediaContainer.appendChild(message);
    mediaOverlay.hidden=false;
    try{
      const url=await M.secureMediaUrl(item.storage_path);
      if(token!==mediaEdition||!active||M.ctx.accessVersion!==access||!M.ctx.role)return;
      const media=document.createElement(item.media_kind==='video'?'video':'img');
      media.src=url;
      if(item.media_kind==='video'){
        media.controls=true;media.preload='metadata';media.playsInline=true;
      }else media.alt=item.caption||'Pagina del Libro di Mattia ingrandita';
      mediaContainer.replaceChildren(media);
    }catch(error){
      if(token===mediaEdition&&active&&M.ctx.accessVersion===access){
        message.textContent='Non è possibile mostrare la fotografia. Riprova.';
      }
    }
  }

  function exitReader(options={}){
    const wasActive=active;
    active=false;++edition;
    closeMedia();
    if(resizeFrame){cancelAnimationFrame(resizeFrame);resizeFrame=0;}
    section.classList.remove('reader-immersive','immersive-portrait-allowed');
    document.body.classList.remove('immersive-active');
    toolbar.hidden=true;
    stage.style.removeProperty('--immersive-book-height');
    if(orientationLocked){
      try{screen.orientation?.unlock?.();}catch{}
      orientationLocked=false;
    }
    if(!options.skipFullscreen&&document.fullscreenElement===section){
      document.exitFullscreen?.().catch(()=>{});
    }
    fullscreenOwned=false;
    if(wasActive&&options.back){
      const back=$('back-chapters');
      if(back&&!section.hidden)back.click();
    }
  }

  async function enterReader(){
    if(active||section.hidden||!M.ctx.role)return;
    active=true;
    const token=++edition;
    fullscreenOwned=false;orientationLocked=false;
    section.classList.add('reader-immersive');
    section.classList.remove('immersive-portrait-allowed');
    document.body.classList.add('immersive-active');
    toolbar.hidden=false;
    $('immersive-chapter').textContent=$('selected-title')?.textContent||'';
    closeMedia();
    scheduleLayout();

    // fullscreen e orientamento richiedono il gesto dell'utente;
    // questo metodo viene chiamato direttamente dal tap sul capitolo.
    if(document.fullscreenEnabled&&typeof section.requestFullscreen==='function'){
      try{
        await section.requestFullscreen({navigationUI:'hide'});
        if(!active||token!==edition){
          if(document.fullscreenElement===section)await document.exitFullscreen?.();
          return;
        }
        fullscreenOwned=document.fullscreenElement===section;
      }catch{
        // Safari iPhone e altri browser: resta il fallback CSS a viewport pieno.
      }
    }
    if(!active||token!==edition)return;
    if(fullscreenOwned&&typeof screen.orientation?.lock==='function'){
      try{
        await screen.orientation.lock('landscape');
        if(!active||token!==edition){
          try{screen.orientation.unlock?.();}catch{}
          return;
        }
        orientationLocked=true;
      }catch{
        // L'utente puo' girare manualmente il telefono.
      }
    }
    scheduleLayout();
  }

  chapterGrid.addEventListener('click',event=>{
    if(!event.target.closest('.chapter-card'))return;
    if(handheld()&&!section.hidden)void enterReader();
  });

  $('immersive-close').addEventListener('click',()=>exitReader({back:true}));
  $('immersive-rotate-exit').addEventListener('click',()=>exitReader({back:true}));
  $('immersive-read-portrait').addEventListener('click',()=>{
    section.classList.add('immersive-portrait-allowed');scheduleLayout();
  });
  $('immersive-media-close').addEventListener('click',closeMedia);
  mediaOverlay.addEventListener('click',event=>{if(event.target===mediaOverlay)closeMedia();});
  $('back-chapters').addEventListener('click',()=>{
    if(active)exitReader({skipFullscreen:false});
  },true);

  document.addEventListener('fullscreenchange',()=>{
    if(!active)return;
    if(document.fullscreenElement===section){fullscreenOwned=true;scheduleLayout();}
    else if(fullscreenOwned)exitReader({skipFullscreen:true});
    else scheduleLayout();
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!active)return;
    if(!mediaOverlay.hidden){event.stopPropagation();closeMedia();}
    else exitReader();
  },true);
  document.addEventListener('mattia:access-cleared',()=>exitReader());
  window.addEventListener('pagehide',()=>exitReader());
  window.addEventListener('resize',scheduleLayout);
  window.addEventListener('orientationchange',scheduleLayout);
  window.visualViewport?.addEventListener('resize',scheduleLayout);
  new MutationObserver(()=>{if(active)scheduleLayout();}).observe(stage,{childList:true});
  if(typeof ResizeObserver==='function'){
    const observer=new ResizeObserver(scheduleLayout);
    observer.observe(stage);
  }
  window.MattiaReader={
    isActive:()=>active,
    openMedia,
    enter:enterReader,
    exit:exitReader
  };
})();
