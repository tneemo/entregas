import { and, eq, ne, or, type SQL } from 'drizzle-orm';
import { interpretarLogin, type EuResposta } from '@entregas/shared';
import type { Db } from '../db/index.ts';
import { empresas, usuarios, vinculos } from '../db/schema.ts';
import { ErroApi, naoAutenticado } from '../erros.ts';
import { usuarioResposta } from './formatos.ts';

/** Usuários que podem corresponder ao login digitado (e-mail, CPF ou telefone). */
export async function candidatosLogin(db: Db, login: string) {
  const l = interpretarLogin(login);
  const condicoes: SQL[] = [];
  if (l.email) condicoes.push(eq(usuarios.email, l.email));
  if (l.cpf) condicoes.push(eq(usuarios.cpf, l.cpf));
  if (l.telefone) condicoes.push(eq(usuarios.telefone, l.telefone));
  if (condicoes.length === 0) return [];
  return db
    .select()
    .from(usuarios)
    .where(or(...condicoes))
    .limit(2)
    .all();
}

const ROTULO_CAMPO = { email: 'e-mail', telefone: 'telefone', cpf: 'CPF' } as const;

/** Falha com 409 se e-mail, telefone ou CPF já pertencem a outra conta. */
export async function garantirDadosUnicos(
  db: Db,
  dados: { email?: string | null; telefone?: string | null; cpf?: string | null },
  exceto?: string,
) {
  const campos = (['email', 'telefone', 'cpf'] as const).filter((k) => dados[k]);
  if (campos.length === 0) return;

  const existentes = await db
    .select({ email: usuarios.email, telefone: usuarios.telefone, cpf: usuarios.cpf })
    .from(usuarios)
    .where(and(or(...campos.map((k) => eq(usuarios[k], dados[k]!))), exceto ? ne(usuarios.id, exceto) : undefined))
    .all();
  if (existentes.length === 0) return;

  const repetidos = campos.filter((k) => existentes.some((u) => u[k] === dados[k]));
  throw new ErroApi(
    409,
    'conta_existente',
    `Já existe uma conta com este ${repetidos.map((k) => ROTULO_CAMPO[k]).join(' / ')}. Entre com ela para continuar.`,
    Object.fromEntries(repetidos.map((k) => [k, [`${ROTULO_CAMPO[k]} já cadastrado.`]])),
  );
}

/** Usuário logado + empresas ativas em que tem vínculo ativo. */
export async function montarEu(db: Db, usuarioId: string): Promise<EuResposta> {
  const usuario = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId)).get();
  if (!usuario) throw naoAutenticado();

  const linhas = await db
    .select({
      vinculoId: vinculos.id,
      papel: vinculos.papel,
      empresaId: empresas.id,
      nomeFantasia: empresas.nomeFantasia,
      tipo: empresas.tipo,
    })
    .from(vinculos)
    .innerJoin(empresas, eq(empresas.id, vinculos.empresaId))
    .where(and(eq(vinculos.usuarioId, usuarioId), eq(vinculos.status, 'ativo'), eq(empresas.status, 'ativa')))
    .orderBy(empresas.nomeFantasia)
    .all();

  return {
    usuario: usuarioResposta(usuario),
    vinculos: linhas.map((l) => ({
      vinculoId: l.vinculoId,
      papel: l.papel,
      empresa: { id: l.empresaId, nomeFantasia: l.nomeFantasia, tipo: l.tipo },
    })),
  };
}

/**
 * Vínculo do usuário na empresa, com o status da empresa. Usado pela porta de entrada
 * das rotas /empresas/:empresaId (middleware/empresa.ts), antes de existir o contexto.
 */
export async function vinculoNaEmpresa(db: Db, empresaId: string, usuarioId: string) {
  return db
    .select({ vinculo: vinculos, statusEmpresa: empresas.status })
    .from(vinculos)
    .innerJoin(empresas, eq(empresas.id, vinculos.empresaId))
    .where(and(eq(vinculos.empresaId, empresaId), eq(vinculos.usuarioId, usuarioId)))
    .get();
}
