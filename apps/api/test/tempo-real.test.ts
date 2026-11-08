import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import type { MensagemCentral, PedidoDetalhe, RastreioResposta } from '@entregas/shared';
import { criarDb } from '../src/db/index.ts';
import { pedidos } from '../src/db/schema.ts';
import { Cliente, Conexao, aceitarComContaNova, empresaComEquipe, novoPedido, novoSuperAdmin } from './ajudantes.ts';

type Equipe = Awaited<ReturnType<typeof empresaComEquipe>>;
const vinculoDe = (p: Equipe['motoboy']) => p.eu.vinculos[0].vinculoId as string;
const ponto = (segundosAtras = 0, extras = {}) => ({
  latitude: -24.9555,
  longitude: -53.4552,
  precisao: 8,
  registradoEm: new Date(Date.now() - segundosAtras * 1000).toISOString(),
  ...extras,
});
const tokenDe = (p: PedidoDetalhe) => p.rastreio!.caminho.replace('/r/', '');

// Toda conexão aberta num teste é fechada no fim dele.
const abertas: Conexao[] = [];
async function abrir(cliente: Cliente, caminho: string) {
  const r = await cliente.abrirWs(caminho);
  if (!r.conexao) throw new Error(`WebSocket não abriu (${r.status}) em ${caminho}`);
  abertas.push(r.conexao);
  return r.conexao;
}
afterEach(() => {
  for (const c of abertas.splice(0)) c.fechar();
});

describe('mapa ao vivo: quem pode conectar', () => {
  let a: Equipe;
  let b: Equipe;
  beforeAll(async () => {
    const sa = await novoSuperAdmin();
    a = await empresaComEquipe(sa);
    b = await empresaComEquipe(sa);
  });

  it('admin e despachante conectam; motoboy não; outra empresa não vê que existe', async () => {
    const WS = `/empresas/${a.empresa.id}/central/ws`;
    expect((await a.admin.cliente.abrirWs(WS)).status).toBe(101);
    expect((await a.despachante.cliente.abrirWs(WS)).status).toBe(101);
    expect((await a.motoboy.cliente.abrirWs(WS)).status).toBe(403);
    expect((await b.admin.cliente.abrirWs(WS)).status).toBe(404);
    expect((await new Cliente().abrirWs(WS)).status).toBe(401);
  });

  it('bloqueia conexão aberta por outro site com o cookie da sessão', async () => {
    const WS = `/empresas/${a.empresa.id}/central/ws`;
    expect((await a.admin.cliente.abrirWs(WS, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    const semFetchSite = await a.admin.cliente.req('GET', WS, undefined, {
      upgrade: 'websocket',
      origin: 'https://site-malicioso.example',
    });
    expect(semFetchSite.status).toBe(403);
  });

  it('sem pedido de WebSocket, responde 426', async () => {
    const r = await a.admin.cliente.get(`/empresas/${a.empresa.id}/central/ws`);
    expect(r.status).toBe(426);
  });
});

describe('mapa ao vivo: posições e turnos', () => {
  let a: Equipe;
  let b: Equipe;
  beforeAll(async () => {
    const sa = await novoSuperAdmin();
    a = await empresaComEquipe(sa);
    b = await empresaComEquipe(sa);
  });

  it('recebe turno, posição e fim do turno; a outra empresa não recebe nada', async () => {
    const A = a.empresa.id;
    const painelA = await abrir(a.despachante.cliente, `/empresas/${A}/central/ws`);
    const painelB = await abrir(b.despachante.cliente, `/empresas/${b.empresa.id}/central/ws`);
    expect(await painelA.esperar()).toEqual({ tipo: 'motoboys', motoboys: [] });
    await painelB.esperar((m) => m.tipo === 'motoboys');

    const moto = a.motoboy.cliente;
    await moto.post(`/empresas/${A}/turno`);
    expect(await painelA.esperar((m) => m.tipo === 'turno')).toEqual({
      tipo: 'turno',
      vinculoId: vinculoDe(a.motoboy),
      emTurno: true,
    });

    // Vários pontos de uma vez (fila offline): o mapa recebe só o mais recente.
    await moto.post(`/empresas/${A}/turno/posicoes`, { pontos: [ponto(5, { latitude: -24.95 }), ponto(30)] });
    const posicao = await painelA.esperar<Extract<MensagemCentral, { tipo: 'posicao' }>>((m) => m.tipo === 'posicao');
    expect(posicao.motoboy).toMatchObject({
      vinculoId: vinculoDe(a.motoboy),
      nome: a.motoboy.dados.nome,
      latitude: -24.95,
      precisao: 8,
    });

    // Ponto atrasado que chega depois não volta o marcador no tempo.
    await moto.post(`/empresas/${A}/turno/posicoes`, { pontos: [ponto(60, { latitude: -24.9 })] });
    await painelA.nenhuma((m) => m.tipo === 'posicao');
    const lidas = await a.admin.cliente.get(`/empresas/${A}/central/posicoes`);
    expect(lidas.corpo).toHaveLength(1);
    expect(lidas.corpo[0].latitude).toBe(-24.95);

    // Quem conecta depois recebe a foto atual.
    const atrasado = await abrir(a.admin.cliente, `/empresas/${A}/central/ws`);
    const foto = await atrasado.esperar((m) => m.tipo === 'motoboys');
    expect(foto.motoboys.map((m: { vinculoId: string }) => m.vinculoId)).toEqual([vinculoDe(a.motoboy)]);

    await moto.delete(`/empresas/${A}/turno`);
    expect(await painelA.esperar((m) => m.tipo === 'turno')).toMatchObject({ emTurno: false });
    expect((await a.admin.cliente.get(`/empresas/${A}/central/posicoes`)).corpo).toEqual([]);

    // Empresa B não soube de nada.
    await painelB.nenhuma();
    expect((await b.admin.cliente.get(`/empresas/${b.empresa.id}/central/posicoes`)).corpo).toEqual([]);
  });

  it('pedido criado e cada mudança de situação chegam ao painel', async () => {
    const A = a.empresa.id;
    const painel = await abrir(a.despachante.cliente, `/empresas/${A}/central/ws`);
    const p = await novoPedido(a.admin.cliente, A);
    expect(await painel.esperar((m) => m.tipo === 'pedido')).toEqual({ tipo: 'pedido', pedidoId: p.id, status: 'pendente' });

    await a.despachante.cliente.post(`/empresas/${A}/pedidos/${p.id}/acoes/atribuir`, {
      motoboyVinculoId: vinculoDe(a.motoboy),
    });
    expect(await painel.esperar((m) => m.tipo === 'pedido')).toMatchObject({ pedidoId: p.id, status: 'atribuido' });

    await a.motoboy.cliente.post(`/empresas/${A}/pedidos/${p.id}/acoes/recusar`);
    expect(await painel.esperar((m) => m.tipo === 'pedido')).toMatchObject({ pedidoId: p.id, status: 'pendente' });
  });
});

describe('rastreio público', () => {
  let a: Equipe;
  let anonimo: Cliente;
  beforeAll(async () => {
    a = await empresaComEquipe(await novoSuperAdmin());
    anonimo = new Cliente();
  });

  const acao = (cliente: Cliente, p: PedidoDetalhe, nome: string, corpo = {}) =>
    cliente.post(`/empresas/${a.empresa.id}/pedidos/${p.id}/acoes/${nome}`, corpo);

  it('só a central recebe o link do pedido', async () => {
    const p = await novoPedido(a.admin.cliente, a.empresa.id, { motoboyVinculoId: vinculoDe(a.motoboy) });
    expect(p.rastreio?.caminho).toMatch(/^\/r\/[A-Za-z0-9_-]{22}$/);
    const doMotoboy = await a.motoboy.cliente.get<PedidoDetalhe>(`/empresas/${a.empresa.id}/pedidos/${p.id}`);
    expect(doMotoboy.corpo.rastreio).toBeUndefined();
    await acao(a.motoboy.cliente, p, 'recusar');
  });

  it('mostra só o necessário e some com código e endereço depois de entregue', async () => {
    const p = await novoPedido(a.admin.cliente, a.empresa.id, { motoboyVinculoId: vinculoDe(a.motoboy) });
    const R = `/rastreio/${tokenDe(p)}`;

    const inicio = await anonimo.get<RastreioResposta>(R);
    expect(inicio.status).toBe(200);
    expect(inicio.headers.get('cache-control')).toBe('no-store');
    expect(inicio.corpo).toMatchObject({
      empresa: { nomeFantasia: a.empresa.nomeFantasia },
      numero: p.numero,
      status: 'atribuido',
      codigoEntrega: p.codigoEntrega,
      entrega: { logradouro: 'Av. Brasil', numero: '2000', bairro: 'Neva' },
      cobranca: { formaPagamento: 'dinheiro', valorACobrarCentavos: 4590, trocoParaCentavos: 5000 },
      motoboy: null,
      aoVivo: false,
    });
    // Nada de nome ou telefone do destinatário, nem identificadores internos.
    const texto = JSON.stringify(inicio.corpo);
    expect(texto).not.toContain(p.entrega.telefone!);
    expect(texto).not.toContain('Ana Cliente');
    expect(texto).not.toContain(p.id);
    expect(texto).not.toContain(vinculoDe(a.motoboy));

    await acao(a.motoboy.cliente, p, 'aceitar');
    expect((await anonimo.get<RastreioResposta>(R)).corpo.motoboy).toEqual({ primeiroNome: 'Motoboy' });

    await acao(a.motoboy.cliente, p, 'iniciar_coleta');
    await acao(a.motoboy.cliente, p, 'coletar');
    const emRota = await anonimo.get<RastreioResposta>(R);
    expect(emRota.corpo).toMatchObject({ status: 'em_rota', aoVivo: true });
    expect(emRota.corpo.horarios.saiuParaEntrega).toBeTruthy();

    await acao(a.motoboy.cliente, p, 'entregar', { codigo: p.codigoEntrega });
    const fim = await anonimo.get<RastreioResposta>(R);
    expect(fim.corpo).toMatchObject({
      status: 'entregue',
      codigoEntrega: null,
      entrega: null,
      cobranca: null,
      motoboy: null,
      aoVivo: false,
    });
    expect(fim.corpo.horarios.concluido).toBeTruthy();
  });

  it('link inválido dá 404; depois de 48 h da conclusão, expira', async () => {
    expect((await anonimo.get('/rastreio/nao-existe-este-token-aqui')).status).toBe(404);
    expect((await anonimo.get('/rastreio/curto')).status).toBe(404);
    expect((await anonimo.get(`/rastreio/${'%27%20OR%201%3D1--'.padEnd(20, 'a')}`)).status).toBe(404);

    const p = await novoPedido(a.admin.cliente, a.empresa.id);
    await acao(a.admin.cliente, p, 'cancelar', { motivo: 'Cliente desistiu' });
    const R = `/rastreio/${tokenDe(p)}`;
    expect((await anonimo.get<RastreioResposta>(R)).corpo.status).toBe('cancelado');

    await criarDb(env.DB)
      .update(pedidos)
      .set({ concluidoEm: new Date(Date.now() - 49 * 60 * 60 * 1000) })
      .where(eq(pedidos.id, p.id));
    const expirado = await anonimo.get(R);
    expect(expirado.status).toBe(410);
    expect(expirado.corpo.erro.codigo).toBe('rastreio_expirado');
  });

  it('ao vivo: posição só do entregador do pedido e só em rota; fecha ao entregar', async () => {
    const E = a.empresa.id;
    // Um segundo motoboy em turno na mesma empresa, que não leva este pedido.
    const convite = await a.admin.cliente.post(`/empresas/${E}/convites`, { papel: 'motoboy' });
    const outro = await aceitarComContaNova(convite.corpo.caminho, 'motoboy');
    await outro.cliente.post(`/empresas/${E}/turno`);
    await a.motoboy.cliente.post(`/empresas/${E}/turno`);

    const p = await novoPedido(a.admin.cliente, E, { motoboyVinculoId: vinculoDe(a.motoboy) });
    const ws = await abrir(anonimo, `/rastreio/${tokenDe(p)}/ws`);
    const enviar = (cliente: Cliente, latitude: number) =>
      cliente.post(`/empresas/${E}/turno/posicoes`, { pontos: [ponto(0, { latitude })] });

    // Antes de sair para entrega, o destinatário não vê a posição.
    await enviar(a.motoboy.cliente, -24.951);
    await ws.nenhuma((m) => m.tipo === 'posicao');

    await acao(a.motoboy.cliente, p, 'aceitar');
    await ws.esperar((m) => m.tipo === 'status');
    await acao(a.motoboy.cliente, p, 'iniciar_coleta');
    await ws.esperar((m) => m.tipo === 'status');

    // Saiu para entrega: recebe na hora a última posição conhecida.
    await acao(a.motoboy.cliente, p, 'coletar');
    await ws.esperar((m) => m.tipo === 'status');
    expect(await ws.esperar((m) => m.tipo === 'posicao')).toMatchObject({ latitude: -24.951, longitude: -53.4552 });

    await enviar(outro.cliente, -24.97);
    await ws.nenhuma((m) => m.tipo === 'posicao');

    await enviar(a.motoboy.cliente, -24.952);
    const nova = await ws.esperar((m) => m.tipo === 'posicao');
    expect(nova).toEqual({ tipo: 'posicao', latitude: -24.952, longitude: -53.4552, precisao: 8, registradoEm: expect.any(String) });
    expect(Object.keys(nova)).not.toContain('vinculoId');

    await acao(a.motoboy.cliente, p, 'entregar', { codigo: p.codigoEntrega });
    await ws.esperar((m) => m.tipo === 'status');
    await ws.esperar((m) => m.tipo === 'sem_posicao');
    await ws.esperarFechar();

    // Pedido terminado não abre mais conexão.
    expect((await anonimo.abrirWs(`/rastreio/${tokenDe(p)}/ws`)).status).toBe(409);
  });

  it('página /r/<token> é servida sem indexação', async () => {
    const r = await exports.default.fetch('https://entregas.teste/r/qualquer-token-de-teste');
    await r.arrayBuffer();
    expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
});
