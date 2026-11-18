// Lojas atendidas por uma empresa. Mesma regra de escopo-empresa.ts: tudo filtra por ctx.empresaId.

import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { LojaResposta, schemaAtualizarLoja, schemaCriarLoja } from '@entregas/shared';
import type { Db } from '../db/index.ts';
import { lojas, usuarios, vinculos } from '../db/schema.ts';
import type { ContextoEmpresa } from '../tipos.ts';
import { camposInvalidos, naoEncontrado } from '../erros.ts';

type Loja = typeof lojas.$inferSelect;

export function escopoLojas(db: Db, ctx: Pick<ContextoEmpresa, 'empresaId'>) {
  const { empresaId } = ctx;

  async function fixosPorLoja(lojaId?: string) {
    const linhas = await db
      .select({ lojaId: vinculos.lojaId, vinculoId: vinculos.id, nome: usuarios.nome })
      .from(vinculos)
      .innerJoin(usuarios, eq(usuarios.id, vinculos.usuarioId))
      .where(
        and(
          eq(vinculos.empresaId, empresaId),
          eq(vinculos.papel, 'motoboy'),
          eq(vinculos.status, 'ativo'),
          lojaId ? eq(vinculos.lojaId, lojaId) : undefined,
        ),
      )
      .orderBy(asc(usuarios.nome))
      .all();
    const mapa = new Map<string, { vinculoId: string; nome: string }[]>();
    for (const l of linhas) {
      if (!l.lojaId) continue;
      mapa.set(l.lojaId, [...(mapa.get(l.lojaId) ?? []), { vinculoId: l.vinculoId, nome: l.nome }]);
    }
    return mapa;
  }

  const paraResposta = (l: Loja, fixos: Map<string, { vinculoId: string; nome: string }[]>): LojaResposta => ({
    id: l.id,
    nome: l.nome,
    telefone: l.telefone,
    endereco: l.endereco,
    transbordo: l.transbordo,
    ativa: l.ativa,
    fixos: fixos.get(l.id) ?? [],
  });

  async function obter(lojaId: string): Promise<LojaResposta> {
    const loja = await db
      .select()
      .from(lojas)
      .where(and(eq(lojas.id, lojaId), eq(lojas.empresaId, empresaId)))
      .get();
    if (!loja) throw naoEncontrado('Loja não encontrada.');
    return paraResposta(loja, await fixosPorLoja(loja.id));
  }

  return {
    async listar(): Promise<LojaResposta[]> {
      const [linhas, fixos] = await Promise.all([
        db.select().from(lojas).where(eq(lojas.empresaId, empresaId)).orderBy(asc(lojas.nome)).all(),
        fixosPorLoja(),
      ]);
      return linhas.map((l) => paraResposta(l, fixos));
    },

    obter,

    async criar(dados: z.output<typeof schemaCriarLoja>): Promise<LojaResposta> {
      const loja = await db
        .insert(lojas)
        .values({
          empresaId,
          nome: dados.nome,
          telefone: dados.telefone ?? null,
          endereco: dados.endereco,
          transbordo: dados.transbordo,
        })
        .returning()
        .get();
      return paraResposta(loja, new Map());
    },

    async atualizar(lojaId: string, dados: z.output<typeof schemaAtualizarLoja>): Promise<LojaResposta> {
      const atualizada = await db
        .update(lojas)
        .set(dados)
        .where(and(eq(lojas.id, lojaId), eq(lojas.empresaId, empresaId)))
        .returning({ id: lojas.id })
        .get();
      if (!atualizada) throw naoEncontrado('Loja não encontrada.');
      return obter(lojaId);
    },

    /** Confere que a loja é desta empresa e está ativa (para pedido e motoboy fixo). */
    async exigirAtiva(lojaId: string, campo: string) {
      const loja = await db
        .select({ id: lojas.id, nome: lojas.nome })
        .from(lojas)
        .where(and(eq(lojas.id, lojaId), eq(lojas.empresaId, empresaId), eq(lojas.ativa, true)))
        .get();
      if (!loja) throw camposInvalidos({ [campo]: ['Escolha uma loja ativa da empresa.'] });
      return loja;
    },
  };
}
