'use strict';
(() => {
  const form = document.getElementById('site-form');
  const name = document.getElementById('site-name');
  const url = document.getElementById('site-url');
  const notice = document.getElementById('site-notice');
  const save = document.getElementById('site-save');
  const cancel = document.getElementById('site-cancel');
  let state, editingId;

  function reset() { editingId = undefined; form.reset(); save.textContent = '添加并打开'; cancel.hidden = true; }
  function message(text, error = false) { notice.textContent = text; notice.classList.toggle('error', error); }
  async function action(kind, value) {
    try { return await window.light.action(kind, value); }
    catch (error) { message(String(error.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''), true); throw error; }
  }
  function render(next) {
    state = next;
    const list = document.getElementById('site-list');
    const rows = next.sites.map(site => {
      const row = document.createElement('div'); row.className = 'site-card'; row.classList.toggle('active', site.id === next.activeSiteId);
      const open = document.createElement('button'); open.type = 'button'; open.className = 'site-open'; open.dataset.siteId = site.id; open.title = site.url;
      const title = document.createElement('strong'); title.textContent = site.name;
      const address = document.createElement('small'); address.textContent = site.url;
      open.append(title, address); open.onclick = () => { action('site-switch', site.id).catch(() => {}); };
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '改'; edit.setAttribute('aria-label', '编辑' + site.name);
      edit.onclick = () => { editingId = site.id; name.value = site.name; url.value = site.url; save.textContent = '保存并打开'; cancel.hidden = false; name.focus(); message('修改网址并保存，会打开新的入口；登录资料不会删除。'); };
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删'; remove.setAttribute('aria-label', '删除' + site.name);
      remove.onclick = () => { action('site-delete', site.id).then(() => { if (editingId === site.id) reset(); message('已移除网址，网站的本地登录资料仍保留。'); }).catch(() => {}); };
      row.append(open, edit, remove); return row;
    });
    list.replaceChildren(...rows);
  }
  form.onsubmit = async event => {
    event.preventDefault(); save.disabled = true;
    try { const site = await action('site-save', { id: editingId, name: name.value, url: url.value }); reset(); message('已保存并打开：' + site.name); }
    catch { /* The validation message is already shown. */ }
    finally { save.disabled = false; }
  };
  cancel.onclick = () => { reset(); message('已取消编辑'); };
  document.getElementById('bookmark-current').onclick = () => { reset(); url.value = state.url; try { name.value = new URL(state.url).hostname; } catch { name.value = ''; } url.focus(); message('可修改名称，再点“添加并打开”保存。'); };
  window.light.subscribe(render); window.light.state().then(render);
})();
