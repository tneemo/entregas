import { describe, expect, it } from 'vitest';
import {
  MAX_PEDIDOS_POR_MOTOBOY,
  escolherParaOferta,
  type CandidatoOferta,
  type PedidoParaOferta,
} from './despacho.ts';

const AGORA = Date.parse('2026-11-18T15:00:00Z');
const recente = new Date(AGORA - 30_000).toISOString();

const COLETA = { latitude: -24.9555, longitude: -53.4552 };
const PERTO = { latitude: -24.9465, longitude: -53.4552 };
const LONGE = { latitude: -24.9195, longitude: -53.4552 };

const motoboy = (vinculoId: string, extras: Partial<CandidatoOferta> = {}): CandidatoOferta => ({
  vinculoId,
  nome: vinculoId,
  emTurno: true,
  pedidosAtivos: 0,
  recebeNotificacao: true,
  lojaId: null,
  ofertaPendente: false,
  ...extras,
});

const pedido = (extras: Partial<PedidoParaOferta> = {}): PedidoParaOferta => ({
  coleta: COLETA,
  lojaId: null,
  lojaTemFixos: false,
  transbordo: true,
  recusaram: new Set(),
  ...extras,
});

const posicoes = {
  perto: { ...PERTO, registradoEm: recente },
  longe: { ...LONGE, registradoEm: recente },
  fixo: { ...LONGE, registradoEm: recente },
};

describe('oferta automática', () => {
  it('pedido sem loja vai para o livre mais perto da coleta', () => {
    const escolha = escolherParaOferta(pedido(), [motoboy('longe'), motoboy('perto')], posicoes, AGORA);
    expect(escolha).toMatchObject({ vinculoId: 'perto', grupo: 'livre' });
  });

  it('pula quem recusou, quem já tem oferta esperando, quem está cheio e quem está fora do turno', () => {
    const lista = [
      motoboy('perto'),
      motoboy('ocupado', { ofertaPendente: true }),
      motoboy('cheio', { pedidosAtivos: MAX_PEDIDOS_POR_MOTOBOY }),
      motoboy('folga', { emTurno: false }),
      motoboy('longe'),
    ];
    const escolha = escolherParaOferta(pedido({ recusaram: new Set(['perto']) }), lista, posicoes, AGORA);
    expect(escolha?.vinculoId).toBe('longe');
    expect(escolherParaOferta(pedido({ recusaram: new Set(['perto', 'longe']) }), lista, posicoes, AGORA)).toBeNull();
  });

  it('pedido de loja com fixo vai para o fixo, mesmo com um livre mais perto', () => {
    const lista = [motoboy('perto'), motoboy('fixo', { lojaId: 'loja-a' })];
    const escolha = escolherParaOferta(pedido({ lojaId: 'loja-a', lojaTemFixos: true }), lista, posicoes, AGORA);
    expect(escolha).toMatchObject({ vinculoId: 'fixo', grupo: 'fixo' });
  });

  it('fixo ocupado: transbordo libera os livres; sem transbordo o pedido espera', () => {
    const lista = [motoboy('perto'), motoboy('fixo', { lojaId: 'loja-a', ofertaPendente: true })];
    const base = { lojaId: 'loja-a', lojaTemFixos: true };
    expect(escolherParaOferta(pedido(base), lista, posicoes, AGORA)).toMatchObject({
      vinculoId: 'perto',
      grupo: 'livre',
    });
    expect(escolherParaOferta(pedido({ ...base, transbordo: false }), lista, posicoes, AGORA)).toBeNull();
  });

  it('fixo de uma loja nunca recebe pedido de outra loja nem pedido sem loja', () => {
    const lista = [motoboy('fixo', { lojaId: 'loja-a' })];
    expect(escolherParaOferta(pedido(), lista, posicoes, AGORA)).toBeNull();
    expect(escolherParaOferta(pedido({ lojaId: 'loja-b' }), lista, posicoes, AGORA)).toBeNull();
  });

  it('loja sem fixos usa os livres', () => {
    const escolha = escolherParaOferta(pedido({ lojaId: 'loja-b' }), [motoboy('perto')], posicoes, AGORA);
    expect(escolha?.vinculoId).toBe('perto');
  });
});
