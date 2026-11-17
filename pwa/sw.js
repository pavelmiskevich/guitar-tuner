/*
 * Service worker «Ночной репетиции».
 *
 * Это шаблон: список файлов сборки и её хэш подставляет pwa/swPlugin.ts после
 * `vite build`. В dist попадает уже готовый sw.js; в режиме разработки воркер
 * не регистрируется (см. src/main.tsx).
 *
 * Стратегии:
 *  - навигация — сеть с таймаутом, при отказе или задержке — index.html из кэша;
 *  - файлы сборки (assets, шрифты, иконки, манифест) — из кэша, без сети:
 *    они версионированы хэшем сборки в имени кэша;
 *  - всё остальное — сеть как есть, без подмен: index.html вместо скрипта или
 *    картинки ломал бы страницу хуже, чем честная сетевая ошибка.
 */

const BUILD_HASH = '__BUILD_HASH__';
const PRECACHE = /* __PRECACHE__ */ [];

const CACHE_NAME = `gt-precache-${BUILD_HASH}`;
/** Сколько ждать сеть при открытии страницы, прежде чем отдать копию из кэша. */
const NAVIGATION_TIMEOUT_MS = 3000;

const toUrl = (path) => new URL(path, self.registration.scope).href;
const INDEX_URL = toUrl('index.html');
const PRECACHE_URLS = new Set(PRECACHE.map(toUrl));

self.addEventListener('install', (event) => {
  // Весь набор файлов кэшируется при установке, а не «по ходу»: при первом
  // визите воркер регистрируется уже после загрузки бандла, и без этого
  // офлайн-запуск получал index.html без скриптов — белый экран.
  // cache: 'reload' — мимо HTTP-кэша браузера, чтобы не законсервировать старую копию.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(toUrl(path), { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Кэши прошлых сборок (и старые night-rehearsal-*) больше не нужны.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (PRECACHE_URLS.has(url.origin + url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
  // Остальное браузер запросит сам, без участия воркера.
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  // ignoreVary: модульный скрипт и шрифты запрашиваются с заголовком Origin,
  // а при установке кэшировались без него; сервер же отвечает с Vary: Origin
  // (vite preview) или Vary: Accept-Encoding (Caddy) — и совпадения не было бы.
  // Файлы сборки неизменны, вариантов у них нет.
  const cached = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  return cached || fetch(request);
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(request);
  // Если сеть ответит после таймаута или упадёт, когда страница уже отдана из
  // кэша, этот промис никто не ждёт — гасим отказ, чтобы не было необработанной ошибки.
  network.catch(() => {});

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([network, timeout]);
    if (response && response.ok) return response;

    // Сеть молчит дольше таймаута или сервер ответил ошибкой — копия из кэша
    // лучше. Если копии нет, остаётся только то, что даст сеть.
    const cached = await cache.match(INDEX_URL, { ignoreVary: true });
    if (cached) return cached;
    return response || network;
  } catch {
    const cached = await cache.match(INDEX_URL, { ignoreVary: true });
    return cached || Response.error();
  } finally {
    clearTimeout(timer);
  }
}
