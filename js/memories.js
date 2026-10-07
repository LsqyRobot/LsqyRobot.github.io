(() => {
  const root=document.querySelector('.memory-page');
  if(!root)return;
  const sections=[...root.querySelectorAll('[data-memory-year]')];
  const buttons=[...root.querySelectorAll('[data-memory-filter]')];
  const photos=[...root.querySelectorAll('[data-memory-photo]')];
  const status=root.querySelector('.memory-status');
  let year='all';
  function filter(value){
    year=value;
    sections.forEach(s=>s.hidden=value!=='all'&&s.dataset.memoryYear!==value);
    buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.memoryFilter===value)));
    const n=photos.filter(p=>value==='all'||p.dataset.year===value).length;
    status.textContent=`${value==='all'?'全部回忆':value==='2026'?'云南旅行':value+' 年'} · ${n} 张`;
  }
  buttons.forEach(b=>b.addEventListener('click',()=>filter(b.dataset.memoryFilter)));
  root.querySelector('.memory-filters').hidden=false;
  root.querySelector('.memory-latest').addEventListener('click',()=>filter('2026'));
  if(location.hash.startsWith('#yunnan-2026-09-30')){
    filter('2026');requestAnimationFrame(()=>document.querySelector(location.hash)?.scrollIntoView());
  }
  const dialog=document.querySelector('.memory-viewer');
  if(!dialog||typeof dialog.showModal!=='function')return;
  const large=dialog.querySelector('[data-memory-large]');
  let visible=[],index=0,returnTo=null;
  function render(){
    const p=visible[index];
    large.src=p.href;large.alt=p.dataset.caption;
    dialog.querySelector('[data-memory-counter]').textContent=`${index+1} / ${visible.length}`;
    dialog.querySelector('[data-memory-caption]').textContent=p.dataset.caption;
    dialog.querySelector('[data-memory-date]').textContent=p.dataset.location||p.dataset.date;
    dialog.querySelector('[data-memory-original]').href=p.href;
  }
  function open(p){
    visible=photos.filter(p=>year==='all'||p.dataset.year===year);
    index=visible.indexOf(p);returnTo=p;render();dialog.showModal();
    document.documentElement.style.overflow='hidden';
    dialog.querySelector('[data-memory-close]').focus();
  }
  photos.forEach(p=>p.addEventListener('click',e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();open(p);
  }));
  function step(delta){index=(index+delta+visible.length)%visible.length;render();}
  dialog.querySelector('[data-memory-prev]').addEventListener('click',()=>step(-1));
  dialog.querySelector('[data-memory-next]').addEventListener('click',()=>step(1));
  dialog.querySelector('[data-memory-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}
    if(e.key==='ArrowRight'){e.preventDefault();step(1);}
  });
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{document.documentElement.style.overflow='';returnTo?.focus({preventScroll:true});});
})();
