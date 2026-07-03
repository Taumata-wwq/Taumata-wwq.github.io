/* ============================================================
   admin.js — 后台逻辑（独立工具，编辑 projects.json）
   支持 serve.py 本地服务器：http:// 下可直接保存到 projects.json
   ============================================================ */

const DATA_URL = 'assets/data/projects.json';
const DRAFT_KEY = 'taumata.admin.draft.v1';
/* 检测是否运行在本地服务器下（http:// 协议且非 file://） */
const isHttpServer = location.protocol === 'http:' || location.protocol === 'https:';

/* 区域代码到中英文名称的映射 */
const REGION_MAP = {
  cn: { zh: '中国', en: 'China' },
  hk: { zh: '中国香港', en: 'Hong Kong SAR' },
  tw: { zh: '中国台湾', en: 'Taiwan' },
  jp: { zh: '日本', en: 'Japan' },
  kr: { zh: '韩国', en: 'South Korea' },
  sg: { zh: '新加坡', en: 'Singapore' },
  us: { zh: '美国', en: 'United States' },
  uk: { zh: '英国', en: 'United Kingdom' },
  eu: { zh: '欧洲', en: 'Europe' },
  other: { zh: '其他', en: 'Other' }
};

/* 时区可选项 */
const TIMEZONE_OPTIONS = [
  'GMT-12','GMT-11','GMT-10','GMT-9','GMT-8','GMT-7','GMT-6','GMT-5','GMT-4','GMT-3','GMT-2','GMT-1',
  'GMT+0','GMT+1','GMT+2','GMT+3','GMT+4','GMT+5','GMT+6','GMT+7','GMT+8','GMT+9','GMT+10','GMT+11','GMT+12'
];

let data = { site: {}, projects: [], notes: [] };
let editingProjectId = null;     /* 当前正在编辑的作品 id（null = 未编辑） */
let editingNoteId = null;        /* 当前正在编辑的笔记 id */
let editingImages = [];          /* 编辑中的图片数组 */
let editingLinks = [];           /* 编辑中的链接引用数组 [{name, url}] */
let projectEditSnapshot = null;  /* 进入编辑时的字段快照，用于"取消时判断是否有改动" */
let noteEditSnapshot = null;
let projectEditBackup = null;    /* 编辑前的深拷贝（用于取消时回滚），null 表示新建 */
let noteEditBackup = null;
let projectEditWasNew = false;   /* 标记当前编辑的是否是新建作品 */
let noteEditWasNew = false;      /* 标记当前编辑的是否是新建笔记 */
let saveTimer = null;            /* 防抖保存计时器 */
let isSaving = false;            /* 是否正在保存中（防止并发保存） */
let saveAgain = false;           /* 保存期间又有新改动，需再次保存 */
let editingTagIdx = -1;          /* 标签管理页当前展开编辑的 tag 索引（-1 = 无） */

/* ---------- 工具 ---------- */
function $(id) { return document.getElementById(id); }
function q(sel) { return document.querySelector(sel); }
function qall(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 1800);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* 转义用于 HTML 属性值和 JS 字符串字面量的字符（防止 XSS 和属性注入） */
function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/['"\\<>]/g, (c) => ({
    "'": '&#39;', '"': '&quot;', '\\': '\\\\', '<': '&lt;', '>': '&gt;'
  }[c]));
}

/* 取作品封面（与 router.js 保持一致） */
function getCover(p) {
  if (Array.isArray(p.images) && p.images.length) {
    const cover = p.images.find((it) => it && it.isCover) || p.images[0];
    return (cover && cover.url) || '';
  }
  return p.image || '';
}

/* 取作品时间（兼容 datetime/year 字段），返回数值时间戳 */
function getTimestamp(p) {
  const dt = p.datetime || p.year || '';
  if (!dt) return 0;
  const t = Date.parse(dt);
  if (!isNaN(t)) return t;
  const year = parseInt(dt, 10);
  if (!isNaN(year)) return Date.parse(year + '-01-01') || 0;
  return 0;
}

/* 格式化为 datetime-local 输入框所需格式：YYYY-MM-DDTHH:MM */
function toDatetimeLocal(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/* 把 datetime-local 值（YYYY-MM-DDTHH:MM）转换为存储格式 YYYY-MM-DD HH:MM */
function fromDatetimeLocal(val) {
  if (!val) return '';
  return val.replace('T', ' ');
}

/* 取作品时间显示文本 */
function getTimeDisplay(p) {
  return p.datetime || p.year || '';
}

/* 把字段值生成快照（用于取消时比对） */
function snapshotProjectForm() {
  return {
    titleZh: $('pf_title_zh').value,
    titleEn: $('pf_title_en').value,
    descZh: $('pf_desc_zh').value,
    descEn: $('pf_desc_en').value,
    bodyZh: $('pf_body_zh').value,
    bodyEn: $('pf_body_en').value,
    tags: $('pf_tags').value,
    datetime: $('pf_datetime').value,
    images: JSON.stringify(editingImages),
    links: JSON.stringify(editingLinks)
  };
}

function snapshotNoteForm() {
  return {
    titleZh: $('nf_title_zh').value,
    titleEn: $('nf_title_en').value,
    date: $('nf_date').value,
    tags: $('nf_tag').value,
    excerptZh: $('nf_excerpt_zh').value,
    excerptEn: $('nf_excerpt_en').value,
    links: JSON.stringify(editingLinks)
  };
}

function shallowEqual(a, b) {
  if (!a || !b) return false;
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/* ---------- 保存状态与防抖 ---------- */
function setSaveStatus(status) {
  const el = $('saveStatus');
  if (el) el.textContent = status;
}

/* 内部保存实现，silent=true 时不弹 toast */
async function _doSave(silent) {
  /* 1. 写入 localStorage 草稿（主页会用它做实时预览） */
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[admin] 草稿保存失败', e);
  }
  /* 2. http:// 模式：POST 到服务器，直接写入 projects.json */
  if (isHttpServer) {
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.ok) {
        if (!silent) toast('已保存到 projects.json · 主页将自动同步');
      } else {
        if (!silent) toast('保存失败 · ' + (json.error || '服务器错误'));
      }
    } catch (e) {
      if (!silent) toast('保存失败 · ' + e.message + '（草稿已写入本机）');
    }
  } else {
    if (!silent) toast('已保存草稿（file:// 模式 · 请使用 serve.py 直接保存到 projects.json）');
  }
}

/* 保存：http:// 模式下直接写入 projects.json；同时保存 localStorage 草稿供主页实时同步 */
async function saveDraft() {
  setSaveStatus('saving...');
  await _doSave(false);
  setSaveStatus('已保存');
}

/* 防抖保存：800ms 内多次调用只触发一次保存（静默，不弹 toast）
   保存期间若有新改动，会在当前保存完成后再次保存一次 */
function debouncedSave() {
  setSaveStatus('saving...');
  /* 如果正在保存中，标记需要再次保存 */
  if (isSaving) {
    saveAgain = true;
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    isSaving = true;
    await _doSave(true);
    isSaving = false;
    /* 保存期间又有新改动，再次保存 */
    if (saveAgain) {
      saveAgain = false;
      debouncedSave();
    } else {
      setSaveStatus('已保存');
    }
  }, 800);
}

/* 同步当前活动的编辑器（作品或笔记）到 data，然后防抖保存 */
function syncActiveEditor() {
  if (editingProjectId != null || ($('projectEditor') && $('projectEditor').style.display !== 'none')) {
    syncProjectEdit();
  } else if (editingNoteId != null || ($('noteEditor') && $('noteEditor').style.display !== 'none')) {
    syncNoteEdit();
  }
}

async function clearDraft() {
  if (!await showConfirmModal('清除草稿', '确定清除本机草稿？主页将回退到 projects.json（刷新后生效）。')) return;
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  toast('已清除草稿 · 重新加载中...');
  setTimeout(() => location.reload(), 600);
}

/* ---------- 数据加载 ---------- */
async function loadData() {
  let loaded = false;
  /* http:// 模式：优先从服务器加载（projects.json 是数据源） */
  if (isHttpServer) {
    try {
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if (res.ok) {
        data = await res.json();
        loaded = true;
      }
    } catch (e) {
      console.warn('[admin] 服务器加载失败', e);
    }
  }
  /* file:// 模式 或 服务器加载失败：尝试 localStorage 草稿 */
  if (!loaded) {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        data = JSON.parse(draft);
        loaded = true;
      }
    } catch (e) {}
  }
  /* 兜底：空数据 */
  if (!loaded) {
    data = { site: {}, about: {}, projects: [], notes: [] };
  }
  /* 兜底：保证必需字段存在（无论数据来源） */
  if (!data.site) data.site = {};
  if (!data.about) data.about = {};
  if (!Array.isArray(data.projects)) data.projects = [];
  if (!Array.isArray(data.notes)) data.notes = [];
  if (!Array.isArray(data.tags)) data.tags = [];
  if (!data.about.title) data.about.title = {};
  if (!data.about.desc) data.about.desc = {};
  if (!Array.isArray(data.about.paragraphs)) data.about.paragraphs = [];
  if (!Array.isArray(data.about.skills)) data.about.skills = [];
  if (!Array.isArray(data.about.contacts)) data.about.contacts = [];
  /* schedule 字段默认值 */
  if (!data.about.schedule) data.about.schedule = {};
  if (!data.about.schedule.status) data.about.schedule.status = 'closed';
  if (typeof data.about.schedule.slots !== 'number') data.about.schedule.slots = 0;
  if (!data.about.schedule.turnaround) data.about.schedule.turnaround = '';
  if (!data.about.schedule.note) data.about.schedule.note = { zh: '', en: '' };
}

/* ---------- 渲染 ---------- */
function renderAll() {
  safeRenderProjectsList();
  safeRenderNotesList();
  renderSiteForm();
  renderAboutForm();
  renderTagsManager();
  renderJsonPreview();
}

/* ---------- 标签管理 ---------- */

/* 判断字符串是否包含中文字符 */
function isChineseText(s) {
  return /[\u4e00-\u9fa5]/.test(String(s || ''));
}

/* 收集所有作品和笔记中出现的 tag 字符串，返回 { counts, allTags } */
function collectAllTags() {
  const counts = {};
  const collect = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((item) => {
      if (Array.isArray(item.tags)) {
        item.tags.forEach((t) => {
          const key = String(t || '').trim();
          if (!key) return;
          counts[key] = (counts[key] || 0) + 1;
        });
      }
    });
  };
  collect(data.projects);
  collect(data.notes);
  return counts;
}

/* 取标签的排序键（取 zh 或 en 的首字母，小写） */
function tagSortKey(t) {
  const s = (t && (t.zh || t.en)) || '';
  return String(s).toLowerCase();
}

/* 在 data.tags 中查找匹配的元数据（按 zh 或 en 字符串匹配） */
function findTagMeta(tagStr) {
  if (!Array.isArray(data.tags)) return null;
  const s = String(tagStr || '').trim();
  if (!s) return null;
  return data.tags.find((t) => t && (t.zh === s || t.en === s)) || null;
}

/* 渲染标签管理页 */
function renderTagsManager() {
  const box = $('tagsManager');
  if (!box) return;
  const items = buildTagItems();

  if (!items.length) {
    box.innerHTML = '<div class="dynamic-empty">暂无标签 · 点击右上角「+ 新增标签」</div>';
    return;
  }

  box.innerHTML = items.map((it, i) => {
    const display = it.zh || it.en;
    const isOpen = editingTagIdx === i;
    return `
      <div class="tag-mgr-row">
        <div class="tag-mgr-item ${isOpen ? 'is-open' : ''}" data-tag-toggle="${i}">
          <span class="tag-mgr-num">${String(i + 1).padStart(3, '0')}</span>
          <div class="tag-mgr-text">
            <span class="tag-mgr-main">${escapeHtml(display)}</span>
            ${(it.zh && it.en) ? `<span class="tag-mgr-sub">${escapeHtml(it.en)}</span>` : ''}
          </div>
          <span class="tag-mgr-count">${it.count}</span>
          <div class="admin-list-actions">
            <button class="btn-mini btn-mini--danger" data-tag-del="${i}" title="删除" aria-label="删除">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M6 4V2h4v2M5 4v9h6V4"/></svg>
            </button>
          </div>
        </div>
        ${isOpen ? renderTagEditPanel(it, i) : ''}
      </div>
    `;
  }).join('');
}

/* 构建标签 items 列表（合并元数据 + 实际使用的 tag，按首字母排序） */
function buildTagItems() {
  const counts = collectAllTags();
  const seen = new Set();
  const items = [];
  (data.tags || []).forEach((t) => {
    if (!t) return;
    const key = (t.zh || t.en || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push({
      zh: t.zh || '',
      en: t.en || '',
      desc: t.desc || { zh: '', en: '' }
    });
  });
  Object.keys(counts).forEach((s) => {
    if (seen.has(s)) return;
    seen.add(s);
    if (isChineseText(s)) items.push({ zh: s, en: '', desc: { zh: '', en: '' } });
    else items.push({ zh: '', en: s, desc: { zh: '', en: '' } });
  });
  items.forEach((it) => {
    let c = 0;
    if (it.zh) c += counts[it.zh] || 0;
    if (it.en && it.en !== it.zh) c += counts[it.en] || 0;
    it.count = c;
  });
  items.sort((a, b) => {
    const ka = tagSortKey(a);
    const kb = tagSortKey(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
  return items;
}

/* 渲染内联编辑面板 */
function renderTagEditPanel(item, idx) {
  const desc = item.desc || {};
  return `
    <div class="tag-edit-panel" data-tag-panel="${idx}">
      <div class="field-grid">
        <div class="field">
          <label class="field-label">中文名称</label>
          <input class="field-input" id="te_zh_${idx}" type="text" value="${escapeHtml(item.zh || '')}" placeholder="中文标签名" data-tag-field>
        </div>
        <div class="field">
          <label class="field-label">英文名称</label>
          <input class="field-input" id="te_en_${idx}" type="text" value="${escapeHtml(item.en || '')}" placeholder="英文标签名" data-tag-field>
        </div>
      </div>
      <div class="field-grid">
        <div class="field">
          <label class="field-label">中文介绍</label>
          <textarea class="field-input md-textarea" id="te_desc_zh_${idx}" rows="2" placeholder="标签的中文介绍（可选）" data-tag-field>${escapeHtml(desc.zh || '')}</textarea>
        </div>
        <div class="field">
          <label class="field-label">英文介绍</label>
          <textarea class="field-input md-textarea" id="te_desc_en_${idx}" rows="2" placeholder="英文介绍（可选）" data-tag-field>${escapeHtml(desc.en || '')}</textarea>
        </div>
      </div>
    </div>
  `;
}

/* 切换 tag 编辑面板的展开/收起 */
function toggleTagEdit(idx) {
  if (editingTagIdx === idx) {
    editingTagIdx = -1;
  } else {
    editingTagIdx = idx;
  }
  renderTagsManager();
}

/* 同步保存内联编辑的 tag（不收起面板，不显示 toast，用于失焦自动保存） */
function saveTagEdit(idx, opts) {
  opts = opts || {};
  const items = buildTagItems();
  const item = items[idx];
  if (!item) return;
  const oldZh = item.zh || '';
  const oldEn = item.en || '';

  const newZh = ($(`te_zh_${idx}`) || {}).value || '';
  const newEn = ($(`te_en_${idx}`) || {}).value || '';
  const newDescZh = ($(`te_desc_zh_${idx}`) || {}).value || '';
  const newDescEn = ($(`te_desc_en_${idx}`) || {}).value || '';

  const trimmedZh = newZh.trim();
  const trimmedEn = newEn.trim();
  if (!trimmedZh && !trimmedEn) {
    if (opts.silent) return;
    toast('中英文不能同时为空');
    return;
  }

  /* 没有变化则不保存 */
  if (trimmedZh === oldZh && trimmedEn === oldEn &&
      trimmedZh && (trimmedEn || !oldEn)) {
    const oldDesc = item.desc || { zh: '', en: '' };
    if (newDescZh.trim() === oldDesc.zh && newDescEn.trim() === oldDesc.en) {
      if (opts.close) {
        editingTagIdx = -1;
        renderTagsManager();
      }
      return;
    }
  }

  /* 同步替换所有作品和笔记中的 tag 字符串 */
  const replaceInArray = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((p) => {
      if (!Array.isArray(p.tags)) return;
      p.tags = p.tags.map((s) => {
        if (s === oldZh) return trimmedZh || trimmedEn;
        if (s === oldEn) return trimmedEn || trimmedZh;
        return s;
      }).filter(Boolean);
    });
  };
  replaceInArray(data.projects);
  replaceInArray(data.notes);

  /* 更新或创建元数据 */
  if (!Array.isArray(data.tags)) data.tags = [];
  const metaIdx = data.tags.findIndex((t) => t && (
    (oldZh && t.zh === oldZh) || (oldEn && t.en === oldEn)
  ));
  const newMeta = { zh: trimmedZh, en: trimmedEn, desc: { zh: newDescZh.trim(), en: newDescEn.trim() } };
  if (metaIdx >= 0) {
    data.tags[metaIdx] = newMeta;
  } else {
    data.tags.push(newMeta);
  }

  if (opts.close) {
    editingTagIdx = -1;
  }
  renderTagsManager();
  safeRenderProjectsList();
  safeRenderNotesList();
  renderJsonPreview();
  debouncedSave();
  if (!opts.silent) toast('标签已更新');
}

/* 新增标签：直接创建并展开编辑面板 */
function addTagItem() {
  if (!Array.isArray(data.tags)) data.tags = [];
  data.tags.push({ zh: '', en: '', desc: { zh: '', en: '' } });
  /* 重新渲染后展开新添加的 tag（排序后的最后一项不一定是新添加的，所以需要找到它） */
  const items = buildTagItems();
  const newIdx = items.length - 1;
  editingTagIdx = newIdx;
  renderTagsManager();
  renderJsonPreview();
  debouncedSave();
  /* 聚焦到新标签的中文输入框 */
  setTimeout(() => {
    const input = $(`te_zh_${newIdx}`);
    if (input) input.focus();
  }, 50);
}

/* 删除标签：从所有作品和笔记中移除匹配的字符串，并删除元数据 */
async function deleteTagItem(idx) {
  const items = buildTagItems();
  const item = items[idx];
  if (!item) return;
  const oldZh = item.zh || '';
  const oldEn = item.en || '';
  const display = oldZh || oldEn;
  if (!await showConfirmModal('删除标签', `确定删除标签「${display}」？将从所有作品和笔记中移除。`)) return;

  const removeFromArray = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((p) => {
      if (!Array.isArray(p.tags)) return;
      p.tags = p.tags.filter((s) => s !== oldZh && s !== oldEn);
    });
  };
  removeFromArray(data.projects);
  removeFromArray(data.notes);
  if (Array.isArray(data.tags)) {
    data.tags = data.tags.filter((t) => !(t && (
      (oldZh && t.zh === oldZh) || (oldEn && t.en === oldEn)
    )));
  }
  if (editingTagIdx === idx) editingTagIdx = -1;
  renderTagsManager();
  safeRenderProjectsList();
  safeRenderNotesList();
  renderJsonPreview();
  debouncedSave();
  toast('标签已删除');
}

/* 同步：扫描所有作品和笔记中的 tag 字符串，把未在元数据中的添加到元数据 */
function syncTagsFromContent() {
  if (!Array.isArray(data.tags)) data.tags = [];
  const counts = collectAllTags();
  let added = 0;
  Object.keys(counts).forEach((s) => {
    const exists = data.tags.some((t) => t && (t.zh === s || t.en === s));
    if (!exists) {
      if (isChineseText(s)) data.tags.push({ zh: s, en: '' });
      else data.tags.push({ zh: '', en: s });
      added++;
    }
  });
  renderTagsManager();
  renderJsonPreview();
  debouncedSave();
  toast(added ? `已同步 ${added} 个新标签` : '没有需要同步的新标签');
}

/* 当作品/笔记保存时，把新输入的 tag 字符串同步到元数据 */
function autoSyncTagsFromStrings(strings) {
  if (!Array.isArray(strings) || !strings.length) return;
  if (!Array.isArray(data.tags)) data.tags = [];
  strings.forEach((s) => {
    const key = String(s || '').trim();
    if (!key) return;
    const exists = data.tags.some((t) => t && (t.zh === key || t.en === key));
    if (!exists) {
      if (isChineseText(key)) data.tags.push({ zh: key, en: '' });
      else data.tags.push({ zh: '', en: key });
    }
  });
}

/* ---------- 标签 autocomplete ---------- */
/* 给指定 input 绑定 autocomplete：输入时显示匹配的已有 tag */
function bindTagsAutocomplete(inputId, dropdownId) {
  const input = $(inputId);
  const dropdown = $(dropdownId);
  if (!input || !dropdown) return;
  let activeIdx = -1;
  let currentMatches = [];

  function getCurrentToken() {
    const val = input.value;
    /* 支持中英文逗号分隔，取光标位置前的当前 token */
    const pos = input.selectionStart || val.length;
    const before = val.slice(0, pos);
    const parts = before.split(/[,，]/);
    return { token: parts[parts.length - 1].trim(), prefix: parts.slice(0, -1).join(', ') + (parts.length > 1 ? ', ' : ''), pos };
  }

  function buildMatches(token) {
    if (!token) return [];
    const lower = token.toLowerCase();
    const matches = [];
    const seen = new Set();
    /* 从元数据中查找 */
    (data.tags || []).forEach((t) => {
      if (!t) return;
      [t.zh, t.en].forEach((s) => {
        if (!s) return;
        if (seen.has(s)) return;
        if (String(s).toLowerCase().indexOf(lower) >= 0) {
          seen.add(s);
          matches.push(s);
        }
      });
    });
    /* 也从所有作品/笔记的实际 tag 中查找 */
    const counts = collectAllTags();
    Object.keys(counts).forEach((s) => {
      if (seen.has(s)) return;
      if (String(s).toLowerCase().indexOf(lower) >= 0) {
        seen.add(s);
        matches.push(s);
      }
    });
    return matches.slice(0, 10);
  }

  function renderDropdown() {
    if (!currentMatches.length) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      return;
    }
    dropdown.innerHTML = currentMatches.map((s, i) =>
      `<div class="tag-ac-item ${i === activeIdx ? 'is-active' : ''}" data-ac-idx="${i}">${escapeHtml(s)}</div>`
    ).join('');
    dropdown.style.display = 'block';
  }

  function applyMatch(match) {
    const val = input.value;
    const pos = input.selectionStart || val.length;
    const before = val.slice(0, pos);
    const after = val.slice(pos);
    const parts = before.split(/([,，])/);
    /* 最后一个非分隔符部分就是当前 token */
    let lastPartIdx = parts.length - 1;
    while (lastPartIdx >= 0 && /[,，]/.test(parts[lastPartIdx])) lastPartIdx--;
    if (lastPartIdx < 0) {
      dropdown.style.display = 'none';
      return;
    }
    parts[lastPartIdx] = match;
    const newBefore = parts.join('');
    input.value = newBefore + after;
    /* 把光标放到末尾 */
    const newPos = newBefore.length;
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(newPos, newPos);
    }, 0);
    dropdown.style.display = 'none';
    /* 触发同步 */
    syncActiveEditor();
    debouncedSave();
  }

  input.addEventListener('input', () => {
    const { token } = getCurrentToken();
    currentMatches = buildMatches(token);
    activeIdx = currentMatches.length ? 0 : -1;
    renderDropdown();
  });

  input.addEventListener('focus', () => {
    const { token } = getCurrentToken();
    if (token) {
      currentMatches = buildMatches(token);
      activeIdx = currentMatches.length ? 0 : -1;
      renderDropdown();
    }
  });

  input.addEventListener('blur', () => {
    /* 延迟关闭，让 click 事件先触发 */
    setTimeout(() => {
      dropdown.style.display = 'none';
    }, 200);
  });

  input.addEventListener('keydown', (e) => {
    if (dropdown.style.display === 'none' || !currentMatches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % currentMatches.length;
      renderDropdown();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = (activeIdx - 1 + currentMatches.length) % currentMatches.length;
      renderDropdown();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (activeIdx >= 0 && currentMatches[activeIdx]) {
        e.preventDefault();
        applyMatch(currentMatches[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });

  dropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('[data-ac-idx]');
    if (!item) return;
    e.preventDefault();
    const idx = parseInt(item.dataset.acIdx, 10);
    if (!isNaN(idx) && currentMatches[idx]) {
      applyMatch(currentMatches[idx]);
    }
  });
}

/* 安全地渲染作品列表：先把编辑器从列表里搬出，避免被 innerHTML 销毁 */
function safeRenderProjectsList() {
  const ul = $('projectsList');
  const editor = $('projectEditor');
  const section = $('section-projects');
  if (!ul) return;
  /* 若编辑器当前在 ul 内，先搬到 section 末尾 */
  if (editor && ul.contains(editor)) {
    section.appendChild(editor);
  }
  renderProjectsList();
  /* 渲染完后，若仍在编辑某项，把编辑器插到该条目下方 */
  if (editor && editingProjectId != null) {
    const item = ul.querySelector(`[data-id="${CSS.escape(String(editingProjectId))}"]`);
    if (item && item.parentNode === ul) {
      ul.insertBefore(editor, item.nextSibling);
    } else {
      ul.parentNode.insertBefore(editor, ul.nextSibling);
    }
  }
}

function safeRenderNotesList() {
  const ul = $('notesList');
  const editor = $('noteEditor');
  const section = $('section-notes');
  if (!ul) return;
  if (editor && ul.contains(editor)) {
    section.appendChild(editor);
  }
  renderNotesList();
  if (editor && editingNoteId != null) {
    const item = ul.querySelector(`[data-id="${CSS.escape(String(editingNoteId))}"]`);
    if (item && item.parentNode === ul) {
      ul.insertBefore(editor, item.nextSibling);
    } else {
      ul.parentNode.insertBefore(editor, ul.nextSibling);
    }
  }
}

function renderProjectsList() {
  const ul = $('projectsList');
  if (!ul) return;
  /* 按时间倒序显示 */
  const sorted = data.projects.slice().sort((a, b) => getTimestamp(b) - getTimestamp(a));
  if (!sorted.length) {
    ul.innerHTML = '<div class="empty-state">暂无作品 · 点击右上角新增</div>';
    return;
  }
  ul.innerHTML = sorted.map((p, i) => {
    const cover = getCover(p);
    const img = cover
      ? `<span class="admin-thumb" style="background-image:url('${escapeAttr(cover)}')"></span>`
      : `<span class="admin-thumb admin-thumb--empty"></span>`;
    const imgCount = Array.isArray(p.images) ? p.images.length : (cover ? 1 : 0);
    const isEditing = editingProjectId != null && String(editingProjectId) === String(p.id);
    const time = getTimeDisplay(p);
    /* 编辑模式下也显示编辑/删除按钮（点击编辑会跳转到编辑器，点击删除会关闭编辑器并删除） */
    const actions = `
      <div class="admin-list-actions">
        <button class="btn-mini" data-edit="${escapeHtml(p.id)}" title="编辑" aria-label="编辑">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>
        </button>
        <button class="btn-mini btn-mini--danger" data-del="${escapeHtml(p.id)}" title="删除" aria-label="删除">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M6 4V2h4v2M5 4v9h6V4"/></svg>
        </button>
      </div>
    `;
    return `
      <div class="admin-list-item admin-list-item--project ${isEditing ? 'is-editing' : ''}" data-id="${escapeHtml(p.id)}">
        ${img}
        <span class="admin-list-num">${String(i + 1).padStart(3, '0')}</span>
        <div class="admin-list-text">
          <div class="admin-list-title">${escapeHtml(p.title?.zh || '')}</div>
          <div class="admin-list-meta">${escapeHtml(time)} · ${(p.tags || []).join(', ')}${imgCount ? ' · ' + imgCount + ' 图' : ''}</div>
        </div>
        ${actions}
      </div>
    `;
  }).join('');
}

function renderNotesList() {
  const ul = $('notesList');
  if (!ul) return;
  /* 笔记按日期倒序 */
  const sorted = data.notes.slice().sort((a, b) => {
    const ta = Date.parse(a.date || '') || 0;
    const tb = Date.parse(b.date || '') || 0;
    return tb - ta;
  });
  if (!sorted.length) {
    ul.innerHTML = '<div class="empty-state">暂无笔记</div>';
    return;
  }
  ul.innerHTML = sorted.map((n, i) => {
    const isEditing = editingNoteId != null && String(editingNoteId) === String(n.id);
    const actions = `
      <div class="admin-list-actions">
        <button class="btn-mini" data-edit-note="${escapeHtml(n.id)}" title="编辑" aria-label="编辑">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>
        </button>
        <button class="btn-mini btn-mini--danger" data-del-note="${escapeHtml(n.id)}" title="删除" aria-label="删除">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M6 4V2h4v2M5 4v9h6V4"/></svg>
        </button>
      </div>
    `;
    return `
      <div class="admin-list-item ${isEditing ? 'is-editing' : ''}" data-id="${escapeHtml(n.id)}">
        <span class="admin-list-num">${String(i + 1).padStart(3, '0')}</span>
        <div class="admin-list-text">
          <div class="admin-list-title">${escapeHtml(n.title?.zh || '')}</div>
          <div class="admin-list-meta">${escapeHtml(n.date || '')} · ${escapeHtml((Array.isArray(n.tags) ? n.tags : []).join(', '))}</div>
        </div>
        ${actions}
      </div>
    `;
  }).join('');
}

/* ---------- 站点信息表单 ---------- */
function renderSiteForm() {
  const s = data.site || {};
  if ($('sf_name')) $('sf_name').value = s.name || '';
  if ($('sf_tagline_zh')) $('sf_tagline_zh').value = s.tagline?.zh || '';
  if ($('sf_tagline_en')) $('sf_tagline_en').value = s.tagline?.en || '';
  if ($('sf_status_zh')) $('sf_status_zh').value = s.status?.zh || '';
  if ($('sf_status_en')) $('sf_status_en').value = s.status?.en || '';

  /* 区域下拉：若 HTML 未提供 options，则用 REGION_MAP 填充 */
  const regionSelect = $('sf_region');
  if (regionSelect) {
    if (!regionSelect.options.length) {
      regionSelect.innerHTML = '<option value="">-- 选择区域 --</option>' +
        Object.keys(REGION_MAP).map((code) =>
          `<option value="${code}">${REGION_MAP[code].zh} / ${REGION_MAP[code].en}</option>`
        ).join('');
    }
    regionSelect.value = s.region || '';
  }

  /* 时区下拉：若 HTML 未提供 options，则用 TIMEZONE_OPTIONS 填充 */
  const tzSelect = $('sf_timezone');
  if (tzSelect) {
    if (!tzSelect.options.length) {
      tzSelect.innerHTML = '<option value="">-- 选择时区 --</option>' +
        TIMEZONE_OPTIONS.map((tz) => `<option value="${tz}">${tz}</option>`).join('');
    }
    tzSelect.value = s.timezone || '';
  }

  if ($('sf_online_time')) $('sf_online_time').value = s.onlineTime || '';
  if ($('sf_site_url')) $('sf_site_url').value = s.siteUrl || '';

  /* 同步首页链接 */
  const siteLink = $('siteLink');
  if (siteLink && s.siteUrl) siteLink.href = s.siteUrl;
}

/* 从表单读取并同步到 data.site */
function syncSiteForm() {
  if (!data.site) data.site = {};
  if ($('sf_name')) data.site.name = $('sf_name').value;
  if ($('sf_tagline_zh')) {
    if (!data.site.tagline) data.site.tagline = {};
    data.site.tagline.zh = $('sf_tagline_zh').value;
  }
  if ($('sf_tagline_en')) {
    if (!data.site.tagline) data.site.tagline = {};
    data.site.tagline.en = $('sf_tagline_en').value;
  }
  if ($('sf_status_zh')) {
    if (!data.site.status) data.site.status = {};
    data.site.status.zh = $('sf_status_zh').value;
  }
  if ($('sf_status_en')) {
    if (!data.site.status) data.site.status = {};
    data.site.status.en = $('sf_status_en').value;
  }
  if ($('sf_region')) {
    const region = $('sf_region').value;
    data.site.region = region;
    /* 当 region 改变时自动填充 location（中英文） */
    if (region && REGION_MAP[region]) {
      data.site.location = { zh: REGION_MAP[region].zh, en: REGION_MAP[region].en };
    }
  }
  if ($('sf_timezone')) data.site.timezone = $('sf_timezone').value;
  if ($('sf_online_time')) data.site.onlineTime = $('sf_online_time').value;
  if ($('sf_site_url')) {
    data.site.siteUrl = $('sf_site_url').value;
    const siteLink = $('siteLink');
    if (siteLink) siteLink.href = data.site.siteUrl;
  }
  renderJsonPreview();
}

/* ---------- 关于信息表单 ---------- */
function renderAboutForm() {
  const a = data.about || {};
  if ($('af_title_zh')) $('af_title_zh').value = a.title?.zh || '';
  if ($('af_title_en')) $('af_title_en').value = a.title?.en || '';
  if ($('af_desc_zh')) $('af_desc_zh').value = a.desc?.zh || '';
  if ($('af_desc_en')) $('af_desc_en').value = a.desc?.en || '';

  /* schedule 下拉：若 HTML 未提供 options 则填充 */
  const scheduleStatus = $('af_schedule_status');
  if (scheduleStatus) {
    if (!scheduleStatus.options.length) {
      scheduleStatus.innerHTML = `
        <option value="open">开放接单</option>
        <option value="busy">较忙</option>
        <option value="closed">不接单</option>
      `;
    }
    scheduleStatus.value = a.schedule?.status || 'closed';
  }
  if ($('af_schedule_slots')) $('af_schedule_slots').value = a.schedule?.slots ?? 0;
  if ($('af_schedule_turnaround')) $('af_schedule_turnaround').value = a.schedule?.turnaround || '';
  if ($('af_schedule_note_zh')) $('af_schedule_note_zh').value = a.schedule?.note?.zh || '';
  if ($('af_schedule_note_en')) $('af_schedule_note_en').value = a.schedule?.note?.en || '';

  renderAboutParagraphs();
  renderAboutSkills();
  renderAboutContacts();
}

/* 从表单读取并同步到 data.about */
function syncAboutForm() {
  if (!data.about) data.about = {};
  const a = data.about;
  if ($('af_title_zh')) { if (!a.title) a.title = {}; a.title.zh = $('af_title_zh').value; }
  if ($('af_title_en')) { if (!a.title) a.title = {}; a.title.en = $('af_title_en').value; }
  if ($('af_desc_zh')) { if (!a.desc) a.desc = {}; a.desc.zh = $('af_desc_zh').value; }
  if ($('af_desc_en')) { if (!a.desc) a.desc = {}; a.desc.en = $('af_desc_en').value; }

  /* schedule */
  if (!a.schedule) a.schedule = {};
  if ($('af_schedule_status')) a.schedule.status = $('af_schedule_status').value;
  if ($('af_schedule_slots')) a.schedule.slots = parseInt($('af_schedule_slots').value, 10) || 0;
  if ($('af_schedule_turnaround')) a.schedule.turnaround = $('af_schedule_turnaround').value;
  if (!a.schedule.note) a.schedule.note = {};
  if ($('af_schedule_note_zh')) a.schedule.note.zh = $('af_schedule_note_zh').value;
  if ($('af_schedule_note_en')) a.schedule.note.en = $('af_schedule_note_en').value;

  /* 段落：从 DOM 读取 */
  const pRows = qall('#aboutParagraphs .dynamic-row--paragraph');
  if (pRows.length) {
    a.paragraphs = pRows.map((row) => ({
      zh: (row.querySelector('[data-pf="zh"]') || {}).value || '',
      en: (row.querySelector('[data-pf="en"]') || {}).value || ''
    }));
  }

  /* 技能：从 DOM 读取 */
  const sRows = qall('#aboutSkills .dynamic-row--skill');
  if (sRows.length) {
    a.skills = sRows.map((row) =>
      (row.querySelector('[data-sf="1"]') || {}).value || ''
    );
  }

  /* 联系方式：从 DOM 读取 */
  const cRows = qall('#aboutContacts .dynamic-row--contact');
  if (cRows.length) {
    a.contacts = cRows.map((row) => ({
      label: (row.querySelector('[data-cf="label"]') || {}).value || '',
      value: (row.querySelector('[data-cf="value"]') || {}).value || ''
    }));
  }
  renderJsonPreview();
}

function renderAboutParagraphs() {
  const box = $('aboutParagraphs');
  if (!box) return;
  const paras = data.about.paragraphs;
  if (!Array.isArray(paras) || !paras.length) {
    box.innerHTML = '<div class="dynamic-empty">暂无段落</div>';
    return;
  }
  box.innerHTML = paras.map((p, i) => `
    <div class="dynamic-row dynamic-row--paragraph" data-index="${i}">
      <div class="dynamic-row-fields">
        <input class="field-input" data-pf="zh" data-index="${i}" type="text" placeholder="中文段落" value="${escapeHtml(p.zh || '')}">
        <input class="field-input" data-pf="en" data-index="${i}" type="text" placeholder="英文段落" value="${escapeHtml(p.en || '')}">
      </div>
      <button class="btn-mini btn-mini--danger" data-pf-del="${i}" title="删除" aria-label="删除段落">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M6 4V2h4v2M5 4v9h6V4"/></svg>
      </button>
    </div>
  `).join('');
}

function renderAboutSkills() {
  const box = $('aboutSkills');
  if (!box) return;
  const skills = data.about.skills;
  if (!Array.isArray(skills) || !skills.length) {
    box.innerHTML = '<div class="dynamic-empty">暂无技能</div>';
    return;
  }
  box.innerHTML = skills.map((s, i) => `
    <div class="dynamic-row dynamic-row--skill" data-index="${i}">
      <div class="dynamic-row-fields">
        <input class="field-input" data-sf="1" data-index="${i}" type="text" placeholder="技能名称" value="${escapeHtml(s || '')}">
      </div>
      <button class="btn-mini btn-mini--danger" data-sf-del="${i}" title="删除" aria-label="删除技能">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M6 4V2h4v2M5 4v9h6V4"/></svg>
      </button>
    </div>
  `).join('');
}

function renderAboutContacts() {
  const box = $('aboutContacts');
  if (!box) return;
  const contacts = data.about.contacts;
  if (!Array.isArray(contacts) || !contacts.length) {
    box.innerHTML = '<div class="dynamic-empty">暂无联系方式</div>';
    return;
  }
  box.innerHTML = contacts.map((c, i) => `
    <div class="dynamic-row dynamic-row--contact" data-index="${i}">
      <div class="dynamic-row-fields dynamic-row-fields--3">
        <input class="field-input" data-cf="label" data-index="${i}" type="text" placeholder="标签（如 EMAIL）" value="${escapeHtml(c.label || '')}">
        <input class="field-input" data-cf="value" data-index="${i}" type="text" placeholder="值（如 hello@example.com）" value="${escapeHtml(c.value || '')}">
      </div>
      <button class="btn-mini btn-mini--danger" data-cf-del="${i}" title="删除" aria-label="删除联系方式">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M6 4V2h4v2M5 4v9h6V4"/></svg>
      </button>
    </div>
  `).join('');
}

function bindAboutFields() {
  /* 静态字段：失焦时同步 + 防抖保存 */
  const staticIds = [
    'af_title_zh', 'af_title_en',
    'af_desc_zh', 'af_desc_en',
    'af_schedule_status', 'af_schedule_slots',
    'af_schedule_turnaround', 'af_schedule_note_zh', 'af_schedule_note_en'
  ];
  staticIds.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      syncAboutForm();
      debouncedSave();
    });
  });

  /* 段落：失焦同步 + 删除 + 添加 */
  const pBox = $('aboutParagraphs');
  if (pBox) {
    pBox.addEventListener('focusout', () => {
      syncAboutForm();
      debouncedSave();
    });
    pBox.addEventListener('click', (e) => {
      const del = e.target.closest('[data-pf-del]');
      if (del) {
        const idx = parseInt(del.dataset.pfDel, 10);
        if (!isNaN(idx) && data.about.paragraphs) {
          data.about.paragraphs.splice(idx, 1);
          renderAboutParagraphs();
          syncAboutForm();
          debouncedSave();
        }
      }
    });
  }
  const addP = $('btnAddParagraph');
  if (addP) addP.addEventListener('click', () => {
    if (!data.about.paragraphs) data.about.paragraphs = [];
    data.about.paragraphs.push({ zh: '', en: '' });
    renderAboutParagraphs();
    syncAboutForm();
    debouncedSave();
    /* 聚焦新行的中文输入框 */
    const rows = pBox ? pBox.querySelectorAll('[data-pf="zh"]') : [];
    if (rows.length) rows[rows.length - 1].focus();
  });

  /* 技能：失焦同步 + 删除 + 添加 */
  const sBox = $('aboutSkills');
  if (sBox) {
    sBox.addEventListener('focusout', () => {
      syncAboutForm();
      debouncedSave();
    });
    sBox.addEventListener('click', (e) => {
      const del = e.target.closest('[data-sf-del]');
      if (del) {
        const idx = parseInt(del.dataset.sfDel, 10);
        if (!isNaN(idx) && data.about.skills) {
          data.about.skills.splice(idx, 1);
          renderAboutSkills();
          syncAboutForm();
          debouncedSave();
        }
      }
    });
  }
  const addS = $('btnAddSkill');
  if (addS) addS.addEventListener('click', () => {
    if (!data.about.skills) data.about.skills = [];
    data.about.skills.push('');
    renderAboutSkills();
    syncAboutForm();
    debouncedSave();
    const rows = sBox ? sBox.querySelectorAll('[data-sf="1"]') : [];
    if (rows.length) rows[rows.length - 1].focus();
  });

  /* 联系方式：失焦同步 + 删除 + 添加 */
  const cBox = $('aboutContacts');
  if (cBox) {
    cBox.addEventListener('focusout', () => {
      syncAboutForm();
      debouncedSave();
    });
    cBox.addEventListener('click', (e) => {
      const del = e.target.closest('[data-cf-del]');
      if (del) {
        const idx = parseInt(del.dataset.cfDel, 10);
        if (!isNaN(idx) && data.about.contacts) {
          data.about.contacts.splice(idx, 1);
          renderAboutContacts();
          syncAboutForm();
          debouncedSave();
        }
      }
    });
  }
  const addC = $('btnAddContact');
  if (addC) addC.addEventListener('click', () => {
    if (!data.about.contacts) data.about.contacts = [];
    data.about.contacts.push({ label: '', value: '' });
    renderAboutContacts();
    syncAboutForm();
    debouncedSave();
    const rows = cBox ? cBox.querySelectorAll('[data-cf="label"]') : [];
    if (rows.length) rows[rows.length - 1].focus();
  });
}

function renderJsonPreview() {
  const pre = $('jsonPreview');
  if (!pre) return;
  /* 截断显示，避免大 base64 图片导致 <pre> 渲染卡死 */
  const MAX = 8000;
  let str;
  try {
    str = JSON.stringify(data, null, 2);
  } catch (e) {
    str = '[stringify error] ' + e.message;
  }
  if (str.length > MAX) {
    str = str.slice(0, MAX) + '\n\n... (已截断，共 ' + str.length + ' 字符，导出文件查看完整内容)';
  }
  pre.textContent = str;
}

/* ---------- 编辑作品 ---------- */

function openProjectEditor(id, sourceButton) {
  /* 若当前有其他作品在编辑，先同步保存（避免切换时丢失未保存的内容） */
  if (editingProjectId != null && String(editingProjectId) !== String(id)) {
    syncProjectEdit();
    debouncedSave();
    closeProjectEditor();
  } else if (editingProjectId != null && String(editingProjectId) === String(id)) {
    /* 点击的是当前正在编辑的同一作品，无需重新打开 */
    return;
  }
  const p = id != null ? (data.projects.find((x) => String(x.id) === String(id)) || {}) : {};
  /* 备份当前数据用于取消时回滚 */
  if (id != null) {
    const existing = data.projects.find((x) => String(x.id) === String(id));
    if (existing) {
      projectEditBackup = JSON.parse(JSON.stringify(existing));
      projectEditWasNew = false;
    } else {
      projectEditBackup = null;
      projectEditWasNew = false;
    }
  } else {
    projectEditBackup = null;
    projectEditWasNew = true;
  }
  editingProjectId = id != null ? id : null;

  /* 填充字段 */
  $('pf_id').value = p.id != null ? p.id : '';
  $('pf_title_zh').value = p.title?.zh || '';
  $('pf_title_en').value = p.title?.en || '';
  $('pf_desc_zh').value = p.desc?.zh || '';
  $('pf_desc_en').value = p.desc?.en || '';
  $('pf_body_zh').value = p.body?.zh || '';
  $('pf_body_en').value = p.body?.en || '';
  $('pf_tags').value = (p.tags || []).join(', ');
  /* datetime 字段：新建时自动填当前时间；旧数据只有 year 时回退用 1 月 1 日 */
  const datetimeVal = p.datetime
    ? toDatetimeLocal(p.datetime.replace(' ', 'T'))
    : (id == null
        ? toDatetimeLocal(new Date())
        : (p.year ? toDatetimeLocal(parseInt(p.year, 10) + '-01-01T00:00') : ''));
  $('pf_datetime').value = datetimeVal;

  /* 初始化图片集 */
  if (Array.isArray(p.images) && p.images.length) {
    editingImages = p.images.map((im) => ({
      url: im.url || '',
      caption: im.caption ? { zh: im.caption.zh || '', en: im.caption.en || '' } : null,
      isCover: !!im.isCover
    }));
    if (!editingImages.some((im) => im.isCover) && editingImages.length) {
      editingImages[0].isCover = true;
    }
  } else if (p.image) {
    editingImages = [{ url: p.image, caption: null, isCover: true }];
  } else {
    editingImages = [];
  }
  renderImageList();

  /* 初始化链接引用 */
  editingLinks = Array.isArray(p.links) && p.links.length
    ? p.links.map((l) => ({ name: l.name || '', url: l.url || '' }))
    : [];
  renderLinksList('project');

  /* 保存快照用于取消时比对 */
  projectEditSnapshot = snapshotProjectForm();

  /* 重渲染列表（让该条目显示编辑状态）并把编辑器移到条目下方 */
  safeRenderProjectsList();
  $('projectEditor').style.display = 'block';
  /* 不再自动滚动到编辑器，避免打断用户浏览 */
}

/* 同步作品编辑表单到 data.projects（不关闭编辑器） */
function syncProjectEdit() {
  const editor = $('projectEditor');
  if (!editor || editor.style.display === 'none') return;

  /* 生成新 id（仅新建时） */
  let id = editingProjectId;
  let isNew = false;
  if (id == null || id === '') {
    const maxId = data.projects.length
      ? Math.max(...data.projects.map((p) => (typeof p.id === 'number' ? p.id : parseInt(p.id, 10) || 0)))
      : 0;
    id = maxId + 1;
    editingProjectId = id;
    isNew = true;
    /* 同步显示到 pf_id 字段 */
    const idField = $('pf_id');
    if (idField) idField.value = id;
  } else {
    id = typeof editingProjectId === 'number' ? editingProjectId
      : (parseInt(editingProjectId, 10) || editingProjectId);
  }

  /* tag 支持中英文逗号 */
  const tags = $('pf_tags').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  /* 自动同步新 tag 到元数据 */
  autoSyncTagsFromStrings(tags);

  /* datetime 字段：优先用，否则回退到 year */
  const datetimeRaw = $('pf_datetime').value.trim();
  const datetime = datetimeRaw ? fromDatetimeLocal(datetimeRaw) : '';
  /* 同时保留 year 字段（取 datetime 前 4 位），向后兼容旧的主页代码 */
  const year = datetime ? datetime.slice(0, 4) : '';

  /* 过滤掉无 URL 的图片，并重新选定封面 */
  const validImages = editingImages.filter((im) => im.url);
  let coverIndexInValid = validImages.findIndex((im) => im.isCover);
  if (coverIndexInValid < 0) coverIndexInValid = 0;
  const images = validImages.map((im, i) => ({
    url: im.url,
    caption: im.caption,
    isCover: i === coverIndexInValid
  }));

  const coverUrl = images.length
    ? (images[coverIndexInValid] || images[0]).url
    : '';

  /* 过滤掉无 URL 的链接 */
  const validLinks = editingLinks
    .map((l) => ({ name: (l.name || '').trim(), url: (l.url || '').trim() }))
    .filter((l) => l.url);

  const item = {
    id,
    title: { zh: $('pf_title_zh').value.trim(), en: $('pf_title_en').value.trim() },
    desc: { zh: $('pf_desc_zh').value, en: $('pf_desc_en').value },
    body: { zh: $('pf_body_zh').value, en: $('pf_body_en').value },
    tags,
    datetime: datetime || undefined,
    year: year || undefined,
    image: coverUrl,
    images: images.length ? images : undefined,
    links: validLinks.length ? validLinks : undefined
  };
  /* 移除空 body */
  if (!item.body.zh && !item.body.en) delete item.body;
  /* 如果没有图片，移除 image 字段 */
  if (!coverUrl) delete item.image;

  if (isNew) {
    data.projects.push(item);
  } else {
    const i = data.projects.findIndex((p) => String(p.id) === String(editingProjectId));
    if (i >= 0) data.projects[i] = item;
    else data.projects.push(item);
  }

  /* 静默更新列表渲染（不关闭编辑器） */
  safeRenderProjectsList();
  renderJsonPreview();
}

/* 关闭作品编辑器并重置状态 */
function closeProjectEditor() {
  editingProjectId = null;
  editingImages = [];
  editingLinks = [];
  projectEditSnapshot = null;
  projectEditBackup = null;
  projectEditWasNew = false;
  const editor = $('projectEditor');
  if (editor) editor.style.display = 'none';
  safeRenderProjectsList();
}

/* 平滑滚动到列表中指定 id 的条目附近 */
function scrollToListItem(id, type) {
  const ul = type === 'note' ? $('notesList') : $('projectsList');
  if (!ul) return;
  const item = ul.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
  if (item) {
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/* 兼容旧调用：同步 + 保存 */
function applyProjectEdit() {
  syncProjectEdit();
  saveDraft();
}

async function cancelProjectEdit(force) {
  if (!force && projectEditSnapshot && !shallowEqual(projectEditSnapshot, snapshotProjectForm())) {
    if (!await showConfirmModal('取消编辑', '当前作品有未保存的更改，确定要取消吗？')) return;
  }
  /* 回滚 data 到编辑前状态 */
  if (projectEditWasNew && editingProjectId != null) {
    /* 新建的作品：从 data 中移除 */
    data.projects = data.projects.filter((p) => String(p.id) !== String(editingProjectId));
  } else if (projectEditBackup && editingProjectId != null) {
    const i = data.projects.findIndex((p) => String(p.id) === String(editingProjectId));
    if (i >= 0) data.projects[i] = projectEditBackup;
  }
  closeProjectEditor();
  renderJsonPreview();
  debouncedSave();
}

async function deleteProject(id) {
  if (!await showConfirmModal('删除作品', '确定删除这个作品？')) return;
  /* 若删除的正是正在编辑的，先关闭编辑器 */
  if (editingProjectId != null && String(editingProjectId) === String(id)) {
    editingProjectId = null;
    editingImages = [];
    editingLinks = [];
    projectEditSnapshot = null;
    projectEditBackup = null;
    projectEditWasNew = false;
    const editor = $('projectEditor');
    if (editor) editor.style.display = 'none';
  }
  data.projects = data.projects.filter((p) => String(p.id) !== String(id));
  safeRenderProjectsList();
  renderTagsManager();
  renderJsonPreview();
  saveDraft();
}

/* 一键按时间排序所有作品 */
function sortAllProjectsByTime() {
  data.projects.sort((a, b) => getTimestamp(b) - getTimestamp(a));
  safeRenderProjectsList();
  renderJsonPreview();
  saveDraft();
  toast('已按时间倒序排序全部作品');
}

/* ---------- 图片列表 ---------- */
/* 渲染图片列表（编辑中状态） — 不再显示 URL 文本输入框 */
function renderImageList() {
  const box = $('imageList');
  if (!box) return;
  if (!editingImages.length) {
    box.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">暂无图片，添加一张作为封面</div>';
    return;
  }
  box.innerHTML = editingImages.map((im, i) => `
    <div class="image-list-item ${im.isCover ? 'is-cover' : ''}" data-img-idx="${i}" draggable="true">
      <div class="image-list-drag" title="拖拽排序" aria-hidden="true">
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2" cy="2" r="1"/><circle cx="2" cy="7" r="1"/><circle cx="2" cy="12" r="1"/><circle cx="8" cy="2" r="1"/><circle cx="8" cy="7" r="1"/><circle cx="8" cy="12" r="1"/></svg>
      </div>
      <div class="image-list-thumb ${im.url ? '' : 'image-list-thumb--empty'}" style="${im.url ? `background-image:url('${escapeAttr(im.url)}')` : ''}"></div>
      <div class="image-list-meta">
        <span>#${String(i + 1).padStart(2, '0')}</span>
        ${im.isCover ? '<span class="image-list-cover-badge">★ 封面</span>' : ''}
      </div>
      <div class="image-list-actions">
        <button class="btn-ghost" type="button" data-img-cover="${i}">${im.isCover ? '取消封面' : '设为封面'}</button>
        <button class="btn-mini btn-mini--danger" type="button" data-img-del="${i}" title="删除" aria-label="删除">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M6 4V2h4v2M5 4v9h6V4"/></svg>
        </button>
      </div>
    </div>
  `).join('');
  bindImageDrag();
}

/* 绑定图片拖拽排序 */
let dragSrcIdx = null;
function bindImageDrag() {
  const items = qall('#imageList .image-list-item');
  items.forEach((el) => {
    el.addEventListener('dragstart', (e) => {
      dragSrcIdx = parseInt(el.dataset.imgIdx, 10);
      el.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(dragSrcIdx)); } catch (err) {}
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('is-dragging');
      qall('#imageList .image-list-item').forEach((x) => x.classList.remove('is-drag-over'));
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('is-drag-over');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('is-drag-over');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetIdx = parseInt(el.dataset.imgIdx, 10);
      if (dragSrcIdx == null || isNaN(targetIdx) || dragSrcIdx === targetIdx) return;
      const moved = editingImages.splice(dragSrcIdx, 1)[0];
      editingImages.splice(targetIdx, 0, moved);
      /* 若拖动的是封面，封面位置已自动跟随；否则保持原封面 */
      dragSrcIdx = null;
      renderImageList();
      syncProjectEdit();
      debouncedSave();
    });
  });
}

/* 添加一张图片到编辑中列表 */
function addEditingImage(url) {
  if (!url) return;
  const wasEmpty = editingImages.length === 0;
  editingImages.push({ url, caption: null, isCover: wasEmpty });
  renderImageList();
  syncProjectEdit();
  debouncedSave();
}

/* 设置封面 */
function setImageAsCover(idx) {
  editingImages.forEach((im, i) => { im.isCover = (i === idx); });
  renderImageList();
  syncProjectEdit();
  debouncedSave();
}

/* 删除编辑中的图片（仅当主站用不到原图时才真正删除文件） */
async function removeEditingImage(idx) {
  const wasCover = editingImages[idx] && editingImages[idx].isCover;
  const removedUrl = editingImages[idx] && editingImages[idx].url;
  editingImages.splice(idx, 1);
  if (wasCover && editingImages.length) {
    editingImages[0].isCover = true;
  }
  renderImageList();
  syncProjectEdit();
  debouncedSave();

  /* 调用后端删除原图 + 缩略图（仅在 HTTP 模式下） */
  if (isHttpServer && removedUrl && removedUrl.indexOf('assets/images/') === 0) {
    const filename = removedUrl.split('/').pop();
    try {
      const res = await fetch('/api/delete-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      const json = await res.json();
      if (json.ok) {
        toast('已删除图片文件');
      }
    } catch (e) {
      /* 静默失败：文件可能不存在或已被删 */
    }
  }
}

/* ---------- 链接引用编辑 ---------- */
/* type: 'project' 或 'note'，决定渲染到哪个容器 */
function renderLinksList(type) {
  const box = type === 'note' ? $('noteLinks') : $('projectLinks');
  if (!box) return;
  if (!editingLinks.length) {
    box.innerHTML = '<div class="dynamic-empty">暂无链接</div>';
    return;
  }
  box.innerHTML = editingLinks.map((l, i) => `
    <div class="dynamic-row dynamic-row--link" data-link-idx="${i}">
      <div class="dynamic-row-fields dynamic-row-fields--3">
        <input class="field-input" data-lf="name" data-link-idx="${i}" type="text" placeholder="链接名称（如 GitHub）" value="${escapeHtml(l.name || '')}">
        <input class="field-input" data-lf="url" data-link-idx="${i}" type="text" placeholder="https://..." value="${escapeHtml(l.url || '')}">
      </div>
      <button class="btn-mini btn-mini--danger" data-link-del="${i}" title="删除" aria-label="删除链接">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M6 4V2h4v2M5 4v9h6V4"/></svg>
      </button>
    </div>
  `).join('');
}

function addEditingLink() {
  editingLinks.push({ name: '', url: '' });
  /* 不知道当前是作品还是笔记编辑，两个都渲染（一个为空时不操作） */
  renderLinksList('project');
  renderLinksList('note');
  syncActiveEditor();
  debouncedSave();
  /* 聚焦新行的名称输入框 */
  const box = editingProjectId != null ? $('projectLinks') : $('noteLinks');
  if (box) {
    const rows = box.querySelectorAll('[data-lf="name"]');
    if (rows.length) rows[rows.length - 1].focus();
  }
}

function removeEditingLink(idx) {
  editingLinks.splice(idx, 1);
  renderLinksList('project');
  renderLinksList('note');
  syncActiveEditor();
  debouncedSave();
}

/* ---------- 图片选择器（http:// 模式下使用 serve.py API） ---------- */
let imagePickerState = { images: [], loading: false };

async function openImagePicker() {
  if (!isHttpServer) {
    /* file:// 模式回退：使用路径输入 prompt */
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const defaultPath = 'assets/images/' + ts + '.png';
    const val = await showPromptModal('输入图片路径', 'assets/images/xxx.png', defaultPath);
    const path = (val || '').trim();
    if (path) {
      /* 修正路径：确保包含斜杠 */
      const fixed = fixImagePath(path);
      addEditingImage(fixed);
      toast('已添加图片路径');
    }
    return;
  }
  /* http:// 模式：打开图片选择器模态框 */
  await showImagePickerModal();
}

/* 修正图片路径：确保是 assets/images/xxx 格式 */
function fixImagePath(path) {
  if (!path) return '';
  /* 如果是 data: URL 或 http(s):// URL，直接返回 */
  if (/^(data:|https?:\/\/)/i.test(path)) return path;
  /* 去掉开头的 ./ 或 / */
  let p = path.replace(/^\.?\//, '');
  /* 如果路径缺少斜杠（如 assetsimagesxxx），尝试修复 */
  if (p.startsWith('assets') && !p.startsWith('assets/')) {
    p = 'assets/' + p.slice(6);
  }
  if (p.startsWith('assets/images') && !p.startsWith('assets/images/')) {
    p = 'assets/images/' + p.slice(13);
  }
  return p;
}

async function showImagePickerModal() {
  const overlay = $('modalOverlay');
  if (!overlay) return;
  const PAGE_SIZE = 10;
  let allImages = [];
  let currentPage = 1;

  /* 渲染模态框骨架 */
  overlay.innerHTML = `
    <div class="modal-dialog modal-dialog--wide" role="dialog" aria-modal="true">
      <div class="modal-title">选择图片</div>
      <div class="modal-message">从 assets/images/ 选择已有图片，或上传新图片（自动生成缩略图）。</div>
      <div class="image-picker-toolbar">
        <button class="btn-ghost" type="button" id="pickerUploadBtn">↑ 上传新图片</button>
        <button class="btn-ghost" type="button" id="pickerRefreshBtn">↻ 刷新</button>
        <input type="file" id="pickerFileInput" accept="image/*" style="display:none">
      </div>
      <div class="image-picker-grid" id="pickerGrid">
        <div class="image-picker-loading">加载中...</div>
      </div>
      <div class="image-picker-pager" id="pickerPager"></div>
      <div class="modal-actions">
        <button class="btn-ghost" id="modalCancelBtn" type="button">取消</button>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';

  const grid = document.getElementById('pickerGrid');
  const pager = document.getElementById('pickerPager');
  const uploadBtn = document.getElementById('pickerUploadBtn');
  const refreshBtn = document.getElementById('pickerRefreshBtn');
  const fileInput = document.getElementById('pickerFileInput');
  const cancelBtn = document.getElementById('modalCancelBtn');

  function closePicker() {
    overlay.style.display = 'none';
    overlay.innerHTML = '';
  }

  /* 渲染当前页 */
  function renderPage() {
    if (!allImages.length) {
      grid.innerHTML = '<div class="image-picker-empty">assets/images/ 目录为空，请上传新图片</div>';
      pager.innerHTML = '';
      return;
    }
    const totalPages = Math.ceil(allImages.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = allImages.slice(start, start + PAGE_SIZE);

    grid.innerHTML = pageItems.map((name) => {
      /* 缩略图 URL：assets/images/xxx.png → assets/images/thumb/xxx.jpg */
      const dotIdx = name.lastIndexOf('.');
      const baseName = dotIdx > 0 ? name.slice(0, dotIdx) : name;
      const thumbUrl = 'assets/images/thumb/' + encodeURIComponent(baseName) + '.jpg';
      const fallbackUrl = 'assets/images/' + encodeURIComponent(name);
      return `
      <button class="image-picker-item" data-picker-name="${escapeHtml(name)}" title="${escapeHtml(name)}">
        <div class="image-picker-thumb">
          <img src="${escapeAttr(thumbUrl)}" data-fallback="${escapeAttr(fallbackUrl)}" alt="${escapeAttr(name)}" loading="lazy" decoding="async" />
        </div>
        <div class="image-picker-name">${escapeHtml(name.length > 18 ? name.slice(0, 15) + '...' : name)}</div>
      </button>
    `;
    }).join('');

    /* 缩略图加载失败时回退到原图 */
    grid.querySelectorAll('.image-picker-thumb img[data-fallback]').forEach((img) => {
      img.addEventListener('error', function handler() {
        if (this.dataset.fallback) {
          this.src = this.dataset.fallback;
          this.removeAttribute('data-fallback');
        }
      });
    });

    /* 绑定点击 */
    grid.querySelectorAll('[data-picker-name]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.pickerName;
        const url = 'assets/images/' + name;
        addEditingImage(url);
        closePicker();
        toast('已添加图片: ' + name);
      });
    });

    /* 渲染分页器 */
    if (totalPages <= 1) {
      pager.innerHTML = `<span class="picker-page-info">共 ${allImages.length} 张</span>`;
    } else {
      pager.innerHTML = `
        <button class="btn-ghost" type="button" data-page="prev" ${currentPage === 1 ? 'disabled' : ''}>‹ 上一页</button>
        <span class="picker-page-info">${currentPage} / ${totalPages} （共 ${allImages.length} 张）</span>
        <button class="btn-ghost" type="button" data-page="next" ${currentPage === totalPages ? 'disabled' : ''}>下一页 ›</button>
      `;
      pager.querySelector('[data-page="prev"]').addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; renderPage(); }
      });
      pager.querySelector('[data-page="next"]').addEventListener('click', () => {
        if (currentPage < totalPages) { currentPage++; renderPage(); }
      });
    }
  }

  /* 加载图片列表（后端已按名称倒序返回） */
  async function loadGrid() {
    if (grid) grid.innerHTML = '<div class="image-picker-loading">加载中...</div>';
    try {
      const res = await fetch('/api/list-images', { cache: 'no-store' });
      const json = await res.json();
      allImages = json.images || [];
      currentPage = 1;
      renderPage();
    } catch (e) {
      grid.innerHTML = '<div class="image-picker-empty">加载失败: ' + escapeHtml(e.message) + '</div>';
      pager.innerHTML = '';
    }
  }

  /* 上传图片 */
  async function uploadFile(file) {
    if (!file) return;
    try {
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      });
      const json = await res.json();
      if (json.ok) {
        toast('上传成功: ' + json.filename);
        /* 自动添加到编辑列表 */
        addEditingImage(json.path);
        closePicker();
      } else {
        toast('上传失败: ' + (json.error || '服务器错误'));
      }
    } catch (e) {
      toast('上传失败: ' + e.message);
    }
  }

  uploadBtn.addEventListener('click', () => fileInput.click());
  refreshBtn.addEventListener('click', loadGrid);
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) uploadFile(f);
  });
  cancelBtn.addEventListener('click', closePicker);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePicker(); });

  await loadGrid();
}

/* ---------- 编辑笔记 ---------- */
function openNoteEditor(id, sourceButton) {
  /* 若当前有其他笔记在编辑，先同步保存 */
  if (editingNoteId != null && String(editingNoteId) !== String(id)) {
    syncNoteEdit();
    debouncedSave();
    closeNoteEditor();
  } else if (editingNoteId != null && String(editingNoteId) === String(id)) {
    /* 点击的是当前正在编辑的同一笔记，无需重新打开 */
    return;
  }
  const n = id != null ? (data.notes.find((x) => String(x.id) === String(id)) || {}) : {};
  /* 备份当前数据用于取消时回滚 */
  if (id != null) {
    const existing = data.notes.find((x) => String(x.id) === String(id));
    if (existing) {
      noteEditBackup = JSON.parse(JSON.stringify(existing));
      noteEditWasNew = false;
    } else {
      noteEditBackup = null;
      noteEditWasNew = false;
    }
  } else {
    noteEditBackup = null;
    noteEditWasNew = true;
  }
  editingNoteId = id != null ? id : null;
  $('nf_id').value = n.id != null ? n.id : '';
  $('nf_title_zh').value = n.title?.zh || '';
  $('nf_title_en').value = n.title?.en || '';
  $('nf_date').value = n.date || new Date().toISOString().slice(0, 10);
  $('nf_tag').value = Array.isArray(n.tags) ? n.tags.join(', ') : 'Note';
  $('nf_excerpt_zh').value = n.excerpt?.zh || '';
  $('nf_excerpt_en').value = n.excerpt?.en || '';
  /* 初始化链接引用 */
  editingLinks = Array.isArray(n.links) && n.links.length
    ? n.links.map((l) => ({ name: l.name || '', url: l.url || '' }))
    : [];
  renderLinksList('note');
  noteEditSnapshot = snapshotNoteForm();
  safeRenderNotesList();
  $('noteEditor').style.display = 'block';
  /* 不再自动滚动到编辑器 */
}

/* 同步笔记编辑表单到 data.notes（不关闭编辑器） */
function syncNoteEdit() {
  const editor = $('noteEditor');
  if (!editor || editor.style.display === 'none') return;

  const titleZh = $('nf_title_zh').value.trim();
  const titleEn = $('nf_title_en').value.trim();
  /* 标题为空时不同步（避免创建空笔记） */
  if (!titleZh && !titleEn) return;

  let id = editingNoteId;
  let isNew = false;
  if (id == null || id === '') {
    id = 'n' + Date.now();
    editingNoteId = id;
    isNew = true;
    const idField = $('nf_id');
    if (idField) idField.value = id;
  }

  /* tags 数组：按中英文逗号分割 */
  const tagsArr = $('nf_tag').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  /* 自动同步新 tag 到元数据 */
  autoSyncTagsFromStrings(tagsArr);
  /* 过滤掉无 URL 的链接 */
  const validLinks = editingLinks
    .map((l) => ({ name: (l.name || '').trim(), url: (l.url || '').trim() }))
    .filter((l) => l.url);
  const item = {
    id,
    date: $('nf_date').value.trim() || new Date().toISOString().slice(0, 10),
    title: {
      zh: titleZh,
      en: titleEn || titleZh
    },
    tags: tagsArr.length ? tagsArr : ['Note'],
    excerpt: {
      zh: $('nf_excerpt_zh').value,
      en: $('nf_excerpt_en').value
    },
    links: validLinks.length ? validLinks : undefined
  };
  if (!item.excerpt.zh && !item.excerpt.en) delete item.excerpt;

  if (isNew) {
    data.notes.unshift(item);
  } else {
    const i = data.notes.findIndex((nn) => String(nn.id) === String(id));
    if (i >= 0) data.notes[i] = item;
    else data.notes.unshift(item);
  }

  safeRenderNotesList();
  renderJsonPreview();
}

/* 关闭笔记编辑器并重置状态 */
function closeNoteEditor() {
  editingNoteId = null;
  editingLinks = [];
  noteEditSnapshot = null;
  noteEditBackup = null;
  noteEditWasNew = false;
  const editor = $('noteEditor');
  if (editor) editor.style.display = 'none';
  safeRenderNotesList();
}

/* 兼容旧调用：同步 + 保存 */
function applyNoteEdit() {
  syncNoteEdit();
  saveDraft();
}

async function cancelNoteEdit(force) {
  if (!force && noteEditSnapshot && !shallowEqual(noteEditSnapshot, snapshotNoteForm())) {
    if (!await showConfirmModal('取消编辑', '当前笔记有未保存的更改，确定要取消吗？')) return;
  }
  /* 回滚 data 到编辑前状态 */
  if (noteEditWasNew && editingNoteId != null) {
    data.notes = data.notes.filter((n) => String(n.id) !== String(editingNoteId));
  } else if (noteEditBackup && editingNoteId != null) {
    const i = data.notes.findIndex((n) => String(n.id) === String(editingNoteId));
    if (i >= 0) data.notes[i] = noteEditBackup;
  }
  closeNoteEditor();
  renderJsonPreview();
  debouncedSave();
}

async function deleteNote(id) {
  if (!await showConfirmModal('删除笔记', '确定删除这条笔记？')) return;
  if (editingNoteId != null && String(editingNoteId) === String(id)) {
    editingNoteId = null;
    editingLinks = [];
    noteEditSnapshot = null;
    noteEditBackup = null;
    noteEditWasNew = false;
    const editor = $('noteEditor');
    if (editor) editor.style.display = 'none';
  }
  data.notes = data.notes.filter((n) => String(n.id) !== String(id));
  safeRenderNotesList();
  renderTagsManager();
  renderJsonPreview();
  saveDraft();
}

/* ---------- 模态框（替代 prompt / confirm） ---------- */
/* 通用模态框：支持 prompt（带输入框）和 confirm（仅消息）两种模式 */
function showModal(opts) {
  return new Promise((resolve) => {
    const overlay = $('modalOverlay');
    if (!overlay) { resolve(opts.inputPlaceholder != null ? '' : false); return; }
    const hasInput = opts.inputPlaceholder != null;
    overlay.innerHTML = `
      <div class="modal-dialog" role="dialog" aria-modal="true">
        <div class="modal-title">${escapeHtml(opts.title || (hasInput ? '请输入' : '请确认'))}</div>
        ${opts.message ? `<div class="modal-message">${escapeHtml(opts.message)}</div>` : ''}
        ${hasInput ? `<input class="field-input modal-input" id="modalInputField" type="text" placeholder="${escapeHtml(opts.inputPlaceholder || '')}" value="${escapeHtml(opts.inputValue || '')}" autocomplete="off">` : ''}
        <div class="modal-actions">
          <button class="btn-ghost" id="modalCancelBtn" type="button">${escapeHtml(opts.cancelText || '取消')}</button>
          <button class="btn-primary" id="modalOkBtn" type="button">${escapeHtml(opts.okText || '确定')}</button>
        </div>
      </div>
    `;
    overlay.style.display = 'flex';
    const input = document.getElementById('modalInputField');
    const okBtn = document.getElementById('modalOkBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');
    if (input) setTimeout(() => { input.focus(); input.select(); }, 30);
    else if (okBtn) setTimeout(() => okBtn.focus(), 30);

    function close(val) {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    }
    function onOk() { close(input ? input.value : true); }
    function onCancel() { close(input ? null : false); }
    function onOverlay(e) { if (e.target === overlay) onCancel(); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      else if (e.key === 'Enter' && hasInput) { e.preventDefault(); onOk(); }
      else if (e.key === 'Enter' && !hasInput) { e.preventDefault(); onOk(); }
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);
  });
}

/* prompt 模式：返回用户输入的字符串（取消返回 null） */
function showPromptModal(title, placeholder, defaultValue) {
  return showModal({
    title,
    inputPlaceholder: placeholder,
    inputValue: defaultValue
  });
}

/* confirm 模式：返回 true/false */
function showConfirmModal(title, message) {
  return showModal({
    title,
    message,
    okText: '确定',
    cancelText: '取消'
  });
}

/* ---------- JSON 导入 / 导出 ---------- */
function exportJson() {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'projects.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('已导出 projects.json');
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      data = JSON.parse(reader.result);
      if (!data.site) data.site = {};
      if (!data.about) data.about = {};
      if (!Array.isArray(data.projects)) data.projects = [];
      if (!Array.isArray(data.notes)) data.notes = [];
      /* 关闭任何打开的编辑器 */
      editingProjectId = null;
      editingImages = [];
      editingLinks = [];
      editingNoteId = null;
      projectEditSnapshot = null;
      noteEditSnapshot = null;
      projectEditBackup = null;
      noteEditBackup = null;
      if ($('projectEditor')) $('projectEditor').style.display = 'none';
      if ($('noteEditor')) $('noteEditor').style.display = 'none';
      renderAll();
      saveDraft();
      toast('导入成功');
    } catch (e) {
      toast('导入失败 · JSON 格式错误');
    }
  };
  reader.readAsText(file);
}

/* ---------- Tab 切换 ---------- */
/* 支持: site / projects / notes / tags / about / preview / help */
function switchTab(name) {
  qall('.admin-side-link').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.tab === name);
  });
  qall('.admin-section').forEach((sec) => {
    sec.classList.toggle('is-active', sec.id === 'section-' + name);
  });
  /* 切换时刷新对应面板，确保显示最新数据 */
  if (name === 'tags') renderTagsManager();
  else if (name === 'projects') safeRenderProjectsList();
  else if (name === 'notes') safeRenderNotesList();
  else if (name === 'preview') renderJsonPreview();
  else if (name === 'about') renderAboutForm();
  else if (name === 'site') renderSiteForm();
}

/* ---------- 明暗切换 ---------- */
function initThemeToggle() {
  const btn = $('themeToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', cur);
    try {
      const KEY = 'taumata.theme.v1';
      const raw = localStorage.getItem(KEY);
      let rgb = '255,107,53';
      if (raw) {
        const cfg = JSON.parse(raw);
        if (cfg.accent_rgb) rgb = cfg.accent_rgb;
      }
      localStorage.setItem(KEY, JSON.stringify({
        mode: cur,
        accent_rgb: rgb,
        updated_at: Date.now()
      }));
    } catch (e) {}
  });
}

/* ---------- 站点信息字段失焦同步 ---------- */
function bindSiteFields() {
  const ids = [
    'sf_name', 'sf_tagline_zh', 'sf_tagline_en',
    'sf_status_zh', 'sf_status_en',
    'sf_region', 'sf_timezone', 'sf_online_time', 'sf_site_url'
  ];
  ids.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      syncSiteForm();
      debouncedSave();
    });
  });
}

/* ---------- 绑定事件 ---------- */
function bindEvents() {
  /* Tab */
  qall('.admin-side-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(link.dataset.tab);
    });
  });

  /* 作品：新增（排序按钮已移除，由自动保存替代统一保存按钮） */
  const addP = $('btnAddProject');
  if (addP) addP.addEventListener('click', () => openProjectEditor(null, addP));

  /* 作品列表上的编辑/删除（事件委托，编辑模式下也显示同样的按钮） */
  const pl = $('projectsList');
  if (pl) pl.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-del]');
    if (editBtn) openProjectEditor(editBtn.dataset.edit, editBtn);
    else if (delBtn) deleteProject(delBtn.dataset.del);
  });

  /* 作品编辑器字段：失焦时同步 + 防抖保存 */
  const pfIds = [
    'pf_title_zh', 'pf_title_en',
    'pf_desc_zh', 'pf_desc_en',
    'pf_body_zh', 'pf_body_en',
    'pf_tags', 'pf_datetime'
  ];
  pfIds.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      syncProjectEdit();
      debouncedSave();
    });
  });

  /* 图片：打开图片选择器（http:// 模式）或路径输入（file:// 模式） */
  const addImgBtn = $('btnAddImagePath');
  if (addImgBtn) {
    addImgBtn.addEventListener('click', () => openImagePicker());
  }
  /* 图片列表内：设为封面 / 删除（事件委托） */
  const imgListEl = $('imageList');
  if (imgListEl) {
    imgListEl.addEventListener('click', (e) => {
      const coverBtn = e.target.closest('[data-img-cover]');
      const delBtn = e.target.closest('[data-img-del]');
      if (coverBtn) {
        const idx = parseInt(coverBtn.dataset.imgCover, 10);
        if (!isNaN(idx)) {
          if (editingImages[idx] && editingImages[idx].isCover) {
            editingImages[idx].isCover = false;
            if (editingImages.length && !editingImages.some((x) => x.isCover)) {
              editingImages[0].isCover = idx !== 0;
            }
            renderImageList();
            syncProjectEdit();
            debouncedSave();
          } else {
            setImageAsCover(idx);
          }
        }
      } else if (delBtn) {
        const idx = parseInt(delBtn.dataset.imgDel, 10);
        if (!isNaN(idx)) removeEditingImage(idx);
      }
    });
  }

  /* 链接引用：添加 / 删除 / 失焦同步（事件委托） */
  const addLinkBtn = $('btnAddLink');
  if (addLinkBtn) addLinkBtn.addEventListener('click', addEditingLink);
  const addLinkNoteBtn = $('btnAddLinkNote');
  if (addLinkNoteBtn) addLinkNoteBtn.addEventListener('click', addEditingLink);
  qall('#projectLinks, #noteLinks').forEach((box) => {
    /* 失焦时同步到 data 并防抖保存 */
    box.addEventListener('focusout', (e) => {
      const el = e.target;
      if (el && el.dataset && el.dataset.lf) {
        /* 先更新 editingLinks 数组 */
        const field = el.dataset.lf;
        const idx = parseInt(el.dataset.linkIdx, 10);
        if (field && !isNaN(idx) && editingLinks[idx]) {
          editingLinks[idx][field] = el.value;
        }
        syncActiveEditor();
        debouncedSave();
      }
    });
    box.addEventListener('click', (e) => {
      const del = e.target.closest('[data-link-del]');
      if (del) {
        const idx = parseInt(del.dataset.linkDel, 10);
        if (!isNaN(idx)) removeEditingLink(idx);
      }
    });
  });

  /* 笔记 */
  const addN = $('btnAddNote');
  if (addN) addN.addEventListener('click', () => openNoteEditor(null, addN));
  const nl = $('notesList');
  if (nl) nl.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-note]');
    const delBtn = e.target.closest('[data-del-note]');
    if (editBtn) openNoteEditor(editBtn.dataset.editNote, editBtn);
    else if (delBtn) deleteNote(delBtn.dataset.delNote);
  });

  /* 笔记编辑器字段：失焦时同步 + 防抖保存 */
  const nfIds = [
    'nf_title_zh', 'nf_title_en',
    'nf_date', 'nf_tag',
    'nf_excerpt_zh', 'nf_excerpt_en'
  ];
  nfIds.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      syncNoteEdit();
      debouncedSave();
    });
  });

  /* 站点信息字段失焦同步 */
  bindSiteFields();

  /* 关于信息字段失焦同步 */
  bindAboutFields();

  /* 标签管理：新增 / 同步 / 编辑 / 删除（事件委托） */
  const addTagBtn = $('btnAddTag');
  if (addTagBtn) addTagBtn.addEventListener('click', addTagItem);
  const syncTagsBtn = $('btnSyncTags');
  if (syncTagsBtn) syncTagsBtn.addEventListener('click', syncTagsFromContent);
  const tagsMgr = $('tagsManager');
  if (tagsMgr) {
    tagsMgr.addEventListener('click', async (e) => {
      /* 删除按钮 */
      const delBtn = e.target.closest('[data-tag-del]');
      if (delBtn) {
        e.stopPropagation();
        deleteTagItem(parseInt(delBtn.dataset.tagDel, 10));
        return;
      }
      /* 点击 tag 行切换展开/收起（点击编辑中的 tag 行也收起并保存） */
      const toggleBtn = e.target.closest('[data-tag-toggle]');
      if (toggleBtn) {
        const idx = parseInt(toggleBtn.dataset.tagToggle, 10);
        if (editingTagIdx === idx) {
          /* 当前正展开，点击则保存并收起 */
          saveTagEdit(idx, { close: true });
        } else {
          /* 切换到其他 tag：先保存当前的 */
          if (editingTagIdx !== -1) {
            saveTagEdit(editingTagIdx, { silent: true });
          }
          toggleTagEdit(idx);
        }
      }
    });
    /* tag 编辑面板字段失焦自动保存（不收起） */
    tagsMgr.addEventListener('focusout', (e) => {
      const el = e.target;
      if (!el || !el.dataset || el.dataset.tagField === undefined) return;
      const panel = el.closest('[data-tag-panel]');
      if (!panel) return;
      const idx = parseInt(panel.dataset.tagPanel, 10);
      if (isNaN(idx)) return;
      /* 用 setTimeout 让焦点能切换到同面板的其他字段，避免过早保存导致输入框重渲染 */
      setTimeout(() => {
        /* 如果焦点已经离开整个面板，才保存 */
        const active = document.activeElement;
        if (active && panel.contains(active)) return;
        saveTagEdit(idx, { silent: true });
      }, 0);
    });
  }

  /* 标签输入 autocomplete */
  bindTagsAutocomplete('pf_tags', 'pf_tags_ac');
  bindTagsAutocomplete('nf_tag', 'nf_tag_ac');

  /* 点击列表外空白处收起编辑器（先同步保存） */
  document.addEventListener('click', (e) => {
    /* 修复：模态框关闭后按钮脱离 DOM，closest 返回 null 导致误判 */
    if (!e.target || !e.target.isConnected) return;
    /* 只处理 admin-main 区域内的点击 */
    const main = document.querySelector('.admin-main');
    if (!main) return;
    /* 如果点击在编辑器内、列表项内、按钮内，跳过 */
    if (e.target.closest('#projectEditor')) return;
    if (e.target.closest('#noteEditor')) return;
    if (e.target.closest('.admin-list-item')) return;
    if (e.target.closest('.admin-bar')) return;
    if (e.target.closest('.modal-overlay')) return;
    if (e.target.closest('.tag-autocomplete')) return;
    if (e.target.closest('.image-picker-overlay')) return;
    if (e.target.closest('.tag-edit-panel')) return;
    if (e.target.closest('.tag-popover')) return;
    /* 若当前有作品编辑器打开，且点击在 main 内，收起 */
    const pe = $('projectEditor');
    if (pe && pe.style.display !== 'none') {
      const editId = editingProjectId;
      syncProjectEdit();
      debouncedSave();
      closeProjectEditor();
      /* 平滑滚动到刚编辑的作品附近 */
      if (editId != null) scrollToListItem(editId, 'project');
    }
    /* 若当前有笔记编辑器打开 */
    const ne = $('noteEditor');
    if (ne && ne.style.display !== 'none') {
      const editId = editingNoteId;
      syncNoteEdit();
      debouncedSave();
      closeNoteEditor();
      if (editId != null) scrollToListItem(editId, 'note');
    }
    /* 若当前有 tag 编辑面板展开，保存并收起 */
    if (editingTagIdx !== -1) {
      saveTagEdit(editingTagIdx, { close: true, silent: true });
    }
  });

  /* JSON 预览 */
  const exp = $('btnExport');
  if (exp) exp.addEventListener('click', exportJson);
  const imp = $('btnImport');
  if (imp) imp.addEventListener('click', () => $('fileImport').click());
  const file = $('fileImport');
  if (file) file.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) importJson(f);
  });
  const clearDraftBtn = $('btnClearDraft');
  if (clearDraftBtn) clearDraftBtn.addEventListener('click', clearDraft);

  /* 主题切换 */
  initThemeToggle();
}

/* ---------- 启动 ---------- */
async function init() {
  await loadData();
  bindEvents();
  renderAll();
  /* 默认打开 site 标签页 */
  switchTab('site');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
