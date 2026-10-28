/* Gestione album: aree focalizzate, senza nuove query o privilegi. */
(function () {
  'use strict';
  const M = window.Mattia;
  const content = document.getElementById('private-content');
  const owner = document.getElementById('owner-only');
  const status = content?.querySelector('.admin-status');
  if (!M || !content || !owner || !status) return;

  const entries = [
    {id:'pagine', number:'01', label:'Pagine', title:'Pagine approvate', subtitle:'Le tavole definitive, pronte da caricare e sfogliare.', owner:true,
      elements:[document.getElementById('approved-panel')]},
    {id:'dediche', number:'02', label:'Bacheca privata', title:'Bacheca privata', subtitle:'Messaggi, dediche e fotografie lasciati a Mattia. Li vedete soltanto voi genitori.', owner:true,
      elements:[document.getElementById('private-board')]},
    {id:'ricordi', number:'03', label:'Ricordi', title:'Ricordi e fotografie', subtitle:'Scrivi un ricordo, modifica quelli esistenti e aggiungi immagini.', owner:false,
      elements:[document.getElementById('memory-form')?.closest('section'),document.getElementById('admin-memory-list')?.closest('section')]},
    {id:'foto', number:'04', label:'Studio foto', title:'Studio fotografico', subtitle:'Regola luce, cornici e didascalie delle fotografie non ancora impaginate.', owner:true,
      elements:[document.getElementById('photo-studio')]},
    {id:'famiglia', number:'05', label:'Famiglia', title:'Famiglia e capitoli', subtitle:'Gestisci gli inviti e scegli i capitoli da condividere.', owner:true,
      elements:[owner.querySelector('.two-panel-grid')]}
  ];
  if (entries.some(item=>item.elements.some(el=>!el))) {
    console.error('Impossibile costruire il menu Gestisci: manca una sezione.');
    return;
  }

  const nav = document.createElement('section');
  nav.id = 'admin-hub';
  nav.className = 'admin-hub';
  nav.hidden = true;
  nav.setAttribute('aria-label', 'Sezioni di gestione del libro');
  nav.innerHTML = [
    '<div class="admin-hub-top"><div><span class="admin-hub-kicker">IL TUO SPAZIO EDITORIALE</span>',
    '<h2 id="admin-hub-title">Pagine approvate</h2>',
    '<p id="admin-hub-description">Gestisci il libro, un capitolo alla volta.</p></div>',
    '<a class="admin-hub-book-link" href="../">Sfoglia il libro <span aria-hidden="true">↗</span></a></div>',
    '<nav class="admin-hub-tabs" id="admin-hub-tabs" aria-label="Cosa vuoi gestire?"></nav>'
  ].join('');
  status.insertAdjacentElement('afterend',nav);
  const tabHost=nav.querySelector('#admin-hub-tabs');
  const buttons=new Map();
  let role=null, active=null;

  function applyView(id) {
    const chosen=entries.find(item=>item.id===id && (!item.owner || role==='owner'));
    if(!chosen)return;
    active=chosen.id;
    for(const item of entries) {
      const visible=item.id===active;
      for(const el of item.elements)el.classList.toggle('admin-pane--inactive',!visible);
      const btn=buttons.get(item.id);
      if(btn) {
        btn.classList.toggle('admin-hub-tab--selected',visible);
        btn.setAttribute('aria-pressed',String(visible));
      }
    }
    nav.querySelector('#admin-hub-title').textContent=chosen.title;
    nav.querySelector('#admin-hub-description').textContent=chosen.subtitle;
    nav.dataset.view=active;
  }

  for(const item of entries){
    const button=document.createElement('button');
    button.type='button';
    button.id='admin-tab-'+item.id;
    button.className='admin-hub-tab';
    button.dataset.ownerOnly=item.owner?'true':'false';
    button.setAttribute('aria-pressed','false');
    button.innerHTML='<span class="admin-hub-tab-number">'+item.number+'</span><span class="admin-hub-tab-label"></span>';
    button.querySelector('.admin-hub-tab-label').textContent=item.label;
    button.addEventListener('click',()=>{
      if(nav.hidden || (item.owner && role!=='owner'))return;
      applyView(item.id);
    });
    tabHost.appendChild(button);
    buttons.set(item.id,button);
  }

  function clear() {
    role=null;active=null;nav.hidden=true;nav.dataset.view='';
    owner.hidden=true;
    for(const item of entries)for(const el of item.elements)el.classList.remove('admin-pane--inactive');
  }

  function sync() {
    if(content.hidden || !['owner','contributor'].includes(M.ctx.role)){
      clear();return;
    }
    const nextRole=M.ctx.role;
    if(role!==nextRole){
      role=nextRole;
      if(role!=='owner')owner.hidden=true;
      for(const item of entries)buttons.get(item.id).hidden=item.owner && role!=='owner';
      applyView(role==='owner'?'pagine':'ricordi');
    }
    nav.hidden=false;
  }

  document.addEventListener('mattia:access-cleared',clear);
  document.addEventListener('mattia:authorized',sync);
  new MutationObserver(sync).observe(content,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('pagehide',clear);
  sync();
})();
