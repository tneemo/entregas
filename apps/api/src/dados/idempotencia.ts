// Chaves de idempotência: guarda a resposta da primeira requisição com uma chave e a
// devolve nas repetições, sem executar de novo. Tabela global, por usuário.

import { and, eq, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db/index.ts';
import { idempotencia } from '../db/schema.ts';

/** Por quanto tempo a resposta fica guardada. */
export const IDEMPOTENCIA_HORAS = 24;

/** Requisição que não terminou neste tempo morreu no caminho: a próxima assume a chave. */
const ABANDONADA_MS = 60_000;

export type Reserva =
  | { tipo: 'nova' }
  | { tipo: 'repetida'; status: number; corpo: string }
  | { tipo: 'em_andamento' }
  | { tipo: 'outra_rota' };

/** Marca a chave como em uso por esta requisição, ou diz o que já aconteceu com ela. */
export async function reservarChave(db: Db, usuarioId: string, chave: string, rota: string): Promise<Reserva> {
  const agora = new Date();
  const criada = await db
    .insert(idempotencia)
    .values({ usuarioId, chave, rota, criadoEm: agora })
    .onConflictDoNothing()
    .returning({ chave: idempotencia.chave })
    .get();
  if (criada) return { tipo: 'nova' };

  const daChave = and(eq(idempotencia.usuarioId, usuarioId), eq(idempotencia.chave, chave));
  const existente = await db.select().from(idempotencia).where(daChave).get();
  // Apagada entre o insert e a leitura (a primeira falhou e liberou): quem chamou tenta de novo.
  if (!existente) return { tipo: 'em_andamento' };
  if (existente.rota !== rota) return { tipo: 'outra_rota' };
  if (existente.status !== null) return { tipo: 'repetida', status: existente.status, corpo: existente.corpo ?? '' };

  if (agora.getTime() - existente.criadoEm.getTime() < ABANDONADA_MS) return { tipo: 'em_andamento' };
  const assumida = await db
    .update(idempotencia)
    .set({ criadoEm: agora })
    .where(and(daChave, isNull(idempotencia.status), eq(idempotencia.criadoEm, existente.criadoEm)))
    .returning({ chave: idempotencia.chave })
    .get();
  return assumida ? { tipo: 'nova' } : { tipo: 'em_andamento' };
}

export async function guardarResposta(db: Db, usuarioId: string, chave: string, status: number, corpo: string) {
  await db
    .update(idempotencia)
    .set({ status, corpo })
    .where(and(eq(idempotencia.usuarioId, usuarioId), eq(idempotencia.chave, chave)));
}

/** A requisição não valeu (erro): solta a chave para a próxima tentativa executar de verdade. */
export async function liberarChave(db: Db, usuarioId: string, chave: string) {
  await db
    .delete(idempotencia)
    .where(and(eq(idempotencia.usuarioId, usuarioId), eq(idempotencia.chave, chave), isNull(idempotencia.status)));
}

/** Tarefa diária: apaga as chaves vencidas. */
export async function expurgarIdempotencia(db: Db, agora = Date.now()): Promise<number> {
  const limite = new Date(agora - IDEMPOTENCIA_HORAS * 60 * 60 * 1000);
  const resultado = await db.delete(idempotencia).where(lt(idempotencia.criadoEm, limite));
  return resultado.meta.changes;
}
