import { beforeAll, describe, expect, it } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import type { PedidoDetalhe, TurnoResposta } from '@entregas/shared';
import { criarDb } from '../src/db/index.ts';
import { eventosPedido, posicoes } from '../src/db/schema.ts';
import { expurgarPosicoes } from '../src/dados/escopo-turno.ts';
import { empresaComEquipe, novoPedido, novoSuperAdmin, tokenDoCaminho } from './ajudantes.ts';

type Equipe = Awaited<ReturnType<typeof empresaComEquipe>>;
const vinculoDe = (p: Equipe['motoboy']) => p.eu.vinculos[0].vinculoId as string;
const ponto = (segundosAtras = 0, extras = {}) => ({
  latitude: -24.9555,
  longitude: -53.4552,
  precisao: 8,
  registradoEm: new Date(Date.now() - segundosAtras * 1000).toISOString(),
  ...extras,
});

// JPEG mínimo válido o bastante para a checagem de assinatura.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

describe('turno do motoboy', () => {
  let eq1: Equipe;
  beforeAll(async () => {
    eq1 = await empresaComEquipe(await novoSuperAdmin());
  });

  it('abre e mostra o turno; a central não abre turno', async () => {
    const T = `/empresas/${eq1.empresa.id}/turno`;
    expect((await eq1.motoboy.cliente.get<TurnoResposta>(T)).corpo).toEqual({ turno: null, emOutraEmpresa: null });

    const aberto = await eq1.motoboy.cliente.post<TurnoResposta>(T);
    expect(aberto.status).toBe(201);
    expect(aberto.corpo.turno?.iniciadoEm).toBeTruthy();
    // Abrir de novo não duplica.
    const deNovo = await eq1.motoboy.cliente.post<TurnoResposta>(T);
    expect(deNovo.corpo.turno?.id).toBe(aberto.corpo.turno?.id);

    expect((await eq1.despachante.cliente.post(T)).status).toBe(403);

    const motoboys = await eq1.despachante.cliente.get(`/empresas/${eq1.empresa.id}/motoboys`);
    expect(motoboys.corpo[0]).toMatchObject({ vinculoId: vinculoDe(eq1.motoboy), emTurno: true });
  });

  it('não encerra com entrega em andamento; depois de recusar, encerra', async () => {
    const E = eq1.empresa.id;
    const p = await novoPedido(eq1.admin.cliente, E, { motoboyVinculoId: vinculoDe(eq1.motoboy) });
    const bloqueado = await eq1.motoboy.cliente.delete(`/empresas/${E}/turno`);
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.corpo.erro.codigo).toBe('entregas_pendentes');

    await eq1.motoboy.cliente.post(`/empresas/${E}/pedidos/${p.id}/acoes/recusar`);
    const encerrado = await eq1.motoboy.cliente.delete<TurnoResposta>(`/empresas/${E}/turno`);
    expect(encerrado.corpo.turno).toBeNull();
  });
});

describe('um turno por vez', () => {
  let a: Equipe;
  let b: Equipe;
  let vinculoEmB: string;

  beforeAll(async () => {
    const sa = await novoSuperAdmin();
    a = await empresaComEquipe(sa);
    b = await empresaComEquipe(sa);
    const convite = await b.admin.cliente.post(`/empresas/${b.empresa.id}/convites`, { papel: 'motoboy' });
    await a.motoboy.cliente.post(`/convites/${tokenDoCaminho(convite.corpo.caminho)}/aceitar`);
    const eu = await a.motoboy.cliente.get('/auth/eu');
    vinculoEmB = eu.corpo.vinculos.find((v: any) => v.empresa.id === b.empresa.id).vinculoId;
  });

  it('com turno na A, não abre na B até encerrar a A', async () => {
    const moto = a.motoboy.cliente;
    await moto.post(`/empresas/${a.empresa.id}/turno`);

    const naB = await moto.post(`/empresas/${b.empresa.id}/turno`);
    expect(naB.status).toBe(409);
    expect(naB.corpo.erro.mensagem).toContain(a.empresa.nomeFantasia);
    const situacaoB = await moto.get<TurnoResposta>(`/empresas/${b.empresa.id}/turno`);
    expect(situacaoB.corpo.emOutraEmpresa?.empresaId).toBe(a.empresa.id);

    await moto.delete(`/empresas/${a.empresa.id}/turno`);
    expect((await moto.post(`/empresas/${b.empresa.id}/turno`)).status).toBe(201);
    await moto.delete(`/empresas/${b.empresa.id}/turno`);
  });

  it('turno esquecido numa empresa onde foi suspenso fecha sozinho', async () => {
    const moto = a.motoboy.cliente;
    await moto.post(`/empresas/${a.empresa.id}/turno`);
    await a.admin.cliente.patch(`/empresas/${a.empresa.id}/membros/${vinculoDe(a.motoboy)}`, { status: 'suspenso' });

    expect((await moto.post(`/empresas/${b.empresa.id}/turno`)).status).toBe(201);
    const motoboysB = await b.admin.cliente.get(`/empresas/${b.empresa.id}/motoboys`);
    expect(motoboysB.corpo.find((m: any) => m.vinculoId === vinculoEmB).emTurno).toBe(true);
  });
});

describe('posições de GPS', () => {
  let eq1: Equipe;
  beforeAll(async () => {
    eq1 = await empresaComEquipe(await novoSuperAdmin());
  });

  it('só aceita posição com turno aberto (LGPD)', async () => {
    const r = await eq1.motoboy.cliente.post(`/empresas/${eq1.empresa.id}/turno/posicoes`, { pontos: [ponto()] });
    expect(r.status).toBe(409);
    expect(r.corpo.erro.codigo).toBe('sem_turno');
  });

  it('registra pontos do turno e descarta os anteriores a ele', async () => {
    const E = eq1.empresa.id;
    await eq1.motoboy.cliente.post(`/empresas/${E}/turno`);
    const r = await eq1.motoboy.cliente.post(`/empresas/${E}/turno/posicoes`, {
      pontos: [ponto(10), ponto(5, { velocidade: 9.5 }), ponto(60 * 60)],
    });
    expect(r.corpo).toEqual({ recebidos: 2, descartados: 1 });

    const demais = await eq1.motoboy.cliente.post(`/empresas/${E}/turno/posicoes`, {
      pontos: Array.from({ length: 101 }, () => ponto()),
    });
    expect(demais.status).toBe(422);
  });

  it('central não envia posição', async () => {
    const r = await eq1.admin.cliente.post(`/empresas/${eq1.empresa.id}/turno/posicoes`, { pontos: [ponto()] });
    expect(r.status).toBe(403);
  });

  it('apaga pontos mais antigos que 90 dias e mantém os recentes', async () => {
    const db = criarDb(env.DB);
    const [qualquer] = await db.select().from(posicoes).limit(1).all();
    const velho = await db
      .insert(posicoes)
      .values({ ...qualquer!, id: crypto.randomUUID(), registradoEm: new Date(Date.now() - 91 * 24 * 3600 * 1000) })
      .returning()
      .get();

    const apagados = await expurgarPosicoes(db);
    expect(apagados).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(posicoes).where(eq(posicoes.id, velho.id)).get()).toBeUndefined();
    expect(await db.select().from(posicoes).where(eq(posicoes.id, qualquer!.id)).get()).toBeDefined();
  });

  it('ação feita pelo app guarda a posição no histórico', async () => {
    const E = eq1.empresa.id;
    const p = await novoPedido(eq1.admin.cliente, E, { motoboyVinculoId: vinculoDe(eq1.motoboy) });
    await eq1.motoboy.cliente.post(`/empresas/${E}/pedidos/${p.id}/acoes/aceitar`, {
      latitude: -24.95,
      longitude: -53.45,
    });
    const evento = await criarDb(env.DB).select().from(eventosPedido).where(eq(eventosPedido.pedidoId, p.id)).all();
    expect(evento.find((e) => e.acao === 'aceitar')).toMatchObject({ latitude: -24.95, longitude: -53.45 });
  });
});

describe('fotos de comprovante', () => {
  let a: Equipe;
  let b: Equipe;
  let pedido: PedidoDetalhe;

  beforeAll(async () => {
    const sa = await novoSuperAdmin();
    a = await empresaComEquipe(sa);
    b = await empresaComEquipe(sa);
    pedido = await novoPedido(a.admin.cliente, a.empresa.id, { motoboyVinculoId: vinculoDe(a.motoboy) });
  });

  const caminhoFotos = () => `/empresas/${a.empresa.id}/pedidos/${pedido.id}/fotos`;

  it('motoboy envia a foto e a central vê no pedido', async () => {
    const r = await a.motoboy.cliente.enviarBytes(`${caminhoFotos()}?tipo=entrega`, JPEG, 'image/jpeg');
    expect(r.status).toBe(201);
    const foto = (await r.json()) as { id: string; url: string };

    const detalhe = await a.admin.cliente.get<PedidoDetalhe>(`/empresas/${a.empresa.id}/pedidos/${pedido.id}`);
    expect(detalhe.corpo.fotos).toEqual([expect.objectContaining({ id: foto.id, tipo: 'entrega' })]);

    const imagem = await a.admin.cliente.buscarBytes(foto.url.replace('/api/v1', ''));
    expect(imagem.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await imagem.arrayBuffer())).toEqual(JPEG);
  });

  it('recusa arquivo que não é imagem, mesmo com cabeçalho de imagem', async () => {
    const texto = new TextEncoder().encode('isto não é uma foto');
    expect((await a.motoboy.cliente.enviarBytes(caminhoFotos(), texto, 'image/jpeg')).status).toBe(415);
    expect((await a.motoboy.cliente.enviarBytes(caminhoFotos(), JPEG, 'application/pdf')).status).toBe(415);
  });

  it('recusa foto acima de 5 MB', async () => {
    const grande = new Uint8Array(5 * 1024 * 1024 + 1);
    grande.set(JPEG.slice(0, 4));
    expect((await a.motoboy.cliente.enviarBytes(caminhoFotos(), grande, 'image/jpeg')).status).toBe(413);
  });

  it('outra empresa não envia nem vê fotos', async () => {
    expect((await b.admin.cliente.enviarBytes(caminhoFotos(), JPEG, 'image/jpeg')).status).toBe(404);
    const detalhe = await a.admin.cliente.get<PedidoDetalhe>(`/empresas/${a.empresa.id}/pedidos/${pedido.id}`);
    const url = detalhe.corpo.fotos[0]!.url.replace('/api/v1', '');
    expect((await b.admin.cliente.buscarBytes(url)).status).toBe(404);
    const comIdDeB = url.replace(a.empresa.id, b.empresa.id);
    expect((await b.admin.cliente.buscarBytes(comIdDeB)).status).toBe(404);
  });
});

describe('CORS do app na web (desenvolvimento)', () => {
  it('libera só a origem configurada, sem credenciais', async () => {
    const preflight = (origem: string) =>
      exports.default.fetch('https://entregas.teste/api/v1/auth/entrar', {
        method: 'OPTIONS',
        headers: {
          origin: origem,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });
    const permitido = await preflight('http://localhost:8081');
    expect(permitido.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
    expect(permitido.headers.get('access-control-allow-credentials')).toBeNull();

    const estranho = await preflight('https://golpe.example');
    expect(estranho.headers.get('access-control-allow-origin')).toBeNull();
  });
});
