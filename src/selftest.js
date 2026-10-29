'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const { BrowserWindow }=require('electron');
const { HoverController,preferences,fromLegacy,contains }=require('./core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(predicate,ms=3000){const end=performance.now()+ms;while(!predicate()){if(performance.now()>end)throw new Error('Test condition timed out');await sleep(10);}}
function domainTests(checks){
  let visible=true,alpha=0;
  const regions=[{x:0,y:0,width:500,height:500}];
  const adapter={visible:()=>visible,regions:()=>regions,alpha:a=>alpha=a,show:()=>visible=true,hide:()=>visible=false};
  const p=preferences();const c=new HoverController(adapter,p,0);
  assert.equal(p.delay,100);assert.equal(p.visibility,25);
  c.tick({x:600,y:600},0);c.tick({x:600,y:600},101);c.tick({x:600,y:600},211);
  assert(alpha>0&&alpha<.25);c.tick({x:600,y:600},322);assert.equal(visible,false);
  c.tick({x:30,y:30},330);assert.equal(visible,true);assert(alpha<.001);c.tick({x:30,y:30},550);assert(Math.abs(alpha-.25)<.001);
  checks.push('default-25-percent-100ms-delay-smooth-fade-native-adapter-contract');
  c.tick({x:600,y:600},600);c.tick({x:600,y:600},701);c.tick({x:600,y:600},760);let before=alpha;
  c.tick({x:30,y:30},761);assert(Math.abs(alpha-before)<.001);c.tick({x:30,y:30},1000);assert(Math.abs(alpha-.25)<.001);
  checks.push('midfade-reentry-retargets-from-current-opacity');
  regions.push({x:700,y:0,width:300,height:500});c.tick({x:750,y:30},1100);c.tick({x:750,y:30},2000);assert.equal(visible,true);
  c.tick({x:1100,y:600},2100);c.tick({x:1100,y:600},2201);c.tick({x:1100,y:600},2422);assert.equal(visible,false);
  checks.push('open-settings-only-protects-its-actual-pointer-region');
  c.mode(false,2500);c.tick({x:1100,y:600},2800);assert.equal(visible,true);c.hide();c.tick({x:30,y:30},2900);assert.equal(visible,false);
  c.restore(3000);c.tick({x:30,y:30},3300);assert.equal(visible,true);c.mode(true,3301);c.opacity(1,3302);c.tick({x:30,y:30},3450);assert(Math.abs(alpha-.01)<.001);
  checks.push('mode-off-manual-hide-restore-and-one-percent-opacity');
  assert(contains({x:900,y:700},{x:800,y:600,width:400,height:300}));assert(!contains({x:1200,y:700},{x:800,y:600,width:400,height:300}));
  checks.push('cursor-and-window-bounds-share-dip-coordinate-space');
  const legacy=fromLegacy({Visibility:20,HoverReveal:true,ChromeHidden:true,AlwaysOnTop:false,HideDelay:350,FadeDuration:220,Zoom:50});
  assert.equal(legacy.visibility,20);assert.equal(legacy.delay,100);assert.equal(legacy.chromeHidden,true);assert.equal(legacy.topmost,false);
  checks.push('legacy-display-preferences-migrate-with-faster-hover-delay-without-reading-login-data');
}
function fixture(){return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>轻窗本地功能验证</title><style>body{font:18px sans-serif;padding:40px;color:#24344c}button{font:inherit;padding:10px}h1{font-size:28px}</style><h1>本地答题交互验证</h1><p>仅用于验证网页交互和窗口隐藏，不是真实题库。</p><button id="answer" onclick="this.textContent='已选择 B';window.answerState='B';localStorage.setItem('lf-persist','yes');document.cookie='lfpersist=yes;max-age=3600;path=/'">选择 B</button><p id="status">请点击上方按钮</p><div style="height:1400px"></div><p>页面底部</p></html>`;}
exports.run=async function(ctx){
  const {ui,app,fs,path,DATA,REPORT,now,atomic}=ctx;const checks=[];const metrics={};let server,secondServer;
  const started=new Date().toISOString();
  const save=(success,error)=>atomic(path.join(REPORT,'electron-self-test.json'),{success,appVersion:ui.snapshot().version,started,finished:new Date().toISOString(),checks,metrics,versions:process.versions,error});
  function checkShellStyle(stage){
    if(process.platform!=='win32'||!process.env.LF_QA_PYTHON)return;
    const handle=ui.main.getNativeWindowHandle().readBigUInt64LE().toString();
    const code='import ctypes,json,sys; u=ctypes.WinDLL("user32",use_last_error=True); u.GetWindowLongW.argtypes=[ctypes.c_void_p,ctypes.c_int]; u.GetWindowLongW.restype=ctypes.c_long; s=u.GetWindowLongW(int(sys.argv[1]),-20); print(json.dumps({"toolWindow":bool(s&128),"appWindow":bool(s&262144),"style":s}))';
    const result=JSON.parse(require('node:child_process').execFileSync(process.env.LF_QA_PYTHON,['-c',code,handle],{encoding:'utf8',windowsHide:true,timeout:5000}));
    assert.equal(result.toolWindow,true);assert.equal(result.appWindow,false);
    (metrics.windowsShellStyles??=[]).push({stage,...result});
  }
  async function checkResizeEdges(stage){
    if(process.platform!=='win32'||!process.env.LF_QA_PYTHON)return;
    const handle=ui.main.getNativeWindowHandle().readBigUInt64LE().toString();
    const {promisify}=require('node:util');
    const run=promisify(require('node:child_process').execFile);
    const previous=ui.main.getBounds(),opacity=ui.main.getOpacity();clearInterval(ui.timer);
    let stdout;
    try{
      ui.main.setOpacity(0);
      const area=require('electron').screen.getPrimaryDisplay().workArea;
      ui.main.setBounds({x:area.x+80,y:area.y+80,width:600,height:500});
      await sleep(60);
      ({stdout}=await run(process.env.LF_QA_PYTHON,[path.join(__dirname,'native-window-check.py'),handle],{encoding:'utf8',windowsHide:true,timeout:5000}));
    }finally{
      ui.main.setBounds(previous);ui.main.setOpacity(opacity);ui.timer=setInterval(()=>ui.tick(),16);
    }
    assert.equal(ui.main.isFocused(),false);
    const result=JSON.parse(stdout);(metrics.nativeResizeEdges??=[]).push({stage,...result});assert.equal(result.thickFrame,true);
    assert.deepEqual(result.hits,{top:12,bottom:15,left:10,right:11,topLeft:13,topRight:14,bottomLeft:16,bottomRight:17});
  }
  try{
    domainTests(checks);
    checkShellStyle('initially-visible');
    await checkResizeEdges('toolbar-visible');
    server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fixture());});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17843,'127.0.0.1',resolve);});
    const base='http://127.0.0.1:17843/';
    await ui.current().webContents.loadURL(base);
    const wc=ui.current().webContents;
    const sandbox=await wc.executeJavaScript('({node:typeof require,electron:typeof window.light,title:document.title})');
    assert.equal(sandbox.node,'undefined');assert.equal(sandbox.electron,'undefined');assert.equal(sandbox.title,'轻窗本地功能验证');
    checks.push('remote-webpage-sandboxed-no-node-or-privileged-bridge');
    if(process.argv.includes('--verify-restart')){
      const persisted=await wc.executeJavaScript('localStorage.getItem("lf-persist")');assert.equal(persisted,'yes');
      const cookies=await wc.session.cookies.get({url:base,name:'lfpersist'});assert(cookies.some(c=>c.value==='yes'));
      checks.push('browser-localstorage-and-cookies-survive-real-process-restart');
      assert(ui.siteState.sites.some(site=>site.name==='QA保留'));
      checks.push('saved-website-library-survives-real-process-restart');
    }
    await wc.executeJavaScript('document.querySelector("#answer").click();window.scrollTo(0,200)');
    assert.equal(await wc.executeJavaScript('window.answerState'),'B');
    assert((await wc.executeJavaScript('scrollY'))>0);
    checks.push('webpage-click-scroll-and-local-browser-storage');
    await ui.main.webContents.executeJavaScript('window.light.action("prefs",{key:"hover",value:false})');
    assert.equal(ui.prefs.hover,false);ui.pointer={x:-32000,y:-32000};await sleep(400);assert(ui.main.isVisible());
    await ui.main.webContents.executeJavaScript('window.light.action("prefs",{key:"hover",value:true})');
    assert.equal(ui.prefs.hover,true);
    ui.pointer={x:ui.main.getBounds().x+30,y:ui.main.getBounds().y+30};
    checks.push('actual-toolbar-ipc-switch-controls-visible-native-window');
    await ui.main.webContents.executeJavaScript('document.querySelector("#more").click()');
    await until(()=>ui.controlsOpen);
    assert.equal(BrowserWindow.getAllWindows().length,1);assert(!ui.main.isFocused());
    assert.equal(ui.current().getBounds().y,134);
    ui.pointer={x:ui.main.getBounds().x+30,y:ui.main.getBounds().y+110};await sleep(400);assert(ui.main.isVisible());
    checks.push('appearance-controls-embedded-in-window-border-no-separate-settings-window');
    const t=now();ui.pointer={x:-32000,y:-32000};
    await until(()=>!ui.main.isVisible(),1800);metrics.hideMs=now()-t;
    assert(metrics.hideMs<700);assert.equal(ui.controller.current,0);
    assert.equal(ui.current().getVisible(),true); // Parent window hides the live view, without destroying it.
    const reenter=now();ui.pointer={x:ui.main.getBounds().x+50,y:ui.main.getBounds().y+50};
    await until(()=>ui.main.isVisible(),1000);metrics.revealStartMs=now()-reenter;
    await until(()=>!ui.controller.fade);assert(Math.abs(ui.main.getOpacity()-.25)<.01);
    assert(!ui.main.isFocused());assert.equal(await wc.executeJavaScript('window.answerState'),'B');assert.equal(ui.controlsOpen,true);
    checkShellStyle('after-hover-reveal');
    if(metrics.windowsShellStyles)checks.push('real-win32-toolwindow-without-appwindow-style-persists-after-hide-and-reveal');
    checks.push('real-16ms-polling-inline-settings-open-mouse-out-hides-whole-native-window');
    checks.push('mouse-reentry-restores-inline-controls-and-answer-without-focus-or-reload');
    await ui.main.webContents.executeJavaScript('document.querySelector("#mode").click()');
    assert.equal(ui.prefs.hover,false);
    const modeText=await ui.main.webContents.executeJavaScript('document.querySelector("#mode").textContent');assert.equal(modeText,'始终显示');
    await ui.main.webContents.executeJavaScript('document.querySelector("#mode").click()');
    checks.push('inline-hover-toggle-controls-native-auto-hide');
    await ui.main.webContents.executeJavaScript('(()=>{const el=document.querySelector("#visibility");el.value=20;el.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await until(()=>ui.prefs.visibility===20);
    await until(()=>!ui.controller.fade);assert(Math.abs(ui.main.getOpacity()-.2)<.01);
    await ui.main.webContents.executeJavaScript('(()=>{const el=document.querySelector("#visibility");el.value=1;el.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await until(()=>ui.prefs.visibility===1);
    await until(()=>!ui.controller.fade);assert(Math.abs(ui.main.getOpacity()-.01)<.01);
    ui.change('visibility',25);await until(()=>!ui.controller.fade);
    checks.push('native-whole-window-opacity-20-and-1-percent');
    for(const width of [360,440,900]){
      ui.main.setSize(width,640);await sleep(100);
      const metrics=await ui.main.webContents.executeJavaScript('(()=>{const rows=[...document.querySelectorAll(".top,.nav,.extra-row")];return {overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:rows.some(row=>row.scrollWidth>row.clientWidth+1),height:document.querySelector("#extras").getBoundingClientRect().height,sliderDrag:getComputedStyle(document.querySelector("#visibility")).webkitAppRegion};})()');
      assert.equal(metrics.overflow,false);assert.equal(metrics.clipped,false);assert.equal(metrics.height,ui.geometry().extras);assert.equal(metrics.sliderDrag,'no-drag');
      const capture=await ui.main.webContents.capturePage({x:0,y:0,width:ui.main.getContentSize()[0],height:ui.geometry().header});fs.writeFileSync(path.join(REPORT,'electron-border-'+width+'.png'),capture.toPNG());
    }
    checks.push('inline-border-controls-render-without-clipping-at-360-440-900-dip-and-slider-is-interactive');
    await ui.main.webContents.executeJavaScript('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
    await until(()=>!ui.controlsOpen);assert.equal(ui.current().getBounds().y,70);assert.equal(await wc.executeJavaScript('window.answerState'),'B');
    checks.push('escape-collapses-inline-controls-without-losing-page-state');
    ui.main.setSize(440,640);await sleep(100);
    const collapsed=await ui.main.webContents.capturePage({x:0,y:0,width:ui.main.getContentSize()[0],height:70});fs.writeFileSync(path.join(REPORT,'electron-border-collapsed.png'),collapsed.toPNG());
    ui.change('chromeHidden',true);const b=ui.main.getContentSize(),v=ui.current().getBounds();assert.deepEqual(v,{x:0,y:0,width:b[0],height:b[1]});
    await checkResizeEdges('toolbar-hidden');
    if(metrics.nativeResizeEdges)checks.push('real-windows-top-bottom-left-right-and-corner-resize-hit-tests-with-and-without-toolbar');
    const cb=ui.corner.getBounds(),contentBounds=ui.main.getContentBounds();assert.equal(cb.width,20);assert.equal(cb.height,20);
    ui.pointer={x:contentBounds.x+b[0]-60,y:contentBounds.y+15};await sleep(60);assert(!ui.corner.getVisible());
    ui.pointer={x:contentBounds.x+cb.x+10,y:contentBounds.y+cb.y+10};await sleep(60);assert(ui.corner.getVisible());
    const button=await ui.corner.webContents.executeJavaScript('(()=>{const b=document.querySelector("#open"),r=b.getBoundingClientRect();return {width:r.width,height:r.height,label:b.getAttribute("aria-label"),text:b.textContent};})()');
    assert.equal(button.width,20);assert.equal(button.height,20);assert.equal(button.label,'外观设置');assert.equal(button.text,'⋯');
    try{const cornerShot=await ui.corner.webContents.capturePage();fs.writeFileSync(path.join(REPORT,'electron-small-corner.png'),cornerShot.toPNG());}
    catch{
      const local=ui.corner.webContents;try{local.debugger.attach('1.3');const shot=await local.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});fs.writeFileSync(path.join(REPORT,'electron-small-corner.png'),Buffer.from(shot.data,'base64'));}finally{if(local.debugger.isAttached())local.debugger.detach();}
    }
    checks.push('appearance-corner-is-20x20-and-old-wide-overlay-area-no-longer-triggers-or-covers-page');
    ui.pointer={x:ui.main.getBounds().x+80,y:ui.main.getBounds().y+80};await sleep(60);assert(!ui.corner.getVisible());
    await ui.corner.webContents.executeJavaScript('document.querySelector("#open").click()');await until(()=>ui.controlsOpen);
    assert.equal(ui.current().getBounds().y,ui.geometry().header);assert.equal(BrowserWindow.getAllWindows().length,1);
    await ui.main.webContents.executeJavaScript('document.querySelector("#frame").click()');await until(()=>!ui.prefs.chromeHidden);
    await ui.action('close-settings');assert.equal(ui.current().getBounds().y,70);
    await ui.main.webContents.executeJavaScript('document.querySelector("#frame").click()');await until(()=>ui.prefs.chromeHidden);
    assert.equal(ui.current().getBounds().y,0);
    checks.push('frameless-live-webview-fills-client-and-hover-corner-control-works');
    ui.change('fade',400);ui.pointer={x:-32000,y:-32000};await until(()=>ui.controller.fade&&ui.controller.fade.to===0);await sleep(80);
    const before=ui.main.getOpacity();ui.pointer={x:ui.main.getBounds().x+30,y:ui.main.getBounds().y+30};await sleep(20);
    assert(Math.abs(ui.main.getOpacity()-before)<.08);await until(()=>!ui.controller.fade);assert(Math.abs(ui.main.getOpacity()-.25)<.01);
    checks.push('real-native-fade-reverses-on-mid-transition-reentry');
    ui.change('fade',220);await wc.executeJavaScript('window.open("'+base+'popup","lf-popup");void 0');
    await until(()=>ui.views.length===2);await sleep(250);
    const child=ui.current().webContents;await until(()=>!child.isLoading());assert.equal(await child.executeJavaScript('window.opener!==null'),true);
    assert.equal(child.session,wc.session);ui.closeTab();assert.equal(ui.current().webContents,wc);
    assert.equal(await wc.executeJavaScript('window.answerState'),'B');
    checks.push('popup-opener-and-session-preserved-with-return-to-original-page');
    ui.change('zoom',100);await wc.executeJavaScript('document.body.style.minWidth="1800px"');await ui.fit();assert(ui.prefs.zoom<100);await wc.executeJavaScript('document.body.style.minWidth=""');
    ui.change('chromeHidden',false);await ui.action('size',{width:560,height:640});assert(Math.abs(ui.main.getSize()[0]-560)<=3);metrics.requestedWidth=560;metrics.nativeWidth=ui.main.getSize()[0];
    const original=ui.main.getBounds();
    ui.main.setBounds({...original,height:original.height+100});await sleep(80);
    const grown=ui.main.getBounds();assert(Math.abs(grown.height-original.height-100)<=3);assert(Math.abs(grown.y-original.y)<=1);
    ui.main.setBounds({...original,y:original.y+60,height:original.height-60});await sleep(80);
    const shrunk=ui.main.getBounds();assert(Math.abs(shrunk.y+shrunk.height-original.y-original.height)<=2);
    const content=ui.main.getContentSize(),viewBounds=ui.current().getBounds();assert.equal(viewBounds.height,content[1]-ui.geometry().header-ui.geometry().footer);
    assert.equal(await wc.executeJavaScript('window.answerState'),'B');
    for(const chromeHidden of [false,true]){
      ui.change('chromeHidden',chromeHidden);await ui.action('size',{width:180,height:120});await sleep(60);
      const small=ui.main.getSize();assert(Math.abs(small[0]-180)<=3);assert(Math.abs(small[1]-120)<=3);assert.deepEqual(ui.main.getMinimumSize(),[0,0]);
      (metrics.smallSizes??=[]).push({chromeHidden,width:small[0],height:small[1]});
    }
    ui.save();const smallSaved=JSON.parse(fs.readFileSync(ui.file,'utf8'));assert.equal(smallSaved.chromeHidden,true);
    ui.change('chromeHidden',false);ui.main.setBounds(original);
    metrics.heightResize={before:original.height,grown:grown.height,shrunk:shrunk.height};
    checks.push('no-app-minimum-width-or-height-and-real-180x120-window-with-toolbar-shown-or-hidden');
    ui.change('chromeHidden',false);await ui.action('close-settings');
    for(const [width,height] of [[440,300],[360,240],[280,180],[180,120],[120,90],[80,60]]){
      ui.main.setSize(width,height);await sleep(100);
      const layout=await ui.main.webContents.executeJavaScript(`(()=>{
        const top=document.querySelector('.top').getBoundingClientRect();
        const controls=[...document.querySelectorAll('.top button,.top input,.top output')].filter(el=>el.getBoundingClientRect().width>0);
        const rects=controls.map(el=>({id:el.id||el.getAttribute('aria-label'),r:el.getBoundingClientRect().toJSON()}));
        return {width:innerWidth,height:innerHeight,header:document.querySelector('#chromeRegion').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:rects.filter(({r})=>r.left<-.5||r.right>innerWidth+.5||r.top<top.top-.5||r.bottom>top.bottom+.5).map(x=>x.id),overlaps:rects.some((a,i)=>rects.slice(i+1).some(b=>Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>1&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>1)),more:document.querySelector('#more').getBoundingClientRect().width>0};
      })()`);
      assert.equal(layout.overflow,false,JSON.stringify(layout));assert.deepEqual(layout.clipped,[],JSON.stringify(layout));assert.equal(layout.overlaps,false,JSON.stringify(layout));assert(layout.more);
      assert.equal(ui.current().getBounds().y,layout.header);assert(ui.current().getBounds().height>=1);
      const shot=await ui.main.webContents.capturePage({x:0,y:0,width:ui.main.getContentSize()[0],height:ui.main.getContentSize()[1]});fs.writeFileSync(path.join(REPORT,'responsive-'+width+'x'+height+'.png'),shot.toPNG());
      await ui.main.webContents.executeJavaScript('document.querySelector("#more").click()');await sleep(70);
      if(width<140||height<100){assert(ui.compactMenu);assert.equal(ui.controlsOpen,false);assert(ui.compactMenu.items.some(item=>item.label==='退出'));assert(ui.compactMenu.items.some(item=>item.label==='移入显示'));}
      else{
        assert(ui.controlsOpen);const g=ui.geometry();assert.equal(ui.current().getBounds().y,g.header);assert(ui.current().getBounds().height>=1);
        const reachable=await ui.main.webContents.executeJavaScript(`(()=>{const panel=document.querySelector('#extras');const controls=[...panel.querySelectorAll('button,input,select')].filter(el=>el.getBoundingClientRect().width>0);return controls.every(el=>{el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect(),p=panel.getBoundingClientRect();return r.left>=p.left-.5&&r.right<=p.right+.5&&r.top>=p.top-.5&&r.bottom<=p.bottom+.5;});})()`);assert(reachable,'Overflow actions must be reachable at '+width+'x'+height);
        const panelShot=await ui.main.webContents.capturePage({x:0,y:0,width:ui.main.getContentSize()[0],height:g.header});fs.writeFileSync(path.join(REPORT,'responsive-more-'+width+'x'+height+'.png'),panelShot.toPNG());
        await ui.action('close-settings');
      }
      (metrics.responsiveSizes??=[]).push({width,height,header:layout.header,overlaps:layout.overlaps,clipped:layout.clipped});
    }
    ui.main.setSize(180,120);await ui.openSettings();assert(ui.controlsOpen);ui.main.setSize(120,90);await sleep(80);assert.equal(ui.controlsOpen,false);
    ui.main.setBounds(original);assert.equal(await wc.executeJavaScript('window.answerState'),'B');
    checks.push('responsive-toolbar-no-overlap-or-clipping-and-overflow-actions-reachable-down-to-80x60');
    secondServer=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fixture());});
    await new Promise((resolve,reject)=>{secondServer.once('error',reject);secondServer.listen(17844,'127.0.0.1',resolve);});
    const originalSite=ui.siteState.activeId,originalPage=ui.current().webContents;
    for(const site of [...ui.siteState.sites])if(site.id!=='fenbi')await ui.deleteWebsite(site.id);
    await ui.main.webContents.executeJavaScript('window.light.action("sites")');assert(ui.sitesOpen);
    const addFromForm=async(name,url)=>{
      await ui.main.webContents.executeJavaScript('(()=>{document.querySelector("#site-name").value='+JSON.stringify(name)+';document.querySelector("#site-url").value='+JSON.stringify(url)+';document.querySelector("#site-form").requestSubmit();})()');
      await until(()=>ui.siteState.sites.some(site=>site.name===name));await until(()=>!ui.current().webContents.isLoading());await sleep(80);
      return ui.siteState.sites.find(site=>site.name===name);
    };
    const a=await addFromForm('练习站 A','http://127.0.0.1:17843/site-a');const pageA=ui.current().webContents;
    await pageA.executeJavaScript('document.querySelector("#answer").click();window.scrollTo(0,200);document.cookie="qaSite=alpha;max-age=3600;path=/"');
    const bSite=await addFromForm('<img src=x onerror=alert(1)>','http://127.0.0.1:17844/site-b');const pageB=ui.current().webContents;
    assert.equal(await ui.main.webContents.executeJavaScript('document.querySelectorAll("#site-list img").length'),0);
    assert.notEqual(pageA.session,pageB.session);assert.notEqual(pageA.session,originalPage.session);
    assert.equal(await pageB.executeJavaScript('localStorage.getItem("lf-persist")'),null);
    assert.equal((await pageB.session.cookies.get({url:'http://127.0.0.1:17844/',name:'qaSite'})).length,0);
    checks.push('website-form-creates-sites-with-text-only-names-and-isolated-cookie-storage');
    await ui.main.webContents.executeJavaScript('document.querySelector(\'[data-site-id="'+a.id+'"]\').click()');
    await until(()=>ui.siteState.activeId===a.id);assert.equal(ui.current().webContents,pageA);
    assert.equal(await pageA.executeJavaScript('window.answerState'),'B');assert(await pageA.executeJavaScript('scrollY>0'));
    assert.equal(pageB.isDestroyed(),false);assert.equal(ui.siteViews.get(bSite.id)[0].getVisible(),false);
    checks.push('switching-websites-keeps-live-answer-scroll-and-background-page-without-reload');
    await ui.saveWebsite({id:a.id,name:'QA保留',url:a.url});assert.equal(ui.current().webContents,pageA);
    const unsafeBefore=ui.current().webContents.getURL();await assert.rejects(ui.action('navigate','javascript:alert(1)'),/http/);assert.equal(ui.current().webContents.getURL(),unsafeBefore);
    checks.push('editing-site-name-keeps-live-view-and-executable-navigation-is-rejected');
    const libraryShot=await ui.main.webContents.capturePage({x:0,y:0,width:ui.main.getContentSize()[0],height:ui.geometry().header});fs.writeFileSync(path.join(REPORT,'website-library.png'),libraryShot.toPNG());
    await ui.deleteWebsite(bSite.id);await until(()=>pageB.isDestroyed());assert(!ui.siteState.sites.some(site=>site.id===bSite.id));
    await ui.switchSite(originalSite);assert.equal(ui.current().webContents,originalPage);assert.equal(await originalPage.executeJavaScript('window.answerState'),'B');
    assert.equal(require('./sites').partitionForURL(ui.activeSite().url),'persist:fenbi');
    const storedSites=JSON.parse(fs.readFileSync(ui.sitesFile,'utf8'));assert(storedSites.sites.some(site=>site.name==='QA保留'));
    await ui.action('close-sites');assert.equal(ui.sitesOpen,false);
    checks.push('website-removal-and-disk-persistence-preserve-original-fenbi-page-and-login-partition');
    ui.main.setSize(180,120);const tiny=ui.main.getBounds();await ui.openSites();assert(ui.main.getSize()[0]>tiny.width);await ui.action('close-sites');assert(Math.abs(ui.main.getSize()[0]-tiny.width)<=3);ui.main.setBounds(original);
    checks.push('website-manager-temporarily-expands-tiny-window-and-restores-original-size-on-close');
    checks.push('actual-window-height-can-grow-and-shrink-with-page-layout-and-answer-preserved');
    ui.save();const saved=JSON.parse(fs.readFileSync(ui.file,'utf8'));assert.equal(saved.hover,true);assert.equal(saved.visibility,25);assert.equal(saved.chromeHidden,false);
    checks.push('fit-size-and-settings-disk-roundtrip');
    const loopTrace=ui.trace.filter(s=>s.alpha>0&&s.alpha<.25);assert(loopTrace.length>3);metrics.intermediateFrames=loopTrace.length;
    atomic(path.join(REPORT,'electron-opacity-trace.json'),ui.trace);
    checks.push('native-window-fade-has-real-intermediate-opacity-updates');
    await wc.session.flushStorageData();await wc.session.cookies.flushStore();
    save(true);ui.main.destroy();server.close();secondServer.close();app.exit(0);
  }catch(error){save(false,String(error.stack||error));if(ui.main&&!ui.main.isDestroyed())ui.main.destroy();if(server)server.close();if(secondServer)secondServer.close();app.exit(1);}
};
exports.live=async function(ctx){
  const {ui,app,fs,path,REPORT,atomic,HOME}=ctx;const result={started:new Date().toISOString()};
  try{
    await ui.load(HOME);await sleep(10000);await ui.fit();
    const wc=ui.current().webContents;
    const doc=await wc.executeJavaScript('({title:document.title,url:location.origin+location.pathname,text:document.body.innerText.slice(0,2500),width:innerWidth,contentWidth:document.documentElement.scrollWidth})');
    Object.assign(result,doc);assert.equal(doc.title,'粉笔题库');assert(doc.url.startsWith('https://www.fenbi.com/spa/tiku'));
    try {
      const img=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});fs.writeFileSync(path.join(REPORT,'electron-live-page.png'),img.toPNG());result.screenshotCaptured=true;
    } catch(captureError) {
      result.screenshotCaptured=false;result.screenshotNote=String(captureError.message||captureError);
      try {
        wc.debugger.attach('1.3');
        const shot=await wc.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true});
        fs.writeFileSync(path.join(REPORT,'electron-live-page.png'),Buffer.from(shot.data,'base64'));result.screenshotCaptured=true;result.screenshotMethod='Chromium page capture';
      } catch(error) {result.screenshotNote+='; '+String(error.message||error);}
      finally {if(wc.debugger.isAttached())wc.debugger.detach();}
    }
    const b=ui.main.getBounds();ui.pointer={x:b.x-50,y:b.y-50};await until(()=>!ui.main.isVisible(),1500);result.actualWindowHidden=true;
    ui.pointer={x:b.x+20,y:b.y+20};await until(()=>ui.main.isVisible(),1000);await until(()=>!ui.controller.fade);result.actualWindowRevealed=true;
    assert.equal(await wc.executeJavaScript('document.title'),'粉笔题库');result.success=true;
  }catch(e){result.success=false;result.error=String(e.stack||e);}finally{result.finished=new Date().toISOString();atomic(path.join(REPORT,'electron-live-check.json'),result);ui.main.destroy();app.exit(result.success?0:1);}
};
