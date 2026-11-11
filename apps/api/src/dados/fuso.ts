// Dia e hora "de parede" da operação. O piloto roda em Cascavel/PR: UTC-3, sem horário
// de verão desde 2019. Quando houver empresa em outro fuso, o deslocamento passa a vir dela.

export const FUSO_MS = -3 * 60 * 60 * 1000;
export const DIA_MS = 24 * 60 * 60 * 1000;

/** "2026-11-11" no fuso da operação. */
export function diaLocal(instante = Date.now()): string {
  return new Date(instante + FUSO_MS).toISOString().slice(0, 10);
}

/** Meia-noite local do dia informado (ou de hoje), em milissegundos UTC. */
export function inicioDoDia(dia?: string): number {
  return Date.parse(`${dia ?? diaLocal()}T00:00:00-03:00`);
}
