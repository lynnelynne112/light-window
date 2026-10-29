'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeURL, normalizeSiteState, saveSite, removeSite, partitionForURL } = require('../src/sites');

test('accept http/https and normalize a bare hostname without changing its path', () => {
  assert.equal(normalizeURL(' example.com/exercise?q=2#part '), 'https://example.com/exercise?q=2#part');
  assert.equal(normalizeURL('http://127.0.0.1:17843/test'), 'http://127.0.0.1:17843/test');
  assert.equal(normalizeURL('example.com:8443/test'), 'https://example.com:8443/test');
});
test('reject executable/local schemes, URL credentials, and control characters', () => {
  for (const url of ['', 'javascript:alert(1)', 'data:text/html,a', 'file:///C:/a', 'about:blank', 'ftp://example.com', 'https://user:password@example.com', 'https://example.com\n/path']) {
    assert.throws(() => normalizeURL(url), undefined, url);
  }
});
test('invalid saved sites cannot become executable content or arbitrary partition paths', () => {
  const state = normalizeSiteState({ activeId: '../other', sites: [{ id: '../other', name: 'bad', url: 'https://example.com' }, { id: 'bad', url: 'javascript:evil()' }] });
  assert.equal(state.activeId, 'fenbi'); assert.equal(state.sites.length, 1);
});
test('create, rename, remove and select a replacement without mutating the source', () => {
  const original = normalizeSiteState(null);
  const added = saveSite(original, { name: '学习网站', url: 'example.com' });
  assert.equal(original.sites.length, 1); assert.equal(added.state.sites.length, 2);
  const updated = saveSite(added.state, { id: added.site.id, name: '新名称', url: added.site.url });
  assert.equal(updated.site.id, added.site.id); assert.equal(updated.site.name, '新名称');
  const next = removeSite({ ...updated.state, activeId: added.site.id }, added.site.id);
  assert.equal(next.activeId, 'fenbi'); assert.equal(next.sites.length, 1);
  assert.throws(() => removeSite(next, 'fenbi'), /先添加/);
  assert.throws(() => saveSite(added.state, { url: 'https://example.com/' }), /保存过/);
});
test('same origin reuses its partition; different origins stay isolated; Fenbi keeps the legacy login partition', () => {
  assert.equal(partitionForURL('https://www.fenbi.com/spa/tiku'), 'persist:fenbi');
  assert.equal(partitionForURL('https://example.com/a'), partitionForURL('https://example.com/b'));
  assert.notEqual(partitionForURL('https://example.com'), partitionForURL('https://other.example.com'));
  assert.notEqual(partitionForURL('http://example.com'), partitionForURL('https://example.com'));
  assert.match(partitionForURL('https://example.com'), /^persist:site-[a-f0-9]{24}$/);
});
test('names are retained as plain text and oversized lists are bounded', () => {
  const state = normalizeSiteState(null);
  const result = saveSite(state, { name: '<img src=x onerror=alert(1)>', url: 'example.com' });
  assert.equal(result.site.name, '<img src=x onerror=alert(1)>');
  assert.throws(() => saveSite(state, { name: 'x'.repeat(41), url: 'example.com' }), /40/);
  const full = normalizeSiteState({ sites: Array.from({ length: 30 }, (_, i) => ({ id: 's-' + i, name: 'Site ' + i, url: 'https://example.com/' + i })) });
  assert.throws(() => saveSite(full, { url: 'https://new.example.com' }), /30/);
});
