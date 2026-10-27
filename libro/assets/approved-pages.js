/* Carica pagina approvata: PNG privati, ordinamento e pubblicazione owner-only. */
(function approvedPagesController() {
  'use strict';
  const M=window.Mattia;
  const panel=document.getElementById('approved-panel');
  const owner=document.getElementById('owner-only');
  const content=document.getElementById('private-content');
  if(!M||!panel||!owner||!content)return;
  const $=id=>document.getElementById(id);
  const status=(message,kind)=>M.status('approved-status',message,kind);
  const canPublish=()=>M.ctx.role==='owner'&&!content.hidden&&!owner.hidden;
  let draft=[],urls=[],chapters=[],existing=[],busy=false,epoch=0;
  const PNG_BYTES=[137,80,78,71,13,10,26,10];
  function element(tag,className,text) {
    const e=document.createElement(tag);
    if(className)e.className=className;
    if(text!==undefined)e.textContent=text;
    return e;
  }
  function clearUrls(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
  function clearDraft(){clearUrls();draft=[];$('approved-files').value='';$('approved-draft').replaceChildren();}
  function resetPrivate() {
    ++epoch;clearDraft();chapters=[];existing=[];panel.hidden=true;
    $('approved-chapter').replaceChildren();$('approved-existing').replaceChildren();
    $('approved-submit').disabled=false;busy=false;status('');
  }
  function defaultTitle(filename) {
    const value=filename.replace(/\.png$/i,'').replace(/^\s*\d+[\s._-]*/,'').replace(/[_-]+/g,' ').trim();
    return (value||'Pagina approvata').slice(0,160);
  }
  function currentExisting(chapterId) {
    return existing.filter(x=>x.chapter_id===chapterId).sort((a,b)=>(a.page_order??9999)-(b.page_order??9999));
  }
  function renderExisting() {
    const box=$('approved-existing');box.replaceChildren();
    const items=currentExisting(Number($('approved-chapter').value));
    const heading=element('h3','','Tavole già pubblicate');
    box.appendChild(heading);
    if(!items.length){box.appendChild(element('p','muted','Ancora nessuna tavola approvata in questo capitolo.'));return;}
    for(const item of items){
      const line=element('div','approved-existing-item');
      line.appendChild(element('span','approved-order-pill',String(item.page_order??'—')));
      line.appendChild(element('span','',item.title));
      box.appendChild(line);
    }
    box.appendChild(element('p','tiny-note','Per rimuovere un ricordo già pubblicato, usa la sezione “I ricordi salvati”.'));
  }
  function draftOrderStart() {
    const values=currentExisting(Number($('approved-chapter').value)).map(x=>Number(x.page_order)||0);
    return Math.max(0,...values)+1;
  }
  function renderDraft(){
    const box=$('approved-draft');box.replaceChildren();clearUrls();
    if(!draft.length)return;
    const first=draftOrderStart();
    draft.forEach((file,index)=>{
      const row=element('div','approved-draft-item');
      const img=element('img','approved-preview');
      const url=URL.createObjectURL(file);urls.push(url);img.src=url;img.alt='Anteprima privata '+file.name;
      const controls=element('div','approved-draft-fields');
      const titleLabel=element('label','','Titolo per riconoscere la tavola');
      const title=element('input');title.type='text';title.maxLength=160;title.required=true;
      title.value=defaultTitle(file.name);title.dataset.approvedTitle=String(index);titleLabel.appendChild(title);
      const orderLabel=element('label','','Ordine nel capitolo');
      const order=element('input');order.type='number';order.min='1';order.max='999';order.required=true;
      order.value=String(first+index);order.dataset.approvedOrder=String(index);orderLabel.appendChild(order);
      const meta=element('span','tiny-note',file.name+' · '+(file.size/1048576).toFixed(1)+' MB');
      controls.append(titleLabel,orderLabel,meta);row.append(img,controls);box.appendChild(row);
    });
    status('Controlla l’ordine delle tavole e premi “Pubblica nel libro”.');
  }
  async function refresh() {
    if(!canPublish())return;
    const version=++epoch,access=M.ctx.accessVersion;
    const live=()=>version===epoch&&access===M.ctx.accessVersion&&canPublish();
    try{
      const [ch,mem,media]=await Promise.all([
        M.sb.from('album_chapters').select('id,title,visible').order('id'),
        M.sb.from('album_memories').select('id,title,chapter_id,page_order').order('page_order'),
        M.sb.from('album_media').select('memory_id,photo_settings')
      ]);
      if(!live())return;
      const error=ch.error||mem.error||media.error;if(error)throw error;
      chapters=ch.data||[];
      const approvedIds=new Set((media.data||[]).filter(x=>x.photo_settings?.approved_spread===true).map(x=>x.memory_id));
      existing=(mem.data||[]).filter(x=>approvedIds.has(x.id));
      const select=$('approved-chapter'),old=select.value;select.replaceChildren();
      for(const chapter of chapters){
        const option=element('option','','Capitolo '+chapter.id+' — '+chapter.title);
        option.value=String(chapter.id);select.appendChild(option);
      }
      if(chapters.some(x=>String(x.id)===old))select.value=old;
      else if(chapters.some(x=>x.id===1))select.value='1';
      renderExisting();
      if(draft.length)renderDraft();
    }catch(err){if(live())status('Impossibile verificare i capitoli: '+M.readableError(err),'error');}
  }
  function onFileChange(){
    if(!canPublish()||busy)return;
    draft=[...$('approved-files').files];renderDraft();
  }
  async function validateFile(file){
    if(!/\.png$/i.test(file.name)||file.type!=='image/png')throw Error('Sono ammesse solo tavole PNG originali: '+file.name);
    if(file.size===0||file.size>20*1048576)throw Error('Dimensione non valida (massimo 20 MB): '+file.name);
    const header=new Uint8Array(await file.slice(0,8).arrayBuffer());
    if(!PNG_BYTES.every((v,i)=>header[i]===v))throw Error('Questo file non è un PNG valido: '+file.name);
    const bitmap=await createImageBitmap(file);
    const dimensions={width:bitmap.width,height:bitmap.height};
    bitmap.close?.();
    if(!dimensions.width||!dimensions.height)throw Error('Tavola senza dimensioni valide: '+file.name);
    return dimensions;
  }
  async function verifyPositions(chapterId,orders){
    const {data,error}=await M.sb.from('album_memories').select('page_order').eq('chapter_id',chapterId);
    if(error)throw error;
    const used=new Set((data||[]).filter(x=>x.page_order!==null&&x.page_order!==undefined).map(x=>Number(x.page_order)));
    for(const order of orders)if(used.has(order))throw Error('L’ordine '+order+' è già occupato in questo capitolo. Scegline un altro.');
  }
  async function publish(event){
    event.preventDefault();
    if(busy||!canPublish())return status('Solo i proprietari possono pubblicare le tavole.','error');
    const chapterId=Number($('approved-chapter').value);
    if(!chapters.some(x=>x.id===chapterId))return status('Seleziona un capitolo valido.','error');
    if(!draft.length||draft.length>10)return status('Seleziona da 1 a 10 tavole PNG.','error');
    const rows=draft.map((file,i)=>({
      file,title:$('approved-draft').querySelector('[data-approved-title="'+i+'"]')?.value.trim(),
      order:Number($('approved-draft').querySelector('[data-approved-order="'+i+'"]')?.value)
    }));
    if(rows.some(x=>!x.title||x.title.length>160||!Number.isInteger(x.order)||x.order<1||x.order>999))
      return status('Controlla titoli e numeri d’ordine (1–999).','error');
    const orders=rows.map(x=>x.order);
    if(new Set(orders).size!==orders.length)return status('Ogni tavola deve avere un ordine diverso.','error');
    const user=M.ctx.user,access=M.ctx.accessVersion,active=()=>canPublish()&&M.ctx.accessVersion===access&&M.ctx.user?.id===user.id;
    const uploaded=[],ids=[],startText=$('approved-submit').textContent;
    let insertedMemories=false,published=false;
    busy=true;$('approved-submit').disabled=true;$('approved-submit').textContent='Pubblicazione…';
    try{
      const dimensions=[];
      for(let i=0;i<rows.length;i++){
        dimensions.push(await validateFile(rows[i].file));
        if(!active())throw Error('La sessione è cambiata: ricarica il pannello.');
      }
      await verifyPositions(chapterId,orders);
      if(!active())throw Error('La sessione è cambiata: ricarica il pannello.');
      const date=new Date().toISOString().slice(0,10),memories=[],media=[];
      rows.forEach((row,i)=>{
        const id=crypto.randomUUID(),path=user.id+'/'+id+'/'+crypto.randomUUID()+'.png';
        ids.push(id);
        memories.push({id,chapter_id:chapterId,title:row.title,body:'',memory_date:date,page_order:row.order,created_by:user.id});
        media.push({memory_id:id,storage_path:path,media_kind:'image',mime_type:'image/png',
          sort_order:0,created_by:user.id,layout:'full',caption:'',
          photo_settings:{approved_spread:true,spread_width:dimensions[i].width,spread_height:dimensions[i].height}});
      });
      for(let i=0;i<rows.length;i++){
        if(!active())throw Error('Sessione scaduta durante il caricamento.');
        status('Caricamento privato '+(i+1)+' di '+rows.length+'…');
        const response=await M.sb.storage.from('mattia-album').upload(media[i].storage_path,rows[i].file,
          {contentType:'image/png',upsert:false,cacheControl:'3600'});
        if(response.error)throw response.error;
        uploaded.push(media[i].storage_path);
      }
      if(!active())throw Error('Sessione scaduta prima della pubblicazione.');
      status('Salvataggio dell’ordine delle tavole…');
      const saved=await M.sb.from('album_memories').insert(memories).select('id');
      if(saved.error)throw saved.error;
      insertedMemories=true;
      if(!active())throw Error('Sessione scaduta durante la pubblicazione.');
      const linked=await M.sb.from('album_media').insert(media).select('id');
      if(linked.error)throw linked.error;
      published=true;
      clearDraft();
      await refresh();
      if(active())status(rows.length+' '+(rows.length===1?'tavola pubblicata':'tavole pubblicate')+' nel libro privato. Apri il capitolo per verificare lo sfoglio. ♡','ok');
    }catch(error){
      let cleanupFailed=false;
      if(!published && active()){
        if(insertedMemories){
          try{const r=await M.sb.from('album_media').delete().in('memory_id',ids);if(r.error)throw r.error;}
          catch{cleanupFailed=true;}
        }
        if(uploaded.length){
          try{const r=await M.sb.storage.from('mattia-album').remove(uploaded);if(r.error)throw r.error;}
          catch{cleanupFailed=true;}
        }
        if(insertedMemories){
          try{const r=await M.sb.from('album_memories').delete().in('id',ids);if(r.error)throw r.error;}
          catch{cleanupFailed=true;}
        }
      }
      if(active())status('Pubblicazione non completata: '+M.readableError(error)+(cleanupFailed?' Verifica eventuali caricamenti parziali prima di riprovare.':''),'error');
    }finally{
      busy=false;$('approved-submit').disabled=!canPublish();
      $('approved-submit').textContent=startText;
    }
  }
  function reevaluate(){
    if(!canPublish()){if(!panel.hidden||draft.length)resetPrivate();return;}
    if(panel.hidden){panel.hidden=false;refresh();}
  }
  $('approved-files').addEventListener('change',onFileChange);
  $('approved-chapter').addEventListener('change',()=>{renderExisting();if(draft.length)renderDraft();});
  $('approved-form').addEventListener('submit',publish);
  $('approved-refresh').addEventListener('click',refresh);
  const observer=new MutationObserver(reevaluate);
  observer.observe(content,{attributes:true,attributeFilter:['hidden']});
  observer.observe(owner,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('mattia:authorized',reevaluate);
  document.addEventListener('mattia:access-cleared',resetPrivate);
  window.addEventListener('pagehide',resetPrivate);
  reevaluate();
})();
