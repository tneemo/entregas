// Indicadores, busca no histórico, avaliação do destinatário, idempotência e cabeçalhos
// de observabilidade.

import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import type { IndicadoresResposta, PedidoDetalhe, PedidoResumo, RastreioResposta } from '@entregas/shared';
import { expurgarIdempotencia } from '../src/dados/idempotencia.ts';
import { criarDb } from '../src/db/index.ts';
import { Cliente, empresaComEquipe, endereco, novoCelular, novoPedido, novoSuperAdmin } from './ajudantes.ts';

type Equipe = Awaited<ReturnType<typeof empresaComEquipe>>;

const ponto = (latitude: number, longitude: number) => ({
  latitude,
  longitude,
  precisao: 'numero' as const,
  fonte: 'mapa' as const,
});

/** A central leva o pedido até "entregue" (ela vê o código). */
async function entregar(equipe: Equipe, pedido: PedidoDetalhe) {
  const central = equipe.despachante.cliente;
  const base = `/empresas/${equipe.empresa.id}/pedidos/${pedido.id}/acoes`;
  const motoboyVinculoId = equipe.motoboy.eu.vinculos[0].vinculoId;
  for (const [acao, corpo] of [
    ['atribuir', { motoboyVinculoId }],
    ['iniciar_coleta', {}],
    ['coletar', {}],
    ['entregar', { codigo: pedido.codigoEntrega }],
  ] as const) {
    const r = await central.post(`${base}/${acao}`, corpo);
    if (r.status !== 200) throw new Error(`${acao} falhou (${r.status}): ${JSON.stringify(r.corpo)}`);
  }
}

const tokenDe = (pedido: PedidoDetalhe) => pedido.rastreio!.caminho.replace('/r/', '');

describe('plataforma', () => {
  let sa: Cliente;
  let a: Equipe;
  let b: Equipe;

  beforeAll(async () => {
    sa = await novoSuperAdmin();
    a = await empresaComEquipe(sa);
    b = await empresaComEquipe(sa);
  });

  describe('resumo dos pedidos', () => {
    it('traz os pontos de coleta e de entrega quando o endereço tem pino', async () => {
      const pedido = await novoPedido(a.despachante.cliente, a.empresa.id, {
        coleta: { endereco: { ...endereco('Rua Paraná', '1500'), localizacao: ponto(-24.9555, -53.4552) } },
        entrega: {
          nome: 'Bia Pino',
          telefone: novoCelular(),
          endereco: { ...endereco('Av. Brasil', '2000'), localizacao: ponto(-24.9465, -53.4552) },
        },
      });
      const lista = await a.despachante.cliente.get<PedidoResumo[]>(`/empresas/${a.empresa.id}/pedidos`);
      const resumo = lista.corpo.find((p) => p.id === pedido.id)!;
      expect(resumo.pontoColeta).toEqual({ latitude: -24.9555, longitude: -53.4552 });
      expect(resumo.destino.coordenadas).toEqual({ latitude: -24.9465, longitude: -53.4552 });
    });

    it('fica sem ponto quando o endereço não foi localizado', async () => {
      const pedido = await novoPedido(a.despachante.cliente, a.empresa.id);
      const lista = await a.despachante.cliente.get<PedidoResumo[]>(`/empresas/${a.empresa.id}/pedidos`);
      const resumo = lista.corpo.find((p) => p.id === pedido.id)!;
      expect(resumo.pontoColeta).toBeNull();
      expect(resumo.destino.coordenadas).toBeNull();
    });
  });

  describe('busca', () => {
    let alvo: PedidoDetalhe;
    const telefone = '(45) 98877-6655';

    beforeAll(async () => {
      alvo = await novoPedido(a.despachante.cliente, a.empresa.id, {
        entrega: { nome: 'Zuleica 100%_Teste', telefone, endereco: endereco('Av. Brasil', '900') },
      });
      await entregar(a, alvo);
      await novoPedido(b.despachante.cliente, b.empresa.id, {
        entrega: { nome: 'Zuleica da Outra', telefone: novoCelular(), endereco: endereco() },
      });
    });

    const buscar = (equipe: Equipe, termo: string) =>
      equipe.despachante.cliente.get<PedidoResumo[]>(
        `/empresas/${equipe.empresa.id}/pedidos?busca=${encodeURIComponent(termo)}`,
      );

    it('acha por parte do nome, mesmo já concluído', async () => {
      const r = await buscar(a, 'zuleica');
      expect(r.status).toBe(200);
      expect(r.corpo.map((p) => p.id)).toEqual([alvo.id]);
      expect(r.corpo[0]!.status).toBe('entregue');
    });

    it('acha pelo número do pedido e pelo telefone', async () => {
      expect((await buscar(a, String(alvo.numero))).corpo.map((p) => p.id)).toContain(alvo.id);
      expect((await buscar(a, '98877-6655')).corpo.map((p) => p.id)).toEqual([alvo.id]);
    });

    it('trata % e _ como texto, não como curinga', async () => {
      expect((await buscar(a, '100%_Teste')).corpo).toHaveLength(1);
      expect((await buscar(a, '%')).corpo.every((p) => p.destino.nome?.includes('%'))).toBe(true);
      expect((await buscar(a, 'Zuleica_100')).corpo).toHaveLength(0);
    });

    it('nunca devolve pedido de outra empresa', async () => {
      const r = await buscar(b, 'zuleica');
      expect(r.corpo).toHaveLength(1);
      expect(r.corpo[0]!.destino.nome).toBe('Zuleica da Outra');
    });

    it('motoboy só encontra o que está com ele', async () => {
      const r = await a.motoboy.cliente.get<PedidoResumo[]>(`/empresas/${a.empresa.id}/pedidos?busca=zuleica`);
      expect(r.status).toBe(200);
      expect(r.corpo).toHaveLength(0);
    });
  });

  describe('avaliação do destinatário', () => {
    let pedido: PedidoDetalhe;
    const publico = new Cliente();

    beforeAll(async () => {
      pedido = await novoPedido(a.despachante.cliente, a.empresa.id);
    });

    it('não aceita nota antes da entrega', async () => {
      const antes = await publico.get<RastreioResposta>(`/rastreio/${tokenDe(pedido)}`);
      expect(antes.corpo.podeAvaliar).toBe(false);
      const r = await publico.post(`/rastreio/${tokenDe(pedido)}/avaliacao`, { nota: 5 });
      expect(r.status).toBe(409);
      expect(r.corpo.erro.codigo).toBe('ainda_nao_entregue');
    });

    it('depois de entregue, aceita uma nota e mostra para a central', async () => {
      await entregar(a, pedido);
      const antes = await publico.get<RastreioResposta>(`/rastreio/${tokenDe(pedido)}`);
      expect(antes.corpo.podeAvaliar).toBe(true);
      expect(antes.corpo.avaliacao).toBeNull();

      const invalida = await publico.post(`/rastreio/${tokenDe(pedido)}/avaliacao`, { nota: 6 });
      expect(invalida.status).toBe(422);

      const r = await publico.post(`/rastreio/${tokenDe(pedido)}/avaliacao`, {
        nota: 4,
        comentario: ' Chegou quente ',
      });
      expect(r.status).toBe(201);

      const depois = await publico.get<RastreioResposta>(`/rastreio/${tokenDe(pedido)}`);
      expect(depois.corpo.podeAvaliar).toBe(false);
      expect(depois.corpo.avaliacao).toEqual({ nota: 4, comentario: 'Chegou quente' });

      const detalhe = await a.despachante.cliente.get<PedidoDetalhe>(`/empresas/${a.empresa.id}/pedidos/${pedido.id}`);
      expect(detalhe.corpo.avaliacao).toMatchObject({ nota: 4, comentario: 'Chegou quente' });
    });

    it('só vale uma avaliação por pedido', async () => {
      const r = await publico.post(`/rastreio/${tokenDe(pedido)}/avaliacao`, { nota: 1 });
      expect(r.status).toBe(409);
      expect(r.corpo.erro.codigo).toBe('ja_avaliado');
    });

    it('token inválido não avalia nada', async () => {
      const r = await publico.post('/rastreio/token-que-nao-existe-0000/avaliacao', { nota: 5 });
      expect(r.status).toBe(404);
    });

    it('o ponto de destino só aparece para o destinatário em rota de entrega', async () => {
      const comPino = await novoPedido(a.despachante.cliente, a.empresa.id, {
        entrega: {
          nome: 'Caio Rota',
          telefone: novoCelular(),
          endereco: { ...endereco('Av. Brasil', '2000'), localizacao: ponto(-24.9465, -53.4552) },
        },
      });
      const ver = () => publico.get<RastreioResposta>(`/rastreio/${tokenDe(comPino)}`);
      expect((await ver()).corpo.destino).toBeNull();

      const base = `/empresas/${a.empresa.id}/pedidos/${comPino.id}/acoes`;
      const motoboyVinculoId = a.motoboy.eu.vinculos[0].vinculoId;
      await a.despachante.cliente.post(`${base}/atribuir`, { motoboyVinculoId });
      await a.despachante.cliente.post(`${base}/iniciar_coleta`);
      await a.despachante.cliente.post(`${base}/coletar`);
      expect((await ver()).corpo.destino).toEqual({ latitude: -24.9465, longitude: -53.4552 });

      await a.despachante.cliente.post(`${base}/entregar`, { codigo: comPino.codigoEntrega });
      expect((await ver()).corpo.destino).toBeNull();
    });
  });

  describe('indicadores', () => {
    const ver = (equipe: Equipe, dias = 1) =>
      equipe.despachante.cliente.get<IndicadoresResposta>(`/empresas/${equipe.empresa.id}/indicadores?dias=${dias}`);

    it('conta o que foi entregue, o que está na rua e a nota dos clientes', async () => {
      // Empresa nova para os números não dependerem dos outros testes.
      const c = await empresaComEquipe(sa);
      const entregue = await novoPedido(c.despachante.cliente, c.empresa.id);
      await entregar(c, entregue);
      await new Cliente().post(`/rastreio/${tokenDe(entregue)}/avaliacao`, { nota: 5 });
      await novoPedido(c.despachante.cliente, c.empresa.id, {
        formaPagamento: 'pago',
        valorACobrarCentavos: 0,
        trocoParaCentavos: undefined,
      });
      const cancelado = await novoPedido(c.despachante.cliente, c.empresa.id);
      await c.despachante.cliente.post(`/empresas/${c.empresa.id}/pedidos/${cancelado.id}/acoes/cancelar`, {
        motivo: 'Cliente desistiu',
      });

      const r = await ver(c);
      expect(r.status).toBe(200);
      const i = r.corpo;
      expect(i.agora).toMatchObject({ emAndamento: 1, semMotoboy: 1, emRota: 0, atencao: 0, motoboysEmTurno: 0 });
      expect(i.totais).toMatchObject({
        entregues: 1,
        devolvidos: 0,
        cancelados: 1,
        taxaSucesso: 1,
        valorCobradoCentavos: 4590,
        taxasEntregaCentavos: 700,
      });
      expect(i.totais.tempoMedioEntregaMin).toBe(0);
      expect(i.porDia).toHaveLength(1);
      expect(i.porDia[0]).toMatchObject({ entregues: 1, naoEntregues: 0 });
      expect(i.porHora).toHaveLength(24);
      expect(i.porHora.reduce((soma, h) => soma + h.pedidos, 0)).toBe(3);
      expect(i.motoboys).toEqual([
        expect.objectContaining({ entregues: 1, devolvidos: 0, notaMedia: 5, avaliacoes: 1, nome: 'Motoboy Teste' }),
      ]);
      expect(i.pagamentos).toEqual([{ forma: 'dinheiro', pedidos: 1, valorCentavos: 4590 }]);
      expect(i.avaliacoes).toEqual({ media: 5, total: 1, porNota: [0, 0, 0, 0, 1] });
    });

    it('o período de 7 dias traz um ponto por dia, terminando hoje', async () => {
      const r = await ver(a, 7);
      expect(r.corpo.periodo.dias).toBe(7);
      expect(r.corpo.porDia).toHaveLength(7);
      const dias = r.corpo.porDia.map((d) => d.dia);
      expect([...dias].sort()).toEqual(dias);
      expect(r.corpo.porDia.at(-1)!.entregues).toBeGreaterThan(0);
    });

    it('recusa período fora da lista e quem não é da central', async () => {
      expect((await ver(a, 5)).status).toBe(404);
      const motoboy = await a.motoboy.cliente.get(`/empresas/${a.empresa.id}/indicadores`);
      expect(motoboy.status).toBe(403);
    });

    it('uma empresa não enxerga os números da outra', async () => {
      const vazia = await empresaComEquipe(sa);
      const r = await ver(vazia, 30);
      expect(r.corpo.totais.entregues).toBe(0);
      expect(r.corpo.motoboys).toEqual([]);
      expect(r.corpo.avaliacoes.total).toBe(0);
      const intruso = await a.admin.cliente.get(`/empresas/${vazia.empresa.id}/indicadores`);
      expect(intruso.status).toBe(404);
    });
  });

  describe('idempotência', () => {
    const corpoPedido = () => ({
      coleta: { endereco: endereco('Rua Paraná', '1500') },
      entrega: { nome: 'Dona Repetida', telefone: novoCelular(), endereco: endereco('Av. Brasil', '2000', 'Neva') },
      formaPagamento: 'pago',
      valorACobrarCentavos: 0,
    });
    const chave = () => `teste-${crypto.randomUUID()}`;

    it('repetir a mesma chave não cria outro pedido e devolve a mesma resposta', async () => {
      const central = a.despachante.cliente;
      const caminho = `/empresas/${a.empresa.id}/pedidos`;
      const k = chave();
      const corpo = corpoPedido();
      const primeira = await central.req<PedidoDetalhe>('POST', caminho, corpo, { 'idempotency-key': k });
      const segunda = await central.req<PedidoDetalhe>('POST', caminho, corpo, { 'idempotency-key': k });
      expect(primeira.status).toBe(201);
      expect(primeira.headers.get('idempotent-replayed')).toBeNull();
      expect(segunda.status).toBe(201);
      expect(segunda.headers.get('idempotent-replayed')).toBe('true');
      expect(segunda.corpo.id).toBe(primeira.corpo.id);
      expect(segunda.corpo.numero).toBe(primeira.corpo.numero);

      const achados = await central.get<PedidoResumo[]>(`${caminho}?busca=${encodeURIComponent('Dona Repetida')}`);
      expect(achados.corpo.filter((p) => p.id === primeira.corpo.id)).toHaveLength(1);
    });

    it('sem a chave, cada requisição vale por si', async () => {
      const central = a.despachante.cliente;
      const caminho = `/empresas/${a.empresa.id}/pedidos`;
      const um = await central.post<PedidoDetalhe>(caminho, corpoPedido());
      const dois = await central.post<PedidoDetalhe>(caminho, corpoPedido());
      expect(dois.corpo.id).not.toBe(um.corpo.id);
    });

    it('ação repetida com a mesma chave não dá "pedido mudou"', async () => {
      const central = a.despachante.cliente;
      const pedido = await novoPedido(central, a.empresa.id);
      const caminho = `/empresas/${a.empresa.id}/pedidos/${pedido.id}/acoes/atribuir`;
      const corpo = { motoboyVinculoId: a.motoboy.eu.vinculos[0].vinculoId };
      const k = chave();
      const primeira = await central.req<PedidoDetalhe>('POST', caminho, corpo, { 'idempotency-key': k });
      const segunda = await central.req<PedidoDetalhe>('POST', caminho, corpo, { 'idempotency-key': k });
      expect(primeira.status).toBe(200);
      expect(segunda.status).toBe(200);
      expect(segunda.corpo.eventos.filter((e) => e.acao === 'atribuir')).toHaveLength(1);
    });

    it('erro não fica guardado: a tentativa seguinte executa de verdade', async () => {
      const central = a.despachante.cliente;
      const caminho = `/empresas/${a.empresa.id}/pedidos`;
      const k = chave();
      const invalido = await central.req(
        'POST',
        caminho,
        { ...corpoPedido(), formaPagamento: 'fiado' },
        { 'idempotency-key': k },
      );
      expect(invalido.status).toBe(422);
      const valido = await central.req<PedidoDetalhe>('POST', caminho, corpoPedido(), { 'idempotency-key': k });
      expect(valido.status).toBe(201);
      expect(valido.headers.get('idempotent-replayed')).toBeNull();
    });

    it('a mesma chave em outra operação é recusada', async () => {
      const central = a.despachante.cliente;
      const k = chave();
      const criado = await central.req<PedidoDetalhe>('POST', `/empresas/${a.empresa.id}/pedidos`, corpoPedido(), {
        'idempotency-key': k,
      });
      const outra = await central.req(
        'POST',
        `/empresas/${a.empresa.id}/pedidos/${criado.corpo.id}/acoes/cancelar`,
        { motivo: 'Teste de chave' },
        { 'idempotency-key': k },
      );
      expect(outra.status).toBe(422);
      expect(outra.corpo.erro.codigo).toBe('chave_idempotencia_reutilizada');
    });

    it('a chave é de quem a usou: outra pessoa com a mesma chave executa a própria requisição', async () => {
      const k = chave();
      const caminho = `/empresas/${a.empresa.id}/pedidos`;
      const um = await a.despachante.cliente.req<PedidoDetalhe>('POST', caminho, corpoPedido(), {
        'idempotency-key': k,
      });
      const dois = await a.admin.cliente.req<PedidoDetalhe>('POST', caminho, corpoPedido(), { 'idempotency-key': k });
      expect(dois.status).toBe(201);
      expect(dois.corpo.id).not.toBe(um.corpo.id);
    });

    it('chave malformada é recusada e chave vencida é apagada pela limpeza diária', async () => {
      const central = a.despachante.cliente;
      const caminho = `/empresas/${a.empresa.id}/pedidos`;
      const ruim = await central.req('POST', caminho, corpoPedido(), { 'idempotency-key': 'curta' });
      expect(ruim.status).toBe(400);

      const k = chave();
      await central.req('POST', caminho, corpoPedido(), { 'idempotency-key': k });
      const db = criarDb(env.DB);
      expect(await expurgarIdempotencia(db)).toBe(0);
      expect(await expurgarIdempotencia(db, Date.now() + 25 * 60 * 60 * 1000)).toBeGreaterThan(0);
      const denovo = await central.req('POST', caminho, corpoPedido(), { 'idempotency-key': k });
      expect(denovo.headers.get('idempotent-replayed')).toBeNull();
    });
  });

  describe('observabilidade', () => {
    it('toda resposta leva número da requisição, tempo e cabeçalhos de segurança', async () => {
      const r = await new Cliente().get('/saude');
      expect(r.headers.get('x-request-id')).toMatch(/\S{8,}/);
      expect(r.headers.get('server-timing')).toMatch(/^app;dur=\d+$/);
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('referrer-policy')).toBe('same-origin');
    });

    it('erros também saem identificados', async () => {
      const r = await new Cliente().get('/rota-que-nao-existe');
      expect(r.status).toBe(404);
      expect(r.headers.get('x-request-id')).toBeTruthy();
    });
  });
});
