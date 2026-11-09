// Notificação no celular do motoboy (Expo Push, simulado aqui): quem recebe, quando, o que
// vai no texto, e o que acontece com aparelho desinstalado ou depois de sair do app.

import { afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { eq as igual } from 'drizzle-orm';
import type { MotoboyResumo } from '@entregas/shared';
import { criarDb } from '../src/db/index.ts';
import { pedidos } from '../src/db/schema.ts';
import { vencerPrazosDeAceite } from '../src/tarefas.ts';
import { aceitarComContaNova, Cliente, empresaComEquipe, novoPedido, novoSuperAdmin } from './ajudantes.ts';

type Equipe = Awaited<ReturnType<typeof empresaComEquipe>>;
type Mensagem = { to: string; title: string; body: string; data: Record<string, string>; channelId: string };

const EXPO = 'https://exp.host/--/api/v2/push/send';
const vinculoDe = (pessoa: Equipe['motoboy']) => pessoa.eu.vinculos[0].vinculoId as string;
const tokenNovo = () => `ExponentPushToken[${crypto.randomUUID().slice(0, 22)}]`;

let expo: MockInstance<typeof fetch>;
let recibo: (m: Mensagem) => object = () => ({ status: 'ok', id: crypto.randomUUID() });

/** Mensagens que chegaram ao Expo até agora. */
function enviadas(): Mensagem[] {
  return expo.mock.calls
    .filter(([url]) => String(url) === EXPO)
    .flatMap(([, init]) => JSON.parse(String(init?.body)) as Mensagem[]);
}

/** O envio sai depois da resposta (waitUntil): espera a mensagem que satisfaz o filtro. */
async function esperarMensagem(filtro: (m: Mensagem) => boolean) {
  return vi.waitFor(() => {
    const achada = enviadas().find(filtro);
    if (!achada) throw new Error('mensagem ainda não enviada');
    return achada;
  });
}

beforeEach(() => {
  recibo = () => ({ status: 'ok', id: crypto.randomUUID() });
  expo = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url) !== EXPO) throw new Error(`fetch inesperado: ${String(url)}`);
    const lote = JSON.parse(String(init?.body)) as Mensagem[];
    return Response.json({ data: lote.map((m) => recibo(m)) });
  });
});
afterEach(() => vi.restoreAllMocks());

describe('notificações para o motoboy', () => {
  let eq: Equipe;
  let token: string;
  const E = () => `/empresas/${eq.empresa.id}`;
  const acao = (cliente: Cliente, pedidoId: string, nome: string, corpo: object = {}) =>
    cliente.post(`${E()}/pedidos/${pedidoId}/acoes/${nome}`, corpo);
  const motoboyNaLista = async (vinculoId: string) =>
    (await eq.admin.cliente.get<MotoboyResumo[]>(`${E()}/motoboys`)).corpo.find((m) => m.vinculoId === vinculoId)!;

  beforeAll(async () => {
    eq = await empresaComEquipe(await novoSuperAdmin());
  });

  beforeEach(async () => {
    // Cada teste parte de um celular novo cadastrado pelo motoboy da equipe.
    token = tokenNovo();
    const r = await eq.motoboy.cliente.post('/auth/dispositivo', { token, plataforma: 'android' });
    expect(r.status).toBe(204);
  });

  it('cadastro do celular: só logado e só com token do Expo', async () => {
    expect((await new Cliente().post('/auth/dispositivo', { token: tokenNovo(), plataforma: 'android' })).status).toBe(
      401,
    );
    const invalido = await eq.motoboy.cliente.post('/auth/dispositivo', { token: 'abc', plataforma: 'android' });
    expect(invalido.status).toBe(422);
    expect((await motoboyNaLista(vinculoDe(eq.motoboy))).recebeNotificacao).toBe(true);
  });

  it('pedido atribuído avisa o motoboy, sem nome nem telefone do cliente', async () => {
    const p = await novoPedido(eq.admin.cliente, eq.empresa.id);
    expect(
      (await acao(eq.despachante.cliente, p.id, 'atribuir', { motoboyVinculoId: vinculoDe(eq.motoboy) })).status,
    ).toBe(200);

    const m = await esperarMensagem((x) => x.to === token);
    expect(m.title).toBe(`Pedido ${p.numero} para você`);
    expect(m.body).toContain('Coleta: Centro · Entrega: Neva');
    expect(m.channelId).toBe('pedidos');
    expect(m.data).toEqual({ tipo: 'pedido', empresaId: eq.empresa.id, pedidoId: p.id });
    const texto = JSON.stringify(m);
    expect(texto).not.toContain('Ana Cliente');
    expect(texto).not.toContain(p.entrega.telefone!.slice(-8));
  });

  it('pedido criado já com motoboy também avisa', async () => {
    const p = await novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculoDe(eq.motoboy) });
    await esperarMensagem((x) => x.to === token && x.data.pedidoId === p.id);
  });

  it('central tira o pedido ou cancela: quem estava com ele fica sabendo', async () => {
    const vinculo = vinculoDe(eq.motoboy);
    const tirado = await novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculo });
    expect((await acao(eq.admin.cliente, tirado.id, 'desatribuir')).status).toBe(200);
    await esperarMensagem((x) => x.title === `Pedido ${tirado.numero} saiu da sua lista`);

    const cancelado = await novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculo });
    expect((await acao(eq.admin.cliente, cancelado.id, 'cancelar', { motivo: 'Cliente desistiu' })).status).toBe(200);
    await esperarMensagem((x) => x.title === `Pedido ${cancelado.numero} cancelado`);
  });

  it('o que o próprio motoboy faz não vira notificação para ele', async () => {
    const p = await novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculoDe(eq.motoboy) });
    await esperarMensagem((x) => x.data.pedidoId === p.id);
    expo.mockClear();
    expect((await acao(eq.motoboy.cliente, p.id, 'recusar')).status).toBe(200);
    // Dá tempo de qualquer envio em segundo plano acontecer.
    await new Promise((r) => setTimeout(r, 50));
    expect(enviadas()).toEqual([]);
  });

  it('aparelho que o Expo não reconhece mais (app desinstalado) é esquecido', async () => {
    recibo = (m) =>
      m.to === token
        ? { status: 'error', message: 'não registrado', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: 'x' };
    const p = await novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculoDe(eq.motoboy) });
    await esperarMensagem((x) => x.to === token && x.data.pedidoId === p.id);
    await vi.waitFor(async () => expect((await motoboyNaLista(vinculoDe(eq.motoboy))).recebeNotificacao).toBe(false));
  });

  it('prazo de aceite esgotado: o motoboy fica sabendo que o pedido voltou', async () => {
    const p = await novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculoDe(eq.motoboy) });
    await criarDb(env.DB)
      .update(pedidos)
      .set({ aceiteAte: new Date(Date.now() - 1_000) })
      .where(igual(pedidos.id, p.id));
    await vencerPrazosDeAceite(env);
    await esperarMensagem((x) => x.to === token && x.title === `Pedido ${p.numero} voltou para a central`);
  });
});

describe('celular preso à sessão', () => {
  it('sair do app apaga o cadastro: quem saiu não recebe mais nada', async () => {
    const eq = await empresaComEquipe(await novoSuperAdmin());
    // Um segundo motoboy, para ver que só o celular de quem saiu deixa de receber.
    const convite = await eq.admin.cliente.post(`/empresas/${eq.empresa.id}/convites`, { papel: 'motoboy' });
    const outro = await aceitarComContaNova(convite.corpo.caminho, 'motoboy');
    await eq.motoboy.cliente.post('/auth/dispositivo', { token: tokenNovo(), plataforma: 'android' });
    await outro.cliente.post('/auth/dispositivo', { token: tokenNovo(), plataforma: 'android' });

    expect((await eq.motoboy.cliente.post('/auth/sair')).status).toBe(204);
    const lista = (await eq.admin.cliente.get<MotoboyResumo[]>(`/empresas/${eq.empresa.id}/motoboys`)).corpo;
    expect(lista.find((m) => m.vinculoId === vinculoDe(eq.motoboy))?.recebeNotificacao).toBe(false);
    expect(lista.find((m) => m.vinculoId === outro.eu.vinculos[0].vinculoId)?.recebeNotificacao).toBe(true);
  });

  it('token novo do mesmo celular substitui o antigo, em vez de acumular', async () => {
    const eq = await empresaComEquipe(await novoSuperAdmin());
    const antigo = tokenNovo();
    const novo = tokenNovo();
    await eq.motoboy.cliente.post('/auth/dispositivo', { token: antigo, plataforma: 'android' });
    await eq.motoboy.cliente.post('/auth/dispositivo', { token: novo, plataforma: 'android' });

    const p = await novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculoDe(eq.motoboy) });
    await esperarMensagem((x) => x.to === novo && x.data.pedidoId === p.id);
    expect(
      enviadas()
        .filter((x) => x.data.pedidoId === p.id)
        .map((x) => x.to),
    ).toEqual([novo]);
  });
});
