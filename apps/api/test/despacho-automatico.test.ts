// Despacho automático: lojas, motoboys fixos, oferta em cascata e prazo curto para responder.

import { beforeAll, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { eq as igual } from 'drizzle-orm';
import type { LojaResposta, PedidoDetalhe } from '@entregas/shared';
import { criarDb } from '../src/db/index.ts';
import { pedidos } from '../src/db/schema.ts';
import { central } from '../src/central/avisar.ts';
import { vencerPrazosDeAceite } from '../src/tarefas.ts';
import {
  type Cliente,
  aceitarComContaNova,
  empresaComEquipe,
  endereco,
  novaEmpresa,
  novoPedido,
  novoSuperAdmin,
} from './ajudantes.ts';

type Equipe = Awaited<ReturnType<typeof empresaComEquipe>>;

/** Rua Paraná, 1500 (coleta dos pedidos de teste) e pontos a ~1 km e ~4 km dela. */
const COLETA = { latitude: -24.9555, longitude: -53.4552 };
const PERTO = { latitude: -24.9465, longitude: -53.4552 };
const LONGE = { latitude: -24.9195, longitude: -53.4552 };
const enderecoColeta = () => ({
  ...endereco('Rua Paraná', '1500'),
  localizacao: { ...COLETA, precisao: 'numero', fonte: 'mapa' },
});

async function novoMotoboy(eq: Equipe) {
  const convite = await eq.admin.cliente.post(`/empresas/${eq.empresa.id}/convites`, { papel: 'motoboy' });
  return aceitarComContaNova(convite.corpo.caminho, 'motoboy');
}

const vinculo = (m: { eu: { vinculos: { vinculoId: string }[] } }) => m.eu.vinculos[0]!.vinculoId;

/** Abre o turno e manda uma posição agora. */
async function naRua(cliente: Cliente, empresaId: string, ponto: { latitude: number; longitude: number }) {
  expect((await cliente.post(`/empresas/${empresaId}/turno`)).status).toBe(201);
  const r = await cliente.post(`/empresas/${empresaId}/turno/posicoes`, {
    pontos: [{ ...ponto, registradoEm: new Date().toISOString() }],
  });
  expect(r.status).toBe(200);
}

const ver = (eq: Equipe, pedidoId: string) =>
  eq.admin.cliente.get<PedidoDetalhe>(`/empresas/${eq.empresa.id}/pedidos/${pedidoId}`);

/** O despacho roda depois da resposta (waitUntil): espera o pedido chegar onde interessa. */
async function esperarPedido(eq: Equipe, pedidoId: string, condicao: (p: PedidoDetalhe) => boolean, ms = 4000) {
  const limite = Date.now() + ms;
  for (;;) {
    const p = (await ver(eq, pedidoId)).corpo;
    if (condicao(p)) return p;
    if (Date.now() > limite) throw new Error(`pedido não chegou na condição: ${p.status} / ${p.motoboy?.nome}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const ligarAutomatico = (eq: Equipe, extras: object = {}) =>
  eq.admin.cliente.patch(`/empresas/${eq.empresa.id}`, { modoDespacho: 'automatico', ...extras });

describe('modo manual (padrão)', () => {
  it('pedido sem motoboy fica esperando a central escolher', async () => {
    const eq = await empresaComEquipe(await novoSuperAdmin());
    await naRua(eq.motoboy.cliente, eq.empresa.id, PERTO);
    const p = await novoPedido(eq.admin.cliente, eq.empresa.id, { coleta: { endereco: enderecoColeta() } });
    expect(await central(env, eq.empresa.id).despachar(eq.empresa.id)).toBe(0);
    expect((await ver(eq, p.id)).corpo.status).toBe('pendente');
  });
});

describe('oferta automática em cascata', () => {
  let eq: Equipe;
  let longe: Awaited<ReturnType<typeof novoMotoboy>>;

  beforeAll(async () => {
    eq = await empresaComEquipe(await novoSuperAdmin());
    longe = await novoMotoboy(eq);
    const r = await ligarAutomatico(eq, { ofertaSegundos: 45 });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ modoDespacho: 'automatico', ofertaSegundos: 45 });
    await naRua(eq.motoboy.cliente, eq.empresa.id, PERTO);
    await naRua(longe.cliente, eq.empresa.id, LONGE);
  });

  it('oferece ao mais perto, passa ao próximo na recusa e para quando ninguém sobra', async () => {
    const E = eq.empresa.id;
    const p = await novoPedido(eq.admin.cliente, E, { coleta: { endereco: enderecoColeta() } });

    const oferecido = await esperarPedido(eq, p.id, (x) => x.status === 'atribuido');
    expect(oferecido.motoboy?.vinculoId).toBe(vinculo(eq.motoboy));
    expect(oferecido.ofertaAutomatica).toBe(true);
    expect(oferecido.eventos.at(-1)).toMatchObject({ acao: 'oferecer', detalhe: eq.motoboy.dados.nome });
    // Prazo curto da oferta automática, não o prazo em minutos da atribuição manual.
    const segundos = (Date.parse(oferecido.aceiteAte!) - Date.parse(oferecido.atualizadoEm)) / 1000;
    expect(segundos).toBeCloseTo(45, 0);

    expect((await eq.motoboy.cliente.post(`/empresas/${E}/pedidos/${p.id}/acoes/recusar`)).status).toBe(200);
    const segundo = await esperarPedido(eq, p.id, (x) => x.motoboy?.vinculoId === vinculo(longe));
    expect(segundo.status).toBe('atribuido');

    expect((await longe.cliente.post(`/empresas/${E}/pedidos/${p.id}/acoes/recusar`)).status).toBe(200);
    // Os dois recusaram: o pedido fica na fila para a central resolver.
    await central(env, E).despachar(E);
    const parado = (await ver(eq, p.id)).corpo;
    expect(parado.status).toBe('pendente');
    expect(parado.ofertaAutomatica).toBe(false);
  });

  it('sem resposta no prazo, a oferta passa para o próximo', async () => {
    const E = eq.empresa.id;
    const p = await novoPedido(eq.admin.cliente, E, { coleta: { endereco: enderecoColeta() } });
    await esperarPedido(eq, p.id, (x) => x.motoboy?.vinculoId === vinculo(eq.motoboy));

    // Prazo vencido (sem esperar 45 s de verdade); o alarme da central faz o resto.
    await criarDb(env.DB)
      .update(pedidos)
      .set({ aceiteAte: new Date(Date.now() - 1000) })
      .where(igual(pedidos.id, p.id));
    await central(env, E).despachar(E);

    const depois = (await ver(eq, p.id)).corpo;
    expect(depois.motoboy?.vinculoId).toBe(vinculo(longe));
    expect(depois.eventos.map((e) => e.acao).slice(-2)).toEqual(['expirar_aceite', 'oferecer']);

    // Quem aceita segue o fluxo normal e deixa de ser oferta.
    const aceito = await longe.cliente.post(`/empresas/${E}/pedidos/${p.id}/acoes/aceitar`);
    expect(aceito.status).toBe(200);
    expect(aceito.corpo.ofertaAutomatica).toBe(false);
  });

  it('a central continua podendo escolher na mão, e uma oferta por vez para cada motoboy', async () => {
    const E = eq.empresa.id;
    // O motoboy perto já tem uma oferta esperando: o pedido seguinte vai para outro (ou espera).
    const a = await novoPedido(eq.admin.cliente, E, { coleta: { endereco: enderecoColeta() } });
    await esperarPedido(eq, a.id, (x) => x.motoboy?.vinculoId === vinculo(eq.motoboy));
    const b = await novoPedido(eq.admin.cliente, E, { coleta: { endereco: enderecoColeta() } });
    await central(env, E).despachar(E);
    expect((await ver(eq, b.id)).corpo.motoboy?.vinculoId).not.toBe(vinculo(eq.motoboy));

    const manual = await eq.admin.cliente.post(`/empresas/${E}/pedidos/${b.id}/acoes/atribuir`, {
      motoboyVinculoId: vinculo(eq.motoboy),
    });
    expect(manual.status).toBe(200);
    expect(manual.corpo.ofertaAutomatica).toBe(false);
  });

  it('o cron de cada minuto também roda as filas automáticas (rede de segurança)', async () => {
    const E = eq.empresa.id;
    await criarDb(env.DB)
      .update(pedidos)
      .set({ aceiteAte: new Date(Date.now() - 1000) })
      .where(igual(pedidos.empresaId, E));
    await vencerPrazosDeAceite(env);
    const lista = (await eq.admin.cliente.get<PedidoDetalhe[]>(`/empresas/${E}/pedidos`)).corpo;
    expect(lista.every((p) => p.status !== 'atribuido' || Date.parse(p.aceiteAte ?? '0') > Date.now())).toBe(true);
  });
});

describe('lojas e motoboys fixos', () => {
  let eq: Equipe;
  let fixo: Awaited<ReturnType<typeof novoMotoboy>>;
  let loja: LojaResposta;

  beforeAll(async () => {
    eq = await empresaComEquipe(await novoSuperAdmin());
    fixo = await novoMotoboy(eq);
    const r = await eq.admin.cliente.post(`/empresas/${eq.empresa.id}/lojas`, {
      nome: 'Pizzaria do Centro',
      telefone: '(45) 3222-1000',
      endereco: enderecoColeta(),
    });
    expect(r.status).toBe(201);
    loja = r.corpo;
    expect(loja.transbordo).toBe(true);

    const m = await eq.admin.cliente.patch(`/empresas/${eq.empresa.id}/membros/${vinculo(fixo)}`, {
      lojaId: loja.id,
    });
    expect(m.status).toBe(200);
    expect(m.corpo.lojaId).toBe(loja.id);
    await ligarAutomatico(eq);
    // O livre está mais perto da coleta; o fixo, longe.
    await naRua(eq.motoboy.cliente, eq.empresa.id, PERTO);
    await naRua(fixo.cliente, eq.empresa.id, LONGE);
  });

  it('lista a loja com o fixo', async () => {
    const lista = await eq.admin.cliente.get<LojaResposta[]>(`/empresas/${eq.empresa.id}/lojas`);
    expect(lista.corpo).toEqual([
      expect.objectContaining({ id: loja.id, fixos: [expect.objectContaining({ vinculoId: vinculo(fixo) })] }),
    ]);
    // O despachante vê, mas não cadastra.
    expect((await eq.despachante.cliente.get(`/empresas/${eq.empresa.id}/lojas`)).status).toBe(200);
    expect(
      (await eq.despachante.cliente.post(`/empresas/${eq.empresa.id}/lojas`, { nome: 'X', endereco: endereco() }))
        .status,
    ).toBe(403);
  });

  it('pedido da loja vai para o fixo dela, mesmo com um livre mais perto', async () => {
    const p = await novoPedido(eq.admin.cliente, eq.empresa.id, {
      lojaId: loja.id,
      coleta: { endereco: enderecoColeta() },
    });
    expect(p.loja).toEqual({ id: loja.id, nome: 'Pizzaria do Centro' });
    const oferecido = await esperarPedido(eq, p.id, (x) => x.status === 'atribuido');
    expect(oferecido.motoboy?.vinculoId).toBe(vinculo(fixo));
  });

  it('fixo ocupado: com transbordo vai para o livre; sem transbordo espera o fixo', async () => {
    const E = eq.empresa.id;
    const comTransbordo = await novoPedido(eq.admin.cliente, E, {
      lojaId: loja.id,
      coleta: { endereco: enderecoColeta() },
    });
    const livre = await esperarPedido(eq, comTransbordo.id, (x) => x.status === 'atribuido');
    expect(livre.motoboy?.vinculoId).toBe(vinculo(eq.motoboy));

    expect((await eq.admin.cliente.patch(`/empresas/${E}/lojas/${loja.id}`, { transbordo: false })).status).toBe(200);
    // Livre recusa: com transbordo desligado, o pedido não vai para ninguém além do fixo (ocupado).
    expect((await eq.motoboy.cliente.post(`/empresas/${E}/pedidos/${comTransbordo.id}/acoes/recusar`)).status).toBe(
      200,
    );
    const semTransbordo = await novoPedido(eq.admin.cliente, E, {
      lojaId: loja.id,
      coleta: { endereco: enderecoColeta() },
    });
    await central(env, E).despachar(E);
    expect((await ver(eq, semTransbordo.id)).corpo.status).toBe('pendente');
  });

  it('pedido sem loja nunca vai para o fixo de uma loja', async () => {
    const E = eq.empresa.id;
    // Desocupa todo mundo: cancela o que estiver ativo.
    const ativos = (await eq.admin.cliente.get<PedidoDetalhe[]>(`/empresas/${E}/pedidos`)).corpo;
    for (const a of ativos) {
      await eq.admin.cliente.post(`/empresas/${E}/pedidos/${a.id}/acoes/cancelar`, { motivo: 'Limpeza do teste' });
    }
    await eq.motoboy.cliente.delete(`/empresas/${E}/turno`);
    const p = await novoPedido(eq.admin.cliente, E, { coleta: { endereco: enderecoColeta() } });
    await central(env, E).despachar(E);
    expect((await ver(eq, p.id)).corpo.status).toBe('pendente');
  });

  it('loja de outra empresa não serve para pedido nem para motoboy fixo', async () => {
    const outra = await novaEmpresa(await novoSuperAdmin());
    const adminOutra = await aceitarComContaNova(outra.conviteAdmin.caminho, 'admin');
    const lojaOutra = await adminOutra.cliente.post(`/empresas/${outra.empresa.id}/lojas`, {
      nome: 'Loja alheia',
      endereco: endereco(),
    });
    expect(lojaOutra.status).toBe(201);

    const r = await eq.admin.cliente.post(`/empresas/${eq.empresa.id}/pedidos`, {
      lojaId: lojaOutra.corpo.id,
      coleta: { endereco: endereco() },
      entrega: { nome: 'Ana', telefone: '(45) 99999-1234', endereco: endereco('Av. Brasil', '10') },
      formaPagamento: 'pago',
      valorACobrarCentavos: 0,
    });
    expect(r.status).toBe(422);
    expect(r.corpo.erro.campos.lojaId).toBeDefined();
    const m = await eq.admin.cliente.patch(`/empresas/${eq.empresa.id}/membros/${vinculo(fixo)}`, {
      lojaId: lojaOutra.corpo.id,
    });
    expect(m.status).toBe(422);
    expect(
      (await eq.admin.cliente.patch(`/empresas/${eq.empresa.id}/lojas/${lojaOutra.corpo.id}`, { nome: 'Minha' }))
        .status,
    ).toBe(404);
  });
});
