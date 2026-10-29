'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function hasProfile(directory) {
  return ['settings.json', 'sites.json', 'browser/Local State', '.profile-location.json'].some(name => fs.existsSync(path.join(directory, name)));
}
function inside(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('资料迁移路径不安全，操作已停止');
}
function findLegacy(installDir) {
  const direct = path.join(installDir, 'data');
  if (hasProfile(direct)) return direct;
  const parent = path.dirname(installDir), found = [];
  const siblings=fs.readdirSync(parent,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&!entry.isSymbolicLink()&&/^LightWindow-\d+\.\d+\.\d+-win32-x64$/i.test(entry.name)).slice(0,200);
  for (const entry of siblings) {
    const sibling = path.join(parent, entry.name);
    for (const candidate of [path.join(sibling, 'data'), path.join(sibling, entry.name, 'data')]) {
      if (hasProfile(candidate) && path.resolve(candidate) !== path.resolve(direct)) found.push(candidate);
    }
  }
  const unique = [...new Set(found)];
  if (unique.length > 1) throw new Error('找到多份旧版资料。请先在你原来使用的程序目录中覆盖更新一次，再启动新版；旧资料均未改动。');
  return unique[0];
}

function resolveProfileDirectory({ installDir, appDataDir, development = false, qaDirectory, beforeMigration }) {
  if (qaDirectory) { fs.mkdirSync(qaDirectory, { recursive: true }); return { directory: qaDirectory, mode: 'test' }; }
  if (development) { const directory = path.join(installDir, 'data'); fs.mkdirSync(directory, { recursive: true }); return { directory, mode: 'development' }; }
  const parent = path.join(appDataDir, 'LightWindow'), directory = path.join(parent, 'data');
  if (hasProfile(directory)) return { directory, mode: 'shared' };
  const legacy = findLegacy(installDir);
  if(legacy&&beforeMigration)beforeMigration(legacy);
  fs.mkdirSync(parent, { recursive: true });
  if (!legacy) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, '.profile-location.json'), JSON.stringify({ version: 1, created: new Date().toISOString() }));
    return { directory, mode: 'shared' };
  }
  const staging = path.join(parent, 'migration-' + randomUUID());
  inside(parent, staging); inside(parent, directory);
  try {
    fs.cpSync(legacy, staging, {
      recursive: true, force: false, errorOnExist: true,
      filter(source) {
        if (fs.lstatSync(source).isSymbolicLink()) throw new Error('旧资料中包含链接，未自动迁移');
        return !/^(SingletonLock|SingletonCookie|SingletonSocket|lockfile|LOCK|DevToolsActivePort)$/i.test(path.basename(source));
      }
    });
    fs.writeFileSync(path.join(staging, '.profile-location.json'), JSON.stringify({ version: 1, migratedFrom: legacy, migrated: new Date().toISOString() }));
    if (hasProfile(directory)) return { directory, mode: 'shared' };
    if (fs.existsSync(directory)) throw new Error('目标资料目录尚未初始化，请先关闭其他轻窗窗口');
    fs.renameSync(staging, directory);
    return { directory, mode: 'shared', migratedFrom: legacy };
  } catch (error) {
    throw new Error('未能完整迁移旧资料。请先退出所有旧版轻窗再重试。原资料未删除，也没有启用不完整资料。', { cause: error });
  }
}
module.exports = { resolveProfileDirectory };
