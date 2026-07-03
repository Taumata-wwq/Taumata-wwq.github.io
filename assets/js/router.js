/* ============================================================
   router.js — hash 路由 + 子页面切换
   支持 / /work /work/:id /about /notes /notes/:id /search
   数据来源：assets/data/projects.json（异步加载）
   ============================================================ */

import { t, DICT, DEFAULT_LANG } from './i18n.js';
import { state, copyText, retriggerAnimations } from './theme.js';

let routes = [];
let activeRoute = null;

/* 站点数据：每次路由切换都重新读取，保证后台编辑后能同步显示 */
let siteData = null;
let siteDataPromise = null;
const DATA_URL = 'assets/data/projects.json';
const DRAFT_KEY = 'taumata.admin.draft.v1';

async function fetchRemoteData() {
  if (siteDataPromise) return siteDataPromise;
  siteDataPromise = (async () => {
    try {
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) {}
    return { site: {}, projects: [], notes: [] };
  })();
  return siteDataPromise;
}

async function loadSiteData() {
  const remote = await fetchRemoteData();
  let merged = remote;
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      const d = JSON.parse(draft);
      merged = {
        site: Object.assign({}, remote.site || {}, d.site || {}),
        about: d.about || remote.about || {},
        projects: Array.isArray(d.projects) ? d.projects : (remote.projects || []),
        notes: Array.isArray(d.notes) ? d.notes : (remote.notes || []),
        tags: Array.isArray(d.tags) ? d.tags : (remote.tags || [])
      };
    }
  } catch (e) {}
  siteData = merged;
  return merged;
}

/* 取本地化字段 */
function loc(v, lang) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v[lang] || v.zh || v.en || '';
}

/* 取作品封面 */
function getCover(p) {
  if (Array.isArray(p.images) && p.images.length) {
    const cover = p.images.find((it) => it && it.isCover) || p.images[0];
    return (cover && cover.url) || '';
  }
  return p.image || '';
}

/* 将图片 URL 转为缩略图 URL（assets/images/xxx.png → assets/images/thumb/xxx.jpg）
   缩略图统一保存为 .jpg 格式 */
function toThumbUrl(url) {
  if (!url) return url;
  /* 仅对 assets/images/ 下的图片生效，避免影响外部 URL */
  const prefix = 'assets/images/';
  if (url.indexOf(prefix) !== 0) return url;
  const rest = url.slice(prefix.length);
  /* 已经是 thumb/ 路径则不再转换 */
  if (rest.indexOf('thumb/') === 0) return url;
  /* 统一替换扩展名为 .jpg（缩略图生成时统一转为 jpg） */
  const dotIdx = rest.lastIndexOf('.');
  const name = dotIdx > 0 ? rest.slice(0, dotIdx) : rest;
  return prefix + 'thumb/' + name + '.jpg';
}

/* 取作品时间（兼容 year/datetime 字段） */
function getTimestamp(p) {
  const dt = p.datetime || p.year || '';
  if (!dt) return 0;
  /* 尝试解析为时间戳；纯年份 "2025" 当作当年 1 月 1 日 */
  const t = Date.parse(dt);
  if (!isNaN(t)) return t;
  /* 纯数字字符串按年处理 */
  const year = parseInt(dt, 10);
  if (!isNaN(year)) return Date.parse(year + '-01-01') || 0;
  return 0;
}

/* 格式化时间显示：YYYY-MM-DD HH:MM → 显示原值；纯年份 → 显示年份 */
function formatTime(p, lang) {
  const dt = p.datetime || p.year || '';
  return dt;
}

/* 按时间倒序排序（最新在前） */
function sortByTimeDesc(items) {
  return items.slice().sort((a, b) => getTimestamp(b) - getTimestamp(a));
}

/* 格式化笔记标签：数组用 · 连接（按首字母排序） */
function formatNoteTags(tags, lang) {
  if (!Array.isArray(tags) || !tags.length) return '';
  return tags.map((s) => String(s).trim()).filter(Boolean).sort((a, b) => {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  }).map((s) => translateTag(s, lang)).join(' · ');
}

/* 根据元数据翻译 tag 字符串到目标语言 */
function translateTag(tagStr, lang) {
  if (!tagStr) return '';
  if (!siteData || !Array.isArray(siteData.tags)) return tagStr;
  const meta = siteData.tags.find((t) => t && (t.zh === tagStr || t.en === tagStr));
  if (!meta) return tagStr;
  if (lang === 'en') return meta.en || meta.zh || tagStr;
  return meta.zh || meta.en || tagStr;
}

/* 渲染链接引用列表 HTML（用于作品/笔记详情页末尾） */
function renderLinksHtml(links, lang) {
  if (!Array.isArray(links) || !links.length) return '';
  const validLinks = links
    .map((l) => ({ name: (l.name || '').trim(), url: (l.url || '').trim() }))
    .filter((l) => l.url);
  if (!validLinks.length) return '';
  return `
    <div class="detail-links">
      <div class="detail-links-label">${lang === 'zh' ? '链接' : 'Links'}</div>
      <ul class="detail-links-list">
        ${validLinks.map((l) => {
          const isExternal = /^https?:\/\//i.test(l.url);
          const display = l.name || l.url.replace(/^https?:\/\//, '').replace(/^www\./, '');
          const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
          return `
            <li class="detail-link-item">
              <a href="${escapeHtml(l.url)}"${target}>
                <span class="detail-link-name">${escapeHtml(display)}</span>
                <svg class="detail-link-arrow" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <path d="M6 3h7v7M13 3L6 10M11 13H4V6"/>
                </svg>
              </a>
            </li>
          `;
        }).join('')}
      </ul>
    </div>
  `;
}

/* ============================================================
   轻量 Markdown 渲染器
   支持：标题、粗体、斜体、链接、行内代码、代码块、列表、引用、分割线
   ============================================================ */
function renderMarkdown(text) {
  if (!text) return '';
  const lines = String(text).split('\n');
  let html = '';
  let inList = false;
  let inOl = false;
  let inQuote = false;
  let inCode = false;
  let codeBuf = [];

  function inline(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
        /* 仅允许 http/https/mailto 协议，阻止 javascript: 等危险协议 */
        if (!/^(https?:|mailto:)/i.test(url)) return label;
        const isExt = /^https?:\/\//i.test(url);
        const target = isExt ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escapeAttr(url)}"${target}>${label}</a>`;
      });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    /* 代码块 */
    if (line.trim().startsWith('```')) {
      if (inCode) {
        html += `<pre class="md-code-block"><code>${codeBuf.map(escapeHtml).join('\n')}</code></pre>`;
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    /* 分割线 */
    if (/^---+\s*$/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
      if (inQuote) { html += '</blockquote>'; inQuote = false; }
      html += '<hr>';
      continue;
    }
    /* 标题 */
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      if (inList) { html += '</ul>'; inList = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
      if (inQuote) { html += '</blockquote>'; inQuote = false; }
      const level = h[1].length;
      html += `<h${level}>${inline(h[2])}</h${level}>`;
      continue;
    }
    /* 引用 */
    const q = line.match(/^>\s*(.*)$/);
    if (q) {
      if (inList) { html += '</ul>'; inList = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inQuote) { html += '<blockquote>'; inQuote = true; }
      html += `<p>${inline(q[1])}</p>`;
      continue;
    } else if (inQuote) {
      html += '</blockquote>';
      inQuote = false;
    }
    /* 无序列表 */
    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ul) {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(ul[1])}</li>`;
      continue;
    }
    /* 有序列表 */
    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (inList) { html += '</ul>'; inList = false; }
      if (!inOl) { html += '<ol>'; inOl = true; }
      html += `<li>${inline(ol[1])}</li>`;
      continue;
    }
    /* 空行 */
    if (!line.trim()) {
      if (inList) { html += '</ul>'; inList = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
      if (inQuote) { html += '</blockquote>'; inQuote = false; }
      continue;
    }
    /* 普通段落 */
    if (inList) { html += '</ul>'; inList = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
    html += `<p>${inline(line)}</p>`;
  }
  /* 收尾 */
  if (inCode) {
    html += `<pre class="md-code-block"><code>${codeBuf.map(escapeHtml).join('\n')}</code></pre>`;
  }
  if (inList) html += '</ul>';
  if (inOl) html += '</ol>';
  if (inQuote) html += '</blockquote>';
  return html;
}

/* 渲染档期信息 HTML（关于页用） */
function renderScheduleHtml(schedule, lang) {
  if (!schedule) return '';
  const statusMap = {
    open: { zh: '接稿中', en: 'Open for commissions', cls: 'is-open' },
    busy: { zh: '繁忙/预约中', en: 'Busy/Booking', cls: 'is-busy' },
    closed: { zh: '休息中', en: 'Closed', cls: 'is-closed' }
  };
  const status = statusMap[schedule.status] || statusMap.open;
  const statusText = lang === 'zh' ? status.zh : status.en;
  const slots = schedule.slots != null ? schedule.slots : '';
  const turnaround = schedule.turnaround || '';
  const note = schedule.note ? loc(schedule.note, lang) : '';

  const hasContent = status || slots !== '' || turnaround || note;
  if (!hasContent) return '';

  return `
    <div class="schedule-box ${status.cls}">
      <div class="schedule-status">
        <span class="schedule-dot"></span>
        <span class="schedule-status-text">${escapeHtml(statusText)}</span>
      </div>
      ${(slots !== '' || turnaround) ? `
        <div class="schedule-info">
          ${slots !== '' ? `<span class="schedule-item"><span class="schedule-label">${lang === 'zh' ? '可接' : 'Slots'}</span> <span class="schedule-value">${escapeHtml(String(slots))}</span></span>` : ''}
          ${turnaround ? `<span class="schedule-item"><span class="schedule-label">${lang === 'zh' ? '周期' : 'Turnaround'}</span> <span class="schedule-value">${escapeHtml(turnaround)}</span></span>` : ''}
        </div>
      ` : ''}
      ${note ? `<p class="schedule-note">${escapeHtml(note)}</p>` : ''}
    </div>
  `;
}

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

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

/* 图片视差交互 */
function bindImageParallax(scope) {
  scope.querySelectorAll('.work-card-img').forEach((box) => {
    const img = box.querySelector('img');
    if (!img) return;
    img.style.objectPosition = 'center center';
    let raf = null;
    let pending = null;
    function apply() {
      if (pending) {
        img.style.objectPosition = `${pending.x}% ${pending.y}%`;
        pending = null;
      }
      raf = null;
    }
    box.addEventListener('mousemove', (e) => {
      const rect = box.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const posX = clamp01((x - 0.1) / 0.8) * 100;
      const posY = clamp01((y - 0.1) / 0.8) * 100;
      pending = { x: posX, y: posY };
      if (!raf) raf = requestAnimationFrame(apply);
    });
    box.addEventListener('mouseleave', () => {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      img.style.objectPosition = 'center center';
    });
  });
}

/* 注册路由 */
export function registerRoute(pattern, handler) {
  routes.push({ pattern, handler, regex: pathToRegex(pattern), keys: keysFromPattern(pattern) });
}

function pathToRegex(pattern) {
  const s = pattern.replace(/:[^/]+/g, '([^/]+)').replace(/\//g, '\\/');
  return new RegExp('^' + s + '$');
}

function keysFromPattern(pattern) {
  const out = [];
  const re = /:([^/]+)/g;
  let m;
  while ((m = re.exec(pattern)) !== null) out.push(m[1]);
  return out;
}

function matchRoute(path) {
  const norm = path.replace(/^\/+/, '');
  for (const r of routes) {
    const m = r.regex.exec(norm);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}

export function render(html, opts) {
  opts = opts || {};
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = html;
  if (opts.afterMount) opts.afterMount(app);
  retriggerAnimations(app);
  window.scrollTo({ top: 0, behavior: opts.skipScroll ? 'auto' : 'smooth' });
  updateNavActive(opts.navKey || '');
}

function updateNavActive(key) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    if (link.dataset.nav === key) link.classList.add('is-active');
    else link.classList.remove('is-active');
  });
}

async function handleRoute() {
  const hash = location.hash.slice(1) || '';
  const [pathPart, queryPart] = hash.split('?');
  const path = pathPart.replace(/^\/+/, '');
  const query = {};
  if (queryPart) {
    queryPart.split('&').forEach((kv) => {
      const eq = kv.indexOf('=');
      const k = eq >= 0 ? kv.slice(0, eq) : kv;
      const v = eq >= 0 ? kv.slice(eq + 1) : '';
      try { query[decodeURIComponent(k)] = decodeURIComponent(v); } catch (e) { query[k] = v; }
    });
  }
  const matched = matchRoute(path);
  if (matched) {
    activeRoute = matched.route.pattern;
    await matched.route.handler(Object.assign({}, matched.params, query));
  } else {
    await notFoundPage();
  }
}

/* ---------- 页面模板 ---------- */

async function homePage() {
  const lang = state.lang;
  const data = await loadSiteData();
  const site = data.site || {};
  const projects = sortByTimeDesc(data.projects || []).slice(0, 6);
  const notes = (data.notes || []).slice(0, 4);

  const tagline = loc(site.tagline, lang) || t('hero.tagline', lang);
  const status = loc(site.status, lang) || t('meta.status', lang);
  const location = loc(site.location, lang) || t('meta.location', lang);
  const timezone = site.timezone || '';
  const onlineTime = site.onlineTime || '';

  /* 组装 meta 行：状态 / 地区 / 时区 / 在线时间 */
  const metaParts = [];
  metaParts.push(`<span class="status-dot" aria-hidden="true"></span><span>${escapeHtml(status)}</span>`);
  if (location) metaParts.push(`<span class="meta-sep" aria-hidden="true">/</span><span>${escapeHtml(location)}</span>`);
  if (timezone) metaParts.push(`<span class="meta-sep" aria-hidden="true">/</span><span>${escapeHtml(timezone)}</span>`);
  if (onlineTime) metaParts.push(`<span class="meta-sep" aria-hidden="true">/</span><span>${escapeHtml(onlineTime)}</span>`);

  render(`
    <main class="container" role="main">
      <section class="hero" aria-labelledby="hero-name">
        <div class="hero-grid">
          <div class="hero-left">
            <h1 class="hero-name" id="hero-name" data-animate>${escapeHtml(loc(site.name, lang) || 'Taumata')}</h1>
            <p class="hero-tagline" data-animate data-animate-delay="60">${escapeHtml(tagline)}</p>
          </div>
          <div class="hero-right">
            <div class="hero-meta" data-animate data-animate-delay="180">
              ${metaParts.join('')}
            </div>
            <div class="hero-cta" data-animate data-animate-delay="240">
              <a href="#/about" class="btn-primary">${t('hero.cta.about', lang)}</a>
            </div>
          </div>
        </div>
      </section>

      <section class="block block--split" aria-labelledby="block-projects">
        <div class="block-head">
          <a href="#/work" class="block-title block-title--link" id="block-projects" aria-label="${escapeAttr(t('block.projects', lang))}">
            <span class="block-num">01</span>
            <span class="block-label" data-i18n="block.projects">${t('block.projects', lang)}</span>
            <span class="block-arrow" aria-hidden="true">→</span>
          </a>
        </div>
        <div class="block-body" data-animate>
          ${projects.length ? `
            <ul class="work-grid work-grid--home">
              ${projects.map((p, i) => workCard(p, i, lang)).join('')}
            </ul>
          ` : `<p class="empty-state">暂无作品</p>`}
        </div>
      </section>

      <section class="block block--split" aria-labelledby="block-notes">
        <div class="block-head">
          <a href="#/notes" class="block-title block-title--link" id="block-notes" aria-label="${escapeAttr(t('block.notes', lang))}">
            <span class="block-num">02</span>
            <span class="block-label" data-i18n="block.notes">${t('block.notes', lang)}</span>
            <span class="block-arrow" aria-hidden="true">→</span>
          </a>
        </div>
        <div class="block-body" data-animate>
          ${notes.length ? `
            <ul class="notes-preview">
              ${notes.map((n, i) => `
                <li class="note-item" data-href="#/notes/${escapeAttr(n.id)}" data-animate data-animate-delay="${i * 50}">
                  <span class="note-date">${escapeHtml(n.date || '')}</span>
                  <span class="note-title">${escapeHtml(loc(n.title, lang))}</span>
                  <span class="note-tag">${escapeHtml(formatNoteTags(n.tags, lang))}</span>
                </li>
              `).join('')}
            </ul>
          ` : `<p class="empty-state">${t('notes.preview.empty', lang)}</p>`}
        </div>
      </section>
    </main>
  `, { afterMount: afterMountCommon, navKey: 'home', skipScroll: true });
}

function workCard(p, i, lang) {
  const id = p.id != null ? p.id : (i + 1);
  const dateStr = (p.datetime || p.year || '').slice(0, 10);
  const title = loc(p.title, lang) || ('Work ' + (i + 1));
  const desc = loc(p.desc, lang) || '';
  const rawTags = Array.isArray(p.tags) ? p.tags : [];
  /* tags 按首字母排序（不区分大小写） */
  const tags = rawTags.slice().sort((a, b) => {
    const la = String(a).toLowerCase();
    const lb = String(b).toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });
  const img = getCover(p);
  /* 卡片展示用缩略图，加载失败时回退到原图 */
  const thumbSrc = toThumbUrl(img);
  /* 转义 URL 中可能破坏属性/JS 的字符 */
  const imgEscaped = escapeAttr(img);
  const thumbEscaped = escapeAttr(thumbSrc);

  return `
    <li class="work-card" data-href="#/work/${escapeAttr(id)}">
      <div class="work-card-img" ${img ? '' : 'data-empty'}>
        ${img
          ? `<img src="${thumbEscaped}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${imgEscaped}'" />`
          : `<span class="work-card-empty">${t('workdetail.placeholder', lang)}</span>`}
      </div>
      <div class="work-card-body">
        <a class="work-card-name" href="#/work/${escapeAttr(id)}">
          <span class="work-card-num">${dateStr}</span>
          <span class="work-card-title">${escapeHtml(title)}</span>
          <svg class="icon-external" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M6 3h7v7M13 3L6 10M11 13H4V6"/>
          </svg>
        </a>
        ${desc ? `<p class="work-card-desc">${escapeHtml(desc)}</p>` : ''}
        <ul class="tag-list tag-list--inline">
          ${tags.map((tg) => `<li class="tag">${escapeHtml(translateTag(tg, lang))}</li>`).join('')}
        </ul>
      </div>
    </li>
  `;
}

async function workListPage() {
  const lang = state.lang;
  const data = await loadSiteData();
  const allProjects = sortByTimeDesc(data.projects || []);
  const PAGE_SIZE = 6;
  let displayed = Math.min(PAGE_SIZE, allProjects.length);

  render(`
    <main class="container" role="main">
      <header class="page-header" data-animate>
        <p class="page-eyebrow" data-i18n="page.work.eyebrow">${t('page.work.eyebrow', lang)}</p>
        <h1 class="page-title" data-i18n="page.work.title">${t('page.work.title', lang)}</h1>
        <p class="page-desc" data-i18n="page.work.desc">${t('page.work.desc', lang)}</p>
      </header>
      <section class="block">
        ${allProjects.length ? `
          <ul class="work-grid" id="workGrid">
            ${allProjects.slice(0, displayed).map((p, i) => workCard(p, i, lang)).join('')}
          </ul>
          <div id="workSentinel" class="scroll-sentinel" style="${displayed >= allProjects.length ? 'display:none;' : ''}">
            <span class="scroll-sentinel-text">${lang === 'zh' ? '滚动加载更多' : 'Scroll for more'}</span>
          </div>
        ` : `<p class="empty-state">暂无作品</p>`}
      </section>
    </main>
  `, {
    afterMount: (scope) => {
      afterMountCommon(scope);
      if (displayed < allProjects.length) {
        const sentinel = document.getElementById('workSentinel');
        if (sentinel) {
          const io = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
              const prevDisplayed = displayed;
              displayed = Math.min(displayed + PAGE_SIZE, allProjects.length);
              const grid = document.getElementById('workGrid');
              if (grid) {
                /* 仅追加新增的卡片，避免重建已加载的图片 */
                const fragment = document.createElement('div');
                fragment.innerHTML = allProjects.slice(prevDisplayed, displayed)
                  .map((p, i) => workCard(p, prevDisplayed + i, lang)).join('');
                while (fragment.firstChild) {
                  grid.appendChild(fragment.firstChild);
                }
                bindImageParallax(scope);
              }
              if (displayed >= allProjects.length) {
                sentinel.style.display = 'none';
                io.disconnect();
              }
            }
          }, { rootMargin: '200px' });
          io.observe(sentinel);
        }
      }
    },
    navKey: 'work'
  });
}

/* ---------- 作品详情：图片查看器 ---------- */

async function workDetailPage(params) {
  const lang = state.lang;
  const data = await loadSiteData();
  const id = params.id != null ? params.id : '1';
  const p = data.projects.find((x) => String(x.id) === String(id)) || {
    id, title: { zh: '作品 ' + id, en: 'Work ' + id }, desc: {}, tags: [], year: ''
  };

  const title = loc(p.title, lang);
  const desc = loc(p.desc, lang);
  const body = loc(p.body, lang);
  const rawTags = Array.isArray(p.tags) ? p.tags : [];
  /* tags 按首字母排序 */
  const tags = rawTags.slice().sort((a, b) => {
    const la = String(a).toLowerCase();
    const lb = String(b).toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });
  const time = formatTime(p, lang);

  let images = Array.isArray(p.images) && p.images.length
    ? p.images.filter((it) => it && it.url)
    : (p.image ? [{ url: p.image, isCover: true }] : []);

  function paragraphs(text) {
    if (!text) return [];
    return String(text).split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  }
  const bodyParas = paragraphs(body);
  const descParas = paragraphs(desc);

  render(`
    <main class="container container--narrow" role="main">
      <p style="padding: var(--sp-5) 0 var(--sp-3)">
        <a href="#/work" class="back-link" data-i18n="project.back">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M10 3L4 8l6 5"/>
          </svg>
          ${t('project.back', lang)}
        </a>
      </p>
      <article class="work-detail" data-animate>
        <header class="work-detail-header">
          <h1 class="work-detail-title">${escapeHtml(title)}</h1>
          <div class="work-detail-meta">
            ${time ? `<span>${escapeHtml(time)}</span>` : ''}
          </div>
        </header>

        ${descParas.length || bodyParas.length ? `
          <div class="work-detail-body work-detail-body--top">
            ${descParas.map((s) => `<p class="lead">${escapeHtml(s)}</p>`).join('')}
            ${bodyParas.map((s) => `<p>${escapeHtml(s)}</p>`).join('')}
          </div>
        ` : ''}

        ${images.length ? `
          <div class="viewer" data-viewer>
            <div class="viewer-stage" data-viewer-stage>
              <button class="viewer-nav viewer-nav--prev" data-viewer-prev aria-label="上一张">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3L4 8l6 5"/></svg>
              </button>
              <div class="viewer-frame" data-viewer-frame>
                <img class="viewer-img" data-viewer-img src="${escapeAttr(images[0].url)}" alt="${escapeAttr(title)}" decoding="async" />
              </div>
              <button class="viewer-nav viewer-nav--next" data-viewer-next aria-label="下一张">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3l6 5-6 5"/></svg>
              </button>
            </div>
            <div class="viewer-info">
              <span data-viewer-counter>1 / ${images.length}</span>
            </div>
            <div class="viewer-thumbs" data-viewer-thumbs>
              ${images.map((im, i) => `
                <button class="viewer-thumb ${i === 0 ? 'is-active' : ''}" data-viewer-thumb="${i}" style="background-image:url('${escapeAttr(im.url)}')" aria-label="第 ${i + 1} 张"></button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${tags.length ? `
          <ul class="tag-list tag-list--inline" style="margin-top: var(--sp-5); padding-top: var(--sp-4); border-top: 1px solid var(--border);">
            ${tags.map((tg) => `<li class="tag">${escapeHtml(translateTag(tg, lang))}</li>`).join('')}
          </ul>
        ` : ''}

        ${renderLinksHtml(p.links, lang)}
      </article>
    </main>
  `, {
    afterMount: (scope) => {
      afterMountCommon(scope);
      initViewer(scope, images);
    },
    navKey: 'work'
  });
}

/* 图片查看器：左右切换 + 缩略图 + 点击大图（拖拽/缩放/翻转/旋转） */
function initViewer(scope, images) {
  if (!images.length) return;
  const viewer = scope.querySelector('[data-viewer]');
  if (!viewer) return;
  let idx = 0;
  const img = viewer.querySelector('[data-viewer-img]');
  const counter = viewer.querySelector('[data-viewer-counter]');
  const thumbs = viewer.querySelectorAll('[data-viewer-thumb]');
  const prevBtn = viewer.querySelector('[data-viewer-prev]');
  const nextBtn = viewer.querySelector('[data-viewer-next]');

  function goto(i) {
    idx = (i + images.length) % images.length;
    img.src = images[idx].url;
    if (counter) counter.textContent = `${idx + 1} / ${images.length}`;
    thumbs.forEach((b, j) => b.classList.toggle('is-active', j === idx));
  }
  prevBtn && prevBtn.addEventListener('click', () => goto(idx - 1));
  nextBtn && nextBtn.addEventListener('click', () => goto(idx + 1));
  thumbs.forEach((b, j) => b.addEventListener('click', () => goto(j)));
  img && img.addEventListener('click', () => openLightbox(images, idx));

  /* 键盘左右切换 */
  function onKey(e) {
    if (!document.body.contains(viewer)) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (e.key === 'ArrowLeft') goto(idx - 1);
    else if (e.key === 'ArrowRight') goto(idx + 1);
  }
  document.addEventListener('keydown', onKey);
}

/* Lightbox：拖拽、滚轮缩放、H 翻转、R 旋转 */
function openLightbox(images, startIdx) {
  let idx = startIdx || 0;
  let scale = 1, rot = 0, flipH = false;
  let dx = 0, dy = 0;
  let dragging = false, startX = 0, startY = 0, startDx = 0, startDy = 0;

  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="关闭">×</button>
    <button class="lightbox-nav lightbox-nav--prev" aria-label="上一张">
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3L4 8l6 5"/></svg>
    </button>
    <div class="lightbox-stage">
      <img class="lightbox-img" alt="" draggable="false" />
    </div>
    <button class="lightbox-nav lightbox-nav--next" aria-label="下一张">
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3l6 5-6 5"/></svg>
    </button>
    <div class="lightbox-toolbar">
      <button data-lb-action="reset" title="重置">RESET</button>
      <button data-lb-action="zoomin" title="放大">+</button>
      <button data-lb-action="zoomout" title="缩小">−</button>
      <button data-lb-action="flip" title="水平翻转 (H)">⇄ H</button>
      <button data-lb-action="rotate" title="逆时针旋转 90° (R)">↺ R</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const img = overlay.querySelector('.lightbox-img');
  const prevBtn = overlay.querySelector('.lightbox-nav--prev');
  const nextBtn = overlay.querySelector('.lightbox-nav--next');
  const closeBtn = overlay.querySelector('.lightbox-close');
  const toolbar = overlay.querySelector('.lightbox-toolbar');

  function render() {
    img.src = images[idx].url;
    applyTransform();
  }
  function applyTransform() {
    const flip = flipH ? -1 : 1;
    img.style.transform = `translate(${dx}px, ${dy}px) scale(${flip * scale}, ${scale}) rotate(${rot}deg)`;
  }
  function goto(i) {
    idx = (i + images.length) % images.length;
    scale = 1; rot = 0; flipH = false; dx = 0; dy = 0;
    render();
  }
  prevBtn.addEventListener('click', () => goto(idx - 1));
  nextBtn.addEventListener('click', () => goto(idx + 1));
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  toolbar.addEventListener('click', (e) => {
    const action = e.target.dataset.lbAction;
    if (!action) return;
    if (action === 'reset') { scale = 1; rot = 0; flipH = false; dx = 0; dy = 0; }
    else if (action === 'zoomin') { scale = Math.min(scale + 0.2, 5); }
    else if (action === 'zoomout') { scale = Math.max(scale - 0.2, 0.2); }
    else if (action === 'flip') { flipH = !flipH; }
    else if (action === 'rotate') { rot = (rot - 90) % 360; }
    applyTransform();
  });

  /* 滚轮缩放 */
  overlay.querySelector('.lightbox-stage').addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    scale = Math.max(0.2, Math.min(5, scale + delta));
    applyTransform();
  }, { passive: false });

  /* 拖拽移动 */
  img.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    startDx = dx; startDy = dy;
    e.preventDefault();
  });
  function onMouseMove(e) {
    if (!dragging) return;
    dx = startDx + (e.clientX - startX);
    dy = startDy + (e.clientY - startY);
    applyTransform();
  }
  function onMouseUp() { dragging = false; }
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  /* 触屏拖拽 */
  img.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    dragging = true;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    startDx = dx; startDy = dy;
  }, { passive: true });
  img.addEventListener('touchmove', (e) => {
    if (!dragging || e.touches.length !== 1) return;
    dx = startDx + (e.touches[0].clientX - startX);
    dy = startDy + (e.touches[0].clientY - startY);
    applyTransform();
  }, { passive: true });
  img.addEventListener('touchend', () => { dragging = false; });

  /* 键盘 */
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') goto(idx - 1);
    else if (e.key === 'ArrowRight') goto(idx + 1);
    else if (e.key === 'h' || e.key === 'H') { flipH = !flipH; applyTransform(); }
    else if (e.key === 'r' || e.key === 'R') { rot = (rot - 90) % 360; applyTransform(); }
    else if (e.key === '+' || e.key === '=') { scale = Math.min(scale + 0.2, 5); applyTransform(); }
    else if (e.key === '-') { scale = Math.max(scale - 0.2, 0.2); applyTransform(); }
    else if (e.key === '0') { scale = 1; rot = 0; flipH = false; dx = 0; dy = 0; applyTransform(); }
  }
  document.addEventListener('keydown', onKey);

  function close() {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    document.body.removeChild(overlay);
    document.body.style.overflow = '';
  }

  render();
}

async function aboutPage() {
  const lang = state.lang;
  const data = await loadSiteData();
  const about = data.about || {};

  const title = loc(about.title, lang) || t('page.about.title', lang);
  const desc = loc(about.desc, lang) || t('page.about.desc', lang);
  const paras = Array.isArray(about.paragraphs) && about.paragraphs.length
    ? about.paragraphs.map((p) => loc(p, lang)).filter(Boolean)
    : [t('about.p1', lang), t('about.p2', lang)];
  const skills = Array.isArray(about.skills) ? about.skills : [];
  const contacts = Array.isArray(about.contacts) ? about.contacts : [];
  const schedule = about.schedule;

  render(`
    <main class="container page-about" role="main">
      <header class="page-header" data-animate>
        <p class="page-eyebrow" data-i18n="page.about.eyebrow">${t('page.about.eyebrow', lang)}</p>
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <p class="page-desc">${escapeHtml(desc)}</p>
      </header>
      <section class="block">
        <div class="block-body about-body" data-animate>
          ${paras.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
          ${renderScheduleHtml(schedule, lang)}
          ${skills.length ? `
            <ul class="tag-list">
              ${skills.map((s) => `<li class="tag">${escapeHtml(s)}</li>`).join('')}
            </ul>
          ` : ''}
          ${contacts.length ? `
            <ul class="row-list row-list--inline" style="margin-top: var(--sp-5);">
              ${contacts.map((c) => {
                const val = (c.value || '').trim();
                if (!val) return '';
                const isUrl = /^https?:\/\//i.test(val);
                if (isUrl) {
                  /* URL 链接：直接渲染为可点击的 a 标签，不显示原链接，用 label 作为显示文字 */
                  const label = (c.label || '').toUpperCase();
                  return `
                    <li class="row--contact row--contact--link">
                      <a href="${escapeHtml(val)}" target="_blank" rel="noopener noreferrer" class="row-contact-link">
                        <span class="row-label">${escapeHtml(label)}</span>
                        <svg class="row-link-icon" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                          <path d="M6 3h7v7M13 3L6 10M11 13H4V6"/>
                        </svg>
                      </a>
                    </li>
                  `;
                }
                /* 非链接（如 QQ 群号）：保留复制功能 */
                return `
                  <li class="row--contact" data-copy="${escapeHtml(val)}" tabindex="0" role="button" aria-label="复制 ${escapeHtml(c.label || '')}">
                    <span class="row-label">${escapeHtml((c.label || '').toUpperCase())}</span>
                    <span class="row-value">${escapeHtml(val)}</span>
                    <span class="row-hint" data-i18n="hint.copy">${t('hint.copy', lang)}</span>
                  </li>
                `;
              }).join('')}
            </ul>
          ` : ''}
        </div>
      </section>
    </main>
  `, { afterMount: afterMountCommon, navKey: 'about' });
}

async function notesPage(params) {
  const lang = state.lang;
  const data = await loadSiteData();
  const allNotes = data.notes || [];
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(allNotes.length / PAGE_SIZE));
  let page = parseInt(params && params.page, 10);
  if (isNaN(page) || page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * PAGE_SIZE;
  const notes = allNotes.slice(start, start + PAGE_SIZE);

  function paginationHtml() {
    if (totalPages <= 1) return '';
    let links = '';
    if (page > 1) {
      links += `<a href="#/notes?page=${page - 1}" class="pagination-link" aria-label="上一页">←</a>`;
    }
    for (let i = 1; i <= totalPages; i++) {
      links += `<a href="#/notes?page=${i}" class="pagination-link ${i === page ? 'is-active' : ''}">${i}</a>`;
    }
    if (page < totalPages) {
      links += `<a href="#/notes?page=${page + 1}" class="pagination-link" aria-label="下一页">→</a>`;
    }
    return `<nav class="pagination">${links}</nav>`;
  }

  render(`
    <main class="container" role="main">
      <header class="page-header" data-animate>
        <p class="page-eyebrow" data-i18n="page.notes.eyebrow">${t('page.notes.eyebrow', lang)}</p>
        <h1 class="page-title" data-i18n="page.notes.title">${t('page.notes.title', lang)}</h1>
        <p class="page-desc" data-i18n="page.notes.desc">${t('page.notes.desc', lang)}</p>
      </header>
      <section class="block">
        ${notes.length ? `
          <ul class="notes-list">
            ${notes.map((n, i) => `
              <li class="note-item" data-href="#/notes/${escapeAttr(n.id)}" data-animate data-animate-delay="${i * 50}">
                <span class="note-date">${escapeHtml(n.date || '')}</span>
                <span class="note-title">${escapeHtml(loc(n.title, lang))}</span>
                <span class="note-tag">${escapeHtml(formatNoteTags(n.tags, lang))}</span>
              </li>
            `).join('')}
          </ul>
        ` : `<p class="empty-state">${t('notes.preview.empty', lang)}</p>`}
        ${paginationHtml()}
      </section>
    </main>
  `, { afterMount: afterMountCommon, navKey: 'notes' });
}

async function noteDetailPage(params) {
  const lang = state.lang;
  const data = await loadSiteData();
  const id = params.id;
  const n = (data.notes || []).find((x) => String(x.id) === String(id)) || {
    id,
    title: { zh: '笔记 ' + id, en: 'Note ' + id },
    date: '', tags: [], excerpt: {}
  };

  const title = loc(n.title, lang);
  const excerpt = loc(n.excerpt, lang);
  const rawTags = Array.isArray(n.tags) ? n.tags : [];
  /* tags 按首字母排序 */
  const tags = rawTags.slice().sort((a, b) => {
    const la = String(a).toLowerCase();
    const lb = String(b).toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });

  render(`
    <main class="container container--narrow" role="main">
      <p style="padding: var(--sp-5) 0 var(--sp-3)">
        <a href="#/notes" class="back-link">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M10 3L4 8l6 5"/>
          </svg>
          ${t('note.back', lang)}
        </a>
      </p>
      <article class="note-detail" data-animate>
        <header class="note-detail-header">
          <h1 class="note-detail-title">${escapeHtml(title)}</h1>
          <div class="note-detail-meta">
            ${n.date ? `<span>${escapeHtml(n.date)}</span>` : ''}
          </div>
        </header>
        <div class="note-detail-body md-content">
          ${renderMarkdown(excerpt)}
        </div>

        ${tags.length ? `
          <ul class="tag-list tag-list--inline" style="margin-top: var(--sp-5); padding-top: var(--sp-4); border-top: 1px solid var(--border);">
            ${tags.map((tg) => `<li class="tag">${escapeHtml(translateTag(tg, lang))}</li>`).join('')}
          </ul>
        ` : ''}

        ${renderLinksHtml(n.links, lang)}
      </article>
    </main>
  `, { afterMount: afterMountCommon, navKey: 'notes' });
}

async function notFoundPage() {
  const lang = state.lang;
  render(`
    <main class="container" role="main" style="text-align: center; padding: var(--sp-8) var(--sp-4);">
      <p class="page-eyebrow">${t('page.notfound.eyebrow', lang)}</p>
      <h1 class="page-title notfound-code">${t('page.notfound.code', lang)}</h1>
      <p class="page-desc notfound-title">${t('page.notfound.title', lang)}</p>
      <p class="page-desc">${t('page.notfound.desc', lang)}</p>
      <p style="margin-top: var(--sp-5)">
        <a href="#/" class="btn-primary">${t('page.notfound.back', lang)}</a>
      </p>
      <div id="pixivRandom" class="pixiv-random" style="margin-top: var(--sp-7);">
        <p class="pixiv-random-loading">加载 Pixiv 每日排行中...</p>
      </div>
    </main>
  `, { afterMount: afterMountCommon });

  /* 异步加载 Pixiv 每日排行随机图片 */
  try {
    const res = await fetch('https://cloud.mokeyjay.com/pixiv/?r=api/pixiv-json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const items = Array.isArray(json.data) ? json.data : [];
    if (!items.length) throw new Error('no data');
    const item = items[Math.floor(Math.random() * items.length)];
    const box = document.getElementById('pixivRandom');
    if (!box) return;
    const pixivUrl = 'https://www.pixiv.net/artworks/' + item.id;
    box.innerHTML = `
      <p class="pixiv-random-label" style="font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; color: var(--fg-dim); text-transform: uppercase; margin-bottom: var(--sp-3);">
        Pixiv Daily Top 50 · #${escapeHtml(String(item.rank || '?'))}
      </p>
      <a href="${escapeAttr(pixivUrl)}" target="_blank" rel="noopener noreferrer" class="pixiv-random-link">
        <img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.title || '')}" loading="lazy" class="pixiv-random-img" />
      </a>
      <p class="pixiv-random-caption" style="margin-top: var(--sp-2); font-size: 12px; color: var(--fg-muted);">
        ${escapeHtml(item.title || '')} · ${escapeHtml(item.user_name || '')}
      </p>
    `;
  } catch (e) {
    const box = document.getElementById('pixivRandom');
    if (box) box.style.display = 'none';
  }
}

/* ---------- 搜索结果页 ---------- */
async function searchPage(params) {
  const lang = state.lang;
  const data = await loadSiteData();
  const q = (params && params.q ? params.q : '').trim();
  /* 支持中英文逗号分割多条件，AND 逻辑（所有条件都需满足） */
  const conditions = q
    ? q.split(/[,，]/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];

  /* 构建 tag 翻译映射（zh↔en），用于搜索时匹配翻译后的标签名 */
  const tagMap = {};
  (Array.isArray(data.tags) ? data.tags : []).forEach((t) => {
    if (!t) return;
    if (t.zh) tagMap[t.zh.toLowerCase()] = (t.en || t.zh).toLowerCase();
    if (t.en) tagMap[t.en.toLowerCase()] = (t.zh || t.en).toLowerCase();
  });
  const expandTag = (tg) => {
    const lower = String(tg).toLowerCase();
    const result = [lower];
    if (tagMap[lower]) result.push(tagMap[lower]);
    return result;
  };

  let matchedProjects = [];
  let matchedNotes = [];
  if (conditions.length) {
    matchedProjects = sortByTimeDesc(data.projects || []).filter((p) => {
      const titleZh = loc(p.title, 'zh').toLowerCase();
      const titleEn = loc(p.title, 'en').toLowerCase();
      const tagVariants = (p.tags || []).flatMap(expandTag);
      return conditions.every((cond) =>
        titleZh.includes(cond) || titleEn.includes(cond) || tagVariants.some((tv) => tv.includes(cond))
      );
    });
    matchedNotes = (data.notes || []).filter((n) => {
      const titleZh = loc(n.title, 'zh').toLowerCase();
      const titleEn = loc(n.title, 'en').toLowerCase();
      const tagVariants = Array.isArray(n.tags) ? n.tags.flatMap(expandTag) : [];
      return conditions.every((cond) =>
        titleZh.includes(cond) || titleEn.includes(cond) || tagVariants.some((tv) => tv.includes(cond))
      );
    });
  }

  const hasResults = matchedProjects.length || matchedNotes.length;
  render(`
    <main class="container" role="main">
      <header class="page-header" data-animate>
        <p class="page-eyebrow">SEARCH</p>
        <h1 class="page-title">${q ? `「${escapeHtml(q)}」` : (lang === 'zh' ? '搜索' : 'Search')}</h1>
        <p class="page-desc">${q
          ? (lang === 'zh'
              ? `找到 ${matchedProjects.length} 个作品 · ${matchedNotes.length} 条笔记`
              : `${matchedProjects.length} works · ${matchedNotes.length} notes`)
          : (lang === 'zh' ? '在顶部搜索框输入关键词后回车' : 'Type a keyword in the top search box and press Enter')}</p>
      </header>
      ${q && hasResults ? `
        ${matchedProjects.length ? `
          <section class="block">
            <div class="block-head">
              <h2 class="block-title">
                <span class="block-num">W</span>
                <span class="block-label">${lang === 'zh' ? '作品' : 'Works'} · ${matchedProjects.length}</span>
              </h2>
            </div>
            <div class="block-body" data-animate>
              <ul class="work-grid">
                ${matchedProjects.map((p, i) => workCard(p, i, lang)).join('')}
              </ul>
            </div>
          </section>
        ` : ''}
        ${matchedNotes.length ? `
          <section class="block">
            <div class="block-head">
              <h2 class="block-title">
                <span class="block-num">N</span>
                <span class="block-label">${lang === 'zh' ? '笔记' : 'Notes'} · ${matchedNotes.length}</span>
              </h2>
            </div>
            <div class="block-body" data-animate>
              <ul class="notes-list">
                ${matchedNotes.map((n) => `
                  <li class="note-item" data-href="#/notes/${escapeAttr(n.id)}">
                    <span class="note-date">${escapeHtml(n.date || '')}</span>
                    <span class="note-title">${escapeHtml(loc(n.title, lang))}</span>
                    <span class="note-tag">${escapeHtml(formatNoteTags(n.tags, lang))}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          </section>
        ` : ''}
      ` : (q ? `<p class="empty-state">${lang === 'zh' ? '无匹配结果' : 'No matches found'}</p>` : '')}
    </main>
  `, {
    afterMount: (scope) => {
      afterMountCommon(scope);
      /* 把搜索词回填到顶栏搜索框 */
      const topSearch = document.getElementById('topSearch');
      if (topSearch && q && topSearch.value !== q) topSearch.value = q;
    },
    navKey: ''
  });
}

function afterMountCommon(scope) {
  /* 事件委托：动态加载更多作品后，新元素也能响应点击 */
  if (!scope.__dataHrefDelegated) {
    scope.__dataHrefDelegated = true;
    scope.addEventListener('click', (e) => {
      const el = e.target.closest('[data-href]');
      if (!el) return;
      /* 点击 tag 时由 tag popover 处理，不触发导航 */
      if (e.target.closest('.tag')) return;
      if (e.target.closest('a')) return;
      const href = el.dataset.href;
      if (href) location.hash = href.slice(1);
    });
  }
  /* tag 点击：弹出 popover */
  if (!scope.__tagClickDelegated) {
    scope.__tagClickDelegated = true;
    scope.addEventListener('click', (e) => {
      const tagEl = e.target.closest('.tag');
      if (!tagEl) return;
      if (tagEl.dataset.clickable === 'false') return;
      e.preventDefault();
      e.stopPropagation();
      const tagText = tagEl.textContent.trim();
      if (!tagText) return;
      showTagPopover(tagEl, tagText, state.lang);
    });
  }
  /* 联系方式复制：仅绑定带 data-copy 的条目（URL 链接由 <a> 自行处理） */
  scope.querySelectorAll('.row--contact[data-copy]').forEach((row) => {
    if (row.__contactBound) return;
    row.__contactBound = true;
    function onActivate(e) {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const val = row.dataset.copy;
      if (val) copyText(val);
    }
    row.addEventListener('click', onActivate);
    row.addEventListener('keydown', onActivate);
  });
  bindImageParallax(scope);
}

/* ---------- Tag Popover：点击 tag 弹出介绍和相关内容 ---------- */
let tagPopoverEl = null;
let tagPopoverToken = 0; /* 取消令牌：每次显示递增，过期的渲染将被丢弃 */

function ensureTagPopover() {
  if (tagPopoverEl && document.body.contains(tagPopoverEl)) return tagPopoverEl;
  tagPopoverEl = document.createElement('div');
  tagPopoverEl.className = 'tag-popover';
  tagPopoverEl.style.display = 'none';
  document.body.appendChild(tagPopoverEl);
  /* 点击外部关闭 */
  document.addEventListener('click', (e) => {
    if (tagPopoverEl && tagPopoverEl.style.display !== 'none') {
      if (!tagPopoverEl.contains(e.target) && !e.target.closest('.tag')) {
        hideTagPopover();
      }
    }
  }, true);
  /* 路由切换时关闭 */
  window.addEventListener('hashchange', hideTagPopover);
  return tagPopoverEl;
}

function hideTagPopover() {
  tagPopoverToken++; /* 使任何进行中的异步渲染失效 */
  if (tagPopoverEl) tagPopoverEl.style.display = 'none';
}

async function showTagPopover(anchorEl, tagText, lang) {
  const popover = ensureTagPopover();
  const myToken = ++tagPopoverToken; /* 本次显示的令牌 */
  const data = await loadSiteData();
  /* 异步等待期间若已被后续点击取代，则放弃渲染 */
  if (myToken !== tagPopoverToken) return;
  /* 查找 tag 元数据 */
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const meta = tags.find((tt) => tt && (tt.zh === tagText || tt.en === tagText));
  const desc = meta && meta.desc ? loc(meta.desc, lang) : '';
  const displayName = meta ? (lang === 'zh' ? (meta.zh || meta.en) : (meta.en || meta.zh)) : tagText;

  /* 构建匹配集合：tagText 可能是中文名或英文名，需同时匹配 zh 和 en */
  const matchSet = new Set();
  matchSet.add(tagText);
  if (meta) {
    if (meta.zh) matchSet.add(meta.zh);
    if (meta.en) matchSet.add(meta.en);
  }
  const matchTag = (t) => matchSet.has(t);

  /* 查找相关作品（最多 8 个，覆盖更全面） */
  const relatedProjects = sortByTimeDesc(data.projects || []).filter((p) =>
    Array.isArray(p.tags) && p.tags.some(matchTag)
  ).slice(0, 8);

  /* 查找相关笔记（最多 5 条） */
  const relatedNotes = (data.notes || []).filter((n) =>
    Array.isArray(n.tags) && n.tags.some(matchTag)
  ).slice(0, 5);

  /* 统计总数 */
  const totalProjects = (data.projects || []).filter((p) =>
    Array.isArray(p.tags) && p.tags.some(matchTag)
  ).length;
  const totalNotes = (data.notes || []).filter((n) =>
    Array.isArray(n.tags) && n.tags.some(matchTag)
  ).length;

  popover.innerHTML = `
    <div class="tag-popover-header">
      <span class="tag-popover-name">${escapeHtml(displayName)}</span>
      <button class="tag-popover-close" aria-label="关闭">×</button>
    </div>
    ${desc ? `<p class="tag-popover-desc">${escapeHtml(desc)}</p>` : ''}
    ${relatedProjects.length ? `
      <div class="tag-popover-section">
        <div class="tag-popover-label">${lang === 'zh' ? '相关作品' : 'Related Works'} · ${totalProjects}</div>
        <div class="tag-popover-works">
          ${relatedProjects.map((p) => {
            const cover = getCover(p);
            const title = loc(p.title, lang);
            const thumbUrl = toThumbUrl(cover);
            return `
              <a href="#/work/${escapeAttr(p.id)}" class="tag-popover-work">
                ${cover ? `<span class="tag-popover-work-img" style="background-image:url('${escapeAttr(thumbUrl)}')"></span>` : '<span class="tag-popover-work-img tag-popover-work-img--empty"></span>'}
                <span class="tag-popover-work-title">${escapeHtml(title)}</span>
              </a>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}
    ${relatedNotes.length ? `
      <div class="tag-popover-section">
        <div class="tag-popover-label">${lang === 'zh' ? '相关笔记' : 'Related Notes'} · ${totalNotes}</div>
        <div class="tag-popover-notes">
          ${relatedNotes.map((n) => `
            <a href="#/notes/${escapeAttr(n.id)}" class="tag-popover-note">
              <span class="tag-popover-note-date">${escapeHtml(n.date || '')}</span>
              <span class="tag-popover-note-title">${escapeHtml(loc(n.title, lang))}</span>
            </a>
          `).join('')}
        </div>
      </div>
    ` : ''}
    ${(totalProjects + totalNotes) > 0 ? `
      <a href="#/search?q=${encodeURIComponent(tagText)}" class="tag-popover-more">
        ${lang === 'zh' ? '查看更多 →' : 'View more →'}
      </a>
    ` : `<p class="tag-popover-empty">${lang === 'zh' ? '暂无相关内容' : 'No related content'}</p>`}
  `;

  /* 再次确认令牌，避免在 innerHTML 之前被取代 */
  if (myToken !== tagPopoverToken) return;

  /* 定位到 tag 下方 */
  const rect = anchorEl.getBoundingClientRect();
  const popoverWidth = 360;
  let left = rect.left + window.scrollX;
  if (left + popoverWidth > window.innerWidth - 16) {
    left = window.innerWidth - popoverWidth - 16;
  }
  if (left < 16) left = 16;
  popover.style.left = left + 'px';
  popover.style.top = (rect.bottom + window.scrollY + 6) + 'px';
  popover.style.display = 'block';

  /* 关闭按钮 */
  const closeBtn = popover.querySelector('.tag-popover-close');
  if (closeBtn) closeBtn.addEventListener('click', hideTagPopover);

  /* 滚轮左右滚动：在相关作品区域上滚动滚轮时，转为横向滚动 */
  const worksBox = popover.querySelector('.tag-popover-works');
  if (worksBox) {
    worksBox.addEventListener('wheel', (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      worksBox.scrollLeft += e.deltaY;
    }, { passive: false });
  }
}

export function initRouter() {
  registerRoute('', () => homePage());
  registerRoute('work', () => workListPage());
  registerRoute('work/:id', (params) => workDetailPage(params));
  registerRoute('about', () => aboutPage());
  registerRoute('notes', (params) => notesPage(params));
  registerRoute('notes/:id', (params) => noteDetailPage(params));
  registerRoute('search', (params) => searchPage(params));

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

export { DICT, DEFAULT_LANG };
