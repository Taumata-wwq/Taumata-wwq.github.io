/* ============================================================
   main.js — 主站入口
   加载顺序：i18n → theme → picker → router → 动画/进度/快捷键
   ============================================================ */

import { load, applyTheme, applyLangAll, initScrollProgress, initRevealAnimations, initKeyboardShortcuts, retriggerAnimations } from './theme.js';
import { initPicker, syncPicker } from './picker.js';
import { initRouter } from './router.js';
import { applyLang } from './i18n.js';
import { state, setMode, setLang } from './theme.js';

function init() {
  load();
  applyTheme();
  applyLangAll();
  initPicker();
  initRouter();
  initScrollProgress();
  initRevealAnimations();
  initKeyboardShortcuts();

  /* 顶部栏按钮 */
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.addEventListener('click', () => setMode(state.mode === 'dark' ? 'light' : 'dark'));

  const langBtn = document.getElementById('langToggle');
  if (langBtn) langBtn.addEventListener('click', () => setLang(state.lang === 'zh' ? 'en' : 'zh'));

  /* 顶部搜索框：回车跳转到搜索结果页 */
  const topSearch = document.getElementById('topSearch');
  if (topSearch) {
    topSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = topSearch.value.trim();
        if (q) {
          location.hash = '/search?q=' + encodeURIComponent(q);
        }
      }
    });
  }

  /* 重新应用语言到动态渲染的页面 */
  window.addEventListener('hashchange', () => {
    setTimeout(() => applyLang(state.lang), 60);
  });

  /* 回到顶部按钮 */
  const backTop = document.querySelector('[data-backtop]');
  if (backTop) {
    backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
