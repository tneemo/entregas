// Celulares que recebem notificação. Tabela global (o aparelho é da pessoa, não da empresa),
// presa à sessão: sair do app ou a sessão vencer apaga o registro pelo ON DELETE CASCADE.

import { and, eq, gt, inArray, ne } from 'drizzle-orm';
import type { DadosDispositivo } from '@entregas/shared';
import type { Db } from '../db/index.ts';
import { dispositivos, sessoes } from '../db/schema.ts';

/**
 * Liga o aparelho à sessão atual. Uma sessão do app é um aparelho: token novo da mesma sessão
 * (o Firebase troca de tempos em tempos) substitui o anterior, em vez de acumular. O mesmo token
 * com outra pessoa logada passa a ser dela.
 */
export async function registrarDispositivo(db: Db, dados: DadosDispositivo & { sessaoId: string; usuarioId: string }) {
  await db.batch([
    db.delete(dispositivos).where(and(eq(dispositivos.sessaoId, dados.sessaoId), ne(dispositivos.token, dados.token))),
    db
      .insert(dispositivos)
      .values(dados)
      .onConflictDoUpdate({
        target: dispositivos.token,
        set: {
          sessaoId: dados.sessaoId,
          usuarioId: dados.usuarioId,
          plataforma: dados.plataforma,
          atualizadoEm: new Date(),
        },
      }),
  ]);
}

/** Aparelhos com sessão ainda válida de cada pessoa. */
export async function tokensDosUsuarios(db: Db, usuarioIds: string[]) {
  if (usuarioIds.length === 0) return [];
  return db
    .select({ token: dispositivos.token, usuarioId: dispositivos.usuarioId })
    .from(dispositivos)
    .innerJoin(sessoes, eq(sessoes.id, dispositivos.sessaoId))
    .where(and(inArray(dispositivos.usuarioId, usuarioIds), gt(sessoes.expiraEm, new Date())))
    .all();
}

/** O Expo avisou que o app foi desinstalado ou a permissão retirada: não adianta mais mandar. */
export async function esquecerDispositivos(db: Db, tokens: string[]) {
  if (tokens.length === 0) return;
  await db.delete(dispositivos).where(inArray(dispositivos.token, tokens));
}
