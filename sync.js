// Conversa com o PC pelo Gist secreto (mesmo Gist da extensão OLX Dashboard):
//   olx.json          ← o PC escreve: anúncios, reservas, pedidos, respostas às ordens
//   olx_pedidos.json  ← este app escreve: ordens "comprar" / "forcar" / "parar_forcar"
// Tudo criptografado com a senha (cripto.js). Lê a cada 15 s com o app na tela
// (ETag/304 — não gasta o limite do GitHub) e a cada 3 s logo depois de uma ordem.
const Sync = (() => {
  const KEY = 'olxcel:sync';
  const CACHE = 'olxcel:dados';
  const ARQ_DADOS = 'olx.json';
  const ARQ_PEDIDOS = 'olx_pedidos.json';
  const INTERVALO = 15000, INTERVALO_RAPIDO = 3000, RAPIDO_POR = 3 * 60 * 1000;
  const VALIDADE_ORDEM = 10 * 60 * 1000;
  let etag = null, usarEtag = true, rodando = false, timer = null, rapidoAte = 0;
  let dados = null;
  const estado = { status: 'desligado', erro: '', ultima: 0 };
  const ouvintes = new Set();

  try { dados = JSON.parse(localStorage.getItem(CACHE)) || null; } catch { dados = null; }

  function cfg() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  const configurado = () => { const c = cfg(); return Boolean(c.token && c.gistId && c.chave); };
  const api = (c) => (c.api || OC.api).replace(/\/$/, '');

  function avisar() { for (const fn of ouvintes) fn(estado, dados); }
  function setEstado(status, erro = '') {
    estado.status = status; estado.erro = erro;
    if (status === 'ok') estado.ultima = Date.now();
    avisar();
  }

  async function req(c, caminho, { method = 'GET', body, condicional } = {}) {
    const headers = { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (condicional && etag && usarEtag) headers['If-None-Match'] = etag;
    let res;
    try {
      res = await fetch(api(c) + caminho, { method, cache: 'no-store', headers, body: body && JSON.stringify(body) });
    } catch (e) {
      if (headers['If-None-Match'] && navigator.onLine) { usarEtag = false; return req(c, caminho, { method, body }); }
      throw new Error(navigator.onLine ? 'sem resposta do GitHub' : 'sem internet');
    }
    if (res.status === 304) return res;
    if (!res.ok) {
      throw new Error({ 401: 'token do GitHub inválido ou expirado', 403: 'o GitHub recusou o acesso (pausa ou permissão)',
        404: 'dados não encontrados no GitHub' }[res.status] || `erro ${res.status} do GitHub`);
    }
    return res;
  }

  async function lerArquivo(gist, nome) {
    const arq = gist.files?.[nome];
    if (!arq) return null;
    let texto = arq.content || '';
    if (arq.truncated) texto = await (await fetch(arq.raw_url, { cache: 'no-store' })).text();
    return texto.trim() ? JSON.parse(texto) : null;
  }

  // Conectar este aparelho: confere a senha abrindo os dados do Gist
  async function conectar({ token, gistId, api: apiTeste }, senha) {
    const c = { token, gistId, ...(apiTeste ? { api: apiTeste } : {}) };
    const gist = await (await req(c, `/gists/${gistId}`)).json();
    const env = await lerArquivo(gist, ARQ_DADOS);
    if (!env) throw new Error('o PC ainda não publicou os dados — ative o celular na extensão');
    const chave = await Cripto.derivar(senha, env.salt, env.iter);
    let d;
    try { d = await Cripto.decifrar(env, chave); } catch { throw new Error('senha incorreta'); }
    localStorage.setItem(KEY, JSON.stringify({ ...c, chave, salt: env.salt, iter: env.iter }));
    etag = null;
    receber(d);
    iniciar();
  }

  function desconectar() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(CACHE);
    etag = null; dados = null;
    setEstado('desligado');
  }

  function receber(d) {
    dados = d;
    try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch { /* cheio: segue só em memória */ }
  }

  async function ciclo() {
    if (!configurado()) return setEstado('desligado');
    if (rodando) return;
    rodando = true;
    if (estado.status !== 'ok') setEstado('sincronizando');
    try {
      const c = cfg();
      const res = await req(c, `/gists/${c.gistId}`, { condicional: true });
      if (res.status !== 304 || !dados) {
        const env = await lerArquivo(await res.json(), ARQ_DADOS);
        if (env) {
          if (env.salt !== c.salt) throw new Error('a senha foi trocada no PC — conecte de novo em ⚙️');
          try { receber(await Cripto.decifrar(env, c.chave)); } catch { throw new Error('não foi possível abrir os dados (senha trocada?)'); }
        }
        etag = res.headers.get('ETag');
      }
      setEstado('ok');
    } catch (e) {
      setEstado('erro', e.message || String(e));
    } finally {
      rodando = false;
      agendar();
    }
  }

  function agendar() {
    clearTimeout(timer);
    if (!configurado()) return;
    const rapido = Date.now() < rapidoAte;
    timer = setTimeout(() => {
      if (document.visibilityState === 'visible' || rapido) ciclo(); else agendar();
    }, rapido ? INTERVALO_RAPIDO : INTERVALO);
  }

  // Manda uma ordem ao PC. Devolve o id — a resposta chega em dados.respostas[id].
  async function enviarOrdem(ordem) {
    if (!configurado()) throw new Error('conecte o app ao PC em ⚙️');
    const c = cfg();
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const gist = await (await req(c, `/gists/${c.gistId}`)).json();
    let lista = [];
    const env = await lerArquivo(gist, ARQ_PEDIDOS);
    if (env) {
      try { lista = (await Cripto.decifrar(env, c.chave)).pedidos || []; } catch { lista = []; }
    }
    lista = lista.filter((o) => Date.now() - (o.ts || 0) < VALIDADE_ORDEM);
    lista.push({ ...ordem, id, ts: Date.now() });
    const conteudo = await Cripto.cifrar({ pedidos: lista }, c.chave, c.salt, c.iter);
    await req(c, `/gists/${c.gistId}`, { method: 'PATCH', body: { files: { [ARQ_PEDIDOS]: { content: conteudo } } } });
    etag = null;
    rapidoAte = Date.now() + RAPIDO_POR; // consulta rápida até a resposta chegar
    agendar();
    return id;
  }

  let iniciado = false;
  function iniciar() {
    if (!iniciado) {
      iniciado = true;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciclo(); });
      window.addEventListener('online', ciclo);
    }
    ciclo();
  }

  return {
    cfg, configurado, conectar, desconectar, iniciar, agora: ciclo, enviarOrdem, estado,
    dados: () => dados, ouvir: (fn) => ouvintes.add(fn),
  };
})();
