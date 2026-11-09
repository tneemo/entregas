import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../tipos.ts';
import { NOME_COOKIE, apagarCookieSessao, buscarSessao, definirCookieSessao } from '../auth/sessao.ts';
import { naoAutenticado, proibido } from '../erros.ts';

/** Painel usa cookie HttpOnly; o app do motoboy usa `Authorization: Bearer`. */
export const carregarSessao = createMiddleware<AppEnv>(async (c, next) => {
  c.set('usuario', null);
  c.set('sessaoId', null);

  const portador = c.req.header('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const token = portador ?? getCookie(c, NOME_COOKIE);
  if (token) {
    const sessao = await buscarSessao(c.var.db, token);
    if (sessao) {
      c.set('usuario', sessao.usuario);
      c.set('sessaoId', sessao.sessaoId);
      if (!portador && sessao.renovada) definirCookieSessao(c, token, sessao.expiraEm);
    } else if (!portador) {
      apagarCookieSessao(c);
    }
  }
  await next();
});

export const exigirLogin = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.usuario) throw naoAutenticado();
  await next();
});

export const exigirSuperAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.usuario) throw naoAutenticado();
  if (!c.var.usuario.superAdmin) throw proibido();
  await next();
});
