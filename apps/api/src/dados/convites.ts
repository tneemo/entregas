import { and, eq, isNull } from 'drizzle-orm';
import type { ConviteCriadoResposta, Papel } from '@entregas/shared';
import type { Db } from '../db/index.ts';
import { violouUnicidade } from '../db/index.ts';
import { cidades, convites, empresas, vinculos } from '../db/schema.ts';
import { gerarToken, sha256Hex } from '../auth/cripto.ts';
import { ErroApi, naoEncontrado } from '../erros.ts';

const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

/** O que o aceite exige de cada papel: painel entra por e-mail; motoboy por telefone/CPF. */
export function exigenciasDoPapel(papel: Papel) {
  return papel === 'motoboy'
    ? { email: false, telefone: true, cpf: true }
    : { email: true, telefone: false, cpf: false };
}

/**
 * Cria um convite de uso único. Só o hash do token é gravado, então o link
 * aparece apenas nesta resposta. Usado pelo escopo da empresa e pelo super admin.
 */
export async function criarConvite(
  db: Db,
  dados: { empresaId: string; papel: Papel; criadoPor: string; nomeConvidado?: string | null },
): Promise<ConviteCriadoResposta> {
  const token = gerarToken();
  const expiraEm = new Date(Date.now() + VALIDADE_MS);
  const convite = await db
    .insert(convites)
    .values({
      empresaId: dados.empresaId,
      tokenHash: await sha256Hex(token),
      papel: dados.papel,
      nomeConvidado: dados.nomeConvidado || null,
      criadoPor: dados.criadoPor,
      expiraEm,
    })
    .returning({ id: convites.id })
    .get();
  return { id: convite.id, papel: dados.papel, caminho: `/convite/${token}`, expiraEm: expiraEm.toISOString() };
}

/** Busca um convite pelo token do link e falha se não puder mais ser usado. */
export async function conviteValido(db: Db, token: string) {
  const linha = await db
    .select({ convite: convites, empresa: empresas, cidade: cidades.nome })
    .from(convites)
    .innerJoin(empresas, eq(empresas.id, convites.empresaId))
    .innerJoin(cidades, eq(cidades.id, empresas.cidadeId))
    .where(eq(convites.tokenHash, await sha256Hex(token)))
    .get();

  if (!linha) throw naoEncontrado('Convite não encontrado.');
  const { convite, empresa } = linha;
  if (convite.revogadoEm) throw new ErroApi(410, 'convite_revogado', 'Este convite foi cancelado.');
  if (convite.aceitoEm) throw new ErroApi(410, 'convite_usado', 'Este convite já foi usado.');
  if (convite.expiraEm.getTime() <= Date.now()) {
    throw new ErroApi(410, 'convite_expirado', 'Este convite expirou. Peça um novo.');
  }
  if (empresa.status !== 'ativa') throw new ErroApi(410, 'empresa_inativa', 'Esta empresa está suspensa.');
  return linha;
}

/**
 * Marca o convite como usado (de forma condicional, para que dois aceites
 * simultâneos não passem) e cria o vínculo. Desfaz a marcação se o vínculo falhar.
 */
export async function reservarConvite(db: Db, conviteId: string) {
  const resultado = await db
    .update(convites)
    .set({ aceitoEm: new Date() })
    .where(and(eq(convites.id, conviteId), isNull(convites.aceitoEm), isNull(convites.revogadoEm)))
    .run();
  if (resultado.meta.changes !== 1) {
    throw new ErroApi(410, 'convite_usado', 'Este convite já foi usado.');
  }
}

export async function liberarConvite(db: Db, conviteId: string) {
  await db.update(convites).set({ aceitoEm: null, aceitoPor: null }).where(eq(convites.id, conviteId));
}

export async function concluirConvite(
  db: Db,
  convite: { id: string; empresaId: string; papel: Papel },
  usuarioId: string,
) {
  try {
    await db.batch([
      db.insert(vinculos).values({ empresaId: convite.empresaId, usuarioId, papel: convite.papel }),
      db.update(convites).set({ aceitoPor: usuarioId }).where(eq(convites.id, convite.id)),
    ]);
  } catch (erro) {
    await liberarConvite(db, convite.id);
    if (violouUnicidade(erro)) {
      throw new ErroApi(409, 'ja_membro', 'Você já faz parte desta empresa.');
    }
    throw erro;
  }
}
