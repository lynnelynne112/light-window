'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveProfileDirectory } = require('../src/profile');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lightwindow-profile-'));
  t.after(() => { const relative=path.relative(os.tmpdir(),root);if(!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(root).startsWith('lightwindow-profile-'))fs.rmSync(root,{recursive:true,force:true}); });
  const a=path.join(root,'LightWindow-3.0.0-win32-x64'),b=path.join(root,'LightWindow-3.0.1-win32-x64'),appData=path.join(root,'user');fs.mkdirSync(a);fs.mkdirSync(b);
  return {root,a,b,appData};
}
test('different extraction directories share one fixed profile', t => {
  const {a,b,appData}=fixture(t);const first=resolveProfileDirectory({installDir:a,appDataDir:appData});
  fs.writeFileSync(path.join(first.directory,'sites.json'),'original');
  const next=resolveProfileDirectory({installDir:b,appDataDir:appData});
  assert.equal(next.directory,first.directory);assert.equal(fs.readFileSync(path.join(next.directory,'sites.json'),'utf8'),'original');
});
test('migrate a legacy data directory without deleting or modifying its original files', t => {
  const {a,b,appData}=fixture(t);const legacy=path.join(a,'data');fs.mkdirSync(path.join(legacy,'browser'),{recursive:true});
  fs.writeFileSync(path.join(legacy,'settings.json'),'{}');fs.writeFileSync(path.join(legacy,'browser','Local State'),'local-key-fixture');fs.writeFileSync(path.join(legacy,'browser','Cookies-wal'),'wal-fixture');
  const migrated=resolveProfileDirectory({installDir:b,appDataDir:appData});
  assert.equal(migrated.migratedFrom,legacy);assert.equal(fs.readFileSync(path.join(migrated.directory,'browser','Local State'),'utf8'),'local-key-fixture');
  assert.equal(fs.readFileSync(path.join(migrated.directory,'browser','Cookies-wal'),'utf8'),'wal-fixture');assert(fs.existsSync(path.join(legacy,'settings.json')));
});
test('an existing shared profile wins over data bundled beside a different copy', t => {
  const {a,b,appData}=fixture(t);const shared=resolveProfileDirectory({installDir:a,appDataDir:appData});fs.writeFileSync(path.join(shared.directory,'settings.json'),'keep');
  fs.mkdirSync(path.join(b,'data'));fs.writeFileSync(path.join(b,'data','settings.json'),'unrelated');
  assert.equal(resolveProfileDirectory({installDir:b,appDataDir:appData}).directory,shared.directory);assert.equal(fs.readFileSync(path.join(shared.directory,'settings.json'),'utf8'),'keep');
});
test('tests and source development never migrate the real user profile', t => {
  const {a,appData}=fixture(t);const qa=path.join(a,'qa');assert.equal(resolveProfileDirectory({installDir:a,appDataDir:appData,qaDirectory:qa}).directory,qa);
  assert.equal(resolveProfileDirectory({installDir:a,appDataDir:appData,development:true}).directory,path.join(a,'data'));assert(!fs.existsSync(appData));
});
test('a running legacy app blocks migration without creating a replacement profile', t=>{
  const {a,b,appData}=fixture(t);fs.mkdirSync(path.join(a,'data'));fs.writeFileSync(path.join(a,'data','settings.json'),'keep');
  assert.throws(()=>resolveProfileDirectory({installDir:b,appDataDir:appData,beforeMigration(){throw new Error('legacy app active');}}),/legacy app active/);
  assert(!fs.existsSync(path.join(appData,'LightWindow','data')));assert.equal(fs.readFileSync(path.join(a,'data','settings.json'),'utf8'),'keep');
});
