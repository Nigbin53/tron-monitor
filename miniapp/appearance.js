/* Mineral appearance preferences are local to this browser. */
window.TronAppearance = (() => {
  const KEY = 'tron-mineral-appearance-v1';
  const backgrounds = [
    {id:'porcelain',name:'Фарфор',description:'Мягкий ровный свет'},
    {id:'nickel',name:'Никель',description:'Холодные металлические волны'},
    {id:'orbit',name:'Орбита',description:'Тонкие дуги цвета шампанского'},
    {id:'eclipse',name:'Затмение',description:'Мягкий свет по краю силуэта'},
    {id:'stardust',name:'Звёзды',description:'Редкие точки в минеральном свечении'}
  ];
  const valid = value => ({theme:value?.theme==='dark'?'dark':'light',background:backgrounds.some(b=>b.id===value?.background)?value.background:'porcelain'});
  let stored;
  try { stored = JSON.parse(localStorage.getItem(KEY)||'null'); } catch {}
  let state = valid(stored);
  const query = new URLSearchParams(location.search);
  const hasOverride = query.has('theme') || query.has('background');
  if(hasOverride)state=valid({theme:query.get('theme')||state.theme,background:query.get('background')||state.background});
  const wallpaper = (id=state.background,theme=state.theme) => `assets/backgrounds/${id}-${theme}.svg`;
  const shotPath = screen => `assets/screens/themes/${state.theme}/${state.background}/${screen}.jpg`;
  function updateControls(){
    document.querySelectorAll('[data-appearance-theme]').forEach(b=>{const selected=b.dataset.appearanceTheme===state.theme;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    document.querySelectorAll('[data-appearance-background]').forEach(b=>{const selected=b.dataset.appearanceBackground===state.background;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.querySelector('.background-thumb')?.style.setProperty('background-image',`url("${wallpaper(b.dataset.appearanceBackground)}")`);});
    document.querySelectorAll('[data-current-theme]').forEach(n=>n.textContent=state.theme==='dark'?'Тёмная':'Светлая');
    document.querySelectorAll('[data-appearance-download]').forEach(a=>a.href=wallpaper(a.dataset.appearanceDownload));
  }
  function apply(persist=false){
    const root=document.documentElement;
    root.dataset.theme=state.theme;root.dataset.background=state.background;
    root.style.colorScheme=state.theme;
    root.style.setProperty('--material-wallpaper',`url("${wallpaper()}")`);
    if(persist){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}}
    updateControls();
    document.dispatchEvent(new CustomEvent('mineral-appearance-change',{detail:{...state}}));
  }
  function set(partial){state=valid({...state,...partial});apply(true);return {...state};}
  function controls(compact=false){return `<div class="appearance-controls ${compact?'compact':''}"><div class="appearance-label">Тема</div><div class="theme-picker" role="group" aria-label="Тема интерфейса"><button type="button" data-appearance-theme="light" aria-label="Светлая тема" aria-pressed="${state.theme==='light'}" class="${state.theme==='light'?'selected':''}"><svg class="theme-symbol" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>Светлая</button><button type="button" data-appearance-theme="dark" aria-label="Тёмная тема" aria-pressed="${state.theme==='dark'}" class="${state.theme==='dark'?'selected':''}"><svg class="theme-symbol" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg>Тёмная</button></div><div class="appearance-label background-label">Фон</div><div class="background-picker" role="group" aria-label="Фон интерфейса">${backgrounds.map(b=>`<button type="button" class="background-option ${state.background===b.id?'selected':''}" data-appearance-background="${b.id}" aria-label="Фон ${b.name}" aria-pressed="${state.background===b.id}" title="${b.description}"><span class="background-thumb" style="background-image:url('${wallpaper(b.id)}')"><span class="background-check" aria-hidden="true">✓</span></span><span class="background-name">${b.name}</span></button>`).join('')}</div>${compact?'':`<p class="appearance-footnote">Применяется ко всем экранам. Ваш выбор сохраняется в этом браузере.</p>`}</div>`;}
  apply();
  document.addEventListener('DOMContentLoaded',()=>{
    const dialog=document.querySelector('#appearance-dialog');
    document.addEventListener('click',event=>{
      const theme=event.target.closest('[data-appearance-theme]');
      const background=event.target.closest('[data-appearance-background]');
      if(theme){set({theme:theme.dataset.appearanceTheme});return;}
      if(background){set({background:background.dataset.appearanceBackground});return;}
      if(event.target.closest('[data-appearance-open]')&&dialog){dialog.querySelector('.appearance-dialog-content').innerHTML=controls();dialog.showModal();}
      if(event.target.closest('[data-appearance-close]'))dialog?.close();
    });
    updateControls();
  });
  window.addEventListener('storage',event=>{if(event.key!==KEY||hasOverride)return;try{state=valid(JSON.parse(event.newValue));apply();}catch{}});
  return {backgrounds,getState:()=>({...state}),wallpaper,shotPath,controls,updateControls,set};
})();
