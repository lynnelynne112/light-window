'use strict';
const { createHash, randomUUID } = require('node:crypto');
const DEFAULT_SITE = Object.freeze({ id: 'fenbi', name: '粉笔题库', url: 'https://www.fenbi.com/spa/tiku' });
const MAX_SITES = 30;

function normalizeURL(value) {
  let input = String(value ?? '').trim();
  if (!input) throw new Error('请输入网站地址');
  if (input.length > 4096 || /[\u0000-\u001f\u007f]/.test(input)) throw new Error('网站地址无效');
  const hostWithPort = /^(localhost|[a-z0-9.-]+\.[a-z]{2,}|(?:\d{1,3}\.){3}\d{1,3}):\d+(?:[/?#]|$)/i.test(input);
  if (!/^https?:\/\//i.test(input)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(input) && !hostWithPort) throw new Error('仅支持 http 和 https 网站');
    input = 'https://' + input;
  }
  let parsed;
  try { parsed = new URL(input); } catch { throw new Error('请填写有效的网站地址'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('仅支持 http 和 https 网站');
  if (parsed.username || parsed.password) throw new Error('网址中不能包含账号或密码');
  return parsed.href;
}

function siteName(value, url) {
  const name = String(value ?? '').trim();
  if (/[\u0000-\u001f\u007f]/.test(name) || name.length > 40) throw new Error('网站名称最多 40 个字');
  return name || new URL(url).hostname;
}

function normalizeSiteState(value) {
  const sites = [];
  for (const raw of Array.isArray(value?.sites) ? value.sites.slice(0, MAX_SITES) : []) {
    try {
      if (!raw || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(raw.id) || sites.some(s => s.id === raw.id)) continue;
      const url = normalizeURL(raw.url);
      if (sites.some(s => s.url === url)) continue;
      sites.push({ id: raw.id, name: siteName(raw.name, url), url });
    } catch { /* Ignore invalid saved entries without interpreting them as code. */ }
  }
  if (!sites.length) sites.push({ ...DEFAULT_SITE });
  return { sites, activeId: sites.some(s => s.id === value?.activeId) ? value.activeId : sites[0].id };
}

function saveSite(state, input) {
  const next = normalizeSiteState(state);
  const url = normalizeURL(input?.url);
  const name = siteName(input?.name, url);
  const existing = input?.id ? next.sites.findIndex(s => s.id === input.id) : -1;
  if (input?.id && existing < 0) throw new Error('这个网站已不存在，请重新选择');
  if (next.sites.some(s => s.url === url && s.id !== input?.id)) throw new Error('这个网址已经保存过了');
  if (existing < 0 && next.sites.length >= MAX_SITES) throw new Error('最多保存 30 个网站');
  const site = { id: existing < 0 ? randomUUID() : input.id, name, url };
  if (existing < 0) next.sites.push(site); else next.sites[existing] = site;
  return { state: next, site, previous: existing < 0 ? null : state.sites.find(s => s.id === input.id) };
}

function removeSite(state, id) {
  const next = normalizeSiteState(state);
  if (!next.sites.some(s => s.id === id)) throw new Error('这个网站已不存在');
  if (next.sites.length === 1) throw new Error('请先添加另一个网站，再删除最后一个');
  next.sites = next.sites.filter(s => s.id !== id);
  if (next.activeId === id) next.activeId = next.sites[0].id;
  return next;
}

function partitionForURL(value) {
  const url = new URL(normalizeURL(value));
  if (url.protocol === 'https:' && ['www.fenbi.com', 'fenbi.com'].includes(url.hostname)) return 'persist:fenbi';
  return 'persist:site-' + createHash('sha256').update(url.origin).digest('hex').slice(0, 24);
}

module.exports = { DEFAULT_SITE, MAX_SITES, normalizeURL, normalizeSiteState, saveSite, removeSite, partitionForURL };
