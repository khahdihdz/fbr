/* Service worker của FB Watch Progress.
 *
 * Hai token dưới đây được scripts/gen-precache.mjs thay thế sau khi `vite build`
 * hoàn tất, vì tên file asset có hash chỉ biết được sau khi build.
 */
/* eslint-disable no-undef */
const VERSION = '__FBR_VERSION__';
const APP_SHELL = [/* __FBR_PRECACHE__ */];

const CACHE = `fbr-${VERSION}`;
const OFFLINE_FALLBACK = '/fbr/index.html';
const SHARE_FALLBACK = '/fbr/share/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch {
            /* bỏ qua từng file lỗi, không làm hỏng cả lần cài */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

/* Giao thức với trang:
 *   FBR_SKIP_WAITING  -> bản mới tiếp quản ngay (trang sẽ tự tải lại)
 *   FBR_GET_VERSION   -> trả về VERSION của service worker đang chạy, để trang
 *                        so với phiên bản build của chính nó.
 */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'FBR_SKIP_WAITING') {
    void self.skipWaiting();
    return;
  }
  if (data.type === 'FBR_GET_VERSION') {
    const payload = { type: 'FBR_VERSION', version: VERSION };
    const port = event.ports && event.ports[0];
    if (port) port.postMessage(payload);
    else if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage(payload);
    }
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirstNavigation(request, url) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE);
    const isShare = url.pathname.replace(/\/$/, '').endsWith('/share');
    const fallback = await cache.match(isShare ? SHARE_FALLBACK : OFFLINE_FALLBACK);
    if (fallback) return fallback;
    return new Response('Bạn đang offline và trang này chưa được lưu.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Không đụng vào request khác origin (ví dụ ảnh thumbnail Facebook).
  if (url.origin !== self.location.origin) return;

  // version.json phải luôn là bản mới nhất, không bao giờ lấy từ cache —
  // nếu không thì không phát hiện được commit mới.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (url.pathname.startsWith('/fbr/assets/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request, url));
    return;
  }

  event.respondWith(cacheFirst(request));
});
