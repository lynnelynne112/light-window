'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'qa'),{recursive:true});const testRoot=fs.mkdtempSync(path.join(root,'qa','profile-upgrade-'));
const a=path.join(testRoot,'LightWindow-3.0.0-win32-x64'),b=path.join(testRoot,'LightWindow-'+require('../package.json').version+'-win32-x64'),user=path.join(testRoot,'user');
const packaged=process.argv.includes('--packaged');
if(packaged){const built=path.join(root,'dist','LightWindow-'+require('../package.json').version+'-win32-x64');fs.cpSync(built,a,{recursive:true,errorOnExist:true,force:false});fs.cpSync(built,b,{recursive:true,errorOnExist:true,force:false});}else{fs.mkdirSync(a);fs.mkdirSync(b);}
const results=[];
for(const phase of ['seed','migrate','reopen','logout','logout-check']){
  const install=['seed','migrate'].includes(phase)?a:b,reportDir=path.join(packaged?install:root,'qa');
  const env={...process.env,LW_TEST_APPDATA:user,LW_TEST_INSTALL_DIR:install};delete env.ELECTRON_RUN_AS_NODE;
  const start=Date.now();const run=spawnSync(packaged?path.join(install,'electron.exe'):require('electron'),[...(packaged?[]:[root]),'--profile-check='+phase],{cwd:install,windowsHide:true,timeout:30000,stdio:'inherit',env});
  if(run.error)throw run.error;const file=path.join(reportDir,'profile-'+phase+'.json');
  if(!fs.existsSync(file)||fs.statSync(file).mtimeMs<start)throw new Error('No fresh profile report for '+phase);
  const report=JSON.parse(fs.readFileSync(file,'utf8'));if(run.status!==0||!report.success||!report.productionClosePath)throw new Error(report.error||'Normal close failed: '+phase);
  results.push(report);console.log(JSON.stringify({phase,success:true,checks:report.checks}));
}
if(results[0].profile===results[1].profile||results[1].profile!==results[2].profile)throw new Error('Profile migration/location did not behave correctly');
fs.writeFileSync(path.join(root,'qa',packaged?'profile-upgrade-packaged.json':'profile-upgrade-summary.json'),JSON.stringify({success:true,results},null,2));
console.log(JSON.stringify({profileUpgradePassed:true,phases:results.length}));
