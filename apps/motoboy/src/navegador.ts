// Recursos da versão de navegador do app (iPhone sem o app instalado, por exemplo).
//
// No navegador não existe GPS em segundo plano nem notificação no celular bloqueado: o app só
// trabalha aberto e com a tela acesa. Por isso, durante o turno, ele pede ao navegador para não
// apagar a tela (Screen Wake Lock) e toca um alerta quando chega uma oferta.
// No app instalado (Android/iOS) tudo aqui é ignorado: lá quem avisa é a notificação.

import { Platform } from 'react-native';

const naWeb = Platform.OS === 'web' && typeof document !== 'undefined';

interface Trava {
  release(): Promise<void>;
}
type NavegadorComTrava = Navigator & { wakeLock?: { request(tipo: 'screen'): Promise<Trava> } };

let trava: Trava | null = null;
let querTelaAcesa = false;

async function pedirTrava() {
  const nav = navigator as NavegadorComTrava;
  if (!nav.wakeLock || trava) return;
  try {
    trava = await nav.wakeLock.request('screen');
    // O navegador solta a trava quando a aba some; volta a pedir quando ela aparece de novo.
    (trava as unknown as EventTarget).addEventListener?.('release', () => {
      trava = null;
    });
  } catch {
    trava = null;
  }
}

if (naWeb) {
  document.addEventListener('visibilitychange', () => {
    if (querTelaAcesa && document.visibilityState === 'visible') void pedirTrava();
  });
}

/** Tela sempre acesa durante o turno (só no navegador). Devolve se o navegador aceitou. */
export async function manterTelaAcesa(ligar: boolean): Promise<boolean> {
  if (!naWeb) return false;
  querTelaAcesa = ligar;
  if (ligar) {
    await pedirTrava();
    return trava !== null;
  }
  const atual = trava;
  trava = null;
  await atual?.release().catch(() => undefined);
  return false;
}

/** O navegador suporta manter a tela acesa? (iPhone a partir do iOS 16.4.) */
export const telaAcesaDisponivel = () => naWeb && Boolean((navigator as NavegadorComTrava).wakeLock);

// Alerta sonoro -------------------------------------------------------------------

type JanelaComAudio = typeof globalThis & { webkitAudioContext?: typeof AudioContext };
let audio: AudioContext | null = null;

/**
 * O iPhone só deixa a página tocar som depois de um toque da pessoa. Chamar dentro de um toque
 * (ex.: "Começar turno") libera o som para os alertas seguintes.
 */
export function liberarSom() {
  if (!naWeb) return;
  try {
    const Contexto = globalThis.AudioContext ?? (globalThis as JanelaComAudio).webkitAudioContext;
    if (!Contexto) return;
    audio ??= new Contexto();
    void audio.resume();
  } catch {
    audio = null;
  }
}

/** Três bipes curtos e vibração (onde houver): chegou oferta de pedido. */
export function alertarOferta() {
  if (!naWeb) return;
  navigator.vibrate?.([300, 150, 300, 150, 300]);
  if (!audio) return;
  const inicio = audio.currentTime;
  for (let i = 0; i < 3; i++) {
    const oscilador = audio.createOscillator();
    const volume = audio.createGain();
    oscilador.type = 'square';
    oscilador.frequency.value = 880;
    volume.gain.setValueAtTime(0.0001, inicio + i * 0.35);
    volume.gain.exponentialRampToValueAtTime(0.25, inicio + i * 0.35 + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, inicio + i * 0.35 + 0.25);
    oscilador.connect(volume).connect(audio.destination);
    oscilador.start(inicio + i * 0.35);
    oscilador.stop(inicio + i * 0.35 + 0.3);
  }
}
