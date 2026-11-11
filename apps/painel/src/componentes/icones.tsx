// Ícones de traço do painel. Decorativos por padrão (o texto ao lado diz o que é);
// quando o ícone é o único conteúdo de um botão, o botão leva aria-label.

import type { ReactNode, SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement> & { tamanho?: number };

function Icone({ tamanho = 18, children, ...props }: Props & { children: ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

function Traco({ d, ...props }: Props & { d: string }) {
  return (
    <Icone {...props}>
      <path d={d} />
    </Icone>
  );
}

export const IconeFila = (p: Props) => <Traco {...p} d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />;
export const IconeGrafico = (p: Props) => <Traco {...p} d="M4 20V11M10 20V4M16 20v-7M22 20H2" />;
export const IconeLoja = (p: Props) => <Traco {...p} d="M3 21h18M5 21V9l7-5 7 5v12M9.5 21v-6h5v6" />;
export const IconeSair = (p: Props) => (
  <Traco {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
);
export const IconeMais = (p: Props) => <Traco {...p} d="M12 5v14M5 12h14" />;
export const IconeCerto = (p: Props) => <Traco {...p} d="M20 6 9 17l-5-5" />;
export const IconeFechar = (p: Props) => <Traco {...p} d="M18 6 6 18M6 6l12 12" />;
export const IconeAlerta = (p: Props) => <Traco {...p} d="M12 3.5 22 20.5H2L12 3.5zM12 10v4.5M12 17.5h.01" />;
export const IconeRaio = (p: Props) => <Traco {...p} d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />;
export const IconeLua = (p: Props) => <Traco {...p} d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />;
export const IconeAnterior = (p: Props) => <Traco {...p} d="m15 18-6-6 6-6" />;
export const IconeProximo = (p: Props) => <Traco {...p} d="m9 18 6-6-6-6" />;
export const IconeSino = (p: Props) => (
  <Traco {...p} d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 20.5a1.9 1.9 0 0 0 3.4 0" />
);
export const IconeSinoMudo = (p: Props) => (
  <Traco
    {...p}
    d="M8.7 3.9A6 6 0 0 1 18 8c0 3 .6 4.9 1.3 6.1M6.3 6.3A6 6 0 0 0 6 8c0 7-3 8-3 8h13M10.3 20.5a1.9 1.9 0 0 0 3.4 0M3 3l18 18"
  />
);

export function IconeMapa(props: Props) {
  return (
    <Icone {...props}>
      <path d="M12 21.5s-7-6.3-7-11.5a7 7 0 0 1 14 0c0 5.2-7 11.5-7 11.5z" />
      <circle cx="12" cy="10" r="2.5" />
    </Icone>
  );
}

export function IconeEquipe(props: Props) {
  return (
    <Icone {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.7a3.5 3.5 0 0 1 0 6.6M18.2 14.4a6.5 6.5 0 0 1 3.3 5.6" />
    </Icone>
  );
}

export function IconeBusca(props: Props) {
  return (
    <Icone {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Icone>
  );
}

export function IconeSol(props: Props) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icone>
  );
}

export function IconeRelogio(props: Props) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icone>
  );
}

/** Estrela cheia ou vazia (avaliações). */
export function IconeEstrela({ cheia = true, ...props }: Props & { cheia?: boolean }) {
  return (
    <Icone {...props} fill={cheia ? 'currentColor' : 'none'} strokeWidth={cheia ? 0 : 1.6}>
      <path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" />
    </Icone>
  );
}
