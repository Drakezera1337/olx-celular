// App instalável: guarda os arquivos do site. Os dados ficam no localStorage
// e a API do GitHub nunca passa pelo cache.
const CACHE = 'olxcel-v24';
const ARQUIVOS = ['./', 'index.html', 'styles.css?v=24', 'config.js?v=24', 'cripto.js?v=24',
  'sync.js?v=24', 'app.js?v=24', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Rede primeiro (pega versões novas), cache se estiver sem internet.
// cache: 'no-cache' — o GitHub Pages manda max-age=600 no index.html; sem
// isso o app reaproveitava por até 10 min o index antigo (com o CSS/JS antigo).
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
    .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: false }).then((r) => r || caches.match('index.html'))));
});

// Notificação push enviada pela extensão no PC (ex.: "Compra automática iniciada")
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'OLX', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png',
    tag: d.tag || undefined, data: { url: d.url || '#/reservas' },
  }));
});

// Toque na notificação: abre (ou traz pra frente) o app na tela indicada (aba Reservas)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = e.notification.data?.url || '#/reservas';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
    for (const w of janelas) {
      if (new URL(w.url).origin === location.origin) {
        w.postMessage({ ir: destino });
        return w.focus();
      }
    }
    return self.clients.openWindow(new URL(destino, self.registration.scope).href);
  }));
});
