// Avisos no canto da tela: o que acabou de acontecer na operação (pedido não entregue,
// motoboy não aceitou, entrega concluída) e confirmações de ações. Os que pedem
// atenção também tocam um bipe curto, se a pessoa ligou o som.

import { useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { IconeAlerta, IconeCerto, IconeFechar, IconeFila } from './componentes/icones.tsx';

export type TipoAviso = 'sucesso' | 'atencao' | 'problema' | 'info';

export interface Aviso {
  id: number;
  tipo: TipoAviso;
  titulo: string;
  texto?: string;
  /** Para onde o aviso leva (ex.: o pedido de que ele fala). */
  link?: { para: string; rotulo: string };
}

const MAXIMO = 4;
let avisos: readonly Aviso[] = [];
let proximoId = 1;
const ouvintes = new Set<() => void>();

function publicar(lista: readonly Aviso[]) {
  avisos = lista;
  for (const ouvinte of ouvintes) ouvinte();
}

export function dispensar(id: number) {
  publicar(avisos.filter((a) => a.id !== id));
}

/** Problemas ficam mais tempo na tela; todos somem sozinhos. */
export function avisar(aviso: Omit<Aviso, 'id'>) {
  const id = proximoId++;
  publicar([...avisos, { ...aviso, id }].slice(-MAXIMO));
  setTimeout(() => dispensar(id), aviso.tipo === 'problema' || aviso.tipo === 'atencao' ? 15_000 : 6_000);
  if (aviso.tipo === 'problema' || aviso.tipo === 'atencao') tocarAlerta();
}

// Som -------------------------------------------------------------------------

const CHAVE_SOM = 'entregas:som';
let contexto: AudioContext | null = null;

export function somLigado(): boolean {
  try {
    return localStorage.getItem(CHAVE_SOM) === 'ligado';
  } catch {
    return false;
  }
}

/** Ligar acontece num clique, que é quando o navegador deixa o áudio começar. */
export function definirSom(ligado: boolean) {
  try {
    localStorage.setItem(CHAVE_SOM, ligado ? 'ligado' : 'desligado');
  } catch {
    // modo privado: vale só nesta visita
  }
  if (ligado) tocarAlerta(true);
  for (const ouvinte of ouvintes) ouvinte();
}

function tocarAlerta(forcar = false) {
  if (!forcar && !somLigado()) return;
  try {
    contexto ??= new AudioContext();
    const agora = contexto.currentTime;
    // Dois toques curtos, como bipe de rádio.
    for (const [inicio, frequencia] of [
      [0, 880],
      [0.16, 1175],
    ] as const) {
      const oscilador = contexto.createOscillator();
      const volume = contexto.createGain();
      oscilador.frequency.value = frequencia;
      volume.gain.setValueAtTime(0.0001, agora + inicio);
      volume.gain.exponentialRampToValueAtTime(0.18, agora + inicio + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, agora + inicio + 0.14);
      oscilador.connect(volume).connect(contexto.destination);
      oscilador.start(agora + inicio);
      oscilador.stop(agora + inicio + 0.15);
    }
  } catch {
    // navegador sem áudio liberado: o aviso visual já apareceu
  }
}

const inscrever = (ouvinte: () => void) => {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
};

export function useSomLigado(): boolean {
  return useSyncExternalStore(inscrever, somLigado);
}

// Tela ------------------------------------------------------------------------

const APARENCIA: Record<TipoAviso, { borda: string; cor: string; Icone: typeof IconeCerto }> = {
  sucesso: { borda: 'border-l-ok', cor: 'text-ok', Icone: IconeCerto },
  atencao: { borda: 'border-l-sinal', cor: 'text-sinal', Icone: IconeAlerta },
  problema: { borda: 'border-l-aluguel', cor: 'text-aluguel', Icone: IconeAlerta },
  info: { borda: 'border-l-mercosul', cor: 'text-mercosul', Icone: IconeFila },
};

export function Avisos() {
  const lista = useSyncExternalStore(inscrever, () => avisos);
  return (
    <section
      aria-label="Avisos"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-40 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5"
    >
      {lista.map((a) => {
        const { borda, cor, Icone } = APARENCIA[a.tipo];
        return (
          <div
            key={a.id}
            role={a.tipo === 'problema' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-sm animate-entrar items-start gap-3 rounded-md border border-linha border-l-4 bg-superficie p-3 shadow-flutuante ${borda}`}
          >
            <Icone className={`mt-0.5 shrink-0 ${cor}`} />
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{a.titulo}</p>
              {a.texto && <p className="text-sm text-concreto">{a.texto}</p>}
              {a.link && (
                <Link
                  to={a.link.para}
                  onClick={() => dispensar(a.id)}
                  className="mt-1 inline-block text-sm font-medium text-mercosul underline underline-offset-2"
                >
                  {a.link.rotulo}
                </Link>
              )}
            </div>
            <button
              type="button"
              aria-label="Dispensar aviso"
              onClick={() => dispensar(a.id)}
              className="-m-1 rounded p-1 text-concreto hover:bg-relevo hover:text-asfalto"
            >
              <IconeFechar tamanho={16} />
            </button>
          </div>
        );
      })}
    </section>
  );
}
