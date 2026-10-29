'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const directories = ['src','test','scripts','assets','docs','.github'];
const files = ['package.json','package-lock.json','README.md','CHANGELOG.md','SECURITY.md','THIRD_PARTY_NOTICES.md','.gitignore','.gitattributes'];
function walk(dir) { for (const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})) { const relative=path.posix.join(dir,entry.name); if (entry.isSymbolicLink()) throw new Error('Source symlink not allowed: '+relative); if(entry.isDirectory())walk(relative);else files.push(relative); } }
directories.forEach(walk);
const privateFile = /(^|\/)(data|browser|node_modules|qa|qa-electron-data|Cookies(?:-wal|-shm)?|Local State|settings\.json|sites\.json)(\/|$)/i;
const secret = /(?:[a-z]:\\Users\\[^\\\s"']+|github_pat_[a-z0-9_]{25,}|gh[pousr]_[a-z0-9]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;
for(const relative of files){if(privateFile.test(relative))throw new Error('Private file in source: '+relative);if(/\.(?:js|json|html|css|py|md|yml|vbs)$/.test(relative)&&secret.test(fs.readFileSync(path.join(root,relative),'utf8')))throw new Error('Potential private material: '+relative);}
console.log(JSON.stringify({sourceChecked:true,files:files.length,privateDataIncluded:false}));
