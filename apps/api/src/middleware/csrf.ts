import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../tipos.ts';
import { proibido } from '../erros.ts';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Bloqueia requisições entre sites que usariam o cookie de sessão do painel.
 * O app do motoboy usa Bearer (sem cookie) e não envia Origin, então não é afetado.
 * Navegadores modernos enviam Sec-Fetch-Site; nos antigos, comparamos o Origin.
 */
export const protegerCsrf = createMiddleware<AppEnv>(async (c, next) => {
  const usaCookie = !c.req.header('authorization') && c.req.header('cookie')?.includes('sessao=');
  if (usaCookie && !METODOS_SEGUROS.has(c.req.method)) {
    const site = c.req.header('sec-fetch-site');
    const origem = c.req.header('origin');
    const bloquear = site
      ? site !== 'same-origin' && site !== 'none'
      : Boolean(origem) && new URL(origem!).host !== new URL(c.req.url).host;
    if (bloquear) throw proibido('Requisição de outra origem bloqueada.');
  }
  await next();
});
