/*
 * Painel de Publicações para o Threads — versão app (PWA)
 * Autoria de Gabriel Marangoni
 *
 * Tudo fica guardado no próprio celular, dentro do app (IndexedDB do navegador):
 * contas, levas, textos e as fotos/vídeos de cada publicação.
 */
'use strict';

// =============================================================================
// Configuração
// =============================================================================
const AUTORIA = 'Autoria de Gabriel Marangoni';
const VERSAO_APP = '1.0';
const LIMITE_CARACTERES = 500;          // limite de texto de um post no Threads (o painel só avisa)
const DIAS_PARA_LEMBRAR_BACKUP = 14;
const ASSINATURA_BACKUP = 'painel-de-publicacoes-threads';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const ESTADOS = {
  pendente: { icone: '⏳', texto: 'Sem publicação', cor: 'amarela' },
  pronto: { icone: '📝', texto: 'Pronta para publicar', cor: 'azul' },
  publicado: { icone: '✅', texto: 'Publicada no Threads', cor: 'verde' },
};
const TIPO_POR_EXTENSAO = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
  webm: 'video/webm', '3gp': 'video/3gpp', mkv: 'video/x-matroska',
};
const RE_CONTA = /^(?=.*[a-z0-9])[a-z0-9._]{1,30}$/;   // regras de @ do Threads/Instagram


// =============================================================================
// Utilidades
// =============================================================================
const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const pad = n => String(n).padStart(2, '0');
const agora = () => new Date().toISOString();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function esc(valor) {
  return String(valor == null ? '' : valor).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function novoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function formatarBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
}

// ----------------------------------------------------------------- datas
function isoDe(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function hoje() { return isoDe(new Date()); }

function lerData(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto || '');
  if (!m) return null;
  const [ano, mes, dia] = [+m[1], +m[2], +m[3]];
  const d = new Date(ano, mes - 1, dia);
  if (ano < 1970 || ano > 2999 || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return d;
}

function somarDias(iso, n) { const d = lerData(iso); d.setDate(d.getDate() + n); return isoDe(d); }

function diasAte(iso) {
  const utc = t => { const [a, m, d] = t.split('-').map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((utc(iso) - utc(hoje())) / 864e5);
}

const dataBr = iso => iso.split('-').reverse().join('/');
const dataCurta = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
function dataExtenso(iso) {
  const d = lerData(iso);
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
function diaRelativo(iso) { return { 0: 'Hoje', 1: 'Amanhã', '-1': 'Ontem' }[diasAte(iso)] || dataCurta(iso); }

function lerHorario(texto) {
  const m = /^([01]\d|2[0-3]):[0-5]\d/.exec(String(texto || '').trim());
  return m ? m[0] : '';
}

// ----------------------------------------------------------------- textos
function limparNome(texto, limite = 40) {
  return String(texto || '').replace(/[^\p{L}\p{N}\s_-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limite).trim();
}

/** Aceita 'conta', '@conta' ou o link do perfil. Devolve o @ sem o '@', ou null. */
function normalizarConta(texto) {
  let t = String(texto || '').trim();
  const link = /threads\.(?:net|com)\/@?([A-Za-z0-9._]+)/i.exec(t);
  if (link) t = link[1];
  t = t.replace(/^@+/, '').trim().toLowerCase();
  return RE_CONTA.test(t) ? t : null;
}

// ----------------------------------------------------------------- arquivos
function extensaoDoNome(nome) {
  const m = /\.([a-z0-9]+)$/i.exec(nome || '');
  return m ? m[1].toLowerCase() : '';
}

/** Tipo (MIME) de uma foto ou vídeo; null se não for foto/vídeo. */
function tipoDe(arquivo) {
  const tipo = (arquivo.type || '').toLowerCase();
  if (tipo.startsWith('video/') || (tipo.startsWith('image/') && tipo !== 'image/svg+xml')) return tipo;
  return TIPO_POR_EXTENSAO[extensaoDoNome(arquivo.name)] || null;
}

function extensaoDe(midia) {
  const ext = extensaoDoNome(midia.nome);
  if (TIPO_POR_EXTENSAO[ext]) return ext === 'jpeg' ? 'jpg' : ext;
  return Object.keys(TIPO_POR_EXTENSAO).find(e => TIPO_POR_EXTENSAO[e] === midia.tipo) || 'bin';
}


// =============================================================================
// Banco de dados no celular (IndexedDB)
// =============================================================================
let db;

function pedido(req) {
  return new Promise((ok, falha) => { req.onsuccess = () => ok(req.result); req.onerror = () => falha(req.error); });
}

function abrirBanco() {
  return new Promise((ok, falha) => {
    const req = indexedDB.open('painel-threads', 1);
    req.onupgradeneeded = () => {
      const b = req.result;
      b.createObjectStore('config');
      b.createObjectStore('levas', { keyPath: 'id' }).createIndex('data', 'data');
      const pubs = b.createObjectStore('publicacoes', { keyPath: 'id' });
      pubs.createIndex('levaId', 'levaId');
      pubs.createIndex('contaId', 'contaId');
      b.createObjectStore('midias', { keyPath: 'id' }).createIndex('pubId', 'pubId');
    };
    req.onsuccess = () => {
      const banco = req.result;
      banco.onversionchange = () => { banco.close(); location.reload(); };
      ok(banco);
    };
    req.onerror = () => falha(req.error);
    req.onblocked = () => falha(new Error('feche as outras janelas do painel e abra de novo'));
  });
}

/** Grava tudo numa transação só. 'trabalho' recebe as lojas e só faz pedidos (sem await). */
function gravar(lojas, trabalho) {
  return new Promise((ok, falha) => {
    const t = db.transaction(lojas, 'readwrite');
    const s = {};
    lojas.forEach(n => { s[n] = t.objectStore(n); });
    t.oncomplete = () => { avisarOutrasJanelas(); ok(); };
    t.onerror = () => falha(t.error);
    t.onabort = () => falha(t.error || new Error('Não foi possível salvar.'));
    try { trabalho(s); } catch (erro) { falha(erro); try { t.abort(); } catch (_) { /* já encerrada */ } }
  });
}

function apagarMidiasDa(lojaMidias, pubId) {
  const cursor = lojaMidias.index('pubId').openKeyCursor(IDBKeyRange.only(pubId));
  cursor.onsuccess = () => {
    const c = cursor.result;
    if (c) { lojaMidias.delete(c.primaryKey); c.continue(); }
  };
}

async function midiasDa(pubId) {
  const lista = await pedido(db.transaction('midias').objectStore('midias').index('pubId').getAll(pubId));
  return lista.sort((a, b) => a.ordem - b.ordem);
}

// ----------------------------------------------------------------- estado em memória (sem as mídias)
const estado = { contas: [], levas: [], pubs: new Map(), ultimoBackup: null };

async function carregarEstado() {
  const t = db.transaction(['config', 'levas', 'publicacoes']);
  const [contas, ultimoBackup, levas, pubs] = await Promise.all([
    pedido(t.objectStore('config').get('contas')),
    pedido(t.objectStore('config').get('ultimoBackup')),
    pedido(t.objectStore('levas').getAll()),
    pedido(t.objectStore('publicacoes').getAll()),
  ]);
  estado.contas = contas || [];
  estado.ultimoBackup = ultimoBackup || null;
  estado.levas = levas;
  estado.pubs = new Map(pubs.map(p => [p.id, p]));
}

async function salvarContas(lista) {
  const ordenada = [...lista.filter(c => c.ativa), ...lista.filter(c => !c.ativa)];
  await gravar(['config'], s => s.config.put(ordenada, 'contas'));
  estado.contas = ordenada;
}

// Mantém outras janelas abertas do painel em dia
const canal = 'BroadcastChannel' in window ? new BroadcastChannel('painel-threads') : null;
let desatualizado = false;
function avisarOutrasJanelas() { if (canal) canal.postMessage('mudou'); }
async function recarregarSeVisivel() {
  if (!desatualizado || document.visibilityState !== 'visible') return;
  desatualizado = false;
  await carregarEstado();
  rolarParaTopo = false;
  render();
}
if (canal) canal.onmessage = () => { desatualizado = true; recarregarSeVisivel(); };
document.addEventListener('visibilitychange', recarregarSeVisivel);


// =============================================================================
// Regras: contas, levas e publicações
// =============================================================================
const contasAtivas = () => estado.contas.filter(c => c.ativa);
const contaPorId = id => estado.contas.find(c => c.id === id && c.ativa) || null;
const levaPorId = id => estado.levas.find(l => l.id === id) || null;
const idPub = (levaId, contaId) => `${levaId}:${contaId}`;
const rotuloLeva = l => `Leva ${l.numero}` + (l.nome ? ` · ${l.nome}` : '');

function situacao(levaId, contaId) {
  const p = estado.pubs.get(idPub(levaId, contaId));
  return !p ? 'pendente' : p.publicado ? 'publicado' : 'pronto';
}

// Por data; no mesmo dia, as que têm horário vêm primeiro (em ordem de horário)
function ordemLeva(a, b) {
  return a.data.localeCompare(b.data) || (a.horario === '') - (b.horario === '')
    || a.horario.localeCompare(b.horario) || a.numero - b.numero;
}

function resumir(leva) {
  const contas = contasAtivas();
  const estados = {};
  contas.forEach(c => { estados[c.id] = situacao(leva.id, c.id); });
  const valores = Object.values(estados);
  const feitas = valores.filter(e => e !== 'pendente').length;
  return Object.assign({}, leva, {
    rotulo: rotuloLeva(leva), estados, feitas, total: contas.length,
    publicadas: valores.filter(e => e === 'publicado').length,
    completa: contas.length > 0 && feitas === contas.length,
  });
}

function levasResumidas(inicio, fim) {
  return estado.levas.filter(l => (!inicio || l.data >= inicio) && (!fim || l.data <= fim))
    .sort(ordemLeva).map(resumir);
}

function proximoNumero(data) {
  return Math.max(0, ...estado.levas.filter(l => l.data === data).map(l => l.numero)) + 1;
}

/** Primeira conta depois da atual (dando a volta na lista) com situação em 'aceitas'. */
function proximaConta(atualId, estados, aceitas) {
  const ids = contasAtivas().map(c => c.id);
  const i = ids.indexOf(atualId);
  const ordem = i >= 0 ? ids.slice(i + 1).concat(ids.slice(0, i)) : ids;
  const id = ordem.find(c => aceitas.includes(estados[c]));
  return id ? contaPorId(id) : null;
}

function pastaLeva(leva) {
  const partes = [`Leva ${pad(leva.numero)}`];
  if (leva.horario) partes.push(leva.horario.replace(':', 'h'));
  if (leva.nome) partes.push(leva.nome);
  return partes.join(' - ');
}

function nomeParaBaixar(leva, conta, midia, i) {
  return `${conta.username}_${leva.data}_leva${leva.numero}_${pad(i + 1)}.${extensaoDe(midia)}`;
}


// =============================================================================
// Navegação
// =============================================================================
const ROTAS = [
  [/^#\/?$/, paginaInicio, 'inicio'],
  [/^#\/agenda(?:\/(\d{4}-\d{2}))?$/, paginaAgenda, 'agenda'],
  [/^#\/dia\/(\d{4}-\d{2}-\d{2})$/, paginaDia, 'agenda'],
  [/^#\/leva\/(\w+)(?:\/(\w+))?$/, paginaLeva, 'agenda'],
  [/^#\/contas$/, paginaContas, 'contas'],
  [/^#\/conta\/(\w+)$/, paginaConta, 'contas'],
  [/^#\/ajustes$/, paginaAjustes, 'ajustes'],
];

const avisos = [];
let rolarParaTopo = true;
let urlsTemporarias = [];
let numeroDoRender = 0;

function avisar(mensagem, tipo = 'ok') { avisos.push([mensagem, tipo]); }

function ir(destino, { manterRolagem = false } = {}) {
  rolarParaTopo = !manterRolagem;
  if ((location.hash || '#/') === destino) render(); else location.hash = destino;
}

function urlTemporaria(blob) {
  const url = URL.createObjectURL(blob);
  urlsTemporarias.push(url);
  return url;
}

async function render() {
  const meu = ++numeroDoRender;
  const antigas = urlsTemporarias;
  urlsTemporarias = [];
  const hash = location.hash || '#/';
  const rota = ROTAS.find(([re]) => re.test(hash));
  let html;
  try {
    html = rota ? await rota[1](...rota[0].exec(hash).slice(1)) : paginaErro('Página não encontrada.');
  } catch (erro) {
    console.error(erro);
    html = paginaErro('Algo deu errado: ' + ((erro && erro.message) || erro));
  }
  if (meu !== numeroDoRender) return;   // outra página foi aberta nesse meio-tempo
  const htmlAvisos = avisos.splice(0).map(([m, t]) => `<div class="aviso ${t}">${esc(m)}</div>`).join('');
  $('main').innerHTML = htmlAvisos + html;
  antigas.forEach(u => URL.revokeObjectURL(u));
  document.querySelectorAll('.topo a').forEach(a => a.classList.toggle('ativo', !!rota && a.dataset.menu === rota[2]));
  depoisDeMostrar();
  if (rolarParaTopo) window.scrollTo(0, 0);
  rolarParaTopo = true;
}

function depoisDeMostrar() {
  document.querySelectorAll('textarea[data-limite]').forEach(campo => {
    const saida = document.getElementById(campo.dataset.contador);
    const limite = +campo.dataset.limite;
    const atualizar = () => {
      const n = Array.from(campo.value).length;
      saida.textContent = `${n} / ${limite} caracteres`;
      saida.classList.toggle('excedeu', n > limite);
    };
    campo.addEventListener('input', atualizar);
    atualizar();
  });
  const selecionada = $('.chips .sel');
  if (selecionada) selecionada.scrollIntoView({ block: 'nearest', inline: 'center' });
  const espaco = $('#espaco');
  if (espaco) mostrarEspaco(espaco);
}


// =============================================================================
// Páginas
// =============================================================================
function paginaErro(mensagem) {
  return `<div class="cartao centro"><h1>😕</h1><p>${esc(mensagem)}</p>
    <a class="btn pri" href="#/">Voltar ao início</a></div>`;
}

function botaoNovaLeva(data, rotulo, classe = '') {
  return `<form data-form="nova-leva" data-data="${data}"><button type="submit" class="btn ${classe}">${rotulo}</button></form>`;
}

function barra(l) {
  const pct = l.total ? Math.round(1000 * l.feitas / l.total) / 10 : 0;
  return `<div class="barra"><i style="width:${pct}%"></i></div>`;
}

function cartaoInstalar() {
  if (instalado() || !pedidoDeInstalacao) return '';
  return `<div class="cartao centro"><p>📲 Instale o painel no celular para abrir pelo ícone, como um app.</p>
    <button type="button" class="btn pri" data-acao="instalar">Instalar app</button></div>`;
}

function lembreteBackup() {
  if (!estado.pubs.size) return '';
  const ultimo = estado.ultimoBackup ? Date.parse(estado.ultimoBackup) : 0;
  if (Date.now() - ultimo < DIAS_PARA_LEMBRAR_BACKUP * 864e5) return '';
  return `<div class="aviso info">💾 ${ultimo ? 'Faz tempo que você não faz backup.' : 'Você ainda não fez nenhum backup.'}
    As publicações ficam guardadas só neste celular. <a href="#/ajustes">Fazer backup</a></div>`;
}

// ----------------------------------------------------------------- início
function paginaInicio() {
  const contas = contasAtivas();
  const proximas = levasResumidas(hoje());
  let pendencia = null;
  for (const l of proximas) {
    const conta = contas.find(c => l.estados[c.id] === 'pendente');
    if (conta) { pendencia = { leva: l, conta }; break; }
  }
  const proximoDia = somarDias(proximas.length ? proximas[proximas.length - 1].data : hoje(), 1);

  let html = '<h1>🧵 Painel de Publicações</h1>' + cartaoInstalar();
  if (!contas.length) {
    html += `<div class="cartao destaque"><h2>Comece cadastrando suas contas</h2>
      <p>Adicione os @ das contas do Threads que você gerencia. Cada leva terá uma publicação para cada conta.</p>
      <a class="btn pri largo" href="#/contas">Cadastrar contas</a></div>`;
  } else if (pendencia) {
    const l = pendencia.leva;
    html += `<div class="cartao destaque"><div class="suave">Continuar de onde parou</div>
      <div class="acoes" style="margin-top:8px">
        <span class="tag">📅 ${diaRelativo(l.data)} · ${dataBr(l.data)}</span>
        <span class="tag amarela">${esc(l.rotulo)}${l.horario ? ' · ' + l.horario : ''}</span>
      </div>
      <p class="suave" style="margin:14px 0 2px">Próxima conta da fila</p>
      <div class="perfil-grande">@${esc(pendencia.conta.username)}</div>
      <div class="acoes"><a class="btn pri largo" href="#/leva/${l.id}/${pendencia.conta.id}">Criar publicação ➡️</a></div></div>`;
  } else {
    html += `<div class="cartao destaque centro">
      ${proximas.length ? '<p>🎉 <strong>Tudo pronto!</strong><br>Todas as levas agendadas têm publicação para todas as contas.</p>'
        : '<p>Nenhuma leva agendada a partir de hoje.</p>'}
      <div class="acoes" style="justify-content:center">
        ${botaoNovaLeva(hoje(), '➕ Nova leva hoje', 'pri')}
        ${botaoNovaLeva(proximoDia, `➡️ Nova leva em ${dataCurta(proximoDia)}`)}
      </div></div>`;
  }
  if (proximas.length) {
    html += `<div class="cartao"><h2>Próximas levas</h2>${proximas.slice(0, 8).map(l => `
      <a class="linha" href="#/leva/${l.id}">
        <span class="txt">${diaRelativo(l.data)} · ${esc(l.rotulo)}${l.horario ? ' · 🕒 ' + l.horario : ''}</span>
        <span class="tag ${l.completa ? 'verde' : 'amarela'}">${l.feitas}/${l.total}${l.publicadas ? ' · ✅ ' + l.publicadas : ''}</span>
      </a>`).join('')}
      ${proximas.length > 8 ? `<p class="suave" style="margin-top:8px">e mais ${proximas.length - 8} na agenda.</p>` : ''}</div>`;
  }
  html += lembreteBackup();
  html += `<div class="acoes"><a class="btn" href="#/agenda">📅 Abrir agenda</a>
    <a class="btn" href="#/dia/${hoje()}">Ver o dia de hoje</a></div>`;
  return html;
}

// ----------------------------------------------------------------- agenda
function paginaAgenda(mes) {
  const atual = new Date();
  let ano = atual.getFullYear();
  let m = atual.getMonth();
  if (mes) {
    const [a, b] = mes.split('-').map(Number);
    if (a >= 1970 && a <= 2999 && b >= 1 && b <= 12) { ano = a; m = b - 1; }
  }
  const primeiro = new Date(ano, m, 1);
  const cursor = new Date(ano, m, 1 - primeiro.getDay());   // semanas começam no domingo
  const semanas = [];
  do {
    const semana = [];
    for (let i = 0; i < 7; i++) { semana.push(isoDe(cursor)); cursor.setDate(cursor.getDate() + 1); }
    semanas.push(semana);
  } while (cursor.getMonth() === m);

  const porDia = {};
  levasResumidas(semanas[0][0], semanas[semanas.length - 1][6]).forEach(l => {
    (porDia[l.data] = porDia[l.data] || []).push(l.completa);
  });
  const hojeIso = hoje();
  const anterior = isoDe(new Date(ano, m - 1, 1)).slice(0, 7);
  const seguinte = isoDe(new Date(ano, m + 1, 1)).slice(0, 7);
  const titulo = `${MESES[m][0].toUpperCase()}${MESES[m].slice(1)} de ${ano}`;
  const mesAtual = ano === atual.getFullYear() && m === atual.getMonth();

  const dias = semanas.map(semana => semana.map(iso => {
    const levas = porDia[iso] || [];
    const classes = ['d'];
    if (+iso.slice(5, 7) - 1 !== m) classes.push('fora');
    if (iso === hojeIso) classes.push('hoje');
    return `<a class="${classes.join(' ')}" href="#/dia/${iso}"><span>${+iso.slice(8)}</span>${levas.length
      ? `<span class="pontos">${levas.slice(0, 6).map(c => `<i class="${c ? 'ok' : ''}"></i>`).join('')}</span>` : ''}</a>`;
  }).join('')).join('');

  return `<div class="cartao">
    <div class="par">
      <a class="btn-ic" href="#/agenda/${anterior}" aria-label="Mês anterior">◀</a>
      <div class="meio"><h1 style="margin:0">${titulo}</h1></div>
      <a class="btn-ic" href="#/agenda/${seguinte}" aria-label="Próximo mês">▶</a>
    </div>
    <div class="cal">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => `<div class="sem">${d}</div>`).join('')}${dias}</div>
    <p class="suave" style="margin:12px 0 0"><span class="pontos"><i class="ok"></i></span> leva completa &nbsp;
      <span class="pontos"><i></i></span> leva com contas faltando</p>
    ${mesAtual ? '' : '<div class="acoes"><a class="btn" href="#/agenda">Voltar para o mês atual</a></div>'}
  </div>
  <div class="cartao"><form data-form="ir-para-data">
    <label for="data" style="margin-top:0">⏩ Ir para uma data</label>
    <div class="form-linha"><input type="date" id="data" name="data" required><button type="submit" class="btn pri">Ir</button></div>
  </form></div>`;
}

// ----------------------------------------------------------------- dia
function paginaDia(data) {
  if (!lerData(data)) return paginaErro('Data inválida.');
  const levas = levasResumidas(data, data);
  const numero = proximoNumero(data);
  return `<div class="cartao"><div class="par">
      <a class="btn-ic" href="#/dia/${somarDias(data, -1)}" aria-label="Dia anterior">◀</a>
      <div class="meio"><h1 style="margin:0">${diaRelativo(data)}</h1><div class="suave">${dataExtenso(data)}</div></div>
      <a class="btn-ic" href="#/dia/${somarDias(data, 1)}" aria-label="Próximo dia">▶</a>
    </div></div>
    ${contasAtivas().length ? '' : '<div class="aviso info">Cadastre suas contas na aba <a href="#/contas">Contas</a> para montar as publicações.</div>'}
    ${levas.map(l => `<a class="cartao" href="#/leva/${l.id}">
      <div class="par"><strong>${esc(l.rotulo)}</strong>
        <span>${l.horario ? `<span class="tag">🕒 ${l.horario}</span> ` : ''}<span class="tag ${l.completa ? 'verde' : 'amarela'}">${l.feitas}/${l.total}</span></span>
      </div>${barra(l)}
      <div class="suave">${plural(l.feitas, 'pronta', 'prontas')} · ${plural(l.publicadas, 'publicada', 'publicadas')}${l.completa ? ' · completa 🎉' : ''}</div>
    </a>`).join('') || '<div class="cartao centro suave">Nenhuma leva neste dia ainda.</div>'}
    <div class="cartao"><h2>➕ Nova leva ${data === hoje() ? 'hoje' : 'neste dia'}</h2>
      <form data-form="nova-leva" data-data="${data}">
        <label for="nome">Nome (opcional)</label>
        <input type="text" id="nome" name="nome" maxlength="40" placeholder="Ex.: Manhã, Promoção">
        <label for="horario">Horário (opcional)</label>
        <input type="time" id="horario" name="horario">
        <div class="acoes"><button type="submit" class="btn pri largo">Criar Leva ${numero}</button></div>
      </form></div>
    <div class="acoes"><a class="btn" href="#/agenda/${data.slice(0, 7)}">📅 Ver na agenda</a></div>`;
}

// ----------------------------------------------------------------- leva
async function paginaLeva(levaId, contaId) {
  const leva = levaPorId(levaId);
  if (!leva) return paginaErro('Essa leva não existe mais.');
  const r = resumir(leva);
  const contas = contasAtivas();
  let conta = contas.find(c => c.id === contaId) || null;
  if (!conta) conta = contas.find(c => r.estados[c.id] === 'pendente') || contas[0] || null;
  const sit = conta ? r.estados[conta.id] : null;
  const existe = !!sit && sit !== 'pendente';
  const pub = existe ? estado.pubs.get(idPub(leva.id, conta.id)) : null;
  const midias = existe ? await midiasDa(pub.id) : [];
  const i = conta ? contas.indexOf(conta) : 0;
  const anterior = conta && i > 0 ? contas[i - 1] : null;
  const seguinte = conta && i < contas.length - 1 ? contas[i + 1] : null;
  const diaSeguinte = somarDias(leva.data, 1);

  let html = `<a class="voltar" href="#/dia/${leva.data}">← ${dataExtenso(leva.data)}</a>
  <div class="cartao">
    <div class="par"><div><h1 style="margin:0">${esc(r.rotulo)}</h1>
      <div class="suave">${dataBr(leva.data)}${leva.horario ? ' · 🕒 ' + leva.horario : ''}</div></div>
      <span class="tag ${r.completa ? 'verde' : 'amarela'}">${r.feitas}/${r.total}</span></div>
    ${barra(r)}
    <div class="suave">${r.feitas} de ${r.total} ${r.feitas === 1 ? 'pronta' : 'prontas'} · ${plural(r.publicadas, 'publicada', 'publicadas')}</div>
    <details><summary>⚙️ Editar ou excluir esta leva</summary>
      <form data-form="editar-leva" data-leva="${leva.id}">
        <label for="nome-leva">Nome (opcional)</label>
        <input type="text" id="nome-leva" name="nome" value="${esc(leva.nome)}" maxlength="40" placeholder="Ex.: Manhã, Promoção">
        <label for="horario-leva">Horário (opcional)</label>
        <input type="time" id="horario-leva" name="horario" value="${leva.horario}">
        <label for="data-leva">Data (mude para reagendar a leva)</label>
        <input type="date" id="data-leva" name="data" value="${leva.data}" required>
        <div class="acoes"><button type="submit" class="btn pri">Salvar leva</button></div>
      </form>
      <div class="acoes"><button type="button" class="btn perigo" data-acao="excluir-leva" data-leva="${leva.id}"
        data-confirmar="Excluir a ${esc(r.rotulo)} de ${dataBr(leva.data)}? As publicações, fotos e vídeos dela serão apagados.">🗑️ Excluir leva</button></div>
    </details>
  </div>`;

  if (r.completa) {
    html += `<div class="cartao centro">🎉 <strong>Leva completa!</strong> Todas as contas têm publicação.
      <div class="acoes" style="justify-content:center">
        ${botaoNovaLeva(leva.data, '➕ Nova leva neste dia', 'pri')}
        ${botaoNovaLeva(diaSeguinte, `➡️ Nova leva em ${dataCurta(diaSeguinte)}`)}
      </div></div>`;
  }

  if (!conta) {
    return html + `<div class="cartao centro"><p>Cadastre suas contas para montar as publicações desta leva.</p>
      <a class="btn pri" href="#/contas">Cadastrar contas</a></div>`;
  }

  html += `<nav class="chips" aria-label="Contas">${contas.map(c => `<a class="chip${c === conta ? ' sel' : ''}"
    href="#/leva/${leva.id}/${c.id}">${ESTADOS[r.estados[c.id]].icone} @${esc(c.username)}</a>`).join('')}</nav>`;

  const galeria = midias.map((m, n) => {
    const url = urlTemporaria(m.blob);
    const previa = m.tipo.startsWith('video/')
      ? `<video src="${url}" controls preload="metadata" playsinline></video>`
      : `<img src="${url}" alt="${esc(m.nome)}" loading="lazy">`;
    return `<figure>${previa}<figcaption>
      <a href="${url}" download="${esc(nomeParaBaixar(leva, conta, m, n))}">⬇️ Baixar</a>
      <label><input type="checkbox" name="remover" value="${esc(m.id)}"> Remover</label></figcaption></figure>`;
  }).join('');
  const e = ESTADOS[sit];

  html += `<div class="cartao">
    <div class="par">
      ${anterior ? `<a class="btn-ic" href="#/leva/${leva.id}/${anterior.id}" aria-label="Conta anterior">◀</a>` : '<span class="btn-ic vazio"></span>'}
      <div class="meio"><div class="perfil-grande">@${esc(conta.username)}</div><span class="tag ${e.cor}">${e.icone} ${e.texto}</span></div>
      ${seguinte ? `<a class="btn-ic" href="#/leva/${leva.id}/${seguinte.id}" aria-label="Próxima conta">▶</a>` : '<span class="btn-ic vazio"></span>'}
    </div>
    <form data-form="salvar-publicacao" data-leva="${leva.id}" data-conta="${conta.id}">
      ${midias.length ? `<label>Fotos e vídeos</label><div class="galeria">${galeria}</div>` : ''}
      <label for="arquivos">${midias.length ? 'Adicionar mais fotos ou vídeos' : 'Fotos ou vídeos'}</label>
      <input type="file" id="arquivos" name="arquivos" accept="image/*,video/*" multiple>
      <label for="legenda">Texto da publicação</label>
      <textarea id="legenda" name="legenda" data-limite="${LIMITE_CARACTERES}" data-contador="contador"
        placeholder="Escreva ou cole o texto do post…">${esc(pub ? pub.legenda : '')}</textarea>
      <div class="contador" id="contador"></div>
      <div class="acoes">
        <button type="submit" class="btn pri">${existe ? '💾 Salvar alterações' : '💾 Salvar e ir para a próxima'}</button>
        <button type="button" class="btn" data-acao="copiar" data-alvo="legenda">📋 Copiar texto</button>
        ${existe ? `<button type="button" class="btn" data-acao="compartilhar" data-leva="${leva.id}" data-conta="${conta.id}">📤 Compartilhar</button>` : ''}
      </div>
      ${existe ? '<p class="dica">📤 Compartilhar abre a lista de apps: escolha o Threads. O texto já vai copiado, é só colar.</p>' : ''}
    </form>`;
  if (existe) {
    html += `<div class="acoes">
      <button type="button" class="btn${sit === 'publicado' ? '' : ' verde'}" data-acao="marcar-publicado" data-leva="${leva.id}" data-conta="${conta.id}">
        ${sit === 'publicado' ? '↩️ Desmarcar publicada' : '✅ Já publiquei no Threads'}</button>
      <button type="button" class="btn perigo" data-acao="excluir-publicacao" data-leva="${leva.id}" data-conta="${conta.id}"
        data-confirmar="Excluir a publicação de @${esc(conta.username)} nesta leva? O texto, as fotos e os vídeos dela serão apagados.">🗑️ Excluir</button>
    </div>`;
  }
  return html + '</div>';
}

// ----------------------------------------------------------------- contas
function paginaContas() {
  const contas = contasAtivas();
  let html = `<h1>👤 Suas contas do Threads</h1>
  <div class="cartao"><h2>Adicionar contas</h2>
    <form data-form="adicionar-contas">
      <textarea name="usernames" style="min-height:100px" autocapitalize="none" autocomplete="off" spellcheck="false"
        placeholder="@minhaconta&#10;@outraconta&#10;https://www.threads.com/@maisuma"></textarea>
      <p class="suave" style="margin-top:6px">Uma por linha ou separadas por vírgula, com ou sem @. Pode colar a lista inteira de uma vez, ou o link do perfil.</p>
      <button type="submit" class="btn pri largo">Adicionar</button>
    </form></div>`;
  if (contas.length) {
    html += `<div class="cartao"><h2>${plural(contas.length, 'conta', 'contas')}</h2>
      <p class="suave">Esta é a ordem da fila em cada leva. Use ▲ ▼ para reorganizar.</p>
      ${contas.map((c, i) => `<div class="item" id="c-${c.id}">
        <div class="ordem">
          <button type="button" class="btn-ic mini" data-acao="mover-conta" data-conta="${c.id}" data-direcao="cima" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="btn-ic mini" data-acao="mover-conta" data-conta="${c.id}" data-direcao="baixo" aria-label="Descer" ${i === contas.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <div class="info">
          <a class="perfil" href="#/conta/${c.id}">@${esc(c.username)}</a><br>
          <a class="suave" href="#/conta/${c.id}">ver publicações desta conta →</a>
          <details><summary>Editar ou remover</summary>
            <form data-form="editar-conta" data-conta="${c.id}" class="form-linha">
              <input type="text" name="username" value="${esc(c.username)}" aria-label="Novo @" autocapitalize="none" autocomplete="off" spellcheck="false" required>
              <button type="submit" class="btn">Salvar</button>
            </form>
            <div class="acoes"><button type="button" class="btn perigo" data-acao="remover-conta" data-conta="${c.id}"
              data-confirmar="Remover @${esc(c.username)} da lista? As publicações dela ficam guardadas e voltam se você adicionar a conta de novo.">Remover da lista</button></div>
          </details>
        </div>
      </div>`).join('')}</div>`;
  }
  return html;
}

function paginaConta(contaId) {
  const conta = contaPorId(contaId);
  if (!conta) return paginaErro('Essa conta não está na lista.');
  const hojeIso = hoje();
  const desde = somarDias(hojeIso, -60);
  const pendentes = [], proximas = [], anteriores = [];
  [...estado.levas].sort(ordemLeva).forEach(leva => {
    if (leva.data < desde) return;
    const sit = situacao(leva.id, conta.id);
    const pub = estado.pubs.get(idPub(leva.id, conta.id));
    const item = { leva, sit, trecho: pub ? pub.legenda.split(/\s+/).join(' ').slice(0, 90) : '' };
    if (leva.data >= hojeIso) (sit === 'pendente' ? pendentes : proximas).push(item);
    else if (sit !== 'pendente') anteriores.push(item);
  });
  const linha = ({ leva, sit, trecho }, relativo) => `<a class="linha" href="#/leva/${leva.id}/${conta.id}">
    <span class="txt">${relativo ? diaRelativo(leva.data) : dataCurta(leva.data)} · ${esc(rotuloLeva(leva))}<span class="trecho">${esc(trecho) || 'Sem texto'}</span></span>
    <span class="tag ${ESTADOS[sit].cor}">${ESTADOS[sit].icone}</span></a>`;

  return `<a class="voltar" href="#/contas">← Contas</a>
  <nav class="chips" aria-label="Contas">${contasAtivas().map(c => `<a class="chip${c === conta ? ' sel' : ''}" href="#/conta/${c.id}">@${esc(c.username)}</a>`).join('')}</nav>
  <h1>@${esc(conta.username)}</h1>
  <div class="cartao"><h2>⏳ Falta criar</h2>${pendentes.map(({ leva }) => `<a class="linha" href="#/leva/${leva.id}/${conta.id}">
      <span class="txt">${diaRelativo(leva.data)} · ${esc(rotuloLeva(leva))}${leva.horario ? ' · 🕒 ' + leva.horario : ''}</span>
      <span class="tag amarela">Criar →</span></a>`).join('')
    || '<p class="suave">Nenhuma leva pendente para esta conta a partir de hoje. 👍</p>'}</div>
  <div class="cartao"><h2>📅 Próximas publicações</h2>${proximas.map(x => linha(x, true)).join('')
    || '<p class="suave">Nada criado para os próximos dias.</p>'}</div>
  ${anteriores.length ? `<div class="cartao"><h2>🗂️ Últimos 60 dias</h2>${anteriores.reverse().map(x => linha(x, false)).join('')}</div>` : ''}`;
}

// ----------------------------------------------------------------- ajustes
function paginaAjustes() {
  let instalar;
  if (instalado()) instalar = '<p>O painel está instalado neste celular. ✅</p>';
  else if (pedidoDeInstalacao) instalar = '<button type="button" class="btn pri largo" data-acao="instalar">📲 Instalar app</button>';
  else instalar = '<p class="suave">Para instalar: no Chrome, toque no menu ⋮ e depois em <strong>Instalar app</strong> (ou <strong>Adicionar à tela inicial</strong>).</p>';
  const ultimo = estado.ultimoBackup ? new Date(estado.ultimoBackup).toLocaleDateString('pt-BR') : 'nenhum ainda';
  return `<h1>⚙️ Ajustes</h1>
  <div class="cartao"><h2>📲 App no celular</h2>${instalar}</div>
  <div class="cartao"><h2>💾 Backup</h2>
    <p class="suave">As publicações ficam guardadas só neste celular, dentro do app. Baixe um backup de vez em quando:
      ele protege contra perdas e serve para passar tudo para outro celular.</p>
    <p class="suave">Último backup: <strong>${ultimo}</strong></p>
    <button type="button" class="btn pri largo" data-acao="baixar-backup">⬇️ Baixar backup (.zip)</button>
    <form data-form="restaurar-backup">
      <label for="backup">Restaurar um backup</label>
      <input type="file" id="backup" name="backup" accept=".zip,application/zip" required>
      <div class="acoes"><button type="submit" class="btn largo">Restaurar backup</button></div>
    </form>
  </div>
  <div class="cartao"><h2>📦 Espaço usado</h2><p id="espaco" class="suave">Calculando…</p></div>
  <p class="centro suave">Painel de Publicações · versão ${VERSAO_APP}</p>`;
}

async function mostrarEspaco(elemento) {
  if (!navigator.storage || !navigator.storage.estimate) { elemento.textContent = 'Este navegador não informa o espaço usado.'; return; }
  try {
    const { usage, quota } = await navigator.storage.estimate();
    const guardado = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    elemento.innerHTML = `Usando <strong>${formatarBytes(usage || 0)}</strong> de ${formatarBytes(quota || 0)} disponíveis.<br>`
      + (guardado ? '🔒 Os dados estão protegidos contra limpeza automática do navegador.'
        : 'Instale o app para o navegador não apagar os dados quando o celular ficar sem espaço.');
  } catch (_) { elemento.textContent = 'Não foi possível calcular o espaço usado.'; }
}


// =============================================================================
// Ações dos formulários e botões
// =============================================================================
async function adicionarContas(form, dados) {
  const itens = String(dados.get('usernames') || '').split(/[\s,;]+/).filter(Boolean);
  const contas = estado.contas.map(c => Object.assign({}, c));
  const adicionadas = [], invalidas = [];
  for (const item of itens) {
    const username = normalizarConta(item);
    if (!username) { invalidas.push(item); continue; }
    const existente = contas.find(c => c.username === username);
    if (existente && existente.ativa) continue;
    if (existente) {                       // conta removida antes: volta com as publicações dela
      contas.splice(contas.indexOf(existente), 1);
      existente.ativa = true;
      contas.push(existente);
    } else {
      contas.push({ id: novoId(), username, ativa: true });
    }
    adicionadas.push(username);
  }
  if (adicionadas.length) {
    await salvarContas(contas);
    const nomes = adicionadas.slice(0, 10).map(u => '@' + u).join(', ') + (adicionadas.length > 10 ? ' …' : '');
    avisar(`${plural(adicionadas.length, 'conta adicionada', 'contas adicionadas')}: ${nomes}`);
  }
  if (invalidas.length) avisar('Não reconheci como @ do Threads: ' + invalidas.slice(0, 10).join(', '), 'erro');
  if (!adicionadas.length && !invalidas.length) avisar('Nenhuma conta nova para adicionar.', 'info');
  ir('#/contas');
}

async function editarConta(form, dados) {
  const conta = contaPorId(form.dataset.conta);
  if (!conta) return;
  const novo = normalizarConta(dados.get('username'));
  if (!novo) { alert('Esse @ não é válido.'); return; }
  if (novo === conta.username) return;
  const outra = estado.contas.find(c => c.username === novo);
  if (outra) {
    alert(outra.ativa ? `@${novo} já está na lista.` : `@${novo} foi removida antes. Para trazê-la de volta, adicione pelo campo "Adicionar contas".`);
    return;
  }
  await salvarContas(estado.contas.map(c => (c.id === conta.id ? Object.assign({}, c, { username: novo }) : c)));
  avisar(`@${conta.username} agora é @${novo}.`);
  ir('#/contas', { manterRolagem: true });
}

async function moverConta(botao) {
  const ativas = contasAtivas();
  const i = ativas.findIndex(c => c.id === botao.dataset.conta);
  const j = botao.dataset.direcao === 'cima' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ativas.length) return;
  [ativas[i], ativas[j]] = [ativas[j], ativas[i]];
  await salvarContas(ativas.concat(estado.contas.filter(c => !c.ativa)));
  ir('#/contas', { manterRolagem: true });
}

async function removerConta(botao) {
  const conta = contaPorId(botao.dataset.conta);
  if (!conta) return;
  await salvarContas(estado.contas.map(c => (c.id === conta.id ? Object.assign({}, c, { ativa: false }) : c)));
  avisar(`@${conta.username} saiu da lista. As publicações dela ficam guardadas e voltam se você adicionar a conta de novo.`);
  ir('#/contas', { manterRolagem: true });
}

async function novaLeva(form, dados) {
  const data = form.dataset.data;
  if (!lerData(data)) return;
  const leva = {
    id: novoId(), data, numero: proximoNumero(data), nome: limparNome(dados.get('nome')),
    horario: lerHorario(dados.get('horario')), criadaEm: agora(),
  };
  await gravar(['levas'], s => s.levas.put(leva));
  estado.levas.push(leva);
  avisar(`${rotuloLeva(leva)} criada para ${dataBr(data)}.`);
  ir(`#/leva/${leva.id}`);
}

async function editarLeva(form, dados) {
  const leva = levaPorId(form.dataset.leva);
  if (!leva) return;
  const novaData = lerData(dados.get('data')) ? dados.get('data') : leva.data;
  const atualizada = Object.assign({}, leva, { nome: limparNome(dados.get('nome')), horario: lerHorario(dados.get('horario')) });
  if (novaData !== leva.data) Object.assign(atualizada, { data: novaData, numero: proximoNumero(novaData) });
  await gravar(['levas'], s => s.levas.put(atualizada));
  estado.levas = estado.levas.map(l => (l.id === leva.id ? atualizada : l));
  avisar('Leva atualizada.' + (novaData !== leva.data ? ` Agora ela é a ${rotuloLeva(atualizada)} de ${dataBr(novaData)}.` : ''));
  ir(`#/leva/${leva.id}`);
}

async function excluirLeva(botao) {
  const leva = levaPorId(botao.dataset.leva);
  if (!leva) return;
  const pubs = [...estado.pubs.values()].filter(p => p.levaId === leva.id);
  await gravar(['levas', 'publicacoes', 'midias'], s => {
    s.levas.delete(leva.id);
    pubs.forEach(p => { s.publicacoes.delete(p.id); apagarMidiasDa(s.midias, p.id); });
  });
  estado.levas = estado.levas.filter(l => l.id !== leva.id);
  pubs.forEach(p => estado.pubs.delete(p.id));
  avisar(`${rotuloLeva(leva)} de ${dataBr(leva.data)} excluída.`);
  ir(`#/dia/${leva.data}`);
}

async function salvarPublicacao(form, dados) {
  const leva = levaPorId(form.dataset.leva);
  const conta = contaPorId(form.dataset.conta);
  if (!leva || !conta) return;
  const id = idPub(leva.id, conta.id);
  const existente = estado.pubs.get(id) || null;
  const legenda = String(dados.get('legenda') || '').replace(/\r\n/g, '\n').trim();
  const arquivos = dados.getAll('arquivos').filter(a => a && typeof a === 'object' && a.name);
  const recusados = arquivos.filter(a => !tipoDe(a));
  if (recusados.length) {
    alert('Formato não aceito: ' + recusados.map(a => a.name).join(', ') + '. Envie fotos ou vídeos.');
    return;
  }
  const remover = new Set(dados.getAll('remover'));
  const atuais = existente ? await midiasDa(id) : [];
  const ficam = atuais.filter(m => !remover.has(m.id));
  if (!legenda && !arquivos.length && !ficam.length) {
    alert('Escreva um texto ou adicione pelo menos uma foto ou vídeo.');
    return;
  }
  let ordem = Math.max(0, ...atuais.map(m => m.ordem));
  const novas = arquivos.map(a => ({
    id: novoId(), pubId: id, nome: a.name, tipo: tipoDe(a), tamanho: a.size, ordem: ++ordem, blob: a,
  }));
  const pub = {
    id, levaId: leva.id, contaId: conta.id, legenda,
    publicado: existente ? existente.publicado : false,
    publicadoEm: existente ? existente.publicadoEm || null : null,
    criadaEm: existente ? existente.criadaEm : agora(), atualizadaEm: agora(),
  };
  await gravar(['publicacoes', 'midias'], s => {
    s.publicacoes.put(pub);
    atuais.filter(m => remover.has(m.id)).forEach(m => s.midias.delete(m.id));
    novas.forEach(m => s.midias.put(m));
  });
  estado.pubs.set(id, pub);

  if (existente) {
    avisar(`Publicação de @${conta.username} atualizada.`);
    ir(`#/leva/${leva.id}/${conta.id}`);
    return;
  }
  const proxima = proximaConta(conta.id, resumir(leva).estados, ['pendente']);
  if (proxima) {
    avisar(`@${conta.username} pronta! Próxima da fila: @${proxima.username}.`);
    ir(`#/leva/${leva.id}/${proxima.id}`);
  } else {
    avisar(`🎉 ${rotuloLeva(leva)} completa: todas as contas têm publicação!`);
    ir(`#/leva/${leva.id}/${conta.id}`);
  }
}

async function marcarPublicado(botao) {
  const leva = levaPorId(botao.dataset.leva);
  const conta = contaPorId(botao.dataset.conta);
  const pub = leva && conta ? estado.pubs.get(idPub(leva.id, conta.id)) : null;
  if (!pub) return;
  const novo = Object.assign({}, pub, { publicado: !pub.publicado, publicadoEm: pub.publicado ? null : agora(), atualizadaEm: agora() });
  await gravar(['publicacoes'], s => s.publicacoes.put(novo));
  estado.pubs.set(pub.id, novo);
  if (!novo.publicado) {
    avisar(`@${conta.username} voltou para “pronta para publicar”.`);
    ir(`#/leva/${leva.id}/${conta.id}`, { manterRolagem: true });
    return;
  }
  const proxima = proximaConta(conta.id, resumir(leva).estados, ['pronto']);
  if (proxima) {
    avisar(`✅ @${conta.username} publicada. Próxima a publicar: @${proxima.username}.`);
    ir(`#/leva/${leva.id}/${proxima.id}`);
  } else {
    avisar(`✅ @${conta.username} publicada.`);
    ir(`#/leva/${leva.id}/${conta.id}`, { manterRolagem: true });
  }
}

async function excluirPublicacao(botao) {
  const leva = levaPorId(botao.dataset.leva);
  const conta = contaPorId(botao.dataset.conta);
  if (!leva || !conta) return;
  const id = idPub(leva.id, conta.id);
  await gravar(['publicacoes', 'midias'], s => { s.publicacoes.delete(id); apagarMidiasDa(s.midias, id); });
  estado.pubs.delete(id);
  avisar(`Publicação de @${conta.username} excluída desta leva.`);
  ir(`#/leva/${leva.id}/${conta.id}`);
}

async function copiarParaAreaDeTransferencia(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(campo);
  campo.select();
  const ok = document.execCommand('copy');
  campo.remove();
  if (!ok) throw new Error('não foi possível copiar');
}

async function copiarTexto(botao) {
  const campo = document.getElementById(botao.dataset.alvo);
  try {
    await copiarParaAreaDeTransferencia(campo.value);
  } catch (_) {
    campo.focus();
    campo.select();
    document.execCommand('copy');
  }
  const original = botao.textContent;
  botao.textContent = '✔️ Copiado!';
  setTimeout(() => { botao.textContent = original; }, 1500);
}

async function compartilhar(botao) {
  const leva = levaPorId(botao.dataset.leva);
  const conta = contaPorId(botao.dataset.conta);
  if (!leva || !conta) return;
  const id = idPub(leva.id, conta.id);
  if (!estado.pubs.get(id)) return;
  const campo = $('#legenda');
  const legenda = (campo ? campo.value : estado.pubs.get(id).legenda).trim();
  const midias = await midiasDa(id);
  const arquivos = midias.map((m, i) => new File([m.blob], nomeParaBaixar(leva, conta, m, i), { type: m.tipo }));
  const aceitos = navigator.canShare ? arquivos.filter(f => navigator.canShare({ files: [f] })) : [];
  if (legenda) { try { await copiarParaAreaDeTransferencia(legenda); } catch (_) { /* segue sem copiar */ } }
  if (!navigator.share) {
    alert('Este navegador não tem a opção de compartilhar. Use "Baixar" nas fotos e vídeos e "Copiar texto".');
    return;
  }
  const conteudo = {};
  if (aceitos.length) conteudo.files = aceitos;
  if (legenda) conteudo.text = legenda;
  if (!conteudo.files && !conteudo.text) {
    alert('Esses arquivos não podem ser compartilhados por aqui. Use "Baixar".');
    return;
  }
  try {
    await navigator.share(conteudo);
  } catch (erro) {
    if (erro && erro.name === 'AbortError') return;   // a pessoa fechou a lista de apps
    alert('Não foi possível compartilhar: ' + ((erro && erro.message) || erro));
    return;
  }
  if (aceitos.length < arquivos.length) {
    alert(`${plural(arquivos.length - aceitos.length, 'arquivo não pôde', 'arquivos não puderam')} ser compartilhado(s) por aqui. Use "Baixar" para salvar no celular.`);
  }
}


// =============================================================================
// Backup em .zip (sem compressão: as fotos e vídeos já são compactados)
// =============================================================================
const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

async function crcDe(blob) {
  let crc = 0xFFFFFFFF;
  const PEDACO = 4 * 1024 * 1024;
  for (let inicio = 0; inicio < blob.size; inicio += PEDACO) {
    const bytes = new Uint8Array(await blob.slice(inicio, inicio + PEDACO).arrayBuffer());
    for (let i = 0; i < bytes.length; i++) crc = TABELA_CRC[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

async function montarZip(entradas, progresso) {
  const codificador = new TextEncoder();
  const agoraData = new Date();
  const hora = (agoraData.getHours() << 11) | (agoraData.getMinutes() << 5) | (agoraData.getSeconds() >> 1);
  const dia = ((agoraData.getFullYear() - 1980) << 9) | ((agoraData.getMonth() + 1) << 5) | agoraData.getDate();
  const partes = [], central = [];
  let deslocamento = 0;
  for (let n = 0; n < entradas.length; n++) {
    if (progresso) progresso(n, entradas.length);
    const { caminho, blob } = entradas[n];
    const nome = codificador.encode(caminho);
    const crc = await crcDe(blob);
    const tamanho = blob.size;
    if (deslocamento + 30 + nome.length + tamanho > 0xFFFFFFFF || entradas.length > 0xFFFF) {
      throw new Error('O backup passou de 4 GB. Exclua levas antigas e tente de novo.');
    }
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);          // nomes em UTF-8
    local.setUint16(8, 0, true);               // sem compressão
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, tamanho, true);
    local.setUint32(22, tamanho, true);
    local.setUint16(26, nome.length, true);
    partes.push(local.buffer, nome, blob);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, tamanho, true);
    c.setUint32(24, tamanho, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, deslocamento, true);
    central.push(c.buffer, nome);
    deslocamento += 30 + nome.length + tamanho;
  }
  const tamanhoCentral = central.reduce((soma, p) => soma + p.byteLength, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, entradas.length, true);
  fim.setUint16(10, entradas.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);
  return new Blob(partes.concat(central, [fim.buffer]), { type: 'application/zip' });
}

async function lerZip(arquivo) {
  const tamanho = arquivo.size;
  const final = new DataView(await arquivo.slice(Math.max(0, tamanho - 65557), tamanho).arrayBuffer());
  let p = -1;
  for (let i = final.byteLength - 22; i >= 0; i--) {
    if (final.getUint32(i, true) === 0x06054b50) { p = i; break; }
  }
  if (p < 0) throw new Error('Esse arquivo não é um .zip de backup do painel.');
  const total = final.getUint16(p + 10, true);
  const tamanhoCentral = final.getUint32(p + 12, true);
  const inicioCentral = final.getUint32(p + 16, true);
  const central = new DataView(await arquivo.slice(inicioCentral, inicioCentral + tamanhoCentral).arrayBuffer());
  const decodificador = new TextDecoder();
  const entradas = new Map();
  let q = 0;
  for (let n = 0; n < total; n++) {
    if (central.getUint32(q, true) !== 0x02014b50) throw new Error('O arquivo de backup está danificado.');
    const tamanhoNome = central.getUint16(q + 28, true);
    entradas.set(decodificador.decode(new Uint8Array(central.buffer, q + 46, tamanhoNome)), {
      metodo: central.getUint16(q + 10, true),
      compactado: central.getUint32(q + 20, true),
      local: central.getUint32(q + 42, true),
    });
    q += 46 + tamanhoNome + central.getUint16(q + 30, true) + central.getUint16(q + 32, true);
  }
  return {
    async blob(nome) {
      const e = entradas.get(nome);
      if (!e) return null;
      const cabecalho = new DataView(await arquivo.slice(e.local, e.local + 30).arrayBuffer());
      if (cabecalho.getUint32(0, true) !== 0x04034b50) throw new Error('O arquivo de backup está danificado.');
      const inicio = e.local + 30 + cabecalho.getUint16(26, true) + cabecalho.getUint16(28, true);
      const dados = arquivo.slice(inicio, inicio + e.compactado);
      if (e.metodo === 0) return dados;
      if (e.metodo === 8 && 'DecompressionStream' in window) {
        return new Response(dados.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      }
      throw new Error('Não consegui ler esse .zip. Use o arquivo de backup original, baixado pelo painel.');
    },
  };
}

async function entradasDoBackup() {
  const contasPorId = new Map(estado.contas.map(c => [c.id, c]));
  const levasPorId = new Map(estado.levas.map(l => [l.id, l]));
  const pubs = [...estado.pubs.values()];
  const entradas = [], listaMidias = [];
  for (const pub of pubs) {
    const leva = levasPorId.get(pub.levaId);
    const conta = contasPorId.get(pub.contaId);
    if (!leva || !conta) continue;
    const pasta = `${leva.data}/${pastaLeva(leva)}/@${conta.username}`;
    entradas.push({ caminho: `${pasta}/legenda.txt`, blob: new Blob([pub.legenda], { type: 'text/plain' }) });
    (await midiasDa(pub.id)).forEach((m, i) => {
      const caminho = `${pasta}/midia_${pad(i + 1)}.${extensaoDe(m)}`;
      entradas.push({ caminho, blob: m.blob });
      listaMidias.push({ id: m.id, pubId: m.pubId, nome: m.nome, tipo: m.tipo, ordem: m.ordem, arquivo: caminho });
    });
  }
  const painel = {
    app: ASSINATURA_BACKUP, versao: 1, exportadoEm: agora(), autoria: AUTORIA,
    contas: estado.contas, levas: estado.levas, publicacoes: pubs, midias: listaMidias,
  };
  entradas.unshift({ caminho: 'painel.json', blob: new Blob([JSON.stringify(painel, null, 2)], { type: 'application/json' }) });
  return entradas;
}

async function baixarBackup(botao) {
  const original = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Preparando backup…';
  try {
    const entradas = await entradasDoBackup();
    const zip = await montarZip(entradas, (n, total) => { botao.textContent = `Preparando backup… ${n + 1}/${total}`; });
    const nome = `backup-painel-${hoje()}.zip`;
    const url = URL.createObjectURL(zip);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    const quando = agora();
    await gravar(['config'], s => s.config.put(quando, 'ultimoBackup'));
    estado.ultimoBackup = quando;
    avisar(`Backup baixado: ${nome} (${formatarBytes(zip.size)}). Guarde uma cópia fora do celular, como no Google Drive.`);
    ir('#/ajustes', { manterRolagem: true });
  } finally {
    if (botao.isConnected) { botao.disabled = false; botao.textContent = original; }
  }
}

function validarBackup(c) {
  if (!c || c.app !== ASSINATURA_BACKUP || !Array.isArray(c.contas) || !Array.isArray(c.levas)) {
    throw new Error('Esse arquivo não é um backup do Painel de Publicações.');
  }
  const contas = c.contas.filter(x => x && typeof x.id === 'string' && RE_CONTA.test(x.username || ''))
    .map(x => ({ id: x.id, username: x.username, ativa: x.ativa !== false }));
  const idsContas = new Set(contas.map(x => x.id));
  const levas = c.levas.filter(l => l && typeof l.id === 'string' && lerData(l.data)).map(l => ({
    id: l.id, data: l.data, numero: Number.isInteger(l.numero) && l.numero > 0 ? l.numero : 1,
    nome: limparNome(l.nome), horario: lerHorario(l.horario), criadaEm: l.criadaEm || agora(),
  }));
  const idsLevas = new Set(levas.map(l => l.id));
  const pubs = (Array.isArray(c.publicacoes) ? c.publicacoes : [])
    .filter(p => p && idsLevas.has(p.levaId) && idsContas.has(p.contaId))
    .map(p => ({
      id: idPub(p.levaId, p.contaId), levaId: p.levaId, contaId: p.contaId, legenda: String(p.legenda || ''),
      publicado: !!p.publicado, publicadoEm: p.publicadoEm || null,
      criadaEm: p.criadaEm || agora(), atualizadaEm: p.atualizadaEm || agora(),
    }));
  return { contas, levas, pubs, midias: Array.isArray(c.midias) ? c.midias : [], exportadoEm: c.exportadoEm };
}

async function restaurarBackup(form, dados) {
  const arquivo = dados.get('backup');
  if (!arquivo || !arquivo.size) { alert('Escolha o arquivo de backup (.zip).'); return; }
  const zip = await lerZip(arquivo);
  const json = await zip.blob('painel.json');
  if (!json) throw new Error('Esse .zip não é um backup do Painel de Publicações.');
  let conteudo;
  try { conteudo = JSON.parse(await json.text()); } catch (_) { throw new Error('O backup está danificado.'); }
  const b = validarBackup(conteudo);
  const quando = b.exportadoEm ? ` de ${new Date(b.exportadoEm).toLocaleDateString('pt-BR')}` : '';
  if (!confirm(`Restaurar o backup${quando} (${plural(b.levas.length, 'leva', 'levas')}, ${plural(b.pubs.length, 'publicação', 'publicações')})?\n\nIsso substitui tudo o que está no app agora.`)) return;

  const idsPubs = new Set(b.pubs.map(p => p.id));
  const midias = [];
  for (const m of b.midias) {
    if (!m || !idsPubs.has(m.pubId) || typeof m.arquivo !== 'string') continue;
    const blob = await zip.blob(m.arquivo);
    if (!blob) continue;
    const tipo = String(m.tipo || TIPO_POR_EXTENSAO[extensaoDoNome(m.arquivo)] || 'application/octet-stream');
    midias.push({
      id: typeof m.id === 'string' ? m.id : novoId(), pubId: m.pubId, nome: String(m.nome || m.arquivo.split('/').pop()),
      tipo, tamanho: blob.size, ordem: Number(m.ordem) || 0, blob: new Blob([blob], { type: tipo }),
    });
  }
  const quandoRestaurou = agora();
  await gravar(['config', 'levas', 'publicacoes', 'midias'], s => {
    ['config', 'levas', 'publicacoes', 'midias'].forEach(n => s[n].clear());
    s.config.put(b.contas, 'contas');
    s.config.put(quandoRestaurou, 'ultimoBackup');
    b.levas.forEach(l => s.levas.put(l));
    b.pubs.forEach(p => s.publicacoes.put(p));
    midias.forEach(m => s.midias.put(m));
  });
  await carregarEstado();
  avisar(`Backup restaurado: ${plural(b.levas.length, 'leva', 'levas')} e ${plural(b.pubs.length, 'publicação', 'publicações')}.`);
  ir('#/');
}


// =============================================================================
// Instalação, armazenamento permanente e funcionamento sem internet
// =============================================================================
let pedidoDeInstalacao = null;
const instalado = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', evento => {
  evento.preventDefault();
  pedidoDeInstalacao = evento;
  const hash = location.hash || '#/';
  if (db && (hash === '#/' || hash === '#/ajustes')) ir(hash, { manterRolagem: true });
});

window.addEventListener('appinstalled', () => {
  pedidoDeInstalacao = null;
  pedirArmazenamentoPermanente();
});

async function instalar() {
  if (!pedidoDeInstalacao) {
    alert('No Chrome, toque no menu ⋮ e depois em "Instalar app" (ou "Adicionar à tela inicial").');
    return;
  }
  pedidoDeInstalacao.prompt();
  const escolha = await pedidoDeInstalacao.userChoice;
  pedidoDeInstalacao = null;
  if (escolha && escolha.outcome === 'accepted') avisar('App instalado! O ícone aparece na tela inicial do celular.');
  ir(location.hash || '#/', { manterRolagem: true });
}

async function pedirArmazenamentoPermanente() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch (_) { /* o navegador decide sozinho */ }
}


// =============================================================================
// Ligação dos formulários e botões
// =============================================================================
const FORMULARIOS = {
  'adicionar-contas': adicionarContas,
  'editar-conta': editarConta,
  'nova-leva': novaLeva,
  'editar-leva': editarLeva,
  'salvar-publicacao': salvarPublicacao,
  'restaurar-backup': restaurarBackup,
  'ir-para-data': (form, dados) => { if (lerData(dados.get('data'))) ir(`#/dia/${dados.get('data')}`); },
};

const BOTOES = {
  'mover-conta': moverConta,
  'remover-conta': removerConta,
  'excluir-leva': excluirLeva,
  'marcar-publicado': marcarPublicado,
  'excluir-publicacao': excluirPublicacao,
  copiar: copiarTexto,
  compartilhar,
  'baixar-backup': baixarBackup,
  instalar,
};

function explicarErro(erro) {
  if (erro && erro.name === 'QuotaExceededError') return 'Não há espaço livre no celular para guardar esses arquivos.';
  return (erro && erro.message) || String(erro);
}

document.addEventListener('submit', async evento => {
  const form = evento.target.closest('form[data-form]');
  if (!form) return;
  evento.preventDefault();
  const acao = FORMULARIOS[form.dataset.form];
  if (!acao) return;
  const botao = form.querySelector('button[type=submit]');
  const textoOriginal = botao ? botao.textContent : '';
  if (botao) {
    botao.disabled = true;
    if (form.dataset.form === 'salvar-publicacao') botao.textContent = 'Salvando…';
  }
  try {
    await acao(form, new FormData(form));
  } catch (erro) {
    console.error(erro);
    alert(explicarErro(erro));
  } finally {
    if (botao && botao.isConnected) { botao.disabled = false; botao.textContent = textoOriginal; }
  }
});

document.addEventListener('click', async evento => {
  const botao = evento.target.closest('[data-acao]');
  if (!botao) return;
  const acao = BOTOES[botao.dataset.acao];
  if (!acao) return;
  evento.preventDefault();
  if (botao.dataset.confirmar && !confirm(botao.dataset.confirmar)) return;
  try {
    await acao(botao);
  } catch (erro) {
    console.error(erro);
    alert(explicarErro(erro));
  }
});

// Foto que o navegador não consegue mostrar (ex.: HEIC): mostra o nome no lugar
document.addEventListener('error', evento => {
  const img = evento.target;
  if (img && img.tagName === 'IMG' && img.closest('.galeria')) {
    const aviso = document.createElement('div');
    aviso.className = 'sem-previa';
    aviso.textContent = '📷 ' + (img.alt || 'foto');
    img.replaceWith(aviso);
  }
}, true);


// =============================================================================
// Início
// =============================================================================
async function iniciar() {
  try {
    db = await abrirBanco();
    await carregarEstado();
  } catch (erro) {
    console.error(erro);
    $('main').innerHTML = paginaErro('Não consegui abrir o armazenamento do app (' + explicarErro(erro)
      + '). Se estiver numa aba anônima, abra numa aba normal.');
    return;
  }
  window.addEventListener('hashchange', () => render());
  await render();
  pedirArmazenamentoPermanente();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(erro => console.warn('Service worker não registrado:', erro));
  }
}

iniciar();
