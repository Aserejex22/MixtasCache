const CACHE_VERSION = {
  APP_SHELL: '2',
  DYNAMIC: '1'
};

const APP_SHELL_CACHE = `app-shell-v${CACHE_VERSION.APP_SHELL}`;
const DYNAMIC_CACHE = `dynamic-cache-v${CACHE_VERSION.DYNAMIC}`;

const APP_SHELL_ASSETS = [
  '/',                 
  '/index.html',
  '/pages/calendar.html',
  '/pages/form.html',
  '/pages/about.html',
  '/style.css',
  '/register.js',
  '/img/192.png',
  '/img/512.png',
  'https://cdn.tailwindcss.com/'
];

const DYNAMIC_ASSET_URLS = [
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/main.min.css',

  'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/js/select2.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/css/select2.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const normalized = APP_SHELL_ASSETS.map(asset => {
      try {
        const u = new URL(asset, self.location);
        return u.href;
      } catch (e) {
        return asset;
      }
    });

    const cache = await caches.open(APP_SHELL_CACHE);

    try {
      await cache.addAll(normalized);
    } catch (err) {
      console.warn('cache.addAll(normalized) falló, intentando uno-a-uno:', err);
      for (const url of normalized) {
        try {
          // Para cross-origin usamos no-cors para evitar CORS blocks
          const reqInit = url.startsWith(self.location.origin) ? {} : { mode: 'no-cors', credentials: 'omit' };
          const resp = await fetch(new Request(url, reqInit));
          if (resp) {
            try {
              await cache.put(url, resp.clone());
            } catch (e) {
              console.warn('cache.put falló para', url, e);
            }
          }
        } catch (e) {
          console.warn('No se pudo precachear asset:', url, e);
        }
      }
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  const keep = [APP_SHELL_CACHE, DYNAMIC_CACHE];
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(async k => {
      if ((k.startsWith('app-shell-') && k !== APP_SHELL_CACHE) ||
          (k.startsWith('dynamic-cache-') && k !== DYNAMIC_CACHE)) {
        console.log('Eliminando cache antigua:', k);
        return caches.delete(k);
      }
      if (!keep.includes(k) && !k.startsWith('app-shell-') && !k.startsWith('dynamic-cache-')) {

      }
    }));
    await self.clients.claim();
  })());
});

function getNormalizedAppShellUrls() {
  return APP_SHELL_ASSETS.map(a => {
    try {
      return new URL(a, self.location).href;
    } catch (e) {
      return a;
    }
  });
}

function isAppShellRequest(request) {
  const normalized = getNormalizedAppShellUrls();
  try {
    const reqUrl = new URL(request.url);
    if (reqUrl.origin === self.location.origin) {
      return normalized.includes(reqUrl.href) || normalized.includes(reqUrl.pathname) || request.mode === 'navigate';
    }
    return normalized.includes(reqUrl.href) || normalized.includes(request.url);
  } catch (e) {
    return normalized.includes(request.url);
  }
}

function isDynamicAssetRequest(request) {
  try {
    const reqUrl = new URL(request.url);
    const normalized = DYNAMIC_ASSET_URLS.map(u => {
      try { return new URL(u).href; } catch (e) { return u; }
    });

    if (normalized.includes(reqUrl.href)) {
      console.log('isDynamicAssetRequest: exact match', reqUrl.href);
      return true;
    }

    if (normalized.some(u => {
      try { return new URL(u).pathname === reqUrl.pathname; } catch (e) { return false; }
    })) {
      console.log('isDynamicAssetRequest: pathname match', reqUrl.pathname);
      return true;
    }

    if (normalized.some(u => reqUrl.href.startsWith(u) || u.startsWith(reqUrl.href))) {
      console.log('isDynamicAssetRequest: prefix/includes match', request.url);
      return true;
    }

    return false;
  } catch (e) {
    return DYNAMIC_ASSET_URLS.includes(request.url);
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  if (isAppShellRequest(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      const cached = await cache.match(request) || await caches.match(request);
      if (cached) {
        return cached;
      }
      try {
        const networkResp = await fetch(request);
        if (networkResp && networkResp.ok) {
          try {
            await cache.put(request.url, networkResp.clone());
          } catch (e) {
            console.warn('No se pudo cache.put en app-shell para', request.url, e);
          }
        }
        return networkResp;
      } catch (e) {
        return new Response('Recurso del App Shell no disponible offline.', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  if (isDynamicAssetRequest(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(DYNAMIC_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }
      try {
        const networkResp = await fetch(request);
        if (networkResp && (networkResp.ok || networkResp.type === 'opaque')) {
          try {
            await cache.put(request.url, networkResp.clone());
            limitCacheSize(DYNAMIC_CACHE, 50);
            console.log('Cached dynamic asset:', request.url);
          } catch (e) {
            console.warn('No se pudo cache.put en dynamic cache para', request.url, e);
          }
        } else {
          console.log('Respuesta no cacheable (no ok y no opaca):', request.url, networkResp && networkResp.type);
        }
        return networkResp;
      } catch (e) {
        return new Response('Recurso dinámico no disponible offline.', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const networkResp = await fetch(request);
      return networkResp;
    } catch (e) {
      const cached = await caches.match(request);
      if (cached) return cached;
      return new Response('Recurso no disponible (offline).', { status: 504, statusText: 'Offline' });
    }
  })());
});

async function limitCacheSize(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      await cache.delete(keys[0]);
      await limitCacheSize(cacheName, maxItems);
    }
  } catch (e) {
    console.warn('limitCacheSize fallo:', e);
  }
}
