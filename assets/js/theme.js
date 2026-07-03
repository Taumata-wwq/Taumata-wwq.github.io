/* ============================================================
   theme.js — 主题状态 / 明暗 / 强调色 / 工具函数
   ============================================================ */

import { DEFAULT_LANG, applyLang, DICT, t } from './i18n.js';

export const KEY = 'taumata.theme.v1';
export const LANG_KEY = 'taumata.lang.v1';
export const DEFAULT_RGB = '255,107,53';
export const DEFAULT_MODE = 'dark';

export const state = {
  mode: DEFAULT_MODE,
  accent_rgb: DEFAULT_RGB,
  lang: DEFAULT_LANG
};

/* ---------- 工具函数 ---------- */
export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function pad2(n) { const s = n.toString(16); return s.length < 2 ? '0' + s : s; }
export function rgbToHex(r, g, b) { return ('#' + pad2(r) + pad2(g) + pad2(b)).toUpperCase(); }

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = m[1];
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

export function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function parseRgb(str) {
  const p = str.split(',').map((s) => parseInt(s.trim(), 10));
  return { r: clamp(p[0] || 0, 0, 255), g: clamp(p[1] || 0, 0, 255), b: clamp(p[2] || 0, 0, 255) };
}

/* ---------- Toast ---------- */
let toastTimer = null;
export function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 1600);
}

/* ---------- 状态持久化 ---------- */
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg.mode === 'light' || cfg.mode === 'dark') state.mode = cfg.mode;
      if (typeof cfg.accent_rgb === 'string' && /^\d{1,3},\d{1,3},\d{1,3}$/.test(cfg.accent_rgb)) state.accent_rgb = cfg.accent_rgb;
    }
  } catch (e) {}
  try {
    const l = localStorage.getItem(LANG_KEY);
    if (l === 'zh' || l === 'en') state.lang = l;
  } catch (e) {}
}

export function saveTheme() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ mode: state.mode, accent_rgb: state.accent_rgb, updated_at: Date.now() }));
  } catch (e) {}
}

export function saveLang() {
  try { localStorage.setItem(LANG_KEY, state.lang); } catch (e) {}
}

/* ---------- 主题应用 ---------- */
import { syncPicker } from './picker.js';

export function applyTheme() {
  const root = document.documentElement;
  root.setAttribute('data-theme', state.mode);
  const c = parseRgb(state.accent_rgb);
  root.style.setProperty('--accent-r', c.r);
  root.style.setProperty('--accent-g', c.g);
  root.style.setProperty('--accent-b', c.b);
  const hsv = rgbToHsv(c.r, c.g, c.b);
  root.style.setProperty('--hue', hsv.h + 'deg');
  syncPicker();
}

export function applyLangAll() {
  applyLang(state.lang);
}

export function setMode(mode) {
  state.mode = mode === 'dark' ? 'dark' : 'light';
  applyTheme();
  saveTheme();
}

export function setRgb(r, g, b) {
  r = clamp(Math.round(r), 0, 255);
  g = clamp(Math.round(g), 0, 255);
  b = clamp(Math.round(b), 0, 255);
  state.accent_rgb = r + ',' + g + ',' + b;
  applyTheme();
  saveTheme();
}

export function setLang(lang) {
  state.lang = lang === 'en' ? 'en' : 'zh';
  applyLangAll();
  saveLang();
  /* 触发一次 hashchange，让路由重新渲染当前页（刷新动态加载的文案） */
  try { window.dispatchEvent(new Event('hashchange')); } catch (e) {}
}

/* ---------- 滚动进度条 ---------- */
export function initScrollProgress() {
  const bar = document.querySelector('.scroll-progress');
  if (!bar) return;
  const update = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const p = max > 0 ? (h.scrollTop / max) * 100 : 0;
    bar.style.width = p + '%';
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

/* ---------- 进入视口动画（IntersectionObserver） ---------- */
export function initRevealAnimations() {
  const els = document.querySelectorAll('[data-animate]');
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.animateDelay || 0;
        setTimeout(() => entry.target.classList.add('is-in'), parseInt(delay, 10));
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  els.forEach((el) => io.observe(el));
}

/* 重新触发动画（路由切换时调用） */
export function retriggerAnimations(scope) {
  const root = scope || document;
  const els = root.querySelectorAll('[data-animate]:not(.is-in)');
  els.forEach((el, i) => {
    const delay = el.dataset.animateDelay || (i * 40);
    setTimeout(() => el.classList.add('is-in'), parseInt(delay, 10));
  });
}

/* ---------- 键盘快捷键 ---------- */
export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const picker = document.getElementById('colorpicker');
      if (picker && picker.classList.contains('is-open')) {
        picker.classList.remove('is-open');
        const btn = document.getElementById('pickerOpen');
        if (btn) btn.classList.remove('is-active');
        return;
      }
    }
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    const inField = tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable);
    if (inField) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); setMode(state.mode === 'dark' ? 'light' : 'dark'); }
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setLang(state.lang === 'zh' ? 'en' : 'zh'); }
      if (e.key === ',') { e.preventDefault(); import('./picker.js').then(m => m.togglePicker()); }
    }
  });

  /* 跟随系统明暗变化（仅当用户未自定义时） */
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch (err) {}
      if (!raw) {
        state.mode = e.matches ? 'dark' : 'light';
        applyTheme();
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}

/* ---------- 复制联系信息 ---------- */
export function copyText(text) {
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(fallback);
  } else { fallback(); }
  showToast(t('toast.copied', state.lang) + text);
}

export { DICT };
