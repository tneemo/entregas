// Regras de entrega da empresa: foto do comprovante, entrega sem código e prazo de aceite.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { eq as igual } from 'drizzle-orm';
import type { PedidoDetalhe, PedidoResumo } from '@entregas/shared';
import { criarDb } from '../src/db/index.ts';
import { pedidos } from '../src/db/schema.ts';
import { expirarAceites } from '../src/dados/escopo-pedidos.ts';
import { vencerPrazosDeAceite } from '../src/tarefas.ts';
import { type Cliente, type Conexao, empresaComEquipe, novoPedido, novoSuperAdmin } from './ajudantes.ts';

type Equipe = Awaited<ReturnType<typeof empresaComEquipe>>;

const vinculoDe = (pessoa: Equipe['motoboy']) => pessoa.eu.vinculos[0].vinculoId as string;
const acao = (cliente: Cliente, empresaId: string, pedidoId: string, nome: string, corpo: object = {}) =>
  cliente.post(`/empresas/${empresaId}/pedidos/${pedidoId}/acoes/${nome}`, corpo);
/** Deixa o relógio do Worker andar: eventos e fotos são comparados pelo horário. */
const esperar = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// JPEG mínimo válido o bastante para a checagem de assinatura.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

async function fotografar(eq: Equipe, pedidoId: string, tipo: 'entrega' | 'falha' | 'coleta') {
  const r = await eq.motoboy.cliente.enviarBytes(
    `/empresas/${eq.empresa.id}/pedidos/${pedidoId}/fotos?tipo=${tipo}`,
    JPEG,
    'image/jpeg',
  );
  expect(r.status).toBe(201);
}

/** Pedido do motoboy da equipe, já coletado e em rota de entrega. */
async function emRota(eq: Equipe) {
  const p = await novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculoDe(eq.motoboy) });
  for (const passo of ['aceitar', 'iniciar_coleta', 'coletar']) {
    expect((await acao(eq.motoboy.cliente, eq.empresa.id, p.id, passo)).status, passo).toBe(200);
  }
  await esperar();
  return p;
}

const verPeloMotoboy = (eq: Equipe, pedidoId: string) =>
  eq.motoboy.cliente.get<PedidoDetalhe>(`/empresas/${eq.empresa.id}/pedidos/${pedidoId}`);
const verPelaCentral = (eq: Equipe, pedidoId: string) =>
  eq.admin.cliente.get<PedidoDetalhe>(`/empresas/${eq.empresa.id}/pedidos/${pedidoId}`);

describe('foto na falha', () => {
  let eq: Equipe;
  beforeAll(async () => {
    eq = await empresaComEquipe(await novoSuperAdmin());
  });

  it('o motoboy só registra falha com foto do local, e a foto vale só para esta tentativa', async () => {
    const E = eq.empresa.id;
    const p = await emRota(eq);
    expect((await verPeloMotoboy(eq, p.id)).corpo.fotoObrigatoria).toEqual(['entregar_sem_codigo', 'falhar']);

    const semFoto = await acao(eq.motoboy.cliente, E, p.id, 'falhar', { motivo: 'Cliente não atendeu' });
    expect(semFoto.status).toBe(422);
    expect(semFoto.corpo.erro.codigo).toBe('foto_obrigatoria');

    // Foto de outro tipo não serve.
    await fotografar(eq, p.id, 'entrega');
    expect((await acao(eq.motoboy.cliente, E, p.id, 'falhar', { motivo: 'Cliente não atendeu' })).status).toBe(422);

    await fotografar(eq, p.id, 'falha');
    const falhou = await acao(eq.motoboy.cliente, E, p.id, 'falhar', { motivo: 'Cliente não atendeu' });
    expect(falhou.status).toBe(200);
    expect(falhou.corpo.status).toBe('falhou');

    // Nova tentativa: a foto da falha anterior não serve para a próxima.
    await esperar();
    await acao(eq.motoboy.cliente, E, p.id, 'nova_tentativa');
    await esperar();
    const repetida = await acao(eq.motoboy.cliente, E, p.id, 'falhar', { motivo: 'Cliente não atendeu de novo' });
    expect(repetida.corpo.erro.codigo).toBe('foto_obrigatoria');
  });

  it('a central registra a falha sem foto (o motoboy pode ter ligado)', async () => {
    const p = await emRota(eq);
    expect((await verPelaCentral(eq, p.id)).corpo.fotoObrigatoria).toEqual([]);
    const r = await acao(eq.despachante.cliente, eq.empresa.id, p.id, 'falhar', {
      motivo: 'Motoboy ligou: casa fechada',
    });
    expect(r.corpo.status).toBe('falhou');
  });
});

describe('foto na entrega com código', () => {
  let eq: Equipe;
  beforeAll(async () => {
    eq = await empresaComEquipe(await novoSuperAdmin());
  });

  it('é opcional por padrão', async () => {
    const p = await emRota(eq);
    expect((await verPeloMotoboy(eq, p.id)).corpo.fotoObrigatoria).toEqual(['entregar_sem_codigo', 'falhar']);
    const r = await acao(eq.motoboy.cliente, eq.empresa.id, p.id, 'entregar', { codigo: p.codigoEntrega });
    expect(r.corpo.status).toBe('entregue');
  });

  it('vira obrigatória quando a empresa exige; errar o código não obriga a fotografar de novo', async () => {
    const E = eq.empresa.id;
    const regra = await eq.admin.cliente.patch(`/empresas/${E}`, { fotoEntregaObrigatoria: true });
    expect(regra.corpo.fotoEntregaObrigatoria).toBe(true);

    const p = await emRota(eq);
    expect((await verPeloMotoboy(eq, p.id)).corpo.fotoObrigatoria).toEqual([
      'entregar',
      'entregar_sem_codigo',
      'falhar',
    ]);

    const semFoto = await acao(eq.motoboy.cliente, E, p.id, 'entregar', { codigo: p.codigoEntrega });
    expect(semFoto.corpo.erro.codigo).toBe('foto_obrigatoria');

    await fotografar(eq, p.id, 'entrega');
    const errado = p.codigoEntrega === '0000' ? '1111' : '0000';
    expect((await acao(eq.motoboy.cliente, E, p.id, 'entregar', { codigo: errado })).status).toBe(422);
    const ok = await acao(eq.motoboy.cliente, E, p.id, 'entregar', { codigo: p.codigoEntrega });
    expect(ok.corpo.status).toBe('entregue');
  });

  it('só o admin muda as regras, e o prazo fica entre 1 e 60 minutos', async () => {
    const E = `/empresas/${eq.empresa.id}`;
    expect((await eq.despachante.cliente.patch(E, { fotoEntregaObrigatoria: false })).status).toBe(403);
    expect((await eq.admin.cliente.patch(E, { prazoAceiteMin: 0 })).status).toBe(422);
    expect((await eq.admin.cliente.patch(E, { prazoAceiteMin: 61 })).status).toBe(422);
    expect((await eq.admin.cliente.patch(E, { prazoAceiteMin: 2.5 })).status).toBe(422);
    const ok = await eq.admin.cliente.patch(E, { prazoAceiteMin: 5, fotoEntregaObrigatoria: false });
    expect(ok.corpo).toMatchObject({ prazoAceiteMin: 5, fotoEntregaObrigatoria: false });
    expect((await eq.admin.cliente.patch(E, { prazoAceiteMin: null })).corpo.prazoAceiteMin).toBeNull();
  });
});

describe('entrega sem o código', () => {
  let eq: Equipe;
  beforeAll(async () => {
    eq = await empresaComEquipe(await novoSuperAdmin());
  });

  it('exige com quem ficou e a foto, e fica marcada no histórico', async () => {
    const E = eq.empresa.id;
    const p = await emRota(eq);
    expect((await verPeloMotoboy(eq, p.id)).corpo.acoes).toEqual(['entregar', 'entregar_sem_codigo', 'falhar']);

    const semMotivo = await acao(eq.motoboy.cliente, E, p.id, 'entregar_sem_codigo');
    expect(semMotivo.status).toBe(422);
    expect(semMotivo.corpo.erro.campos.motivo).toEqual(['Diga com quem ou onde ficou.']);

    const semFoto = await acao(eq.motoboy.cliente, E, p.id, 'entregar_sem_codigo', { motivo: 'Deixei na portaria' });
    expect(semFoto.corpo.erro.codigo).toBe('foto_obrigatoria');

    await fotografar(eq, p.id, 'entrega');
    const ok = await acao(eq.motoboy.cliente, E, p.id, 'entregar_sem_codigo', { motivo: 'Deixei na portaria' });
    expect(ok.corpo.status).toBe('entregue');

    const visao = await verPelaCentral(eq, p.id);
    expect(visao.corpo.motivo).toBe('Deixei na portaria');
    expect(visao.corpo.eventos.at(-1)).toMatchObject({
      acao: 'entregar_sem_codigo',
      papel: 'motoboy',
      motivo: 'Deixei na portaria',
    });
    expect(visao.corpo.fotos.map((f) => f.tipo)).toEqual(['entrega']);
  });

  it('a central não usa (ela vê o código)', async () => {
    const p = await emRota(eq);
    expect((await verPelaCentral(eq, p.id)).corpo.acoes).not.toContain('entregar_sem_codigo');
    const r = await acao(eq.despachante.cliente, eq.empresa.id, p.id, 'entregar_sem_codigo', { motivo: 'Portaria' });
    expect(r.status).toBe(403);
  });

  it('com o código bloqueado, também não dá para entregar sem ele', async () => {
    const E = eq.empresa.id;
    const p = await emRota(eq);
    const errado = p.codigoEntrega === '9999' ? '8888' : '9999';
    for (let i = 0; i < 5; i++) await acao(eq.motoboy.cliente, E, p.id, 'entregar', { codigo: errado });

    const visao = await verPeloMotoboy(eq, p.id);
    expect(visao.corpo.acoes).toEqual(['falhar']);

    await fotografar(eq, p.id, 'entrega');
    const r = await acao(eq.motoboy.cliente, E, p.id, 'entregar_sem_codigo', { motivo: 'Deixei na portaria' });
    expect(r.status).toBe(423);
  });
});

describe('prazo de aceite', () => {
  const db = criarDb(env.DB);
  let eq: Equipe;
  beforeAll(async () => {
    eq = await empresaComEquipe(await novoSuperAdmin());
  });

  const daquiA = (minutos: number) => new Date(Date.now() + minutos * 60_000);
  const atribuido = () => novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculoDe(eq.motoboy) });

  it('sem prazo configurado, o pedido espera o motoboy o quanto for', async () => {
    const p = await atribuido();
    expect(p.aceiteAte).toBeNull();
    const voltaram = await expirarAceites(db, daquiA(24 * 60));
    expect(voltaram.map((v) => v.pedidoId)).not.toContain(p.id);
  });

  it('com prazo, o pedido sem resposta volta para a fila e o motoboy deixa de vê-lo', async () => {
    const E = eq.empresa.id;
    await eq.admin.cliente.patch(`/empresas/${E}`, { prazoAceiteMin: 5 });
    const antes = Date.now();
    const p = await atribuido();
    const prazo = Date.parse(p.aceiteAte!);
    expect(prazo).toBeGreaterThanOrEqual(antes + 5 * 60_000);
    expect(prazo).toBeLessThan(Date.now() + 5 * 60_000 + 1_000);

    const lista = await eq.motoboy.cliente.get<PedidoResumo[]>(`/empresas/${E}/pedidos`);
    expect(lista.corpo.find((x) => x.id === p.id)?.aceiteAte).toBe(p.aceiteAte);

    expect((await expirarAceites(db, new Date(prazo - 1_000))).map((v) => v.pedidoId)).not.toContain(p.id);
    expect((await verPelaCentral(eq, p.id)).corpo.status).toBe('atribuido');

    const voltaram = await expirarAceites(db, new Date(prazo));
    expect(voltaram).toContainEqual({ empresaId: E, pedidoId: p.id });

    const visao = await verPelaCentral(eq, p.id);
    expect(visao.corpo).toMatchObject({ status: 'pendente', motoboy: null, aceiteAte: null });
    expect(visao.corpo.eventos.at(-1)).toMatchObject({
      acao: 'expirar_aceite',
      de: 'atribuido',
      para: 'pendente',
      papel: 'motoboy',
      autor: eq.motoboy.dados.nome,
    });
    expect((await verPeloMotoboy(eq, p.id)).status).toBe(404);

    // Rodar de novo não duplica o evento.
    await expirarAceites(db, new Date(prazo + 60_000));
    const depois = await verPelaCentral(eq, p.id);
    expect(depois.corpo.eventos.filter((e) => e.acao === 'expirar_aceite')).toHaveLength(1);
  });

  it('aceitar encerra o prazo; atribuir de novo recomeça a contagem', async () => {
    const E = eq.empresa.id;
    await eq.admin.cliente.patch(`/empresas/${E}`, { prazoAceiteMin: 3 });

    const aceito = await atribuido();
    const r = await acao(eq.motoboy.cliente, E, aceito.id, 'aceitar');
    expect(r.corpo.aceiteAte).toBeNull();
    await expirarAceites(db, daquiA(60));
    expect((await verPelaCentral(eq, aceito.id)).corpo.status).toBe('aceito');

    const trocado = await atribuido();
    const primeiroPrazo = new Date(trocado.aceiteAte!);
    await esperar(20);
    const reatribuido = await acao(eq.admin.cliente, E, trocado.id, 'atribuir', {
      motoboyVinculoId: vinculoDe(eq.motoboy),
    });
    expect(Date.parse(reatribuido.corpo.aceiteAte)).toBeGreaterThan(primeiroPrazo.getTime());

    // O prazo antigo não vale mais.
    expect((await expirarAceites(db, primeiroPrazo)).map((v) => v.pedidoId)).not.toContain(trocado.id);
    expect((await verPelaCentral(eq, trocado.id)).corpo.status).toBe('atribuido');
  });

  it('ninguém executa a expiração pela API', async () => {
    const p = await atribuido();
    expect((await acao(eq.admin.cliente, eq.empresa.id, p.id, 'expirar_aceite')).status).toBe(403);
    expect((await acao(eq.motoboy.cliente, eq.empresa.id, p.id, 'expirar_aceite')).status).toBe(403);
  });
});

describe('cron do prazo de aceite', () => {
  const abertas: Conexao[] = [];
  afterEach(() => {
    for (const c of abertas.splice(0)) c.fechar();
  });

  it('devolve à fila e avisa o painel da empresa na hora', async () => {
    const eq = await empresaComEquipe(await novoSuperAdmin());
    const E = eq.empresa.id;
    await eq.admin.cliente.patch(`/empresas/${E}`, { prazoAceiteMin: 2 });
    const p = await novoPedido(eq.admin.cliente, E, { motoboyVinculoId: vinculoDe(eq.motoboy) });

    const ws = await eq.despachante.cliente.abrirWs(`/empresas/${E}/central/ws`);
    if (!ws.conexao) throw new Error(`WebSocket não abriu (${ws.status})`);
    abertas.push(ws.conexao);
    await ws.conexao.esperar((m) => m.tipo === 'motoboys');

    // Prazo vencido sem esperar 2 minutos de verdade.
    await criarDb(env.DB)
      .update(pedidos)
      .set({ aceiteAte: new Date(Date.now() - 1_000) })
      .where(igual(pedidos.id, p.id));
    const voltaram = await vencerPrazosDeAceite(env);
    expect(voltaram).toContainEqual({ empresaId: E, pedidoId: p.id });
    expect(await ws.conexao.esperar((m) => m.tipo === 'pedido')).toEqual({
      tipo: 'pedido',
      pedidoId: p.id,
      status: 'pendente',
    });
  });
});
