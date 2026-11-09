// GPS do turno.
//
// No Android roda como serviço em primeiro plano, com notificação fixa avisando que a
// localização está sendo enviada (transparência exigida pela LGPD e pela Play Store).
// Os pontos vão para uma fila no aparelho e sobem em lotes; sem sinal, esperam.
// A API recusa pontos sem turno aberto; nesse caso a fila é descartada e o GPS para.
//
// Na web (só desenvolvimento) não há tarefa em segundo plano: usamos watchPosition
// enquanto a página está aberta.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { DadosPosicoes } from '@entregas/shared';
import { api, ErroDaApi } from './api.ts';
import { cores } from './tema.ts';
// Também inicia o Sentry quando o Android acorda o app só para esta tarefa.
import { Sentry } from './monitoramento.ts';

const TAREFA = 'entregas-gps-turno';
const CHAVE_FILA = 'entregas.gps.fila';
const CHAVE_EMPRESA = 'entregas.gps.empresa';
const MAX_FILA = 2000;
const LOTE = 100;

type Ponto = DadosPosicoes['pontos'][number];

function paraPonto(l: Location.LocationObject): Ponto {
  return {
    latitude: l.coords.latitude,
    longitude: l.coords.longitude,
    precisao: l.coords.accuracy ?? undefined,
    velocidade: l.coords.speed !== null && l.coords.speed >= 0 ? l.coords.speed : undefined,
    registradoEm: new Date(l.timestamp).toISOString(),
  };
}

async function lerFila(): Promise<Ponto[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CHAVE_FILA)) ?? '[]') as Ponto[];
  } catch {
    return [];
  }
}

async function enfileirar(pontos: Ponto[]) {
  const fila = [...(await lerFila()), ...pontos].slice(-MAX_FILA);
  await AsyncStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
}

let enviando = false;

/** Sobe a fila em lotes. Chamado a cada novo ponto e quando o app volta a abrir. */
export async function enviarFila() {
  if (enviando) return;
  enviando = true;
  try {
    const empresaId = await AsyncStorage.getItem(CHAVE_EMPRESA);
    if (!empresaId) return;
    let fila = await lerFila();
    while (fila.length > 0) {
      const lote = fila.slice(0, LOTE);
      try {
        await api(`/empresas/${empresaId}/turno/posicoes`, { metodo: 'POST', corpo: { pontos: lote } });
      } catch (erro) {
        // Sem turno ou sem acesso: nada deve ser guardado nem enviado.
        if (erro instanceof ErroDaApi && [401, 403, 404, 409].includes(erro.status)) {
          await pararRastreio();
        }
        return;
      }
      fila = fila.slice(lote.length);
      await AsyncStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
    }
  } finally {
    enviando = false;
  }
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TAREFA, async ({ data, error }) => {
    // Ex.: permissão de localização retirada com o turno aberto. A central perde o motoboy no mapa.
    if (error) Sentry.captureMessage(`GPS do turno: ${error.message}`, 'warning');
    if (error || !data?.locations?.length) return;
    await enfileirar(data.locations.map(paraPonto));
    await enviarFila();
  });
}

let observadorWeb: Location.LocationSubscription | null = null;

export type ResultadoRastreio = 'segundo_plano' | 'so_com_app_aberto' | 'sem_permissao';

/**
 * Liga o GPS do turno. Pede permissão "o tempo todo" para continuar com a tela
 * apagada; se a pessoa negar, funciona só com o app aberto.
 */
export async function iniciarRastreio(empresaId: string, nomeEmpresa: string): Promise<ResultadoRastreio> {
  await AsyncStorage.setItem(CHAVE_EMPRESA, empresaId);

  const primeiroPlano = await Location.requestForegroundPermissionsAsync();
  if (primeiroPlano.status !== 'granted') return 'sem_permissao';

  if (Platform.OS === 'web') {
    observadorWeb?.remove();
    observadorWeb = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 15_000, distanceInterval: 25 },
      async (l) => {
        await enfileirar([paraPonto(l)]);
        await enviarFila();
      },
    );
    return 'so_com_app_aberto';
  }

  const segundoPlano = await Location.requestBackgroundPermissionsAsync();
  if (await Location.hasStartedLocationUpdatesAsync(TAREFA)) await Location.stopLocationUpdatesAsync(TAREFA);
  await Location.startLocationUpdatesAsync(TAREFA, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15_000,
    distanceInterval: 25,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Você está em turno',
      notificationBody: `Sua localização é enviada à ${nomeEmpresa} até você encerrar o turno.`,
      notificationColor: cores.mercosul,
      killServiceOnDestroy: false,
    },
  });
  return segundoPlano.status === 'granted' ? 'segundo_plano' : 'so_com_app_aberto';
}

export async function pararRastreio() {
  observadorWeb?.remove();
  observadorWeb = null;
  if (Platform.OS !== 'web' && (await Location.hasStartedLocationUpdatesAsync(TAREFA).catch(() => false))) {
    await Location.stopLocationUpdatesAsync(TAREFA);
  }
  await AsyncStorage.multiRemove([CHAVE_FILA, CHAVE_EMPRESA]);
}

export async function rastreioAtivo(): Promise<boolean> {
  if (Platform.OS === 'web') return observadorWeb !== null;
  return Location.hasStartedLocationUpdatesAsync(TAREFA).catch(() => false);
}

/** Posição atual para registrar no histórico de uma ação (se houver permissão). */
export async function posicaoAtual(): Promise<{ latitude: number; longitude: number } | undefined> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return undefined;
    const l =
      (await Location.getLastKnownPositionAsync({ maxAge: 60_000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { latitude: l.coords.latitude, longitude: l.coords.longitude };
  } catch {
    return undefined;
  }
}
