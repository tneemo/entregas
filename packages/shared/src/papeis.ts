export const TIPOS_EMPRESA = ['loja', 'motofrete'] as const;
export type TipoEmpresa = (typeof TIPOS_EMPRESA)[number];

export const STATUS_EMPRESA = ['ativa', 'suspensa'] as const;
export type StatusEmpresa = (typeof STATUS_EMPRESA)[number];

export const PAPEIS = ['admin', 'despachante', 'motoboy'] as const;
export type Papel = (typeof PAPEIS)[number];

export const STATUS_VINCULO = ['ativo', 'suspenso'] as const;
export type StatusVinculo = (typeof STATUS_VINCULO)[number];

/** O sistema não presume vínculo empregatício: cada empresa registra o seu. */
export const TIPOS_VINCULO = ['clt', 'mei', 'freelancer'] as const;
export type TipoVinculo = (typeof TIPOS_VINCULO)[number];

export const ROTULOS = {
  tipoEmpresa: { loja: 'Loja com frota própria', motofrete: 'Empresa de motofrete' },
  papel: { admin: 'Administrador', despachante: 'Despachante', motoboy: 'Motoboy' },
  statusVinculo: { ativo: 'Ativo', suspenso: 'Suspenso' },
  statusEmpresa: { ativa: 'Ativa', suspensa: 'Suspensa' },
  tipoVinculo: { clt: 'CLT', mei: 'MEI', freelancer: 'Freelancer' },
} as const satisfies {
  tipoEmpresa: Record<TipoEmpresa, string>;
  papel: Record<Papel, string>;
  statusVinculo: Record<StatusVinculo, string>;
  statusEmpresa: Record<StatusEmpresa, string>;
  tipoVinculo: Record<TipoVinculo, string>;
};

/** Admin convida qualquer papel; despachante só convida motoboys. */
export function podeConvidar(quem: Papel, convidado: Papel): boolean {
  if (quem === 'admin') return true;
  if (quem === 'despachante') return convidado === 'motoboy';
  return false;
}
