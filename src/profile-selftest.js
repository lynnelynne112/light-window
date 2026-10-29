'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { partitionForURL } = require('./sites');
exports.run=async({ui,app,fs,path,REPORT,DATA,atomic,profile,phase})=>{
  const result={phase,started:new Date().toISOString(),profile:DATA,migrated:Boolean(profile.migratedFrom),checks:[]};
  let first,second;
  const makeServer=port=>new Promise(resolve=>{
    const server=http.createServer((req,res)=>{
      res.setHeader('Content-Type','text/html; charset=utf-8');
      if(req.url.startsWith('/login'))res.setHeader('Set-Cookie','rememberAuth=remembered-'+port+'; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax');
      if(req.url==='/logout')res.setHeader('Set-Cookie','rememberAuth=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
      const authenticated=(req.headers.cookie||'').includes('rememberAuth=remembered-'+port);
      res.end('<!doctype html><title>Local login fixture</title><p id="auth">'+(authenticated?'signed-in':'signed-out')+'</p>');
    }).listen(port,'127.0.0.1',()=>resolve(server));server.once('error',error=>{throw error;});
  });
  try{
    first=await makeServer(17845);second=await makeServer(17846);
    const base='http://127.0.0.1:17845';
    await ui.load(base+'/');let wc=ui.current().webContents;
    assert.equal(partitionForURL(ui.activeSite().url),'persist:fenbi');
    if(phase!=='seed'){
      const expected=phase==='logout-check'?'signed-out':'signed-in';assert.equal(await wc.executeJavaScript('document.querySelector("#auth").textContent'),expected);
      if(phase!=='logout-check')assert.equal(await wc.executeJavaScript('localStorage.getItem("rememberLogin")'),'yes');
      result.checks.push('first-http-request-restores-expected-authentication-and-localstorage');
    }
    if(phase==='seed'||phase==='migrate'){
      await ui.load(base+'/login');await wc.executeJavaScript('localStorage.setItem("rememberLogin","yes")');
      if(phase==='migrate'){
        await ui.saveWebsite({name:'QA后台站点',url:'http://127.0.0.1:17846/'});await ui.load('http://127.0.0.1:17846/login');
        await ui.current().webContents.executeJavaScript('localStorage.setItem("backgroundLogin","yes")');await ui.switchSite('fenbi');
        assert(profile.migratedFrom);result.checks.push('legacy-profile-migrated-with-original-encryption-key-and-background-site-saved');
      }
      result.checks.push('login-then-immediate-normal-exit-without-test-only-flush');
    }
    if(phase==='reopen'){
      assert(!profile.migratedFrom);const other=ui.siteState.sites.find(site=>site.name==='QA后台站点');assert(other);await ui.switchSite(other.id);
      await ui.current().webContents.loadURL('http://127.0.0.1:17846/');assert.equal(await ui.current().webContents.executeJavaScript('document.querySelector("#auth").textContent'),'signed-in');
      assert.equal(await ui.current().webContents.executeJavaScript('localStorage.getItem("backgroundLogin")'),'yes');await ui.switchSite('fenbi');
      result.checks.push('different-install-folder-keeps-main-and-background-site-logins');
    }
    if(phase==='logout'){
      await ui.load(base+'/logout');await wc.executeJavaScript('localStorage.removeItem("rememberLogin")');result.checks.push('explicit-site-logout-saved');
    }
    app.once('will-quit',()=>{
      assert(ui.readyToClose);result.success=true;result.finished=new Date().toISOString();result.productionClosePath=true;
      atomic(path.join(REPORT,'profile-'+phase+'.json'),result);first.close();second.close();
    });
    ui.main.close();
  }catch(error){result.success=false;result.error=String(error.stack||error);atomic(path.join(REPORT,'profile-'+phase+'.json'),result);first?.close();second?.close();app.exit(1);}
};
