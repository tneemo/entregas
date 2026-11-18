// Entregas Central: o painel da central numa janela própria, para Windows, macOS e Linux.
//
// Não tem código do painel aqui dentro: a janela abre o endereço publicado (produção por
// padrão), então toda atualização do painel chega sozinha, sem reinstalar o programa.
//
//   ENTREGAS_URL=https://... electron .   outro endereço (ex.: http://localhost:5173)
//   electron . --homologacao              ambiente de homologação
//
// Segurança: a página roda isolada (contextIsolation, sandbox, sem Node). Só o próprio
// painel abre dentro da janela; qualquer outro link (WhatsApp, Google Maps, rastreio)
// vai para o navegador padrão. Das permissões do navegador, só notificação é liberada.

const { app, BrowserWindow, Menu, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PRODUCAO = 'https://entregas.tneemo.com';
const HOMOLOGACAO = 'https://entregas-homologacao.tneemo.com';
const TITULO = 'Entregas — Central';

/** Endereço do painel que esta janela abre. */
function enderecoInicial() {
  if (process.env.ENTREGAS_URL) return process.env.ENTREGAS_URL;
  return process.argv.includes('--homologacao') ? HOMOLOGACAO : PRODUCAO;
}

const INICIAL = new URL(enderecoInicial());
const ORIGEM = INICIAL.origin;
const PAGINA_SEM_CONEXAO = path.join(__dirname, 'sem-conexao.html');
const URL_SEM_CONEXAO = pathToFileURL(PAGINA_SEM_CONEXAO).href;

/** @param {string} url */
function ehDoPainel(url) {
  try {
    return new URL(url).origin === ORIGEM;
  } catch {
    return false;
  }
}

/** Abre no navegador padrão só o que é seguro abrir fora (nunca file:, javascript: etc.). */
function abrirFora(/** @type {string} */ url) {
  try {
    const { protocol } = new URL(url);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(protocol)) shell.openExternal(url);
  } catch {
    // Endereço inválido: ignora.
  }
}

// Tamanho e posição da janela ----------------------------------------------------

const ARQUIVO_JANELA = () => path.join(app.getPath('userData'), 'janela.json');

/** @returns {{ width: number, height: number, x?: number, y?: number, maximizada?: boolean }} */
function lerJanela() {
  try {
    const salvo = JSON.parse(fs.readFileSync(ARQUIVO_JANELA(), 'utf8'));
    if (Number.isFinite(salvo.width) && Number.isFinite(salvo.height)) return salvo;
  } catch {
    // Primeira abertura ou arquivo corrompido: usa o padrão.
  }
  return { width: 1280, height: 820 };
}

function salvarJanela(/** @type {BrowserWindow} */ janela) {
  try {
    const maximizada = janela.isMaximized();
    const limites = maximizada ? janela.getNormalBounds() : janela.getBounds();
    fs.writeFileSync(ARQUIVO_JANELA(), JSON.stringify({ ...limites, maximizada }));
  } catch {
    // Não conseguir lembrar o tamanho não impede de fechar.
  }
}

// Janela ---------------------------------------------------------------------------

/** @type {BrowserWindow | null} */
let janela = null;

function carregarPainel(/** @type {string} */ url = INICIAL.href) {
  janela?.loadURL(url);
}

function criarJanela() {
  const salvo = lerJanela();
  janela = new BrowserWindow({
    title: TITULO,
    width: salvo.width,
    height: salvo.height,
    x: salvo.x,
    y: salvo.y,
    minWidth: 360,
    minHeight: 480,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });
  if (salvo.maximizada) janela.maximize();
  janela.once('ready-to-show', () => janela?.show());

  // O título da página muda a cada tela; a janela mantém o nome do programa.
  janela.on('page-title-updated', (evento) => evento.preventDefault());

  const conteudo = janela.webContents;

  // Links que abririam outra janela (target=_blank, window.open): navegador padrão.
  conteudo.setWindowOpenHandler(({ url }) => {
    abrirFora(url);
    return { action: 'deny' };
  });

  // Navegação dentro da janela só para o próprio painel (e a tela local de sem conexão).
  conteudo.on('will-navigate', (evento, url) => {
    if (ehDoPainel(url) || url.split('?')[0] === URL_SEM_CONEXAO) return;
    evento.preventDefault();
    abrirFora(url);
  });
  conteudo.on('will-redirect', (evento, url) => {
    if (ehDoPainel(url)) return;
    evento.preventDefault();
    abrirFora(url);
  });

  // Sem internet (ou servidor fora): mostra a tela local com "tentar de novo".
  conteudo.on('did-fail-load', (_evento, codigo, _descricao, url, principal) => {
    // -3 = navegação abortada (ex.: trocou de página antes de terminar); não é falta de conexão.
    if (!principal || codigo === -3 || !ehDoPainel(url)) return;
    janela?.loadFile(PAGINA_SEM_CONEXAO, { query: { voltar: url } });
  });

  janela.on('close', () => janela && salvarJanela(janela));
  janela.on('closed', () => {
    janela = null;
  });

  carregarPainel();
}

// Menu -----------------------------------------------------------------------------

function criarMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const modelo = [
    ...(process.platform === 'darwin'
      ? [
          /** @type {Electron.MenuItemConstructorOptions} */ ({
            label: 'Entregas Central',
            submenu: [
              { role: 'about', label: 'Sobre o Entregas Central' },
              { type: 'separator' },
              { role: 'quit', label: 'Sair' },
            ],
          }),
        ]
      : []),
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Abrir no navegador',
          click: () => {
            const atual = janela?.webContents.getURL();
            abrirFora(atual && ehDoPainel(atual) ? atual : INICIAL.href);
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        {
          label: 'Recarregar',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const atual = janela?.webContents.getURL();
            // Na tela de sem conexão, recarregar é tentar o painel de novo.
            if (atual && ehDoPainel(atual)) janela?.webContents.reload();
            else carregarPainel();
          },
        },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Aumentar zoom', accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut', label: 'Diminuir zoom' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        ...(app.isPackaged
          ? []
          : [{ type: 'separator' }, { role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(/** @type {Electron.MenuItemConstructorOptions[]} */ (modelo)));
}

// Início ---------------------------------------------------------------------------

// Uma janela só: abrir o programa de novo traz a que já está aberta para a frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!janela) return criarJanela();
    if (janela.isMinimized()) janela.restore();
    janela.show();
    janela.focus();
  });

  app.whenReady().then(() => {
    // Notificação (avisos de pedido novo) sim; câmera, microfone, localização etc. não.
    const permitidas = new Set(['notifications']);
    session.defaultSession.setPermissionRequestHandler((conteudo, permissao, responder) => {
      responder(permitidas.has(permissao) && ehDoPainel(conteudo.getURL()));
    });
    session.defaultSession.setPermissionCheckHandler((_conteudo, permissao, origem) => {
      return permitidas.has(permissao) && origem === ORIGEM;
    });

    criarMenu();
    criarJanela();

    // macOS: clicar no ícone do Dock sem janela aberta abre uma nova.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });

  // Fechar a janela encerra o programa (inclusive no macOS, para não ficar rodando escondido).
  app.on('window-all-closed', () => app.quit());

  // Nenhuma outra janela ou webview pode ser criada por conteúdo da página.
  app.on('web-contents-created', (_evento, conteudo) => {
    conteudo.on('will-attach-webview', (evento) => evento.preventDefault());
  });
}
