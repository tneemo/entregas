// Ambiente de demonstração: enche um banco local SEPARADO do seu banco de desenvolvimento
// com uma pizzaria, equipe, uma semana de entregas, avaliações e motoboys andando no mapa.
//
//   npm run demo:preparar -w @entregas/api   (uma vez: cria as tabelas em .wrangler/demo)
//   npm run dev:demo -w @entregas/api        (API usando esse banco; deixe rodando)
//   npm run demo -w @entregas/api            (este script; fica movendo os motoboys até Ctrl+C)
//
// Só fala com http://localhost:8787 e só funciona em banco vazio (usa o SETUP_TOKEN do
// .dev.vars para criar o super admin). As contas criadas aqui são fictícias.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'http://localhost:8787/api/v1';
const PERSISTENCIA = '.wrangler/demo';
const SO_SEMEAR = process.argv.includes('--sem-movimento');

/** Contas da demonstração (fictícias; valem só no banco local de demonstração). */
export const DEMO = {
  senha: 'demo-entregas-2026',
  superAdmin: 'plataforma@demo.local',
  admin: 'dona@belamassa.demo',
  despachante: 'central@belamassa.demo',
};

// Utilidades ------------------------------------------------------------------

const sorteio = (min, max) => min + Math.random() * (max - min);
const inteiro = (min, max) => Math.floor(sorteio(min, max + 1));
const escolher = (lista) => lista[inteiro(0, lista.length - 1)];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function digitosVerificadores(base, pesos) {
  const dv = (s, inicio) => {
    let soma = 0;
    let peso = inicio;
    for (const ch of s) {
      soma += Number(ch) * peso;
      peso = pesos === 'cnpj' ? (peso === 2 ? 9 : peso - 1) : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base, pesos === 'cnpj' ? 5 : 10);
  return `${base}${d1}${dv(base + d1, pesos === 'cnpj' ? 6 : 11)}`;
}
const numeros = (n) => Array.from({ length: n }, () => inteiro(0, 9)).join('');
const novoCnpj = () => digitosVerificadores(`${numeros(8)}0001`, 'cnpj');
const novoCpf = () => digitosVerificadores(numeros(9), 'cpf');
const novoCelular = () => `(45) 9${numeros(4)}-${numeros(4)}`;

async function chamar(metodo, caminho, corpo, token) {
  const resposta = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) {
    const erro = new Error(`${metodo} ${caminho} → ${resposta.status}: ${texto.slice(0, 300)}`);
    erro.status = resposta.status;
    erro.codigo = dados?.erro?.codigo;
    throw erro;
  }
  return dados;
}

async function entrar(login) {
  const r = await chamar('POST', '/auth/entrar', { login, senha: DEMO.senha, modo: 'token' });
  return r.token;
}

// Cenário ---------------------------------------------------------------------

const LOJA = { latitude: -24.9578, longitude: -53.4595 };
const ponto = (latitude, longitude) => ({ latitude, longitude, precisao: 'numero', fonte: 'mapa' });
const endereco = (logradouro, numero, bairro, lat, lng, extra = {}) => ({
  logradouro,
  numero,
  bairro,
  cidade: 'Cascavel',
  uf: 'PR',
  localizacao: ponto(lat, lng),
  ...extra,
});

const ENDERECO_LOJA = endereco('Rua Paraná', '3033', 'Centro', LOJA.latitude, LOJA.longitude, { cep: '85810010' });

const CLIENTES = [
  ['Mariana Lopes', 'Av. Brasil', '6282', 'Centro', -24.9548, -53.4635],
  ['João Batista', 'Rua Recife', '1420', 'Centro', -24.9611, -53.4581],
  ['Fernanda Dias', 'Rua Minas Gerais', '2244', 'Centro', -24.9529, -53.4562],
  ['Carlos Eduardo', 'Rua Carlos Gomes', '3120', 'Centro', -24.9597, -53.4667],
  ['Patrícia Nunes', 'Av. Tancredo Neves', '1810', 'Alto Alegre', -24.9461, -53.4703],
  ['Lucas Pereira', 'Rua Jorge Lacerda', '890', 'Claudete', -24.9689, -53.4728],
  ['Aline Ferraz', 'Rua Europa', '455', 'Cancelli', -24.9402, -53.4611],
  ['Roberto Kühn', 'Rua Rio de Janeiro', '1765', 'Centro', -24.9636, -53.4532],
  ['Simone Barros', 'Av. Carlos Gomes', '2710', 'Parque São Paulo', -24.9722, -53.4498],
  ['Eduardo Ramos', 'Rua Cuiabá', '3355', 'Recanto Tropical', -24.9518, -53.4801],
  ['Bianca Moraes', 'Rua Vitória', '2080', 'Country', -24.9442, -53.4467],
  ['Gustavo Lima', 'Rua da Lapa', '612', 'Neva', -24.9684, -53.4619],
  ['Tatiane Costa', 'Av. Assunção', '1190', 'Pacaembu', -24.9361, -53.4549],
  ['Marcelo Vidal', 'Rua Manaus', '2901', 'Coqueiral', -24.9649, -53.4802],
  ['Renata Prado', 'Rua Pio XII', '740', 'Maria Luíza', -24.9743, -53.4643],
  ['Vinícius Klein', 'Rua Souza Naves', '3987', 'Centro', -24.9571, -53.4528],
].map(([nome, rua, numero, bairro, lat, lng]) => ({
  nome,
  telefone: novoCelular(),
  endereco: endereco(rua, numero, bairro, lat, lng),
}));

const COMENTARIOS = [
  [5, 'Chegou quentinha e antes do previsto!'],
  [5, 'Entregador muito educado.'],
  [5, null],
  [4, 'Tudo certo, só demorou um pouco para sair.'],
  [5, 'Acompanhei pelo link o tempo todo, adorei.'],
  [3, 'A caixa veio um pouco amassada.'],
  [5, null],
  [4, null],
  [2, 'Demorou bastante hoje.'],
  [5, 'Perfeito, como sempre.'],
];

function corpoDoPedido(cliente, extras = {}) {
  const pago = Math.random() < 0.45;
  const valor = inteiro(38, 129) * 100 + escolher([0, 50, 90]);
  const forma = pago ? 'pago' : escolher(['dinheiro', 'pix', 'pix', 'cartao']);
  return {
    coleta: { nome: 'Pizzaria Bela Massa', endereco: ENDERECO_LOJA },
    entrega: { nome: cliente.nome, telefone: cliente.telefone, endereco: cliente.endereco },
    formaPagamento: forma,
    valorACobrarCentavos: pago ? 0 : valor,
    ...(forma === 'dinheiro' && Math.random() < 0.5 ? { trocoParaCentavos: Math.ceil(valor / 5000) * 5000 } : {}),
    taxaEntregaCentavos: escolher([600, 700, 800, 1000]),
    ...extras,
  };
}

async function principal() {
  const setupToken = readFileSync(join(RAIZ, '.dev.vars'), 'utf8')
    .match(/^SETUP_TOKEN=(.+)$/m)?.[1]
    ?.trim();
  if (!setupToken) throw new Error('SETUP_TOKEN não encontrado em apps/api/.dev.vars.');

  try {
    await chamar('GET', '/saude');
  } catch {
    throw new Error('A API não respondeu em localhost:8787. Rode antes: npm run dev:demo -w @entregas/api');
  }

  console.log('Criando a plataforma e a empresa…');
  try {
    await chamar('POST', '/setup', {
      token: setupToken,
      nome: 'Equipe da Plataforma',
      email: DEMO.superAdmin,
      senha: DEMO.senha,
    });
  } catch (erro) {
    if (erro.codigo === 'ja_configurado') {
      throw new Error(
        'Este banco já tem dados. A demonstração só roda em banco vazio: confira se a API foi iniciada com "npm run dev:demo" (e não "npm run dev").',
      );
    }
    throw erro;
  }
  const superAdmin = await entrar(DEMO.superAdmin);
  const cidades = await chamar('GET', '/admin/cidades', undefined, superAdmin);
  const cascavel = cidades.find((c) => c.nome === 'Cascavel') ?? cidades[0];

  const { empresa, conviteAdmin } = await chamar(
    'POST',
    '/admin/empresas',
    {
      tipo: 'loja',
      razaoSocial: 'Bela Massa Pizzaria Ltda',
      nomeFantasia: 'Pizzaria Bela Massa',
      cnpj: novoCnpj(),
      cidadeId: cascavel.id,
      telefone: '(45) 3222-1000',
    },
    superAdmin,
  );
  const E = `/empresas/${empresa.id}`;
  const aceitar = (convite, dados) =>
    chamar('POST', `/convites/${convite.caminho.replace('/convite/', '')}/aceitar`, {
      ...dados,
      senha: DEMO.senha,
      modo: 'token',
    });

  await aceitar(conviteAdmin, { nome: 'Helena Bela Massa', email: DEMO.admin });
  const admin = await entrar(DEMO.admin);
  await chamar('PATCH', E, { endereco: ENDERECO_LOJA, prazoAceiteMin: 30 }, admin);

  const conviteCentral = await chamar('POST', `${E}/convites`, { papel: 'despachante' }, admin);
  await aceitar(conviteCentral, { nome: 'Paulo da Central', email: DEMO.despachante });
  const central = await entrar(DEMO.despachante);

  const motoboys = [];
  for (const nome of ['Rafael Souza', 'Diego Martins', 'Camila Rocha', 'Thiago Alves']) {
    const convite = await chamar('POST', `${E}/convites`, { papel: 'motoboy', nomeConvidado: nome }, central);
    const telefone = novoCelular();
    const eu = await aceitar(convite, { nome, telefone, cpf: novoCpf() });
    motoboys.push({
      nome,
      token: await entrar(telefone),
      vinculoId: eu.vinculos[0].vinculoId,
      posicao: { latitude: LOJA.latitude + sorteio(-0.004, 0.004), longitude: LOJA.longitude + sorteio(-0.004, 0.004) },
      alvo: null,
    });
  }
  const [rafael, diego, camila] = motoboys;

  const acao = (pedido, nome, corpo = {}) => chamar('POST', `${E}/pedidos/${pedido.id}/acoes/${nome}`, corpo, central);
  const criar = (cliente, extras) => chamar('POST', `${E}/pedidos`, corpoDoPedido(cliente, extras), central);
  async function ateEmRota(pedido, motoboy) {
    await acao(pedido, 'atribuir', { motoboyVinculoId: motoboy.vinculoId });
    await acao(pedido, 'iniciar_coleta');
    await acao(pedido, 'coletar');
  }
  async function entregar(pedido, motoboy) {
    await ateEmRota(pedido, motoboy);
    await acao(pedido, 'entregar', { codigo: pedido.codigoEntrega });
  }
  const avaliar = (pedido, [nota, comentario]) =>
    chamar('POST', `/rastreio/${pedido.rastreio.caminho.replace('/r/', '')}/avaliacao`, {
      nota,
      ...(comentario ? { comentario } : {}),
    });

  // Duas semanas de histórico: entregue agora pela API, e as datas são recuadas no banco depois.
  console.log('Gerando duas semanas de entregas (leva uns dois minutos)…');
  const historico = [];
  for (let dia = 13; dia >= 1; dia--) {
    const quantos = inteiro(7, 13) + (dia === 2 || dia === 1 ? 5 : 0);
    for (let i = 0; i < quantos; i++) {
      const pedido = await criar(escolher(CLIENTES));
      const motoboy = escolher(motoboys);
      const devolvido = Math.random() < 0.06;
      if (devolvido) {
        await ateEmRota(pedido, motoboy);
        await acao(pedido, 'falhar', { motivo: 'Cliente não atendeu o interfone nem o telefone.' });
        await acao(pedido, 'devolver');
        await acao(pedido, 'concluir_devolucao');
      } else {
        await entregar(pedido, motoboy);
        if (Math.random() < 0.55) await avaliar(pedido, escolher(COMENTARIOS));
      }
      // Pico no almoço e no jantar.
      const hora = Math.random() < 0.3 ? sorteio(11.3, 13.5) : sorteio(18.2, 22.4);
      historico.push({ id: pedido.id, dia, hora, duracaoMin: sorteio(19, 46) + (devolvido ? 25 : 0) });
    }
  }

  console.log('Montando o movimento de hoje…');
  const hoje = [...CLIENTES].sort(() => Math.random() - 0.5);
  const proximo = () => hoje.pop() ?? escolher(CLIENTES);
  const feitosHoje = [];
  for (let i = 0; i < 7; i++) {
    const pedido = await criar(proximo());
    await entregar(pedido, escolher([rafael, diego, camila]));
    if (i < 5) await avaliar(pedido, COMENTARIOS[i]);
    feitosHoje.push(pedido.id);
  }
  const cancelado = await criar(proximo());
  await acao(cancelado, 'cancelar', { motivo: 'Cliente pediu para cancelar.' });

  for (const m of [rafael, diego, camila]) await chamar('POST', `${E}/turno`, undefined, m.token);

  const rotaRafael = await criar(proximo(), { observacoes: 'Interfone quebrado, ligar ao chegar.' });
  await ateEmRota(rotaRafael, rafael);
  rafael.alvo = rotaRafael.entrega.endereco.localizacao;
  const rotaCamila = await criar(proximo());
  await ateEmRota(rotaCamila, camila);
  camila.alvo = rotaCamila.entrega.endereco.localizacao;

  const problema = await criar(proximo());
  await ateEmRota(problema, camila);
  await acao(problema, 'falhar', { motivo: 'Endereço não encontrado: o número não existe na rua.' });

  const coletando = await criar(proximo());
  await acao(coletando, 'atribuir', { motoboyVinculoId: diego.vinculoId });
  await acao(coletando, 'iniciar_coleta');
  const aguardandoAceite = await criar(proximo());
  await acao(aguardandoAceite, 'atribuir', { motoboyVinculoId: diego.vinculoId });
  for (let i = 0; i < 3; i++) await criar(proximo());

  recuarDatas(historico, feitosHoje);

  console.log(`
Pronto. Abra http://localhost:5173 e entre com uma destas contas (senha em apps/api/scripts/demo.mjs):
  central (despachante): ${DEMO.despachante}
  dona da empresa:       ${DEMO.admin}
  plataforma:            ${DEMO.superAdmin}
Link de acompanhamento de um pedido em rota: http://localhost:5173${rotaRafael.rastreio.caminho}
`);

  if (SO_SEMEAR) return;
  console.log('Movendo os motoboys no mapa. Ctrl+C para parar.');
  await mover(E, [rafael, diego, camila]);
}

/** Espalha o histórico pelos últimos dias direto no banco local (a API não aceita data retroativa). */
function recuarDatas(historico, feitosHoje) {
  const DIA = 24 * 60 * 60 * 1000;
  const agora = Date.now();
  const meiaNoite = Date.parse(`${new Date(agora - 3 * 3600_000).toISOString().slice(0, 10)}T00:00:00-03:00`);
  const linhas = [];
  const mover = (id, criado, concluido) => {
    linhas.push(
      `UPDATE pedidos SET criado_em = ${criado}, concluido_em = ${concluido}, atualizado_em = ${concluido} WHERE id = '${id}';`,
    );
    linhas.push(`UPDATE eventos_pedido SET criado_em = ${criado} + (criado_em % 1000) WHERE pedido_id = '${id}';`);
    linhas.push(`UPDATE avaliacoes SET criado_em = ${concluido} + 600000 WHERE pedido_id = '${id}';`);
  };
  for (const h of historico) {
    const criado = Math.round(meiaNoite - h.dia * DIA + h.hora * 3600_000);
    mover(h.id, criado, Math.round(criado + h.duracaoMin * 60_000));
  }
  // Os de hoje foram entregues ao longo das últimas horas, não todos no mesmo segundo.
  feitosHoje.forEach((id, i) => {
    const concluido = Math.round(agora - (i + 1) * sorteio(9, 16) * 60_000);
    mover(id, Math.round(concluido - sorteio(21, 38) * 60_000), concluido);
  });

  const arquivo = join(RAIZ, PERSISTENCIA, 'recuar-datas.sql');
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, linhas.join('\n'));
  try {
    const wrangler = join(
      dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),
      'bin',
      'wrangler.js',
    );
    execFileSync(
      process.execPath,
      [wrangler, 'd1', 'execute', 'DB', '--local', '--persist-to', PERSISTENCIA, '--file', arquivo, '--yes'],
      { cwd: RAIZ, stdio: 'pipe' },
    );
  } catch (erro) {
    console.warn('Não deu para espalhar o histórico pelos dias anteriores; tudo vai aparecer como hoje.');
    console.warn(String(erro.stderr ?? erro.message).slice(0, 400));
  }
}

/** Faz cada motoboy andar: quem tem entrega vai até o cliente e recomeça; os outros circulam perto da loja. */
async function mover(E, motoboys) {
  for (;;) {
    for (const m of motoboys) {
      const destino = m.alvo ?? {
        latitude: LOJA.latitude + sorteio(-0.006, 0.006),
        longitude: LOJA.longitude + sorteio(-0.006, 0.006),
      };
      const dLat = destino.latitude - m.posicao.latitude;
      const dLng = destino.longitude - m.posicao.longitude;
      const falta = Math.hypot(dLat, dLng);
      if (m.alvo && falta < 0.0012) {
        // Quase na porta: volta para a loja e refaz o trajeto, para a demonstração não acabar.
        m.posicao = { latitude: LOJA.latitude, longitude: LOJA.longitude };
      } else {
        const passo = Math.min(1, 0.0007 / (falta || 1));
        m.posicao = {
          latitude: m.posicao.latitude + dLat * passo + sorteio(-0.00008, 0.00008),
          longitude: m.posicao.longitude + dLng * passo + sorteio(-0.00008, 0.00008),
        };
      }
      await chamar(
        'POST',
        `${E}/turno/posicoes`,
        {
          pontos: [
            {
              ...m.posicao,
              precisao: inteiro(6, 18),
              velocidade: sorteio(5, 11),
              registradoEm: new Date().toISOString(),
            },
          ],
        },
        m.token,
      ).catch((erro) => console.warn(`posição de ${m.nome} não enviada: ${erro.message}`));
    }
    await dormir(4_000);
  }
}

principal().catch((erro) => {
  console.error(`\n${erro.message}`);
  process.exit(1);
});
