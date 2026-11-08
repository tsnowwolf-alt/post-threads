/*
 * Painel de Publicações — guarda os arquivos do app no celular para ele abrir sem internet.
 * Autoria de Gabriel Marangoni
 *
 * Ao publicar uma versão nova do app, aumente o número abaixo (v2, v3, ...).
 */
const VERSAO = 'painel-v5';
const ARQUIVOS = [
  './', './index.html', './app.js', './manifest.webmanifest',
  './icone-192.png', './icone-512.png', './icone-mascara-512.png',
];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(VERSAO).then(cache => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(nome => nome !== VERSAO).map(nome => caches.delete(nome))))
      .then(() => self.clients.claim())
  );
});

// Abre na hora com a cópia guardada e, se houver internet, atualiza a cópia para a próxima vez.
self.addEventListener('fetch', evento => {
  const pedido = evento.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;
  const daRede = fetch(pedido).then(async resposta => {
    if (resposta.ok) {
      const cache = await caches.open(VERSAO);
      await cache.put(pedido, resposta.clone());
    }
    return resposta;
  });
  evento.waitUntil(daRede.catch(() => {}));
  evento.respondWith(caches.match(pedido, { ignoreSearch: true }).then(guardado => guardado || daRede));
});
