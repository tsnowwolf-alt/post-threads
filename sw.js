/*
 * Painel de Publicações — guarda os arquivos do app no celular para ele abrir sem internet.
 * Autoria de Gabriel Marangoni
 *
 * Com internet, o app sempre busca a versão mais nova (as atualizações aparecem na hora).
 * Sem internet (ou com internet muito lenta), abre a cópia guardada no celular.
 *
 * Ao publicar uma versão nova do app, aumente o número abaixo (v7, v8, ...).
 */
const VERSAO = 'painel-v6';
const ARQUIVOS = [
  './', './index.html', './app.js', './manifest.webmanifest',
  './icone-192.png', './icone-512.png', './icone-mascara-512.png',
];
const ESPERA_MAXIMA = 4000;   // milissegundos esperando a internet antes de abrir a cópia guardada

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(VERSAO)
      .then(cache => cache.addAll(ARQUIVOS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(nome => nome !== VERSAO).map(nome => caches.delete(nome))))
      .then(() => self.clients.claim())
  );
});

function comLimite(promessa, ms) {
  return new Promise((ok, falha) => {
    const relogio = setTimeout(() => falha(new Error('a internet demorou')), ms);
    promessa.then(r => { clearTimeout(relogio); ok(r); }, e => { clearTimeout(relogio); falha(e); });
  });
}

self.addEventListener('fetch', evento => {
  const pedido = evento.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;

  // Pergunta sempre ao site se há versão nova (sem usar a cópia antiga do navegador)
  const daRede = fetch(pedido.url, { cache: 'no-cache' });

  // Guarda a versão recebida para quando estiver sem internet
  evento.waitUntil(daRede.then(resposta => {
    if (!resposta.ok) return undefined;
    const copia = resposta.clone();
    return caches.open(VERSAO).then(cache => cache.put(pedido, copia));
  }).catch(() => {}));

  evento.respondWith(
    comLimite(daRede, ESPERA_MAXIMA)
      .then(resposta => (resposta.ok ? resposta
        : caches.match(pedido, { ignoreSearch: true }).then(guardado => guardado || resposta)))
      .catch(() => caches.match(pedido, { ignoreSearch: true }).then(guardado => guardado || Response.error()))
  );
});
