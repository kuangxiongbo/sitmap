(function() {
  const STORAGE_KEY = 'intranet_links_v1';
  const THEME_KEY = 'intranet_theme_v1';
  const HISTORY_KEY = 'intranet_links_history_v1';
  const HISTORY_LIMIT = 50;
  const API_BASE = '/api';

  /** @typedef {{ id:string, title:string, url:string, description?:string, icon?:string, createdAt:number, updatedAt:number }} LinkItem */

  /**
   * 数据访问层：从localStorage读取/写入
   */
  const store = {
    /** @returns {LinkItem[]} */
    all() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr;
      } catch {
        return [];
      }
    },
    /** @param {LinkItem[]} items */
    save(items) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    },
    getTheme() {
      try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; }
    },
    setTheme(theme) {
      try { localStorage.setItem(THEME_KEY, theme); } catch {}
    },
    historyAll() {
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    },
    historySave(list) {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {}
    }
  };

  /** 工具函数 */
  const utils = {
    uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); },
    isHttpUrl(v) { return /^https?:\/\//i.test(v.trim()); },
    safeIcon(url) { return url && utils.isHttpUrl(url) ? url : '';
    },
    faviconFrom(url) {
      try {
        const u = new URL(url);
        return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
      } catch {
        return '';
      }
    }
  };

  /** 状态与DOM */
  /** @type {LinkItem[]} */
  let items = store.all();
  let currentView = 'card'; // 'card' | 'list'
  let currentTheme = store.getTheme(); // 'light' | 'dark'
  let histories = store.historyAll();

  const els = {
    formSection: document.getElementById('formSection'),
    formTitle: document.getElementById('formTitle'),
    form: document.getElementById('linkForm'),
    fieldId: document.getElementById('itemId'),
    fieldTitle: document.getElementById('title'),
    fieldUrl: document.getElementById('url'),
    fieldDesc: document.getElementById('description'),
    fieldIcon: document.getElementById('icon'),
    errTitle: document.querySelector('.error[data-for="title"]'),
    errUrl: document.querySelector('.error[data-for="url"]'),

    empty: document.getElementById('emptyState'),
    cards: document.getElementById('cardsView'),
    list: document.getElementById('listView'),
    listContainer: document.getElementById('listContainer'),

    btnNew: document.getElementById('btnNew'),
    btnCard: document.getElementById('btnViewCard'),
    btnList: document.getElementById('btnViewList'),
    btnCancelEdit: document.getElementById('btnCancelEdit'),
    btnTheme: document.getElementById('btnThemeToggle'),
    btnHistory: document.getElementById('btnHistory'),
    historyPanel: document.getElementById('historyPanel'),
    historyList: document.getElementById('historyList'),
    btnCloseHistory: document.getElementById('btnCloseHistory'),
  };

  // 初始化
  applyTheme(currentTheme);
  render();
  bindEvents();
  // 尝试从服务端同步数据（不阻塞UI）
  syncFromServer();

  function bindEvents() {
    els.btnNew.addEventListener('click', () => openForm());
    els.btnCancelEdit.addEventListener('click', closeForm);
    els.btnCard.addEventListener('click', () => switchView('card'));
    els.btnList.addEventListener('click', () => switchView('list'));
    els.btnTheme.addEventListener('click', toggleTheme);
    els.btnHistory.addEventListener('click', openHistory);
    els.btnCloseHistory.addEventListener('click', closeHistory);

    els.form.addEventListener('submit', onSubmitForm);
  }

  function switchView(view) {
    currentView = view;
    els.btnCard.classList.toggle('active', view === 'card');
    els.btnList.classList.toggle('active', view === 'list');
    els.btnCard.setAttribute('aria-selected', String(view === 'card'));
    els.btnList.setAttribute('aria-selected', String(view === 'list'));
    els.cards.hidden = view !== 'card';
    els.list.hidden = view !== 'list';
  }

  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
      els.btnTheme?.setAttribute('aria-pressed', 'true');
    } else {
      html.removeAttribute('data-theme');
      els.btnTheme?.setAttribute('aria-pressed', 'false');
    }
  }

  function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    store.setTheme(currentTheme);
    applyTheme(currentTheme);
  }

  function openForm(editItem) {
    els.form.reset();
    clearErrors();
    if (editItem) {
      els.formTitle.textContent = '编辑链接';
      els.fieldId.value = editItem.id;
      els.fieldTitle.value = editItem.title;
      els.fieldUrl.value = editItem.url;
      els.fieldDesc.value = editItem.description || '';
      els.fieldIcon.value = editItem.icon || '';
    } else {
      els.formTitle.textContent = '新增链接';
      els.fieldId.value = '';
    }
    els.formSection.hidden = false;
    els.fieldTitle.focus();
  }

  function closeForm() {
    els.formSection.hidden = true;
  }

  function setError(field, message) {
    if (field === 'title') els.errTitle.textContent = message || '';
    if (field === 'url') els.errUrl.textContent = message || '';
  }
  function clearErrors() { setError('title', ''); setError('url', ''); }

  function validate() {
    clearErrors();
    let ok = true;
    const title = els.fieldTitle.value.trim();
    const url = els.fieldUrl.value.trim();
    if (!title) { setError('title', '请输入标题'); ok = false; }
    if (!url) { setError('url', '请输入链接'); ok = false; }
    else if (!utils.isHttpUrl(url)) { setError('url', '请以 http:// 或 https:// 开头'); ok = false; }
    return ok;
  }

  function onSubmitForm(e) {
    e.preventDefault();
    if (!validate()) return;

    const now = Date.now();
    const payload = {
      title: els.fieldTitle.value.trim(),
      url: els.fieldUrl.value.trim(),
      description: els.fieldDesc.value.trim(),
      icon: utils.safeIcon(els.fieldIcon.value.trim()),
    };

    const id = els.fieldId.value;
    if (id) {
      // 更新
      const before = items;
      items = items.map((it) => it.id === id ? { ...it, ...payload, updatedAt: now } : it);
      pushHistory('update', before, items);
    } else {
      // 新增
      const before = items;
      items = [...items, { id: utils.uid(), ...payload, createdAt: now, updatedAt: now }];
      pushHistory('create', before, items);
    }
    store.save(items);
    // 同步数据到服务端
    upsertDataOnServer(items).catch(() => {});
    closeForm();
    render();
  }

  function handleEdit(id) {
    const it = items.find(x => x.id === id);
    if (it) openForm(it);
  }

  function handleDelete(id) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    const confirmed = confirm(`确定删除“${it.title}”吗？`);
    if (!confirmed) return;
    const before = items;
    items = items.filter(x => x.id !== id);
    pushHistory('delete', before, items);
    store.save(items);
    // 同步数据到服务端
    upsertDataOnServer(items).catch(() => {});
    render();
  }

  function render() {
    // 空状态
    if (!items.length) {
      els.empty.hidden = false;
      els.cards.innerHTML = '';
      if (els.listContainer) els.listContainer.innerHTML = '';
    } else {
      els.empty.hidden = true;
    }

    renderCards();
    renderList();
    renderHistory();
  }

  function renderCards() {
    const html = items.map((it) => {
      const icon = it.icon || utils.faviconFrom(it.url);
      const safeUrl = it.url;
      const desc = it.description ? it.description : '';
      return `
      <article class="card" data-id="${it.id}">
        <header class="card-header">
          <img class="favicon" src="${icon}" alt="" onerror="this.style.display='none'">
          <a class="title" href="${safeUrl}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>
        </header>
        <p class="desc">${escapeHtml(desc)}</p>
        <a class="link" href="${safeUrl}" target="_blank" rel="noopener">${escapeHtml(safeUrl)}</a>
        <div class="card-actions">
          <button class="ghost-btn" data-action="edit">编辑</button>
          <button class="danger-btn" data-action="delete">删除</button>
        </div>
      </article>`;
    }).join('');
    els.cards.innerHTML = html;

    els.cards.querySelectorAll('.card').forEach(card => {
      const id = card.getAttribute('data-id');
      card.querySelector('[data-action="edit"]').addEventListener('click', () => handleEdit(id));
      card.querySelector('[data-action="delete"]').addEventListener('click', () => handleDelete(id));
    });
  }

  function renderList() {
    const html = items.map((it) => {
      const icon = it.icon || utils.faviconFrom(it.url);
      const desc = it.description ? escapeHtml(it.description) : '';
      return `
      <div class="list-item" data-id="${it.id}">
        <img class="favicon" src="${icon}" alt="" onerror="this.style.display='none'">
        <div class="li-main">
          <a class="li-title" href="${it.url}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>
          <div class="li-desc">${desc}</div>
          <a class="li-link" href="${it.url}" target="_blank" rel="noopener">${escapeHtml(it.url)}</a>
        </div>
        <div class="li-actions">
          <button class="ghost-btn" data-action="edit">编辑</button>
          <button class="danger-btn" data-action="delete">删除</button>
        </div>
      </div>`;
    }).join('');
    els.listContainer.innerHTML = html;

    els.listContainer.querySelectorAll('.list-item').forEach(row => {
      const id = row.getAttribute('data-id');
      row.querySelector('[data-action="edit"]').addEventListener('click', () => handleEdit(id));
      row.querySelector('[data-action="delete"]').addEventListener('click', () => handleDelete(id));
    });
  }

  // 版本记录
  function pushHistory(action, before, after) {
    const snapshot = {
      id: utils.uid(),
      action, // create | update | delete | restore
      time: Date.now(),
      before: before,
      after: after,
    };
    histories = [snapshot, ...histories].slice(0, HISTORY_LIMIT);
    store.historySave(histories);
    // 异步上报到服务端
    sendSnapshotToServer(snapshot).catch(() => {});
  }

  function renderHistory() {
    if (!els.historyList) return;
    if (!histories.length) {
      els.historyList.innerHTML = '<div class="history-item"><div class="meta">暂无历史</div></div>';
      return;
    }
    els.historyList.innerHTML = histories.map(h => {
      const date = new Date(h.time);
      const meta = `${date.toLocaleString()} · ${labelOf(h.action)}`;
      return `
      <div class="history-item" data-hid="${h.id}">
        <div class="meta">${escapeHtml(meta)}</div>
        <div class="actions">
          <button class="ghost-btn" data-action="restore">恢复此版本</button>
        </div>
      </div>`;
    }).join('');
    els.historyList.querySelectorAll('.history-item').forEach(row => {
      const hid = row.getAttribute('data-hid');
      row.querySelector('[data-action="restore"]').addEventListener('click', () => restoreHistory(hid));
    });
  }

  function labelOf(action) {
    if (action === 'create') return '新增';
    if (action === 'update') return '编辑';
    if (action === 'delete') return '删除';
    if (action === 'restore') return '恢复';
    return action;
  }

  function openHistory() {
    els.historyPanel.hidden = false;
  }
  function closeHistory() {
    els.historyPanel.hidden = true;
  }

  function restoreHistory(historyId) {
    const rec = histories.find(h => h.id === historyId);
    if (!rec) return;
    const confirmed = confirm('确定将数据恢复到该版本吗？当前内容将被覆盖。');
    if (!confirmed) return;
    const before = items;
    items = Array.isArray(rec.after) ? rec.after : [];
    pushHistory('restore', before, items);
    store.save(items);
    // 同步数据到服务端
    upsertDataOnServer(items).catch(() => {});
    render();
  }

  // ===== 服务端同步 =====
  async function syncFromServer() {
    try {
      // 同步数据
      const res = await fetch(`${API_BASE}/data`, { cache: 'no-store' });
      if (!res.ok) return;
      const payload = await res.json();
      if (Array.isArray(payload?.items)) {
        items = payload.items;
        store.save(items);
        render();
      }
      
      // 同步历史
      const historyRes = await fetch(`${API_BASE}/history`, { cache: 'no-store' });
      if (historyRes.ok) {
        const historyPayload = await historyRes.json();
        if (Array.isArray(historyPayload?.history)) {
          histories = historyPayload.history;
          store.historySave(histories);
          renderHistory();
        }
      }
    } catch { /* 忽略离线错误 */ }
  }

  async function upsertDataOnServer(nextItems) {
    try {
      await fetch(`${API_BASE}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: nextItems })
      });
    } catch { /* 忽略离线错误 */ }
  }

  async function sendSnapshotToServer(snapshot) {
    try {
      await fetch(`${API_BASE}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
    } catch { /* 忽略 */ }
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
})();


