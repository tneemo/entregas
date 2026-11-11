import { describe, expect, it } from 'vitest';
import { minutosDeTrajeto, preverChegada, sugerirMotoboys, textoPrevisao, type CandidatoDespacho } from './despacho.ts';

const AGORA = Date.parse('2026-11-11T15:00:00Z');
const haSegundos = (s: number) => new Date(AGORA - s * 1000).toISOString();

/** Centro de Cascavel e pontos a ~1 km e ~4 km ao norte. */
const COLETA = { latitude: -24.9555, longitude: -53.4552 };
const PERTO = { latitude: -24.9465, longitude: -53.4552 };
const LONGE = { latitude: -24.9195, longitude: -53.4552 };

const motoboy = (vinculoId: string, extras: Partial<CandidatoDespacho> = {}): CandidatoDespacho => ({
  vinculoId,
  nome: vinculoId,
  emTurno: true,
  pedidosAtivos: 0,
  recebeNotificacao: true,
  ...extras,
});

describe('previsão de chegada', () => {
  it('nunca promete menos de 1 minuto', () => {
    expect(minutosDeTrajeto(0)).toBe(1);
    expect(minutosDeTrajeto(50)).toBe(1);
  });

  it('cresce com a distância (1,1 km em linha reta ≈ 4 min de moto)', () => {
    expect(minutosDeTrajeto(1100)).toBe(4);
    expect(minutosDeTrajeto(5200)).toBe(18);
  });

  it('avisa quando o entregador já está na rua', () => {
    const p = preverChegada({ latitude: -24.9556, longitude: -53.4553 }, COLETA);
    expect(p.chegando).toBe(true);
    expect(textoPrevisao(p)).toBe('Chegando');
  });

  it('dá os minutos quando ainda falta', () => {
    const p = preverChegada(LONGE, COLETA);
    expect(p.chegando).toBe(false);
    expect(textoPrevisao(p)).toMatch(/^cerca de \d+ min$/);
  });
});

describe('sugestão de motoboy', () => {
  it('deixa de fora quem não está em turno', () => {
    const lista = sugerirMotoboys(COLETA, [motoboy('a', { emTurno: false }), motoboy('b')], {}, AGORA);
    expect(lista.map((s) => s.vinculoId)).toEqual(['b']);
  });

  it('prefere o mais perto da coleta', () => {
    const lista = sugerirMotoboys(
      COLETA,
      [motoboy('longe'), motoboy('perto')],
      { longe: { ...LONGE, registradoEm: haSegundos(20) }, perto: { ...PERTO, registradoEm: haSegundos(20) } },
      AGORA,
    );
    expect(lista.map((s) => s.vinculoId)).toEqual(['perto', 'longe']);
    expect(lista[0]!.distanciaM).toBeGreaterThan(900);
    expect(lista[0]!.distanciaM).toBeLessThan(1100);
    expect(lista[0]!.minutosAteColeta).toBe(4);
  });

  it('quem está livre e um pouco mais longe passa na frente de quem já carrega entregas', () => {
    const lista = sugerirMotoboys(
      COLETA,
      [motoboy('perto', { pedidosAtivos: 2 }), motoboy('longe')],
      { longe: { ...LONGE, registradoEm: haSegundos(20) }, perto: { ...PERTO, registradoEm: haSegundos(20) } },
      AGORA,
    );
    expect(lista[0]!.vinculoId).toBe('longe');
  });

  it('ignora posição velha: sem distância e atrás de quem está comprovadamente perto', () => {
    const lista = sugerirMotoboys(
      COLETA,
      [motoboy('parado'), motoboy('perto')],
      { parado: { ...PERTO, registradoEm: haSegundos(900) }, perto: { ...PERTO, registradoEm: haSegundos(30) } },
      AGORA,
    );
    expect(lista.map((s) => s.vinculoId)).toEqual(['perto', 'parado']);
    expect(lista[1]!.distanciaM).toBeNull();
    expect(lista[1]!.minutosAteColeta).toBeNull();
  });

  it('sem ponto de coleta, ordena pela carga e por quem recebe notificação', () => {
    const lista = sugerirMotoboys(
      null,
      [motoboy('carregado', { pedidosAtivos: 1 }), motoboy('mudo', { recebeNotificacao: false }), motoboy('livre')],
      {},
      AGORA,
    );
    expect(lista.map((s) => s.vinculoId)).toEqual(['livre', 'mudo', 'carregado']);
  });
});
