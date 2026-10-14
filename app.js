// OLX no celular — anúncios captados pela extensão OLX Dashboard no PC, com
// compra direto no celular ("Comprar aqui") ou feita pelo PC ("Comprar pelo PC").
const $ = (s, el = document) => el.querySelector(s);
const tela = $('#tela');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REGIONAIS = ['campos', 'sfitab', 'sjb', 'macae'];
const FILTROS = [
  ['todos', 'Todos'], ['ps5', 'PS5'], ['ps4', 'PS4'], ['ps3', 'PS3'], ['xbox', 'Xbox'],
  ['switch', 'Switch'], ['iphone', 'iPhone'], ['jogos', 'Jogos'], ['regional', '📍 Regionais'], ['outros', 'Outros'],
];
const ORDENS_KEY = 'olxcel:ordens'; // listId → { id, tipo, ts } (última ordem enviada por anúncio)
const PREF_KEY = 'olxcel:pref';

let pref = { filtro: 'todos', semDefeito: false, busca: '' };
try { pref = { ...pref, ...JSON.parse(localStorage.getItem(PREF_KEY)) }; } catch { /* padrão */ }
const salvarPref = () => localStorage.setItem(PREF_KEY, JSON.stringify(pref));

function ordens() { try { return JSON.parse(localStorage.getItem(ORDENS_KEY)) || {}; } catch { return {}; } }
function guardarOrdem(listId, id, tipo) {
  const o = ordens();
  o[listId] = { id, tipo, ts: Date.now() };
  for (const k of Object.keys(o)) if (Date.now() - o[k].ts > 3 * 60 * 60 * 1000) delete o[k];
  localStorage.setItem(ORDENS_KEY, JSON.stringify(o));
}

// Conta da reserva: "—" é "não identificada" (reservas antigas) — não mostra
const contaOk = (c) => Boolean(c && c !== '—' && c !== '-');

// ─── Liga/desliga a compra automática do PC (ordem "auto_compra") ───────────
const AUTO_KEY = 'olxcel:autoOrdem'; // { id, ligar, ts } — última ordem enviada
function blocoAutoCompra(d) {
  if (d?.pc?.autoCompra === undefined) return ''; // extensão do PC ainda sem essa função
  const atual = d.pc.autoCompra;
  let pend = null;
  try { pend = JSON.parse(localStorage.getItem(AUTO_KEY)); } catch { pend = null; }
  const esperando = pend && Date.now() - pend.ts < 2 * 60 * 1000 && atual !== pend.ligar && !d.respostas?.[pend.id];
  const txt = esperando ? (pend.ligar ? '⏳ Ligando no PC…' : '⏳ Desligando no PC…')
    : atual ? 'Ligada — o PC compra PS5 e Xbox Series sozinho' : 'Desligada — o PC só avisa, não compra';
  return `<div class="card pad auto-toggle ${atual ? 'on' : 'off'}">
    <div class="info"><b>🎯 Compra automática ${atual ? 'LIGADA' : 'DESLIGADA'}</b><div class="sub">${txt}</div></div>
    <button type="button" class="btn ${atual ? 'perigo' : 'prim'}" data-auto="${atual ? '0' : '1'}"${esperando ? ' disabled' : ''}>${atual ? 'Desligar' : 'Ligar'}</button>
  </div>`;
}
function ligarBotoesAutoCompra(redesenhar) {
  for (const b of document.querySelectorAll('[data-auto]')) {
    b.addEventListener('click', async () => {
      const ligar = b.dataset.auto === '1';
      if (!confirm(ligar ? 'Ligar a compra automática no PC?\n\nO PC volta a comprar PS5 e Xbox Series sozinho.' : 'Desligar a compra automática no PC?\n\nO PC continua avisando os anúncios, mas não compra mais sozinho.')) return;
      localStorage.setItem(AUTO_KEY, JSON.stringify({ id: 'local', ligar, ts: Date.now() }));
      redesenhar();
      try {
        const id = await Sync.enviarOrdem({ tipo: 'auto_compra', ligar });
        localStorage.setItem(AUTO_KEY, JSON.stringify({ id, ligar, ts: Date.now() }));
        toast(ligar ? 'Pedido enviado: ligar' : 'Pedido enviado: desligar');
      } catch (e) {
        localStorage.removeItem(AUTO_KEY);
        toast('Falhou: ' + e.message);
      }
      redesenhar();
    });
  }
}

// Pediu "Cancelar reserva" há pouco e o PC ainda não confirmou?
function cancelando(listId) {
  const o = ordens()[listId];
  return !!(o && o.tipo === 'cancelar_reserva' && Date.now() - o.ts < 2 * 60 * 1000);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('on'), 2600);
}

// ─── Formatação ─────────────────────────────────────────────────────────────
const fmtPreco = (a) => a.precoRaw || (a.preco ? 'R$ ' + Math.round(a.preco).toLocaleString('pt-BR') : 'Sob consulta');
function relativo(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}
const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function cronometro(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
const checkoutUrl = (id) => `https://comprasegura.olx.com.br/?listId=${encodeURIComponent(id)}&source=ADVIEW`;
const chatUrl = (id) => `https://chat.olx.com.br/?list-id=${encodeURIComponent(id)}`;

async function copiar(texto, msg) {
  try { await navigator.clipboard.writeText(texto); toast(msg || 'Copiado!'); }
  catch { prompt('Copie:', texto); }
}

// ─── Topo ───────────────────────────────────────────────────────────────────
function titulo(txt, voltar = false) {
  $('#titulo').textContent = txt;
  $('#voltar').hidden = !voltar;
}
$('#voltar').addEventListener('click', () => (history.length > 1 ? history.back() : ir('#/anuncios')));

function atualizarPill() {
  const pill = $('#pillSync');
  const d = Sync.dados();
  let cls = 'off', txt = 'Configurar';
  if (Sync.configurado()) {
    if (Sync.estado.status === 'erro') { cls = 'erro'; txt = 'Erro'; }
    else if (d?.ts) {
      const idade = Date.now() - d.ts;
      if (idade < 120000) { cls = 'ok'; txt = 'PC online'; }
      else { cls = 'aviso'; txt = `PC ${relativo(d.ts)}`; }
    } else { cls = 'aviso'; txt = '…'; }
  }
  pill.className = `pill ${cls}`;
  $('span', pill).textContent = txt;
}
$('#pillSync').addEventListener('click', () => ir('#/config'));
setInterval(atualizarPill, 20000);

// ─── Rotas ──────────────────────────────────────────────────────────────────
const ir = (hash) => { location.hash = hash; };
let timerTela = null;

function render() {
  clearInterval(timerTela); timerTela = null;
  if (location.hash.startsWith('#cfg=')) return receberLinkConfig(location.hash);
  const h = location.hash.replace(/^#/, '') || '/anuncios';
  const [, rota, arg] = h.split('/');
  for (const a of document.querySelectorAll('.abas a')) a.classList.toggle('ativa', a.dataset.aba === rota);
  if (!Sync.configurado() && rota !== 'config') return vBoasVindas();
  ({ anuncios: vAnuncios, anuncio: () => vAnuncio(arg), reservas: vReservas, pedidos: vPedidos, config: vConfig }[rota] || vAnuncios)();
}
window.addEventListener('hashchange', render);

function vBoasVindas() {
  titulo('OLX no celular');
  tela.innerHTML = `<div class="card pad">
    <div class="det-titulo">📱 Conecte ao PC</div>
    <ol class="passos">
      <li>No PC, abra a dashboard da extensão <b>OLX Dashboard</b> → ⚙️ → <b>📱 Celular</b>.</li>
      <li>Cole um token do GitHub (permissão <b>gist</b>), crie uma senha e clique em <b>Ativar celular</b>.</li>
      <li>Aqui, toque em <b>Configurar</b> e leia o QR code. Depois digite a senha.</li>
    </ol>
    <div class="acoes"><a class="btn prim" href="#/config">Configurar</a></div>
  </div>`;
}

// ─── Anúncios ───────────────────────────────────────────────────────────────
function selos(a, completo = false) {
  const s = [];
  if (Date.now() - (a.ts || 0) * 1000 < 30 * 60 * 1000) s.push('<span class="selo novo">NOVO</span>');
  if (a.golpe) s.push('<span class="selo vermelho">🚨 Golpe?</span>');
  if (a.defeito) s.push('<span class="selo vermelho">⚠️ Defeito</span>');
  if (a.contaNova) s.push('<span class="selo amarelo">🆕 Conta nova</span>');
  if (a.solicitar) s.push('<span class="selo amarelo">🔒 Solicitar</span>');
  if (a.envio === 'sim') s.push('<span class="selo verde">📦 Faz envio</span>');
  if (a.envio === 'nao') s.push('<span class="selo cinza">🚫 Não envia</span>');
  if (REGIONAIS.includes(a.cc)) s.push('<span class="selo azul">📍 Regional</span>');
  if (a.aval) s.push(`<span class="selo ${a.aval.diff >= 10 && a.aval.texto !== 'Acima da média' ? 'verde' : 'cinza'}">${esc(a.aval.emoji)} ${esc(a.aval.texto)}${completo && a.media ? ` (média R$ ${Math.round(a.media).toLocaleString('pt-BR')})` : ''}</span>`);
  return s.join('');
}

function filtrar(lista) {
  const q = pref.busca.trim().toLowerCase();
  return lista.filter((a) => {
    if (pref.semDefeito && (a.defeito || a.golpe)) return false;
    if (pref.filtro === 'regional') { if (!REGIONAIS.includes(a.cc)) return false; }
    else if (pref.filtro !== 'todos' && a.cat !== pref.filtro) return false;
    if (q && !(`${a.titulo} ${a.bairro} ${a.cidade}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

function vAnuncios() {
  titulo('Anúncios');
  const d = Sync.dados();
  const lista = filtrar(d?.anuncios || []);
  const rolagem = window.scrollY;
  tela.innerHTML = `
    <div class="filtros">
      <input type="search" id="busca" placeholder="Buscar título ou bairro…" value="${esc(pref.busca)}">
      <div class="chips">${FILTROS.map(([id, nome]) => `<button type="button" class="chip${pref.filtro === id ? ' on' : ''}" data-f="${id}">${nome}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="semDefeito"${pref.semDefeito ? ' checked' : ''}> Esconder defeito/golpe</label>
    </div>
    ${!d ? '<div class="vazio">Carregando…</div>' : !lista.length ? '<div class="vazio">Nenhum anúncio com esses filtros.</div>' : ''}
    <div class="lista">${lista.map((a) => `
      <a class="anuncio" href="#/anuncio/${encodeURIComponent(a.id)}">
        <div class="foto">${a.fotos?.[0] ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(a.fotos[0])}" alt="">` : '<span>📷</span>'}</div>
        <div class="info">
          <div class="t">${esc(a.titulo)}</div>
          <div class="preco">${esc(fmtPreco(a))}</div>
          <div class="sub">${esc([a.bairro, a.cidade].filter(Boolean).join(', ') || '—')} · ${relativo((a.ts || 0) * 1000)}</div>
          <div class="selos">${selos(a)}</div>
        </div>
      </a>`).join('')}</div>`;
  window.scrollTo(0, rolagem);
  const busca = $('#busca');
  busca.addEventListener('input', () => {
    pref.busca = busca.value; salvarPref();
    clearTimeout(busca.t); busca.t = setTimeout(() => { vAnuncios(); const b = $('#busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }, 250);
  });
  for (const c of document.querySelectorAll('.chip')) c.addEventListener('click', () => { pref.filtro = c.dataset.f; salvarPref(); vAnuncios(); });
  $('#semDefeito').addEventListener('change', (e) => { pref.semDefeito = e.target.checked; salvarPref(); vAnuncios(); });
}

// ─── Detalhe + compra ───────────────────────────────────────────────────────
const STATUS = {
  enviando: ['⏳', 'Enviando ao PC…'],
  recebido: ['🔄', 'PC recebeu — abrindo a compra…'],
  forcando: ['⚡', 'Forçando compra no PC…'],
  sucesso: ['✅', 'Compra finalizada no PC — PIX gerado!'],
  reservado: ['🔒', 'Reservado por outra pessoa.'],
  vendido: ['🚫', 'Anúncio já vendido.'],
  erro: ['❌', 'Não foi possível finalizar.'],
  cancelado: ['⛔', 'Compra cancelada.'],
  parado: ['⏹', 'Forçar compra parado.'],
  reserva_cancelada: ['✕', 'Reserva cancelada — a aba de pagamento foi fechada no PC.'],
};

function vAnuncio(id) {
  const d = Sync.dados();
  const a = (d?.anuncios || []).find((x) => String(x.id) === String(id));
  titulo('Anúncio', true);
  if (!a) { tela.innerHTML = '<div class="vazio">Anúncio não encontrado (saiu da lista do PC).</div>'; return; }
  tela.innerHTML = `
    <div class="fotos">${(a.fotos?.length ? a.fotos : [null]).map((f) => f ? `<img referrerpolicy="no-referrer" src="${esc(f)}" alt="">` : '<div class="sem-foto">📷</div>').join('')}</div>
    <div class="card pad">
      <div class="det-titulo">${esc(a.titulo)}</div>
      <div class="det-preco">${esc(fmtPreco(a))}</div>
      <div class="selos">${selos(a, true)}</div>
      <div class="sub">📍 ${esc([a.bairro, a.cidade].filter(Boolean).join(', ') || '—')}</div>
      <div class="sub">🕒 ${a.publicado ? `Publicado ${esc(a.publicado)} · ` : ''}captado ${relativo((a.ts || 0) * 1000)}</div>
    </div>
    <div class="card pad compra">
      <a class="btn prim grande" href="${checkoutUrl(a.id)}" target="_blank" rel="noopener">🛒 Comprar aqui</a>
      <button type="button" class="btn grande" id="comprarPc">💻 Comprar pelo PC</button>
      <div id="statusOrdem"></div>
      <div class="sub dica">“Comprar aqui” abre o checkout da OLX neste celular (conta logada aqui). “Comprar pelo PC” faz a Compra Rápida na extensão (Expressa + Pix) com a conta logada no PC${d.pc?.conta ? ` (<b>${esc(d.pc.conta)}</b>)` : ''}.</div>
    </div>
    <div class="card pad">
      <b>Vendedor</b>
      <div class="sub">${esc(a.tempoOlx || '—')}${a.validada ? ' · ✔ conta verificada' : ''}${a.vendas ? ` · ${a.vendas} venda(s)` : ''}${a.avaliacoes ? ` · ${a.avaliacoes} avaliação(ões)` : ''}</div>
      ${a.desc ? `<b style="display:block;margin-top:10px">Descrição</b><div class="desc">${esc(a.desc)}</div>` : ''}
      <div class="acoes">
        <a class="btn" href="${esc(a.link)}" target="_blank" rel="noopener">Ver na OLX</a>
        <a class="btn" href="${chatUrl(a.id)}" target="_blank" rel="noopener">💬 Chat</a>
      </div>
    </div>`;
  $('#comprarPc').addEventListener('click', () => mandarOrdem(a, 'comprar'));
  desenharStatusOrdem(a);
  timerTela = setInterval(() => desenharStatusOrdem(a), 1000);
}

async function mandarOrdem(a, tipo) {
  const confirmacoes = {
    comprar: `Comprar pelo PC?\n\n${a.titulo}\n${fmtPreco(a)}\n\nO PC finaliza a compra e gera o PIX.`,
    forcar: `Forçar a compra pelo PC?\n\nO PC fica tentando até o anúncio liberar.`,
    parar_forcar: 'Parar o forçar compra no PC?',
    cancelar_reserva: `Cancelar a reserva?\n\n${a.titulo}\n\nA aba de pagamento é fechada no PC e o Pix expira sem pagamento.`,
  };
  if (!confirm(confirmacoes[tipo])) return;
  guardarOrdem(a.id, 'local-' + Date.now(), tipo); // mostra "Enviando…" já
  desenharStatusOrdem(a);
  try {
    const id = await Sync.enviarOrdem({ tipo, listId: a.id, titulo: a.titulo, preco: fmtPreco(a), link: a.link });
    guardarOrdem(a.id, id, tipo);
    toast('Enviado ao PC');
  } catch (e) {
    const o = ordens(); delete o[a.id]; localStorage.setItem(ORDENS_KEY, JSON.stringify(o));
    toast('Falhou: ' + e.message);
  }
  desenharStatusOrdem(a);
}

function desenharStatusOrdem(a) {
  const box = $('#statusOrdem');
  if (!box) return;
  const d = Sync.dados();
  const o = ordens()[a.id];
  const reserva = (d?.reservas || []).find((r) => String(r.listId) === String(a.id));
  const forcando = (d?.forcando || []).find((f) => String(f.listId) === String(a.id));
  let resp = o && !o.id.startsWith('local-') ? d?.respostas?.[o.id] : null;
  let status = o ? (o.id.startsWith('local-') ? 'enviando' : (resp?.status || 'enviando')) : null;
  if (reserva) status = 'sucesso';
  else if (forcando && status !== 'parado') status = 'forcando';
  if (!status) { box.innerHTML = ''; return; }

  const [ic, txtPadrao] = STATUS[status] || ['•', status];
  let html = `<div class="status st-${status}"><span>${ic}</span><div>${esc(resp?.msg || txtPadrao)}`;
  if (status === 'enviando' && o && !o.id.startsWith('local-')) {
    const idade = d?.ts ? Date.now() - d.ts : Infinity;
    html += `<div class="sub">${idade > 120000 ? '⚠️ O PC não dá sinal há algum tempo — confira se ele está ligado com o Chrome aberto.' : 'Aguardando o PC (alguns segundos)…'}</div>`;
  }
  if (status === 'forcando' && forcando) html += `<div class="sub">Tentativa ${forcando.tentativa || 0}</div>`;
  html += '</div></div>';

  if (reserva) {
    const resta = (reserva.expiraEm || 0) - Date.now();
    html += `<div class="reserva-box">
      ${contaOk(reserva.conta) ? `<div class="conta">👤 Reservado na conta <b>${esc(reserva.conta)}</b></div>` : ''}
      ${reserva.total ? `<div>Total: <b>${esc(reserva.total)}</b></div>` : ''}
      <div>${resta > 0 ? `PIX expira em <b>${cronometro(resta)}</b> (às ${hora(reserva.expiraEm)})` : 'PIX expirado'}</div>
      ${reserva.pix ? '<button type="button" class="btn prim grande" id="copiarPix">📋 Copiar código Pix</button>' : '<div class="sub">O código Pix aparece aqui assim que o PC ler a página de pagamento.</div>'}
      ${cancelando(a.id) ? '<div class="sub">✕ Cancelando no PC…</div>' : '<button type="button" class="btn perigo grande" id="cancelarReserva">✕ Cancelar reserva</button>'}
    </div>`;
  }
  if (status === 'reservado') html += '<button type="button" class="btn grande" id="forcarPc">⚡ Forçar compra pelo PC</button>';
  if (status === 'forcando') html += '<button type="button" class="btn perigo" id="pararPc">⏹ Parar forçar compra</button>';
  if (box.dataset.html === html) return; // nada mudou (o timer roda a cada 1 s)
  box.dataset.html = html;
  box.innerHTML = html;
  $('#copiarPix')?.addEventListener('click', () => copiar(reserva.pix, 'Código Pix copiado — cole no app do banco'));
  $('#cancelarReserva')?.addEventListener('click', () => mandarOrdem(a, 'cancelar_reserva'));
  $('#forcarPc')?.addEventListener('click', () => mandarOrdem(a, 'forcar'));
  $('#pararPc')?.addEventListener('click', () => mandarOrdem(a, 'parar_forcar'));
}

// ─── Reservas (aguardando pagamento) ────────────────────────────────────────
function vReservas() {
  titulo('Reservas');
  const d = Sync.dados();
  const reservas = (d?.reservas || []).slice().sort((x, y) => (y.ts || 0) - (x.ts || 0));
  const forcando = d?.forcando || [];
  // Compras automáticas do PC: as que ainda não viraram reserva (comprando,
  // falharam ou foram canceladas) aparecem aqui; as que viraram reserva
  // aparecem como reserva, com o selo "🎯 Automática".
  const auto = d?.autoCompras || [];
  const autoIds = new Set(auto.map((x) => String(x.listId)));
  const autoAndamento = auto
    .filter((x) => !reservas.some((r) => String(r.listId) === String(x.listId)) && /^(comprando|falhou|cancelada)/.test(x.status || ''))
    .sort((x, y) => (y.ts || 0) - (x.ts || 0));
  const statusAuto = (s) => /^comprando/.test(s) ? '🔄 Comprando no PC…'
    : /^falhou/.test(s) ? '❌ ' + s.replace(/^falhou:\s*/, 'Não deu: ')
    : '⛔ ' + s.replace(/^cancelada:\s*/, 'Cancelada: ');
  const desenhar = () => {
    tela.innerHTML = `
      ${blocoAutoCompra(d)}
      ${autoAndamento.length ? `<div class="secao">🎯 Compras automáticas</div>${autoAndamento.map((x) => `
        <a class="card pad auto-compra" href="#/anuncio/${encodeURIComponent(x.listId)}">
          <div class="det-titulo pequeno">${esc(x.titulo || 'Anúncio')}</div>
          <div class="sub">${esc([String(x.console || '').toUpperCase(), x.preco].filter(Boolean).join(' · '))} · ${relativo(x.ts || 0)}</div>
          <div class="st ${/^comprando/.test(x.status) ? 'andando' : 'parou'}">${esc(statusAuto(x.status || ''))}</div>
        </a>`).join('')}` : ''}
      ${!reservas.length && !forcando.length && !autoAndamento.length ? '<div class="vazio">Nenhuma reserva aguardando pagamento.</div>' : ''}
      ${reservas.length && autoAndamento.length ? '<div class="secao">⏱ Aguardando pagamento</div>' : ''}
      ${reservas.map((r, i) => {
        const resta = (r.expiraEm || 0) - Date.now();
        return `<div class="card pad reserva">
          <div class="det-titulo pequeno">${esc(r.titulo || 'Anúncio')}${autoIds.has(String(r.listId)) ? ' <span class="selo verde">🎯 Automática</span>' : ''}</div>
          ${contaOk(r.conta) ? `<div class="conta">👤 ${esc(r.conta)}</div>` : ''}
          <div class="sub">${esc(r.preco || '')}${r.total ? ` · total <b>${esc(r.total)}</b>` : ''}</div>
          <div class="cron ${resta <= 0 ? 'expirado' : ''}" data-lid="${esc(r.listId)}">⏱ ${resta > 0 ? cronometro(resta) : (r.renovacaoFalhou ? 'Não renovou' : 'Expirado')}</div>
          ${r.suspeitaGolpe ? `<div class="aviso erro">⛔ Atenção: anúncio ${esc(r.motivoSuspeita || 'suspeito')} — confira antes de pagar!</div>` : ''}
          ${r.confirmadaWhats ? '<div class="sub ok">✅ Mantida pelo WhatsApp</div>' : ''}
          <div class="acoes">
            ${r.pix ? `<button type="button" class="btn prim" data-pix="${i}">📋 Copiar Pix</button>` : '<span class="sub">Pix ainda não lido</span>'}
            ${r.link ? `<a class="btn" href="${esc(r.link)}" target="_blank" rel="noopener">Ver anúncio</a>` : ''}
            ${cancelando(r.listId) ? '<span class="sub">✕ Cancelando no PC…</span>' : `<button type="button" class="btn perigo" data-cancelar="${i}">✕ Cancelar</button>`}
          </div>
        </div>`;
      }).join('')}
      ${forcando.length ? `<div class="secao">⚡ Forçando compra no PC</div>${forcando.map((f) => `
        <div class="card pad"><b>${esc(f.titulo || f.listId)}</b><div class="sub">${esc(f.preco || '')} · tentativa ${f.tentativa || 0}</div></div>`).join('')}` : ''}`;
    ligarBotoesAutoCompra(desenhar);
    for (const b of document.querySelectorAll('[data-pix]')) {
      b.addEventListener('click', () => copiar(reservas[+b.dataset.pix].pix, 'Código Pix copiado — cole no app do banco'));
    }
    for (const b of document.querySelectorAll('[data-cancelar]')) {
      b.addEventListener('click', async () => {
        const r = reservas[+b.dataset.cancelar];
        await mandarOrdem({ id: r.listId, titulo: r.titulo || 'Anúncio', precoRaw: r.preco, link: r.link }, 'cancelar_reserva');
        desenhar();
      });
    }
  };
  desenhar();
  // Um timer só: esta tela é redesenhada a cada atualização dos dados (15 s)
  // e antes cada redesenho criava mais um timer sem parar o anterior — os
  // antigos, com o horário de expiração velho, escreviam "Expirado" por cima
  // do contador novo quando o Pix era renovado. O timer também lê sempre a
  // reserva atual (pelo listId), não a lista de quando foi criado.
  clearInterval(timerTela);
  timerTela = null;
  if (reservas.length) timerTela = setInterval(() => {
    const atuais = Sync.dados()?.reservas || [];
    for (const el of document.querySelectorAll('.reserva .cron[data-lid]')) {
      const r = atuais.find((x) => String(x.listId) === el.dataset.lid);
      if (!r) continue;
      const resta = (r.expiraEm || 0) - Date.now();
      el.textContent = `⏱ ${resta > 0 ? cronometro(resta) : (r.renovacaoFalhou ? 'Não renovou' : 'Expirado')}`;
      el.classList.toggle('expirado', resta <= 0);
    }
  }, 1000);
}

// ─── Pedidos (Verificar compras / Verificação Completa) ─────────────────────
const GRUPOS = [['transito', '🚚 Em trânsito'], ['preparacao', '📦 Em preparação'], ['cancelamento', '❌ Em cancelamento'], ['entregue', '✅ Entregues']];
function vPedidos() {
  titulo('Pedidos');
  const d = Sync.dados();
  const pedidos = d?.pedidos || [];
  if (!pedidos.length) {
    tela.innerHTML = '<div class="vazio">Nenhum pedido ainda.<br><small>No PC, use “Verificar compras” ou “Verificação Completa” na dashboard.</small></div>';
    return;
  }
  tela.innerHTML = `<div class="sub centro">${pedidos.length} pedido(s) · verificado ${d.pedidosTs ? relativo(d.pedidosTs) : ''}</div>
    ${GRUPOS.map(([tipo, nome]) => {
      const g = pedidos.filter((p) => p.statusTipo === tipo);
      if (!g.length) return '';
      return `<div class="secao">${nome} (${g.length})</div>${g.map((p) => `
        <div class="card pad pedido">
          ${p.foto ? `<img referrerpolicy="no-referrer" src="${esc(p.foto)}" alt="">` : ''}
          <div class="info">
            <b>${esc(p.titulo || 'Pedido')}</b>
            ${p.conta ? `<div class="conta">👤 ${esc(p.conta)}</div>` : ''}
            <div class="sub">${esc(p.precoTotal || p.preco || '')}${p.data ? ` · ${esc(p.data)}` : ''}</div>
            <div class="sub">${esc(p.status || '')}${p.dataCancelamento ? ` · cancelável em ${esc(p.dataCancelamento)}` : ''}</div>
            ${p.codigoRastreio ? `<button type="button" class="btn mini" data-cod="${esc(p.codigoRastreio)}">📋 ${esc(p.codigoRastreio)}</button>` : ''}
            ${p.link ? `<a class="btn mini" href="${esc(p.link)}" target="_blank" rel="noopener">Ver pedido</a>` : ''}
          </div>
        </div>`).join('')}`;
    }).join('')}`;
  for (const b of document.querySelectorAll('[data-cod]')) b.addEventListener('click', () => copiar(b.dataset.cod, 'Código de rastreio copiado'));
}

// ─── Configuração (QR do PC) ────────────────────────────────────────────────
let cfgPendente = null; // token + Gist vindos do QR/link, esperando a senha

function lerLinkConfig(texto) {
  const m = /#cfg=([\w-]+)/.exec(texto || '');
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const d = JSON.parse(atob(b64 + '==='.slice((b64.length + 3) % 4)));
    return d.t && d.g ? { token: d.t, gistId: d.g, ...(d.a ? { api: d.a } : {}) } : null;
  } catch { return null; }
}
function receberLinkConfig(texto) {
  const cfg = lerLinkConfig(texto);
  history.replaceState(null, '', `${location.pathname}${location.search}#/config`); // tira o token da barra de endereço
  if (cfg) cfgPendente = cfg; else toast('Link de configuração inválido');
  render();
}

// ─── Notificações push (o PC avisa quando inicia uma compra automática) ─────
const PUSH_ORDEM_KEY = 'olxcel:pushOrdem';
const ehIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
function deB64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function cartaoNotificacoes(d) {
  const suporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const perm = suporta ? Notification.permission : 'indisponível';
  const resp = d?.respostas?.[localStorage.getItem(PUSH_ORDEM_KEY)];
  let estado;
  if (!suporta) estado = ehIOS && !instalado()
    ? 'No iPhone, as notificações só funcionam com o app <b>instalado na tela de início</b> (Safari → Compartilhar → Adicionar à Tela de Início) e aberto por lá.'
    : 'Este navegador não suporta notificações.';
  else if (perm === 'denied') estado = 'Notificações bloqueadas — libere nos ajustes do celular para este app.';
  else if (!d?.push?.chave) estado = 'Atualize a extensão no PC (recarregue em chrome://extensions) para ativar.';
  else estado = perm === 'granted' && d.push.inscritos ? `✅ Ativadas · ${d.push.inscritos} aparelho(s) inscrito(s) no PC` : 'Desligadas.';
  return `<div class="card pad" style="margin-top:12px">
    <b>🔔 Notificações</b>
    <p class="sub">Aviso no celular quando o PC <b>inicia uma compra automática</b> (console e preço). Tocar abre as Reservas.</p>
    <div class="sub">${estado}</div>
    ${resp ? `<div class="sub ${resp.status === 'push_ok' ? 'ok' : ''}">${resp.status === 'push_ok' ? '✅' : '⚠️'} ${esc(resp.msg)}</div>` : ''}
    ${suporta && perm !== 'denied' && d?.push?.chave ? `<div class="acoes">
      <button type="button" class="btn prim" id="ativarPush">🔔 ${perm === 'granted' && d.push.inscritos ? 'Reativar' : 'Ativar notificações'}</button>
      ${d.push.inscritos ? '<button type="button" class="btn" id="testarPush">Enviar teste</button>' : ''}
    </div>` : ''}
  </div>`;
}

async function ordemPush(ordem) {
  try {
    const id = await Sync.enviarOrdem(ordem);
    localStorage.setItem(PUSH_ORDEM_KEY, id);
    toast('Enviado ao PC — a resposta chega em alguns segundos');
  } catch (e) { toast('Falhou: ' + e.message); }
}

async function ativarNotificacoes() {
  const chave = Sync.dados()?.push?.chave;
  if (!chave) return toast('Atualize a extensão no PC e tente de novo');
  try {
    if ((await Notification.requestPermission()) !== 'granted') return toast('Permissão de notificação negada');
    const reg = await navigator.serviceWorker.ready;
    let insc = await reg.pushManager.getSubscription();
    // Inscrição feita com outra chave (PC reconfigurado): refaz
    const atual = insc?.options?.applicationServerKey;
    if (insc && atual && btoa(String.fromCharCode(...new Uint8Array(atual))) !== btoa(String.fromCharCode(...deB64u(chave)))) {
      await insc.unsubscribe(); insc = null;
    }
    insc ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(chave) });
    const j = insc.toJSON();
    await ordemPush({ tipo: 'push_inscrever', insc: { endpoint: j.endpoint, keys: j.keys },
      aparelho: (/iPhone|iPad|Android/.exec(navigator.userAgent) || ['navegador'])[0] });
  } catch (e) {
    toast('Não foi possível ativar: ' + e.message);
  }
}

// Toque numa notificação com o app já aberto: o service worker manda ir pra tela
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.ir) location.hash = e.data.ir; });

function vConfig() {
  titulo('Configuração', Sync.configurado());
  const e = Sync.estado, d = Sync.dados();
  if (Sync.configurado()) {
    tela.innerHTML = `<div class="card pad">
        <div class="det-titulo">${{ ok: '✅ Conectado', sincronizando: '🔄 Atualizando…', erro: '⚠️ Problema na conexão', desligado: '—' }[e.status]}</div>
        <div class="sub">Dados do PC: ${d?.ts ? `${new Date(d.ts).toLocaleString('pt-BR')} (${relativo(d.ts)})` : '—'}</div>
        <div class="sub">Conta logada no PC: <b>${esc(d?.pc?.conta || '—')}</b> · monitor ${d?.pc?.monitorando ? 'ligado' : 'parado'}</div>
        ${e.status === 'erro' ? `<div class="aviso erro">${esc(e.erro)}</div>` : ''}
        <div class="acoes"><button type="button" class="btn prim" id="atualizar">Atualizar agora</button></div>
      </div>
      ${blocoAutoCompra(d)}
      ${cartaoNotificacoes(d)}
      <div class="card pad" style="margin-top:12px">
        <b>Como funciona</b>
        <p class="sub">O PC publica os anúncios captados, as reservas e os pedidos num Gist secreto do GitHub, criptografados com a sua senha.
        O app atualiza a cada 15 s com a tela aberta. “Comprar pelo PC” manda a ordem pelo mesmo Gist — o PC precisa estar ligado com o Chrome aberto.</p>
        <div class="acoes"><button type="button" class="btn perigo" id="desconectar">Desconectar este aparelho</button></div>
      </div>
      <div class="sub centro" style="margin-top:14px">OLX no celular · versão ${OC_VERSAO}</div>`;
    $('#atualizar').addEventListener('click', () => Sync.agora());
    ligarBotoesAutoCompra(vConfig);
    $('#ativarPush')?.addEventListener('click', ativarNotificacoes);
    $('#testarPush')?.addEventListener('click', () => ordemPush({ tipo: 'push_teste' }));
    $('#desconectar').addEventListener('click', () => {
      if (!confirm('Desconectar este aparelho?\n\nNada é apagado no PC. Para voltar, leia o QR de novo.')) return;
      Sync.desconectar(); ir('#/anuncios');
    });
    return;
  }

  tela.innerHTML = cfgPendente ? `<form id="fSenha" class="card pad" autocomplete="off">
      <div class="det-titulo">🔐 Quase lá</div>
      <p class="sub">Digite a senha que você criou no PC (⚙️ → 📱 Celular).</p>
      <label class="campo">Senha<input type="password" name="senha" autocomplete="current-password" required></label>
      <div class="acoes"><button type="submit" class="btn prim" id="btnConectar">Conectar</button></div>
      <div id="msgCfg"></div>
    </form>` : `<div class="card pad">
      <div class="det-titulo">📱 Conectar ao PC</div>
      <p class="sub">No PC: dashboard da extensão → ⚙️ → <b>📱 Celular</b> → aparece um QR code.</p>
      <div class="acoes"><button type="button" class="btn prim" id="lerQr">📷 Ler QR do PC</button></div>
    </div>
    <div id="leitor" class="card oculto" style="margin-top:12px;overflow:hidden">
      <video id="videoQr" playsinline muted style="width:100%;display:block"></video>
      <div class="acoes" style="margin:8px"><button type="button" class="btn" id="pararQr">Cancelar</button></div>
    </div>
    <details class="card pad" style="margin-top:12px"><summary>Sem câmera? Colar o link do PC</summary>
      <label class="campo">Link (botão “Copiar link” no PC)<input type="text" id="linkCfg" placeholder="https://…#cfg=…"></label>
      <div class="acoes"><button type="button" class="btn" id="usarLink">Usar link</button></div>
    </details>`;

  if (cfgPendente) {
    const f = $('#fSenha');
    f.elements.senha.focus();
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = $('#btnConectar');
      btn.disabled = true; btn.textContent = 'Conectando…';
      try {
        await Sync.conectar(cfgPendente, f.elements.senha.value);
        cfgPendente = null;
        toast('Conectado!');
        ir('#/anuncios');
      } catch (err) {
        $('#msgCfg').innerHTML = `<div class="aviso erro">${esc(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'Conectar';
      }
    });
    return;
  }
  $('#usarLink').addEventListener('click', () => receberLinkConfig($('#linkCfg').value));
  $('#lerQr').addEventListener('click', lerQr);
  $('#pararQr').addEventListener('click', pararQr);
}

// Leitor de QR dentro do app (no iPhone, o app da tela de início não enxerga o que foi aberto no Safari)
let qrStream = null, jsQrScript = null;
function pararQr() {
  qrStream?.getTracks().forEach((t) => t.stop());
  qrStream = null;
  $('#leitor')?.classList.add('oculto');
}
window.addEventListener('hashchange', pararQr);
async function lerQr() {
  const video = $('#videoQr');
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    return toast('Sem acesso à câmera — permita nas configurações ou cole o link');
  }
  video.srcObject = qrStream;
  $('#leitor').classList.remove('oculto');
  await video.play().catch(() => {});
  let ler;
  if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats?.())?.includes('qr_code')) {
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    ler = async () => (await det.detect(video))[0]?.rawValue;
  } else {
    try {
      jsQrScript ??= new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
        s.onload = ok; s.onerror = () => { jsQrScript = null; falha(new Error()); };
        document.head.appendChild(s);
      });
      await jsQrScript;
    } catch { pararQr(); return toast('Não foi possível carregar o leitor — cole o link'); }
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
    ler = async () => {
      if (!video.videoWidth) return null;
      cv.width = video.videoWidth; cv.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      return jsQR(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height)?.data;
    };
  }
  while (qrStream) {
    const texto = await ler().catch(() => null);
    if (texto?.includes('#cfg=')) { pararQr(); return receberLinkConfig(texto); }
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ─── Dados novos do PC ──────────────────────────────────────────────────────
let idsVistos = new Set((Sync.dados()?.anuncios || []).map((a) => a.id));
Sync.ouvir((estado, d) => {
  atualizarPill();
  if (d) {
    const novos = (d.anuncios || []).filter((a) => !idsVistos.has(a.id));
    if (novos.length && idsVistos.size) {
      toast(`🆕 ${novos.length} anúncio(s) novo(s)`);
      navigator.vibrate?.(150);
    }
    idsVistos = new Set((d.anuncios || []).map((a) => a.id));
  }
  // Redesenha a tela atual com os dados novos (menos com formulário de senha aberto)
  const rota = (location.hash.replace(/^#\/?/, '') || 'anuncios').split('/')[0];
  if (rota === 'anuncios' && document.activeElement?.id !== 'busca') vAnuncios();
  else if (rota === 'reservas') vReservas();
  else if (rota === 'pedidos') vPedidos();
  else if (rota === 'config' && Sync.configurado()) vConfig();
  else if (rota === 'anuncio') { const a = (d?.anuncios || []).find((x) => String(x.id) === decodeURIComponent(location.hash.split('/')[2] || '')); if (a) desenharStatusOrdem(a); }
});

// ─── Atualização do app ─────────────────────────────────────────────────────
// O app instalado (principalmente no iPhone) pode abrir com a versão antiga
// guardada. Confere a versão publicada e, se houver uma nova, recarrega com um
// endereço novo (?v=N), que não pega nenhum cache.
async function checarVersao() {
  try {
    const t = await (await fetch(`config.js?ts=${Date.now()}`, { cache: 'no-store' })).text();
    const v = Number(/OC_VERSAO = (\d+)/.exec(t)?.[1] || 0);
    if (v > OC_VERSAO && sessionStorage.getItem('olxcel:atualizou') !== String(v)) {
      sessionStorage.setItem('olxcel:atualizou', String(v));
      await (await navigator.serviceWorker?.getRegistration())?.update().catch(() => {});
      location.replace(`${location.pathname}?v=${v}${location.hash}`);
    }
  } catch { /* sem internet: segue com a versão que tem */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checarVersao(); });

// ─── Início ─────────────────────────────────────────────────────────────────
checarVersao();
atualizarPill();
render();
if (Sync.configurado()) Sync.iniciar();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
