/* ============================================================
   sw.js — Service Worker
   策略：
   - 图片（assets/images/）：缓存优先（cache-first），无缓存才网络
   - CSS/JS：缓存优先，后台更新（stale-while-revalidate）
   - projects.json / API：网络优先（不缓存）
   - HTML 文档：网络优先（保证更新）
   ============================================================ */

const CACHE_NAME = 'taumata-v1';
const IMG_CACHE = 'taumata-img-v1';

/* 需要缓存的静态资源前缀 */
const IMG_PREFIX = '/assets/images/';
const STATIC_EXTS = ['.css', '.js', '.woff', '.woff2', '.svg'];

/* 判断是否为图片请求 */
function isImageReq(url) {
  return url.pathname.indexOf(IMG_PREFIX) === 0 ||
    /\.(png|jpg|jpeg|gif|webp|bmp|avif)$/i.test(url.pathname);
}

/* 判断是否为静态资源 */
function isStaticReq(url) {
  return STATIC_EXTS.some((ext) => url.pathname.endsWith(ext));
}

/* 安装：预缓存关键资源 */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

/* 激活：清理旧缓存 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== IMG_CACHE)
            .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

/* 请求拦截 */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  /* 仅处理同源 GET 请求 */
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  /* projects.json / API：始终网络优先，不缓存 */
  if (url.pathname.indexOf('/api/') === 0 || url.pathname.endsWith('projects.json')) {
    return;
  }

  /* HTML 文档：网络优先（保证更新） */
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match('/')))
    );
    return;
  }

  /* 图片：cache-first（缓存优先，无缓存才网络）
     这样能最大程度避免重复网络请求，提升页面切换速度 */
  if (isImageReq(url)) {
    event.respondWith(
      caches.open(IMG_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          /* 缓存未命中：从网络获取并缓存 */
          return fetch(req).then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  /* CSS/JS 等：缓存优先，后台更新（stale-while-revalidate） */
  if (isStaticReq(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }
});
