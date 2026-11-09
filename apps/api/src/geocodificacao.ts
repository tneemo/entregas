// Geocodificação: texto do endereço → ponto no mapa, com a precisão que o provedor garante.
//
// Provedor:
// - Google Geocoding API, quando existe o segredo GOOGLE_MAPS_API_KEY (acha o número da casa);
// - senão Nominatim (OpenStreetMap), provisório: em Cascavel ele só acha a rua, e a política de
//   uso pede no máximo 1 consulta por segundo e identificação no User-Agent. Serve no piloto
//   porque só consulta endereço novo (cliente que volta reaproveita o ponto salvo).
// - GEOCODIFICADOR=desligado (testes): não consulta ninguém.
//
// Nunca impede a operação: se o provedor falhar ou demorar, o endereço fica sem ponto e o
// painel deixa marcar no mapa. Só o endereço sai daqui, nunca nome ou telefone de alguém.

import type { Endereco, Localizacao, PrecisaoLocalizacao } from '@entregas/shared';

const TEMPO_MAXIMO_MS = 4000;
const AGENTE = 'entregas-plataforma/1.0 (+https://entregas.joaopedropavanete.workers.dev)';

type EnderecoBusca = Pick<Endereco, 'logradouro' | 'numero' | 'bairro' | 'cidade' | 'uf' | 'cep'>;

export async function geocodificar(env: Env, endereco: EnderecoBusca): Promise<Localizacao | null> {
  if (env.GEOCODIFICADOR === 'desligado') return null;
  try {
    return env.GOOGLE_MAPS_API_KEY ? await google(env.GOOGLE_MAPS_API_KEY, endereco) : await nominatim(endereco);
  } catch (erro) {
    console.warn('geocodificação falhou:', erro instanceof Error ? erro.message : String(erro));
    return null;
  }
}

/** Completa a localização de quem ainda não tem. Endereços com ponto (do cliente ou do mapa) ficam como estão. */
export async function comLocalizacao<T extends EnderecoBusca & { localizacao?: Localizacao }>(
  env: Env,
  endereco: T,
): Promise<T> {
  if (endereco.localizacao) return endereco;
  const localizacao = await geocodificar(env, endereco);
  return localizacao ? { ...endereco, localizacao } : endereco;
}

const semNumero = (numero: string) => /^s\/?n$/i.test(numero.trim());

/** Sem acento e em minúsculas, para comparar nomes de cidade. */
function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

// Google --------------------------------------------------------------------------------

interface RespostaGoogle {
  status: string;
  error_message?: string;
  results: {
    geometry: { location: { lat: number; lng: number }; location_type: string };
    partial_match?: boolean;
    types: string[];
  }[];
}

export function interpretarGoogle(dados: RespostaGoogle): Localizacao | null {
  if (dados.status === 'ZERO_RESULTS') return null;
  if (dados.status !== 'OK') throw new Error(`Google: ${dados.status} ${dados.error_message ?? ''}`.trim());
  const r = dados.results[0];
  if (!r) return null;
  const tipo = r.geometry.location_type;
  let precisao: PrecisaoLocalizacao;
  if ((tipo === 'ROOFTOP' || tipo === 'RANGE_INTERPOLATED') && !r.partial_match) precisao = 'numero';
  else if (r.types.includes('route') || r.types.includes('street_address') || tipo === 'RANGE_INTERPOLATED')
    precisao = 'rua';
  else precisao = 'aproximada';
  return { latitude: r.geometry.location.lat, longitude: r.geometry.location.lng, precisao, fonte: 'busca' };
}

async function google(chave: string, e: EnderecoBusca): Promise<Localizacao | null> {
  const numero = semNumero(e.numero) ? '' : `, ${e.numero}`;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', `${e.logradouro}${numero} - ${e.bairro}, ${e.cidade} - ${e.uf}, Brasil`);
  url.searchParams.set('components', `country:BR|administrative_area:${e.uf}`);
  url.searchParams.set('region', 'br');
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('key', chave);
  const r = await fetch(url, { signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) });
  if (!r.ok) throw new Error(`Google: HTTP ${r.status}`);
  return interpretarGoogle(await r.json());
}

// Nominatim (OpenStreetMap) -------------------------------------------------------------

interface ResultadoNominatim {
  lat: string;
  lon: string;
  category?: string;
  address?: { house_number?: string; city?: string; town?: string; municipality?: string; village?: string };
}

export function interpretarNominatim(resultados: ResultadoNominatim[], cidade: string): Localizacao | null {
  const r = resultados[0];
  if (!r) return null;
  const a = r.address ?? {};
  const cidadeAchada = a.city ?? a.town ?? a.municipality ?? a.village;
  // Rua com o mesmo nome em outra cidade não serve.
  if (cidadeAchada && normalizar(cidadeAchada) !== normalizar(cidade)) return null;
  const precisao: PrecisaoLocalizacao = a.house_number ? 'numero' : r.category === 'highway' ? 'rua' : 'aproximada';
  return { latitude: Number(r.lat), longitude: Number(r.lon), precisao, fonte: 'busca' };
}

async function nominatim(e: EnderecoBusca): Promise<Localizacao | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('street', semNumero(e.numero) ? e.logradouro : `${e.numero} ${e.logradouro}`);
  url.searchParams.set('city', e.cidade);
  url.searchParams.set('state', e.uf);
  url.searchParams.set('country', 'Brasil');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  const r = await fetch(url, {
    headers: { 'user-agent': AGENTE, 'accept-language': 'pt-BR' },
    signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
  });
  if (!r.ok) throw new Error(`Nominatim: HTTP ${r.status}`);
  return interpretarNominatim(await r.json(), e.cidade);
}
