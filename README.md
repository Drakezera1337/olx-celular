# OLX no celular 📱

Os anúncios captados pela extensão **OLX Dashboard** (no Chrome do PC) direto no celular — com
compra pelo próprio celular ou feita pelo PC.

Site estático (HTML + CSS + JS, sem build), feito para o **GitHub Pages**. Instalável na tela inicial.

## O que dá para fazer

- **Anúncios**: a mesma lista da dashboard (fotos, preço, local, selos de defeito, golpe, conta nova,
  “Solicitar”, faz envio, regional, avaliação de preço do iPhone), com busca e filtros. Avisa quando chega anúncio novo.
- **🛒 Comprar aqui**: abre o checkout da OLX no próprio celular (com a conta logada no celular).
- **💻 Comprar pelo PC**: manda a extensão fazer a Compra Rápida no PC (Expressa + Pix) e mostra o
  resultado aqui — compra finalizada (com total, cronômetro e botão **Copiar código Pix**), reservado
  (com opção de **Forçar compra pelo PC** e de parar), vendido ou erro.
- **Reservas**: compras aguardando pagamento, com cronômetro e código Pix.
- **Pedidos**: os pedidos do “Verificar compras” / “Verificação Completa”, com a conta de cada um.

## Como funciona

- A extensão publica os dados num **Gist secreto** do GitHub, **criptografados** (AES-256-GCM; chave
  derivada da senha com PBKDF2-SHA256, 310 mil iterações). Sem a senha, o conteúdo é ilegível.
- `olx.json` é escrito pelo PC (anúncios, reservas, pedidos, respostas); `olx_pedidos.json` é escrito
  pelo celular (ordens de compra). O PC confere as ordens a cada ~3 s.
- O app atualiza a cada 15 s com a tela aberta (e a cada 3 s logo depois de uma ordem).
- “Comprar pelo PC” precisa do PC ligado com o Chrome aberto e a extensão carregada.

Nenhum dado fica neste repositório: aqui só há o código do site.

## Ligar

1. No PC, abra a dashboard da extensão → ⚙️ → **📱 Celular** → cole um token do GitHub com permissão
   **gist** e crie uma senha → **Ativar celular**. Aparece um QR code.
2. No celular, abra o site → **Configurar** → **📷 Ler QR do PC** → digite a senha.
3. Adicione à tela inicial (Safari: Compartilhar → Adicionar à Tela de Início; Chrome: ⋮ → Instalar app).

No iPhone, leia o QR **de dentro do app já instalado**.

## Publicar uma mudança

```bash
python versao.py
git add -A
git commit -m "..."
git push
```

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html`, `styles.css` | Estrutura e visual |
| `app.js` | Telas: anúncios, detalhe/compra, reservas, pedidos, configuração |
| `sync.js` | Leitura dos dados e envio de ordens pelo Gist |
| `cripto.js` | Criptografia (igual à da extensão) |
| `sw.js`, `manifest.webmanifest` | App instalável |
| `versao.py` | Sobe a versão antes de publicar |
