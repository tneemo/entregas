// Pontos no mapa: geocodificação (Google e OpenStreetMap), rota de busca do painel,
// pedido guardando o ponto e distância das ações do motoboy até a entrega.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClienteResposta, LocalizarResposta, PedidoDetalhe } from '@entregas/shared';
import { geocodificar, interpretarGoogle, interpretarNominatim } from '../src/geocodificacao.ts';
import { type Cliente, empresaComEquipe, endereco, novoCelular, novoPedido, novoSuperAdmin } from './ajudantes.ts';

type Equipe = Awaited<ReturnType<typeof empresaComEquipe>>;

const NA_PORTA = { latitude: -24.9555, longitude: -53.4552, precisao: 'numero', fonte: 'mapa' } as const;

const google = (location_type: string, types: string[], partial_match?: boolean) => ({
  status: 'OK',
  results: [{ geometry: { location: { lat: -24.95, lng: -53.45 }, location_type }, types, partial_match }],
});

const osm = (extras: object) => [{ lat: '-24.95', lon: '-53.45', category: 'highway', ...extras }];

describe('interpretação do Google', () => {
  it('telhado ou número interpolado chega na porta; centro da rua é só a rua', () => {
    expect(interpretarGoogle(google('ROOFTOP', ['street_address']))?.precisao).toBe('numero');
    expect(interpretarGoogle(google('RANGE_INTERPOLATED', ['street_address']))?.precisao).toBe('numero');
    expect(interpretarGoogle(google('GEOMETRIC_CENTER', ['route']))?.precisao).toBe('rua');
    expect(interpretarGoogle(google('APPROXIMATE', ['locality', 'political']))?.precisao).toBe('aproximada');
  });

  it('acerto parcial não vale como número', () => {
    expect(interpretarGoogle(google('ROOFTOP', ['street_address'], true))?.precisao).toBe('rua');
  });

  it('sem resultado é null; erro de chave ou cota vira exceção', () => {
    expect(interpretarGoogle({ status: 'ZERO_RESULTS', results: [] })).toBeNull();
    expect(() => interpretarGoogle({ status: 'REQUEST_DENIED', results: [] })).toThrow(/REQUEST_DENIED/);
  });
});

describe('interpretação do OpenStreetMap', () => {
  it('com número da casa chega na porta; sem ele, é só a rua', () => {
    const comNumero = osm({ address: { house_number: '10', city: 'Cascavel' } });
    expect(interpretarNominatim(comNumero, 'Cascavel')?.precisao).toBe('numero');
    expect(interpretarNominatim(osm({ address: { city: 'Cascavel' } }), 'Cascavel')?.precisao).toBe('rua');
    const lugar = osm({ category: 'place', address: { city: 'Cascavel' } });
    expect(interpretarNominatim(lugar, 'Cascavel')?.precisao).toBe('aproximada');
  });

  it('rua de mesmo nome em outra cidade não serve; acento não atrapalha', () => {
    expect(interpretarNominatim(osm({ address: { city: 'Toledo' } }), 'Cascavel')).toBeNull();
    expect(interpretarNominatim(osm({ address: { city: 'São Paulo' } }), 'Sao Paulo')).not.toBeNull();
    expect(interpretarNominatim([], 'Cascavel')).toBeNull();
  });
});

describe('geocodificar', () => {
  afterEach(() => vi.restoreAllMocks());
  const ambiente = (extras: Partial<Env> = {}) => ({ ...extras }) as Env;

  it('sem chave do Google, pergunta ao OpenStreetMap identificando o sistema', async () => {
    const chamada = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(osm({ address: { city: 'Cascavel' } })));
    const l = await geocodificar(ambiente(), endereco('Rua Recife', '1500'));
    expect(l).toEqual({ latitude: -24.95, longitude: -53.45, precisao: 'rua', fonte: 'busca' });
    const [url, init] = chamada.mock.calls[0]!;
    expect(String(url)).toContain('nominatim.openstreetmap.org');
    expect(String(url)).toContain('street=1500+Rua+Recife');
    expect(new Headers(init?.headers).get('user-agent')).toContain('entregas-plataforma');
  });

  it('com chave, usa o Google', async () => {
    const chamada = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(google('ROOFTOP', ['street_address'])));
    const l = await geocodificar(ambiente({ GOOGLE_MAPS_API_KEY: 'chave-teste' }), endereco());
    expect(l?.precisao).toBe('numero');
    expect(String(chamada.mock.calls[0]![0])).toContain('maps.googleapis.com/maps/api/geocode/json');
  });

  it('provedor fora do ar não derruba nada: fica sem ponto', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    expect(await geocodificar(ambiente(), endereco())).toBeNull();
  });

  it('desligado não consulta ninguém', async () => {
    const chamada = vi.spyOn(globalThis, 'fetch');
    expect(await geocodificar(ambiente({ GEOCODIFICADOR: 'desligado' }), endereco())).toBeNull();
    expect(chamada).not.toHaveBeenCalled();
  });
});

describe('pontos no pedido', () => {
  let eq: Equipe;
  beforeAll(async () => {
    eq = await empresaComEquipe(await novoSuperAdmin());
  });

  const vinculoDe = (pessoa: Equipe['motoboy']) => pessoa.eu.vinculos[0].vinculoId as string;
  const acao = (cliente: Cliente, pedidoId: string, nome: string, corpo: object = {}) =>
    cliente.post(`/empresas/${eq.empresa.id}/pedidos/${pedidoId}/acoes/${nome}`, corpo);
  const verPelaCentral = (pedidoId: string) =>
    eq.admin.cliente.get<PedidoDetalhe>(`/empresas/${eq.empresa.id}/pedidos/${pedidoId}`);

  it('busca de endereço é da central (geocodificador desligado nos testes: sem ponto)', async () => {
    const rota = `/empresas/${eq.empresa.id}/enderecos/localizar`;
    const r = await eq.despachante.cliente.post<LocalizarResposta>(rota, endereco());
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ localizacao: null });
    expect((await eq.motoboy.cliente.post(rota, endereco())).status).toBe(403);
    expect((await eq.despachante.cliente.post(rota, { logradouro: 'x' })).status).toBe(422);
  });

  it('o ponto marcado no mapa vai para o pedido, para o motoboy e para o próximo pedido do cliente', async () => {
    const telefone = novoCelular();
    const p = await novoPedido(eq.admin.cliente, eq.empresa.id, {
      entrega: { nome: 'Bia', telefone, endereco: { ...endereco('Rua Recife', '900'), localizacao: NA_PORTA } },
      motoboyVinculoId: vinculoDe(eq.motoboy),
    });
    expect(p.entrega.endereco.localizacao).toEqual(NA_PORTA);
    expect(p.coleta.endereco.localizacao).toBeUndefined();

    const doMotoboy = await eq.motoboy.cliente.get<PedidoDetalhe>(`/empresas/${eq.empresa.id}/pedidos/${p.id}`);
    expect(doMotoboy.corpo.entrega.endereco.localizacao).toEqual(NA_PORTA);

    const cliente = await eq.admin.cliente.get<ClienteResposta>(
      `/empresas/${eq.empresa.id}/clientes/telefone/${encodeURIComponent(telefone)}`,
    );
    expect(cliente.corpo.endereco?.localizacao).toEqual(NA_PORTA);
  });

  it('a central vê a que distância da entrega o motoboy registrou cada ação', async () => {
    const p = await novoPedido(eq.admin.cliente, eq.empresa.id, {
      entrega: { nome: 'Caio', telefone: novoCelular(), endereco: { ...endereco(), localizacao: NA_PORTA } },
      motoboyVinculoId: vinculoDe(eq.motoboy),
    });
    // Coleta a uns 2 km da porta; entrega a uns 50 m.
    const longe = { latitude: -24.9555, longitude: -53.4752 };
    const perto = { latitude: -24.9559, longitude: -53.4552 };
    for (const passo of ['aceitar', 'iniciar_coleta']) {
      expect((await acao(eq.motoboy.cliente, p.id, passo)).status, passo).toBe(200);
    }
    expect((await acao(eq.motoboy.cliente, p.id, 'coletar', longe)).status).toBe(200);
    const codigo = (await verPelaCentral(p.id)).corpo.codigoEntrega;
    expect((await acao(eq.motoboy.cliente, p.id, 'entregar', { codigo, ...perto })).status).toBe(200);

    const { corpo } = await verPelaCentral(p.id);
    const distancia = (nome: string) => corpo.eventos.find((e) => e.acao === nome)?.distanciaDaEntregaM;
    expect(distancia('criar')).toBeNull(); // ação da central, sem GPS
    expect(distancia('coletar')).toBeGreaterThan(1900);
    expect(distancia('entregar')).toBeLessThan(100);
  });

  it('sem ponto de entrega, não há distância a mostrar', async () => {
    const p = await novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculoDe(eq.motoboy) });
    const aceite = await acao(eq.motoboy.cliente, p.id, 'aceitar', { latitude: -24.95, longitude: -53.45 });
    expect(aceite.status).toBe(200);
    const { corpo } = await verPelaCentral(p.id);
    expect(corpo.eventos.every((e) => e.distanciaDaEntregaM === null)).toBe(true);
  });
});
