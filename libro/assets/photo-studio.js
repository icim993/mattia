/* Studio fotografico V2. Add-on per l'admin esistente, solo owner.
 * Conserva sempre il file originale nel bucket privato; salva unicamente
 * impostazioni non distruttive di ritaglio, luce, colore e impaginazione. */
(function(){
 'use strict';
 const M=window.Mattia;
 if(!M || !document.getElementById('private-content'))return;
 const content=document.getElementById('private-content');
 const panel=document.createElement('section');
 panel.id='photo-studio';panel.hidden=true;panel.className='panel photo-studio-panel';
 panel.setAttribute('aria-labelledby','studio-title');
 panel.innerHTML=`
   <div class="panel-head"><span class="panel-symbol" aria-hidden="true">✧</span><div>
     <p class="overline">OGNI FOTO, UNA PAGINA UNICA</p><h2 id="studio-title">Studio fotografico</h2>
   </div></div>
   <p class="muted">Personalizza una fotografia per volta: la foto originale resta custodita nel tuo album privato.</p>
   <div class="form-grid">
     <label>Ricordo <select id="studio-memory"></select></label>
     <label>Fotografia <select id="studio-media"></select></label>
   </div>
   <div class="studio-grid" style="margin-top:20px">
    <div>
     <div class="studio-preview">
       <div class="studio-photo-frame paper" id="studio-frame"><p class="muted" id="studio-no-photo">Seleziona una foto.</p></div>
     </div>
     <p class="studio-preview-label">ANTEPRIMA PERSONALE · NESSUNA FOTO VIENE PUBBLICATA</p>
    </div>
    <div class="studio-controls">
      <label>Stile della pagina
        <select id="studio-layout"><option value="paper">Carta avorio</option><option value="polaroid">Polaroid</option><option value="full">A piena pagina</option><option value="film">Pellicola</option><option value="gallery">Cornice elegante</option><option value="letter">Lettera vintage</option></select>
      </label>
      <label>Tonalità iniziale
        <select id="studio-preset"><option value="natural">Naturale</option><option value="warm">Calda e luminosa</option><option value="memory">Ricordo vintage</option><option value="bw">Bianco e nero</option></select>
      </label>
      <label>Didascalia di questa fotografia
        <input id="studio-caption" maxlength="220" placeholder="Una frase solo per questa foto…">
      </label>
      <div class="studio-duo">
        <label>Inquadratura orizzontale <input id="studio-x" type="range" min="0" max="100" value="50"></label>
        <label>Inquadratura verticale <input id="studio-y" type="range" min="0" max="100" value="50"></label>
        <label>Zoom <input id="studio-zoom" type="range" min="100" max="180" value="100"></label>
        <label>Rotazione <input id="studio-rotate" type="range" min="-15" max="15" value="0"></label>
        <label>Luminosità <input id="studio-brightness" type="range" min="70" max="135" value="100"></label>
        <label>Contrasto <input id="studio-contrast" type="range" min="70" max="140" value="100"></label>
        <label>Colore <input id="studio-saturation" type="range" min="0" max="160" value="100"></label>
        <label>Effetto seppia <input id="studio-sepia" type="range" min="0" max="100" value="0"></label>
        <label>Bianco e nero <input id="studio-grayscale" type="range" min="0" max="100" value="0"></label>
        <label>Ordine foto <input id="studio-sort" type="number" min="0" max="999" value="0"></label>
      </div>
      <p class="studio-note">Gli effetti sono modificabili in qualsiasi momento. Per le ecografie suggeriamo il preset Naturale.</p>
      <div class="studio-actions"><button class="primary-btn" id="studio-save" type="button">Salva questa fotografia ♡</button><button class="outline-btn" id="studio-reset" type="button">Ripristina</button><button class="outline-btn" id="studio-reload" type="button">Aggiorna elenco</button></div>
      <p id="studio-message" class="status" role="status" aria-live="polite"></p>
    </div>
   </div>
   <div style="border-top:1px solid #dbcfbd;margin-top:30px;padding-top:23px">
    <h3 style="font:600 29px var(--serif);margin:0 0 10px">Ordine delle pagine</h3>
    <p class="muted">Prima si legge il titolo e il racconto; poi si sfogliano le foto una per una. Puoi scegliere in quale posizione appare un ricordo nel capitolo.</p>
    <div class="studio-actions"><label>Posizione del ricordo <input id="studio-page-order" type="number" min="0" max="999" value="0" style="width:110px"></label><button class="outline-btn" id="studio-save-order" type="button">Salva posizione</button></div>
   </div>`;
 const anchor=document.getElementById('admin-memory-list')?.closest('section');
 (anchor?.parentNode||content).insertBefore(panel,anchor?anchor.nextSibling:content.firstChild);
 const $=id=>document.getElementById(id);
 const fields=['x','y','zoom','rotate','brightness','contrast','saturation','sepia','grayscale'];
 const defaultSettings={x:50,y:50,zoom:1,rotate:0,brightness:100,contrast:100,saturation:100,sepia:0,grayscale:0};
 const presets={
   natural:{brightness:100,contrast:100,saturation:100,sepia:0,grayscale:0},
   warm:{brightness:108,contrast:96,saturation:109,sepia:17,grayscale:0},
   memory:{brightness:103,contrast:89,saturation:76,sepia:42,grayscale:0},
   bw:{brightness:104,contrast:114,saturation:0,sepia:0,grayscale:100}
 };
 let memories=[],media=[],currentMedia=null,previewUrl=null,refreshing=false,sequence=0;
 const status=(msg,type)=>M.status('studio-message',msg,type);
 const finite=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
 function selectedMemory(){return memories.find(x=>x.id===$('studio-memory').value);}
 function makeOption(value,label){const opt=document.createElement('option');opt.value=value;opt.textContent=label;return opt;}
 function settingsFromForm(){const settings={};fields.forEach(k=>settings[k]=finite($("studio-"+k).value,defaultSettings[k]));settings.zoom=settings.zoom/100;return settings;}
 function setForm(settings){const vals={...defaultSettings,...(settings||{})};fields.forEach(k=>{$('studio-'+k).value=k==='zoom'?Math.round(finite(vals[k],1)*100):finite(vals[k],defaultSettings[k]);});}
 function clearPreview(){sequence++;if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}const frame=$('studio-frame');frame.replaceChildren();const msg=document.createElement('p');msg.className='muted';msg.textContent='Seleziona una fotografia.';frame.appendChild(msg);}
 function applyPreview(){
   const frame=$('studio-frame');frame.className='studio-photo-frame '+$('studio-layout').value;
   const img=frame.querySelector('img');if(!img)return;
   const s=settingsFromForm();
   img.style.objectPosition=`${s.x}% ${s.y}%`;
   img.style.transform=`scale(${s.zoom}) rotate(${s.rotate}deg)`;
   img.style.filter=`brightness(${s.brightness}%) contrast(${s.contrast}%) saturate(${s.saturation}%) sepia(${s.sepia}%) grayscale(${s.grayscale}%)`;
 }
 function renderSelectedMedia(){
   const item=media.find(x=>x.id===$('studio-media').value);currentMedia=item||null;
   clearPreview();if(!item){status('Seleziona un ricordo con almeno una fotografia.');return;}
   $('studio-caption').value=item.caption||'';
   $('studio-sort').value=item.sort_order||0;
   $('studio-layout').value=['paper','polaroid','full','film','gallery','letter'].includes(item.layout)?item.layout:'paper';
   $('studio-preset').value='natural';
   setForm(item.photo_settings||{});
   applyPreview();
   if(item.media_kind!=='image'){status('Per i video puoi modificare solo didascalia e ordine.');return;}
   const request=sequence;
   status('Caricamento dell’anteprima privata…');
   M.sb.storage.from('mattia-album').download(item.storage_path).then(({data,error})=>{
     if(request!==sequence || !currentMedia || currentMedia.id!==item.id)return;
     if(error)throw error;
     previewUrl=URL.createObjectURL(data);
     const img=document.createElement('img');img.alt='Fotografia privata da personalizzare';img.src=previewUrl;
     $('studio-frame').replaceChildren(img);
     applyPreview();status('');
   }).catch(error=>{if(request===sequence)status('Impossibile caricare l’anteprima: '+M.readableError(error),'error');});
 }
 function listMedia(){
   const id=$('studio-memory').value;
   const select=$('studio-media'),old=select.value;select.replaceChildren();
   const items=media.filter(x=>x.memory_id===id).sort((a,b)=>a.sort_order-b.sort_order);
   items.forEach((x,i)=>select.appendChild(makeOption(x.id,`${x.media_kind==='video'?'Video':'Foto'} ${i+1}${x.caption?' · '+x.caption.slice(0,32):''}`)));
   if(items.some(x=>x.id===old))select.value=old;
   const m=selectedMemory();$('studio-page-order').value=m?.page_order??0;
   renderSelectedMedia();
 }
 async function loadStudio(){
   if(refreshing||M.ctx.role!=='owner'||content.hidden)return;
   refreshing=true;status('Aggiornamento delle fotografie…');
   try{
     const r=await Promise.all([
       M.sb.from('album_memories').select('id,title,memory_date,page_order,chapter_id').order('created_at'),
       M.sb.from('album_media').select('id,memory_id,storage_path,media_kind,caption,layout,photo_settings,sort_order').order('sort_order')
     ]);
     const err=r.find(x=>x.error);if(err)throw err.error;
     memories=r[0].data||[];media=r[1].data||[];
     const select=$('studio-memory'),old=select.value;select.replaceChildren();
     for(const m of memories)select.appendChild(makeOption(m.id,m.title));
     if(memories.some(x=>x.id===old))select.value=old;
     listMedia();if(!memories.length)status('Crea il primo ricordo nella sezione qui sopra, poi torna qui per personalizzare ogni foto.');
   }catch(e){status('Impossibile caricare lo studio: '+M.readableError(e),'error');}
   finally{refreshing=false;}
 }
 function reevaluate(){
   const eligible=!content.hidden&&M.ctx.role==='owner';
   if(!eligible){panel.hidden=true;clearPreview();return;}
   if(panel.hidden){panel.hidden=false;loadStudio();}
 }
 const observer=new MutationObserver(reevaluate);
 observer.observe(content,{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('pagehide',clearPreview);
 $('studio-memory').addEventListener('change',listMedia);
 $('studio-media').addEventListener('change',renderSelectedMedia);
 $('studio-layout').addEventListener('change',applyPreview);
 fields.forEach(k=>$('studio-'+k).addEventListener('input',applyPreview));
 $('studio-preset').addEventListener('change',()=>{
   const p=presets[$('studio-preset').value]||presets.natural;
   Object.keys(p).forEach(k=>{$('studio-'+k).value=p[k];});applyPreview();
 });
 $('studio-reset').addEventListener('click',()=>{setForm(defaultSettings);$('studio-layout').value='paper';$('studio-preset').value='natural';$('studio-caption').value='';applyPreview();status('Anteprima ripristinata: premi Salva per confermare.');});
 $('studio-reload').addEventListener('click',loadStudio);
 $('studio-save').addEventListener('click',async()=>{
   if(M.ctx.role!=='owner'||content.hidden||!currentMedia)return;
   const button=$('studio-save');button.disabled=true;status('Salvataggio…');
   try{
     const caption=$('studio-caption').value.trim();
     const payload={
       caption,layout:$('studio-layout').value,
       photo_settings:settingsFromForm(),
       sort_order:Math.min(999,Math.max(0,Math.floor(finite($('studio-sort').value,0))))
     };
     const {data,error}=await M.sb.from('album_media').update(payload).eq('id',currentMedia.id).select('id');
     if(error)throw error;if(!data?.length)throw Error('Salvataggio non autorizzato.');
     Object.assign(currentMedia,payload);
     status('Fotografia personalizzata e salvata. ♡','ok');
   }catch(e){status(M.readableError(e),'error');}
   finally{button.disabled=false;}
 });
 $('studio-save-order').addEventListener('click',async()=>{
   const m=selectedMemory();if(!m||M.ctx.role!=='owner')return;
   try{
     const order=Math.min(999,Math.max(0,Math.floor(finite($('studio-page-order').value,0))));
     const {data,error}=await M.sb.from('album_memories').update({page_order:order}).eq('id',m.id).select('id');
     if(error)throw error;if(!data?.length)throw Error('Salvataggio non autorizzato.');
     m.page_order=order;status('Posizione del ricordo aggiornata. ♡','ok');
   }catch(e){status(M.readableError(e),'error');}
 });
 reevaluate();
})();
