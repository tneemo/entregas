// Despacho: quem é o melhor motoboy para um pedido e em quanto tempo ele chega.
//
// Funções puras, sem rede: o painel recalcula a sugestão a cada posição nova que
// chega pelo tempo real, e a página de rastreio estima a chegada no próprio celular.

import { distanciaMetros, type Coordenadas } from './localizacao.ts';

/** Ruas não são linha reta: o trajeto costuma ser uns 40% maior que a distância direta. */
export const FATOR_TRAJETO = 1.4;

/** Velocidade média de moto na cidade, já contando semáforo e trânsito (km/h). */
export const VELOCIDADE_MEDIA_KMH = 24;

/** Mais perto que isto do destino, o entregador está chegando. */
export const CHEGANDO_M = 150;

/** Posição mais velha que isto não serve para medir distância (o motoboy já andou). */
export const POSICAO_UTIL_S = 5 * 60;

/** Cada entrega já em andamento pesa como este desvio a mais no caminho (metros). */
const PESO_POR_PEDIDO_M = 2_000;
/** Quem está em turno mas sem posição recente entra depois de quem está comprovadamente perto. */
const PESO_SEM_POSICAO_M = 6_000;
/** Sem notificação no celular, o pedido demora a ser visto. */
const PESO_SEM_NOTIFICACAO_M = 1_500;

/** Minutos de moto para vencer uma distância em linha reta. Nunca menos de 1. */
export function minutosDeTrajeto(distanciaRetaM: number): number {
  const km = (distanciaRetaM * FATOR_TRAJETO) / 1000;
  return Math.max(1, Math.round((km / VELOCIDADE_MEDIA_KMH) * 60));
}

export interface PrevisaoChegada {
  /** Já está na rua do destino. */
  chegando: boolean;
  minutos: number;
  distanciaM: number;
}

/** Previsão de chegada do entregador ao destino, a partir da última posição dele. */
export function preverChegada(entregador: Coordenadas, destino: Coordenadas): PrevisaoChegada {
  const distanciaM = Math.round(distanciaMetros(entregador, destino));
  return { chegando: distanciaM <= CHEGANDO_M, minutos: minutosDeTrajeto(distanciaM), distanciaM };
}

/** "Chegando", "cerca de 8 min". */
export function textoPrevisao(p: PrevisaoChegada): string {
  return p.chegando ? 'Chegando' : `cerca de ${p.minutos} min`;
}

export interface CandidatoDespacho {
  vinculoId: string;
  nome: string;
  emTurno: boolean;
  pedidosAtivos: number;
  recebeNotificacao: boolean;
}

export interface PosicaoCandidato extends Coordenadas {
  registradoEm: string;
}

export interface SugestaoDespacho {
  vinculoId: string;
  nome: string;
  pedidosAtivos: number;
  recebeNotificacao: boolean;
  /** Distância em linha reta até a coleta; null sem posição recente ou sem ponto de coleta. */
  distanciaM: number | null;
  /** Minutos até chegar na coleta; null quando não dá para medir. */
  minutosAteColeta: number | null;
  /** Quanto menor, melhor. Só serve para ordenar. */
  custo: number;
}

/**
 * Ordena quem está em turno do melhor para o pior: mais perto da coleta, com menos
 * entregas na mão e com o celular recebendo notificação. Quem está fora do turno não entra.
 */
export function sugerirMotoboys(
  coleta: Coordenadas | null | undefined,
  motoboys: readonly CandidatoDespacho[],
  posicoes: Readonly<Record<string, PosicaoCandidato | undefined>>,
  agora = Date.now(),
): SugestaoDespacho[] {
  return motoboys
    .filter((m) => m.emTurno)
    .map((m): SugestaoDespacho => {
      const posicao = posicoes[m.vinculoId];
      const recente = posicao && agora - Date.parse(posicao.registradoEm) <= POSICAO_UTIL_S * 1000;
      const distanciaM = coleta && posicao && recente ? Math.round(distanciaMetros(posicao, coleta)) : null;
      return {
        vinculoId: m.vinculoId,
        nome: m.nome,
        pedidosAtivos: m.pedidosAtivos,
        recebeNotificacao: m.recebeNotificacao,
        distanciaM,
        minutosAteColeta: distanciaM === null ? null : minutosDeTrajeto(distanciaM),
        custo:
          (distanciaM ?? PESO_SEM_POSICAO_M) +
          m.pedidosAtivos * PESO_POR_PEDIDO_M +
          (m.recebeNotificacao ? 0 : PESO_SEM_NOTIFICACAO_M),
      };
    })
    .sort((a, b) => a.custo - b.custo || a.nome.localeCompare(b.nome, 'pt-BR'));
}
