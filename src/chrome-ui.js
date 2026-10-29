'use strict';let current;
function render(s){
  current=s;
  const mode=document.querySelector('#mode');mode.textContent=s.hover?'移入 · 开':'始终显示';mode.dataset.short=s.hover?'移入':'常显';mode.classList.toggle('on',s.hover);mode.setAttribute('aria-pressed',String(s.hover));mode.setAttribute('aria-label',s.hover?'移入显示已开启，点击切换始终显示':'始终显示，点击开启移入显示');
  document.querySelector('#menu-mode').textContent=s.hover?'关闭移入显示':'开启移入显示';
  document.querySelector('#frame').textContent=s.chromeHidden?'有框':'无框';document.querySelector('#frame').title=s.chromeHidden?'恢复工具栏与边框':'隐藏工具栏与边框，只留网页';
  document.querySelector('#menu-frame').textContent=s.chromeHidden?'显示边框':'隐藏边框';
  document.querySelector('#site-switch').textContent=s.activeSiteName+' ▾';document.querySelector('#site-switch').title='切换或管理网站：'+s.activeSiteName;
  document.querySelector('#more').setAttribute('aria-expanded',String(s.controlsOpen));document.querySelector('#more').classList.toggle('on',s.controlsOpen);
  const g=s.layout;document.querySelector('#chromeRegion').hidden=!g.shown;document.querySelector('.nav').hidden=!g.nav;document.querySelector('.footer').hidden=!g.footer;document.querySelector('#extras').hidden=!s.controlsOpen;document.querySelector('#sitesPanel').hidden=!s.sitesOpen;
  for(const [key,value] of Object.entries({top:g.top,nav:g.nav,extras:g.extras,footer:g.footer}))document.documentElement.style.setProperty('--'+key+'-height',value+'px');
  document.body.classList.toggle('nav-hidden',!g.nav);
  document.querySelectorAll('[data-pref]').forEach(el=>{const value=s[el.dataset.pref];if(el.type==='checkbox')el.checked=value;else if(document.activeElement!==el)el.value=value;});
  document.querySelector('#visibilityValue').textContent=s.visibility+'%';document.querySelector('.opacity-value').textContent=s.visibility+'%';document.querySelector('#zoomValue').textContent=s.zoom+'%';
  if(document.activeElement.id!=='address')document.querySelector('#address').value=s.url;
  document.querySelector('#return').classList.toggle('compact',s.tabs<2);document.querySelector('#menu-return').hidden=s.tabs<2;document.querySelector('#status').textContent=s.status+'   ·   v'+s.version;
}
window.light.subscribe(render);window.light.state().then(render);
for(const id of ['mode','menu-mode'])document.getElementById(id).onclick=()=>window.light.action('prefs',{key:'hover',value:!current.hover});
for(const id of ['frame','menu-frame'])document.getElementById(id).onclick=()=>window.light.action('prefs',{key:'chromeHidden',value:!current.chromeHidden});
document.querySelectorAll('[data-pref]').forEach(el=>el.addEventListener(el.type==='range'?'input':'change',()=>window.light.action('prefs',{key:el.dataset.pref,value:el.type==='checkbox'?el.checked:Number(el.value)})));
document.querySelector('#size').onchange=e=>{if(!e.target.value)return;const [width,height]=e.target.value.split(',').map(Number);window.light.action('size',{width,height});e.target.value='';};
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>window.light.action(b.dataset.action));
document.querySelector('#address').onkeydown=e=>{if(e.key==='Enter')window.light.action('navigate',e.target.value);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(current?.controlsOpen||current?.sitesOpen))window.light.action('close-settings');});

