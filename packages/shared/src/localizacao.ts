// Onde fica cada endereço no mapa (latitude e longitude), e quão confiável é esse ponto.
//
// Geocodificadores erram muito no Brasil: em Cascavel o OpenStreetMap só acha a rua, não o
// número. Por isso cada ponto diz de onde veio e com que precisão, e o painel sempre deixa
// a pessoa arrastar o pino até a porta.

/** Quão perto da porta o ponto está. */
export const PRECISOES_LOCALIZACAO = ['numero', 'rua', 'aproximada'] as const;
export type PrecisaoLocalizacao = (typeof PRECISOES_LOCALIZACAO)[number];

/**
 * De onde veio o ponto:
 * - busca: geocodificador (Google ou OpenStreetMap), a partir do texto do endereço;
 * - mapa: alguém da central marcou ou arrastou o pino (vale como o número exato).
 */
export const FONTES_LOCALIZACAO = ['busca', 'mapa'] as const;
export type FonteLocalizacao = (typeof FONTES_LOCALIZACAO)[number];

export interface Localizacao {
  latitude: number;
  longitude: number;
  precisao: PrecisaoLocalizacao;
  fonte: FonteLocalizacao;
}

export interface Coordenadas {
  latitude: number;
  longitude: number;
}

export const ROTULOS_PRECISAO: Record<PrecisaoLocalizacao, string> = {
  numero: 'no número',
  rua: 'só a rua',
  aproximada: 'aproximada',
};

/** O ponto leva o motoboy até a porta (dá para navegar direto por coordenada). */
export function localizacaoExata(l: Localizacao | null | undefined): l is Localizacao {
  return Boolean(l && l.precisao === 'numero');
}

/**
 * Ação do motoboy registrada mais longe que isto do endereço de entrega chama a atenção
 * da central (ex.: "entregue" a 2 km do cliente). O GPS de celular erra uns 10 a 50 m.
 */
export const LONGE_DO_DESTINO_M = 300;

const RAIO_TERRA_M = 6_371_000;
const rad = (graus: number) => (graus * Math.PI) / 180;

/** Distância em linha reta (fórmula de haversine), em metros. */
export function distanciaMetros(a: Coordenadas, b: Coordenadas): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "850 m", "1,2 km". */
export function textoDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`;
  return `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}
