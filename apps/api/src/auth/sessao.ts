import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.ts';
import { sessoes, usuarios } from '../db/schema.ts';
import { gerarToken, sha256Hex } from './cripto.ts';

export const NOME_COOKIE = 'sessao';
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;
/** Renova a validade no máximo uma vez por dia, para não escrever no banco a cada requisição. */
const RENOVAR_A_CADA_MS = 24 * 60 * 60 * 1000;

export async function criarSessao(db: Db, usuarioId: string, userAgent: string | undefined) {
  const token = gerarToken();
  const expiraEm = new Date(Date.now() + DURACAO_MS);
  await db.insert(sessoes).values({
    id: await sha256Hex(token),
    usuarioId,
    userAgent: userAgent?.slice(0, 200) ?? null,
    expiraEm,
  });
  return { token, expiraEm };
}

export async function buscarSessao(db: Db, token: string) {
  const id = await sha256Hex(token);
  const linha = await db
    .select({ sessao: sessoes, usuario: usuarios })
    .from(sessoes)
    .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
    .where(eq(sessoes.id, id))
    .get();
  if (!linha) return null;

  const agora = Date.now();
  if (linha.sessao.expiraEm.getTime() <= agora || !linha.usuario.ativo) {
    await db.delete(sessoes).where(eq(sessoes.id, id));
    return null;
  }

  let expiraEm = linha.sessao.expiraEm;
  const renovar = expiraEm.getTime() - agora < DURACAO_MS - RENOVAR_A_CADA_MS;
  if (renovar) {
    expiraEm = new Date(agora + DURACAO_MS);
    await db.update(sessoes).set({ expiraEm }).where(eq(sessoes.id, id));
  }
  return { sessaoId: id, usuario: linha.usuario, expiraEm, renovada: renovar };
}

export async function encerrarSessao(db: Db, sessaoId: string) {
  await db.delete(sessoes).where(eq(sessoes.id, sessaoId));
}

export function definirCookieSessao(c: Context, token: string, expiraEm: Date) {
  setCookie(c, NOME_COOKIE, token, {
    httpOnly: true,
    secure: true, // navegadores aceitam cookie Secure em http://localhost
    sameSite: 'Lax',
    path: '/',
    expires: expiraEm,
  });
}

export function apagarCookieSessao(c: Context) {
  deleteCookie(c, NOME_COOKIE, { path: '/', secure: true });
}
