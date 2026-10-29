'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { preferences, fromLegacy, contains, clamp, HoverController, chromeLayout } = require('./core');
const { DEFAULT_SITE, normalizeURL, normalizeSiteState, saveSite, removeSite, partitionForURL } = require('./sites');
const { resolveProfileDirectory } = require('./profile');
const SELF = process.argv.includes('--self-test');
const LIVE = process.argv.includes('--live-check');
const PROFILE_TEST = process.argv.find(arg=>arg.startsWith('--profile-check='))?.split('=')[1];
const QA = SELF || LIVE || Boolean(PROFILE_TEST);
const ROOT = process.defaultApp ? path.resolve(__dirname, '..') : path.dirname(process.execPath);
function requireLegacyClosed(legacy){
  const executable=path.join(path.dirname(legacy),'electron.exe');if(process.platform!=='win32'||!fs.existsSync(executable))return;
  const code='@(Get-CimInstance Win32_Process -Filter "Name=\'electron.exe\'" | Where-Object { $_.ProcessId -ne [int]$env:LW_MIGRATION_PID -and $_.ExecutablePath -eq $env:LW_MIGRATION_EXE -and $_.CommandLine -notmatch "--type=" }).Count';
  let count;try{count=Number(require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,LW_MIGRATION_PID:String(process.pid),LW_MIGRATION_EXE:executable}}).trim());}catch{throw new Error('无法确认旧版是否已退出，登录资料尚未迁移。请关闭旧版后重试。');}
  if(!Number.isFinite(count)||count>0)throw new Error('旧版轻窗仍在运行。请先退出旧版再打开新版，登录资料尚未迁移。');
}
let profile;
try{profile=resolveProfileDirectory({installDir:PROFILE_TEST?process.env.LW_TEST_INSTALL_DIR||ROOT:ROOT,appDataDir:PROFILE_TEST?process.env.LW_TEST_APPDATA:app.getPath('appData'),development:Boolean(process.defaultApp)&&!PROFILE_TEST,qaDirectory:PROFILE_TEST==='seed'?path.join(process.env.LW_TEST_INSTALL_DIR||ROOT,'data'):SELF||LIVE?path.join(ROOT,'qa-electron-data'):undefined,beforeMigration:requireLegacyClosed});}
catch(error){dialog.showErrorBox('轻窗无法打开登录资料',error.message);app.exit(1);throw error;}
const DATA = profile.directory;
const REPORT = QA?path.join(ROOT,'qa'):path.join(DATA,'diagnostics');
const HOME = DEFAULT_SITE.url;
const VERSION = '3.0.1';
const ICON = [path.join(ROOT,'app.ico'),path.join(ROOT,'assets','icon.ico'),path.join(ROOT,'LightFenbi.ico')].find(p=>fs.existsSync(p));
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(REPORT, { recursive: true });
app.setName('轻窗');
app.setPath('userData', path.join(DATA, 'browser'));
app.setPath('sessionData',path.join(DATA,'browser'));
app.setAppUserModelId('LightFenbi.Personal');
let ui;
const now = () => performance.now();
const read = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')); } catch { return fallback; } };
function atomic(p, value) { const temp=p+'.tmp'; fs.writeFileSync(temp,JSON.stringify(value,null,2)); fs.renameSync(temp,p); }
function reportError(error) {
  const detail = String(error?.stack || error);
  fs.appendFileSync(path.join(DATA,'error.log'), new Date().toISOString()+' '+detail+'\n');
  if (QA) { atomic(path.join(REPORT,'electron-fatal.json'),{at:new Date().toISOString(),error:detail}); app.exit(1); }
}
process.on('uncaughtException',reportError);
process.on('unhandledRejection',reportError);

class FenbiApp {
  constructor() {
    this.file=path.join(DATA,'settings.json');
    const stored=QA?{}:read(this.file,null);
    const legacy=!stored&&!QA?read(path.resolve(ROOT,'..','轻窗粉笔-个人版','app','data','settings.json'),null):null;
    this.prefs=legacy?fromLegacy(legacy):preferences(stored||{});
    if(legacy&&Number.isFinite(legacy.X)&&legacy.X!==-1&&legacy.X>-10000&&legacy.Width>0&&legacy.Height>0)
      this.prefs.bounds=screen.screenToDipRect(null,{x:legacy.X,y:legacy.Y,width:legacy.Width,height:legacy.Height});
    this.sitesFile=path.join(DATA,'sites.json');
    this.siteState=normalizeSiteState(read(this.sitesFile,null));
    if(SELF&&this.siteState.sites.some(site=>site.id==='fenbi'))this.siteState.activeId='fenbi';
    this.siteViews=new Map();this.siteViews.set(this.siteState.activeId,[]);this.browserSessions=new Set();
    this.trusted=new Set(); this.status='正在准备网页…'; this.pointer=null;
    this.controlsOpen=false;this.sitesOpen=false; this.shutting=false; this.tray=null; this.trace=[];
    const area=screen.getPrimaryDisplay().workArea;
    let bounds={x:area.x+Math.round((area.width-860)/2),y:area.y+40,width:Math.min(860,area.width-40),height:Math.min(740,area.height-60)};
    if (!QA && this.prefs.bounds && screen.getAllDisplays().some(d=>contains({x:this.prefs.bounds.x+30,y:this.prefs.bounds.y+30},d.workArea))) bounds={...this.prefs.bounds};
    bounds.width=clamp(bounds.width,1,area.width); bounds.height=clamp(bounds.height,1,area.height);
    if(QA) bounds={x:-16000,y:-16000,width:900,height:720};
    this.main=new BrowserWindow({...bounds,minWidth:0,minHeight:0,show:false,frame:false,thickFrame:true,hasShadow:false,roundedCorners:false,resizable:true,
      title:'轻窗 v'+VERSION,type:'toolbar',icon:ICON,backgroundColor:'#ffffff',skipTaskbar:true,
      webPreferences:this.localPreferences()});
    this.trusted.add(this.main.webContents.id);
    this.main.setMenu(null);
    this.main.on('show',()=>this.main.setSkipTaskbar(true));
    this.main.setAlwaysOnTop(!QA && this.prefs.topmost);
    this.main.on('resize',()=>{const [w,h]=this.main.getContentSize();if(w<140||h<100)this.controlsOpen=false;this.layout();this.broadcast();this.saveSoon();});
    this.main.on('move',()=>this.saveSoon());
    this.main.on('close',event=>{if(!this.readyToClose){event.preventDefault();this.requestQuit();}else{this.shutting=true;this.save();}});
    this.main.on('closed',()=>this.shutdown());
    this.main.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    this.main.webContents.on('will-navigate',e=>e.preventDefault());
    const adapter={
      visible:()=>!this.main.isDestroyed() && this.main.isVisible() && !this.main.isMinimized(),
      regions:()=>this.regions(),
      alpha:a=>this.alpha(a),
      show:()=>this.showGroup(),
      hide:()=>this.hideGroup()
    };
    this.controller=new HoverController(adapter,this.prefs,now());
  }
  localPreferences() { return {preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}; }
  get views(){return this.siteViews.get(this.siteState.activeId)||[];}
  allViews(){return [...this.siteViews.values()].flat();}
  current() { return this.views.at(-1); }
  activeSite(){return this.siteState.sites.find(site=>site.id===this.siteState.activeId);}
  geometry() { const [w,h]=this.main.getContentSize();return chromeLayout(w,h,this.prefs.chromeHidden,this.controlsOpen||this.sitesOpen,this.sitesOpen); }
  snapshot() { const current=this.current()?.webContents;return {...this.prefs,controlsOpen:this.controlsOpen,sitesOpen:this.sitesOpen,sites:this.siteState.sites,activeSiteId:this.siteState.activeId,activeSiteName:this.activeSite().name,layout:this.geometry(),status:this.status,tabs:this.views.length,url:current&&!current.isDestroyed()?current.getURL()||this.activeSite().url:this.activeSite().url,version:VERSION}; }
  broadcast() { if(this.main.isDestroyed()||this.shutting)return;for(const id of this.trusted) { const wc=require('electron').webContents.fromId(id); if(wc&&!wc.isDestroyed())wc.send('lf:state',this.snapshot()); } }
  saveSoon() { clearTimeout(this.saveTimer); this.saveTimer=setTimeout(()=>this.save(),200); }
  save() { if(!QA && !this.main.isDestroyed() && !this.main.isMinimized())this.prefs.bounds=this.main.getBounds(); atomic(this.file,this.prefs); }
  saveSites(){atomic(this.sitesFile,this.siteState);}
  async switchSite(id){
    const site=this.siteState.sites.find(s=>s.id===id);if(!site)throw new Error('这个网站已不存在');
    for(const view of this.views)view.setVisible(false);
    this.siteState.activeId=id;if(!this.siteViews.has(id))this.siteViews.set(id,[]);
    if(!this.views.length){this.addView();this.load(site.url);}else{this.current().setVisible(true);this.status='已切换到 '+site.name;}
    this.saveSites();this.layout();this.broadcast();
  }
  disposeSite(id){
    const group=this.siteViews.get(id)||[];this.siteViews.delete(id);
    for(const view of group){this.main.contentView.removeChildView(view);if(!view.webContents.isDestroyed())view.webContents.close({waitForBeforeUnload:false});}
  }
  async saveWebsite(input){
    const saved=saveSite(this.siteState,input);this.siteState=saved.state;
    if(saved.previous&&saved.previous.url!==saved.site.url)this.disposeSite(saved.site.id);
    this.saveSites();await this.switchSite(saved.site.id);return saved.site;
  }
  async deleteWebsite(id){
    const next=removeSite(this.siteState,id),wasActive=id===this.siteState.activeId;
    this.disposeSite(id);this.siteState=next;this.saveSites();
    if(wasActive)await this.switchSite(next.activeId);else this.broadcast();
  }
  closePanels(){
    this.controlsOpen=false;this.sitesOpen=false;
    if(this.siteManagerRestoreBounds){const bounds=this.siteManagerRestoreBounds;this.siteManagerRestoreBounds=null;this.main.setBounds(bounds);}
    this.layout();this.broadcast();
  }
  async openSites(){
    if(!this.main.isVisible()||this.main.isMinimized()||this.controller.manual)this.controller.restore(now());
    this.controlsOpen=false;
    const [w,h]=this.main.getContentSize();
    if(w<280||h<230){this.siteManagerRestoreBounds??=this.main.getBounds();const area=screen.getDisplayMatching(this.main.getBounds()).workArea;this.main.setSize(Math.min(440,area.width),Math.min(420,area.height));}
    this.sitesOpen=true;this.layout();this.broadcast();
  }
  regions() { return [this.main.getBounds()]; }
  alpha(a) {
    if(this.main.isDestroyed())return;
    this.main.setOpacity(clamp(a,0,1));
    if(QA)this.trace.push({at:now(),alpha:this.main.getOpacity(),visible:this.main.isVisible()});
  }
  guardOffscreen(w) { if(QA && w.getBounds().x>-10000)throw new Error('Background test window was not offscreen'); }
  showGroup() {
    this.guardOffscreen(this.main);this.main.setSkipTaskbar(true);if(this.main.isMinimized())this.main.restore();this.main.showInactive();
  }
  hideGroup() {
    this.main.hide();
  }
  tick() {
    if(this.shutting||this.main.isDestroyed()||this.main.isMinimized())return;
    if(this.compactMenuOpen)return;
    const p=this.pointer||screen.getCursorScreenPoint(); this.controller.tick(p,now());
    if(this.corner){const content=this.main.getContentBounds();const r=this.corner.getBounds();const hot={x:content.x+r.x,y:content.y+r.y,width:r.width,height:r.height};this.corner.setVisible(this.main.isVisible()&&this.prefs.chromeHidden&&!this.controlsOpen&&!this.sitesOpen&&contains(p,hot));}
  }
  async create() {
    await this.main.loadFile(path.join(__dirname,'chrome.html'));
    this.corner=new WebContentsView({webPreferences:this.localPreferences()});
    this.corner.setBackgroundColor('#00000000');
    this.trusted.add(this.corner.webContents.id);
    await this.corner.webContents.loadFile(path.join(__dirname,'corner.html'));
    this.corner.setVisible(false);
    this.main.contentView.addChildView(this.corner);
    const v=this.addView(); this.layout();
    if(QA)this.pointer={x:this.main.getBounds().x+30,y:this.main.getBounds().y+30};
    this.guardOffscreen(this.main); this.main.showInactive();
    this.timer=setInterval(()=>this.tick(),16);
    if(!QA) {
      this.createTray();
      this.hotkey=globalShortcut.register('CommandOrControl+Alt+Q',()=>{if(this.main.isVisible()&&!this.main.isMinimized())this.controller.hide();else this.controller.restore(now());});
      if(!this.hotkey)this.status='快捷键被占用，可双击托盘图标显示';
      this.saveSites();this.load(this.activeSite().url);
    }
    this.broadcast(); return v;
  }
  addView(options={},siteId=this.siteState.activeId) {
    const site=this.siteState.sites.find(s=>s.id===siteId);if(!site)throw new Error('Website not found');
    if(!this.siteViews.has(siteId))this.siteViews.set(siteId,[]);
    const group=this.siteViews.get(siteId);
    const webPreferences={sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,partition:partitionForURL(site.url)};
    if(Number.isInteger(options.webPreferences?.openerId))webPreferences.openerId=options.webPreferences.openerId;
    const v=new WebContentsView({...options,webPreferences});
    this.browserSessions.add(v.webContents.session);
    v.siteId=siteId;
    for(const old of group)old.setVisible(false);
    group.push(v);this.main.contentView.addChildView(v);v.setVisible(siteId===this.siteState.activeId);
    if(this.corner){this.main.contentView.removeChildView(this.corner);this.main.contentView.addChildView(this.corner);}
    v.setBackgroundColor('#ffffff');v.webContents.setZoomFactor(this.prefs.zoom/100);
    v.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    v.webContents.session.setPermissionCheckHandler(()=>false);
    v.webContents.on('will-attach-webview',event=>event.preventDefault());
    v.webContents.on('did-start-loading',()=>{if(v===this.current()){this.status='网页加载中…';this.broadcast();}});
    v.webContents.on('did-finish-load',()=>{v.webContents.setZoomFactor(this.prefs.zoom/100);if(v===this.current()){this.status='在顶部直接调可见度，更多设置点 ···';this.broadcast();}});
    v.webContents.on('did-fail-load',(_e,code,description,_url,isMain)=>{if(isMain&&code!==-3){this.status='加载失败，请检查网络并刷新（'+description+'）';this.broadcast();}});
    v.webContents.on('did-navigate-in-page',()=>this.broadcast());
    v.webContents.on('will-navigate',(e,url)=>{try{normalizeURL(url);}catch{e.preventDefault();}});
    v.webContents.on('will-redirect',(e,url)=>{try{normalizeURL(url);}catch{e.preventDefault();}});
    v.webContents.setWindowOpenHandler(details=>{if(details.url&&details.url!=='about:blank'){try{normalizeURL(details.url);}catch{return {action:'deny'};}}return {action:'allow',createWindow:opts=>this.addView(opts,siteId).webContents};});
    v.webContents.on('close',()=>{const own=this.siteViews.get(siteId);if(!this.shutting&&own?.includes(v)&&own.length>1)this.closeTab(v,siteId);});
    this.layout();this.broadcast();return v;
  }
  closeTab(v=this.current(),siteId=v?.siteId||this.siteState.activeId) {
    const group=this.siteViews.get(siteId);if(!group||group.length<=1)return;
    const i=group.indexOf(v);if(i<0)return;group.splice(i,1);
    this.main.contentView.removeChildView(v);if(!v.webContents.isDestroyed())v.webContents.close({waitForBeforeUnload:false});
    group.at(-1).setVisible(siteId===this.siteState.activeId);this.layout();this.broadcast();
  }
  layout() {
    if(this.main.isDestroyed())return;
    const [width,height]=this.main.getContentSize();const {header:y,footer:foot}=this.geometry();
    for(const v of this.allViews())v.setBounds({x:0,y,width,height:Math.max(1,height-y-foot)});
    if(this.corner){const w=Math.min(20,width),h=Math.min(20,height);this.corner.setBounds({x:Math.max(0,width-w-3),y:Math.min(3,Math.max(0,height-h)),width:w,height:h});}
  }
  async load(url) { const normalized=normalizeURL(url);try{await this.current().webContents.loadURL(normalized);}catch(e){this.status='网页未加载，请检查地址或网络后刷新';this.broadcast();} }
  async fit() {
    try {
      const m=await this.current().webContents.executeJavaScript(`(()=>{let content=innerWidth;for(const el of document.querySelectorAll('body *')){let r=el.getBoundingClientRect();if(!r.width||!r.height)continue;let s=getComputedStyle(el);if(s.position!=='fixed'&&s.visibility!=='hidden'&&s.opacity!=='0')content=Math.max(content,r.width,el.scrollWidth);}return {viewport:innerWidth,content};})()`);
      if(m.content>m.viewport+1)this.change('zoom',Math.floor(this.current().webContents.getZoomFactor()*100*(m.viewport-12)/m.content));
      this.status='已适应窗口宽度 · 缩放 '+this.prefs.zoom+'%';this.broadcast();
    }catch{this.status='网页还未准备好，请稍后点“适应”';this.broadcast();}
  }
  change(key,value) {
    if(!['visibility','hover','chromeHidden','topmost','delay','fade','zoom'].includes(key))throw new Error('Unknown preference');
    const next=preferences({...this.prefs,[key]:value});Object.assign(this.prefs,next);
    if(key==='visibility')this.controller.opacity(this.prefs.visibility,now());
    if(key==='chromeHidden'&&this.prefs.chromeHidden)this.closePanels();
    if(key==='hover')this.controller.mode(this.prefs.hover,now());
    if(key==='topmost')this.main.setAlwaysOnTop(!QA&&this.prefs.topmost);
    if(key==='zoom')for(const v of this.allViews())v.webContents.setZoomFactor(this.prefs.zoom/100);
    this.layout();this.saveSoon();this.broadcast();
  }
  async openSettings() {
    if(this.sitesOpen)this.closePanels();
    if(!this.main.isVisible()||this.main.isMinimized()||this.controller.manual)this.controller.restore(now());
    const [width,height]=this.main.getContentSize();
    if(width<140||height<100)return this.openCompactMenu();
    this.controlsOpen=true;this.layout();this.broadcast();
  }
  openCompactMenu(){
    const pref=(key,value)=>()=>this.change(key,value);
    const visibility=[10,20,30,50,100].map(value=>({label:value+'%',type:'radio',checked:this.prefs.visibility===value,click:pref('visibility',value)}));
    const zoom=[25,50,70,100,125].map(value=>({label:value+'%',type:'radio',checked:this.prefs.zoom===value,click:pref('zoom',value)}));
    this.compactMenu=Menu.buildFromTemplate([
      {label:'可见度 '+this.prefs.visibility+'%',submenu:[...visibility,{type:'separator'},{label:'更淡一点',click:pref('visibility',Math.max(1,this.prefs.visibility-5))},{label:'更清晰一点',click:pref('visibility',Math.min(100,this.prefs.visibility+5))}]},
      {label:'移入显示',type:'checkbox',checked:this.prefs.hover,click:pref('hover',!this.prefs.hover)},
      {label:'显示边框',type:'checkbox',checked:!this.prefs.chromeHidden,click:pref('chromeHidden',!this.prefs.chromeHidden)},
      {label:'置顶',type:'checkbox',checked:this.prefs.topmost,click:pref('topmost',!this.prefs.topmost)},
      {type:'separator'},{label:'网页缩放',submenu:zoom},{label:'适应窗口',click:()=>this.fit()},
      {label:'网站',submenu:[...this.siteState.sites.map(site=>({label:site.name,type:'radio',checked:site.id===this.siteState.activeId,click:()=>this.switchSite(site.id)})),{type:'separator'},{label:'添加或管理网站…',click:()=>this.openSites()}]},
      {label:'网页操作',submenu:[{label:'返回',click:()=>this.action('back')},{label:'刷新',click:()=>this.action('reload')},{label:'网站主页',click:()=>this.load(this.activeSite().url)},{label:'返回原页',enabled:this.views.length>1,click:()=>this.closeTab()}]},
      {label:'窗口大小',submenu:[{label:'紧凑',click:()=>this.action('size',{width:440,height:600})},{label:'标准',click:()=>this.action('size',{width:860,height:720})}]},
      {label:'响应速度',submenu:[{label:'移出延迟',submenu:[0,100,200,350].map(value=>({label:value+' ms',type:'radio',checked:this.prefs.delay===value,click:pref('delay',value)}))},{label:'淡入淡出',submenu:[100,220,350,500].map(value=>({label:value+' ms',type:'radio',checked:this.prefs.fade===value,click:pref('fade',value)}))}]},
      {type:'separator'},{label:'持续隐藏',click:()=>this.controller.hide()},{label:'最小化',click:()=>this.main.minimize()},{label:'退出',click:()=>this.main.close()}
    ]);
    if(QA)return;
    this.compactMenuOpen=true;
    try{this.compactMenu.popup({window:this.main,callback:()=>{this.compactMenuOpen=false;this.controller.outsideAt=null;}});}catch(error){this.compactMenuOpen=false;throw error;}
  }
  createTray() {
    let icon=ICON?nativeImage.createFromPath(ICON):nativeImage.createEmpty();
    if(icon.isEmpty())icon=nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');
    this.tray=new Tray(icon);this.tray.setToolTip('轻窗 v'+VERSION+' · 双击显示');
    this.tray.setContextMenu(Menu.buildFromTemplate([
      {label:'显示窗口',click:()=>this.controller.restore(now())},
      {label:'外观与设置',click:()=>this.openSettings()},
      {label:'添加或切换网站',click:()=>this.openSites()},
      {label:'持续隐藏',click:()=>this.controller.hide()},
      {type:'separator'},{label:'退出',click:()=>this.main.close()}
    ]));
    this.tray.on('double-click',()=>this.controller.restore(now()));
  }
  async action(name,value) {
    if(name==='prefs')return this.change(value.key,value.value);
    if(name==='settings'){if(!this.controlsOpen)return this.openSettings();return this.closePanels();}
    if(name==='close-settings'||name==='close-sites')return this.closePanels();
    if(name==='sites'){if(this.sitesOpen)return this.closePanels();return this.openSites();}
    if(name==='site-save')return this.saveWebsite(value);
    if(name==='site-switch')return this.switchSite(String(value));
    if(name==='site-delete')return this.deleteWebsite(String(value));
    if(name==='hide')return this.controller.hide();
    if(name==='minimize')return this.main.minimize();
    if(name==='quit')return this.main.close();
    if(name==='home')return this.load(this.activeSite().url);
    if(name==='navigate')return this.load(String(value).slice(0,2048));
    if(name==='reload')return this.current().webContents.reload();
    if(name==='back'){if(this.current().webContents.navigationHistory.canGoBack())this.current().webContents.navigationHistory.goBack();else if(this.views.length>1)this.closeTab();return;}
    if(name==='return')return this.closeTab();
    if(name==='fit')return this.fit();
    if(name==='size'){const area=screen.getDisplayMatching(this.main.getBounds()).workArea;this.main.setSize(clamp(value.width,1,area.width),clamp(value.height,1,area.height));return;}
    throw new Error('Unsupported action');
  }
  shutdown() {
    if(this.stopped)return;this.stopped=true;this.shutting=true;clearInterval(this.timer);clearTimeout(this.saveTimer);
    for(const v of this.allViews())if(v.webContents&&!v.webContents.isDestroyed())v.webContents.close({waitForBeforeUnload:false});
    if(this.corner?.webContents&&!this.corner.webContents.isDestroyed())this.corner.webContents.close({waitForBeforeUnload:false});
    this.tray?.destroy();globalShortcut.unregisterAll();
    if(!QA||PROFILE_TEST)app.quit();
  }
  async flushBrowserData(){
    await Promise.all([...this.browserSessions].map(async session=>{session.flushStorageData();await session.cookies.flushStore();}));
  }
  requestQuit(){
    if(this.quitPromise)return this.quitPromise;
    this.shutting=true;clearInterval(this.timer);clearTimeout(this.saveTimer);
    if(!this.main.isDestroyed()){this.save();this.saveSites();this.main.hide();}
    this.quitPromise=(async()=>{
      await this.flushBrowserData();
      await Promise.all(this.allViews().map(view=>new Promise(resolve=>{
        const wc=view.webContents;if(!wc||wc.isDestroyed())return resolve();
        const timeout=setTimeout(resolve,3000);wc.once('destroyed',()=>{clearTimeout(timeout);resolve();});wc.close({waitForBeforeUnload:false});
      })));
      await this.flushBrowserData();
      this.readyToClose=true;
      if(this.main.isDestroyed())app.quit();else this.main.close();
    })().catch(error=>{
      reportError(error);this.quitPromise=null;this.shutting=false;
      if(!this.main.isDestroyed()){
        this.status='登录资料保存失败，请稍后再退出';
        if(!this.current()?.webContents||this.current().webContents.isDestroyed()){this.siteViews.set(this.siteState.activeId,[]);this.addView();this.load(this.activeSite().url);}
        this.controller.restore(now());this.timer=setInterval(()=>this.tick(),16);this.broadcast();
      }
    });
    return this.quitPromise;
  }
}

ipcMain.handle('lf:state',event=>{if(!ui?.trusted.has(event.sender.id))throw new Error('Untrusted sender');return ui.snapshot();});
ipcMain.handle('lf:action',(event,{name,value})=>{if(!ui?.trusted.has(event.sender.id))throw new Error('Untrusted sender');return ui.action(name,value);});
app.on('before-quit',event=>{if(ui&&!ui.readyToClose&&(!QA||PROFILE_TEST)){event.preventDefault();ui.requestQuit();}});
app.on('window-all-closed',()=>{if(ui&&(!QA||PROFILE_TEST))ui.requestQuit();});
app.whenReady().then(async()=>{
  if(!app.requestSingleInstanceLock()){app.quit();return;}
  app.on('second-instance',()=>ui?.controller.restore(now()));
  ui=new FenbiApp();await ui.create();
  if(PROFILE_TEST)await require('./profile-selftest').run({ui,app,fs,path,ROOT,DATA,REPORT,atomic,profile,phase:PROFILE_TEST});
  else if(SELF)await require('./selftest').run({ui,app,fs,path,ROOT,DATA,REPORT,now,atomic});
  else if(LIVE)await require('./selftest').live({ui,app,fs,path,ROOT,DATA,REPORT,now,atomic,HOME});
}).catch(reportError);
