/* ============================================================
   i18n.js — 多语言字典与切换
   中英文文案在此集中维护（同一个 key 的中英文放在一起）
   ============================================================ */

export const DEFAULT_LANG = 'zh';

export const DICT = {
  /* 顶部栏 */
  'nav.home':            { zh: '首页',           en: 'Home' },
  'nav.work':            { zh: '作品',           en: 'Work' },
  'nav.notes':           { zh: '笔记',           en: 'Notes' },
  'nav.search':          { zh: '搜索作品/笔记…', en: 'Search works / notes…' },

  /* Hero */
  'hero.tagline':        { zh: '喜欢画画，偶尔整理些零碎的东西，还会写点小工具之类的。', en: 'I like drawing. Sometimes I tidy up odds and ends, and I also write small tools.' },
  'meta.status':         { zh: '摸鱼中...',      en: 'Taking it easy...' },
  'meta.location':       { zh: '中国/GMT+8/19:00-22:00', en: 'China/GMT+8/19:00-22:00' },
  'hero.cta.about':      { zh: '关于',           en: 'About' },

  /* About */
  'about.p1':            { zh: '喜欢画画，偶尔整理些零碎的东西，还会写点小工具之类的。', en: 'I like drawing. Sometimes I tidy up odds and ends, and I also write small tools.' },
  'about.p2':            { zh: '一直挺想做一个网站来着，心血来潮终于是做出来了...', en: 'I had been wanting to build a website for a while — finally got around to it on a whim...' },

  /* Projects */
  'block.projects':      { zh: '作品',           en: 'WORK' },
  'project.back':        { zh: '← 返回作品列表', en: '← Back to work' },

  /* Notes */
  'block.notes':         { zh: '笔记',           en: 'NOTES' },
  'notes.preview.empty': { zh: '暂无笔记',       en: 'No notes yet' },
  'note.back':           { zh: '← 返回笔记列表', en: '← Back to notes' },

  /* 联系方式复制提示 */
  'hint.copy':           { zh: '点击复制',       en: 'click to copy' },

  /* Footer */
  'footer.build':        { zh: '2026.06 · v1.0', en: '2026.06 · v1.0' },
  'footer.backtop':      { zh: '回到顶部 ↑',     en: 'Back to top ↑' },

  /* 子页面 */
  'page.work.eyebrow':   { zh: 'WORK',           en: 'WORK' },
  'page.work.title':     { zh: '作品列表',       en: 'Selected Work' },
  'page.work.desc':      { zh: '练习、摸鱼、画画之类的...', en: 'Practice, doodling, drawing and such...' },
  'page.about.eyebrow':  { zh: 'ABOUT',          en: 'ABOUT' },
  'page.about.title':    { zh: '关于',           en: 'About Me' },
  'page.about.desc':     { zh: '喜欢画画，偶尔整理些零碎的东西，还会写点小工具之类的。', en: 'I like drawing. Sometimes I tidy up odds and ends, and I also write small tools.' },
  'page.notes.eyebrow':  { zh: 'NOTES',          en: 'NOTES' },
  'page.notes.title':    { zh: '笔记',           en: 'Notes' },
  'page.notes.desc':     { zh: '记录学习的过程、想法、还有些零碎记录...', en: 'Recording learning processes, thoughts, and miscellaneous notes...' },

  /* 作品详情占位 */
  'workdetail.placeholder': { zh: '作品图占位',  en: 'WORK IMAGE' },

  /* 404 */
  'page.notfound.eyebrow': { zh: 'ERROR',        en: 'ERROR' },
  'page.notfound.code':    { zh: '404',          en: '404' },
  'page.notfound.title':   { zh: '页面未找到',   en: 'Not Found' },
  'page.notfound.desc':    { zh: '找不到页面啦！', en: 'The page does not exist, or never did.' },
  'page.notfound.back':    { zh: '← 回到首页',   en: '← Back to home' },

  /* 色板 */
  'picker.reset':        { zh: '重置',           en: 'Reset' },

  /* Toast */
  'toast.copied':        { zh: '已复制 · ',      en: 'Copied · ' },
  'toast.reset':         { zh: '已重置 · 恢复默认', en: 'Reset · defaults applied' },

  /* 后台 */
  'lang.toggle':         { zh: 'EN',             en: '中文' }
};

/* 应用语言：扫描所有 [data-i18n] 元素并写入文案 */
export function applyLang(lang) {
  const root = document.documentElement;
  root.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const entry = DICT[key];
    if (entry && entry[lang]) el.textContent = entry[lang];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const entry = DICT[key];
    if (entry && entry[lang]) el.setAttribute('placeholder', entry[lang]);
  });
  const langBtn = document.getElementById('langToggle');
  if (langBtn) {
    const entry = DICT['lang.toggle'];
    if (entry) langBtn.textContent = entry[lang] || entry[DEFAULT_LANG];
  }
}

export function t(key, lang) {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[lang] || entry[DEFAULT_LANG] || key;
}
