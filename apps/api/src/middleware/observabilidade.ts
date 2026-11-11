import { createMiddleware } from 'hono/factory';
import { routePath } from 'hono/route';
import type { AppEnv } from '../tipos.ts';

/**
 * Toda resposta da API sai com:
 * - x-request-id: o mesmo número aparece no log, para achar a requisição de um chamado de suporte;
 * - server-timing: quanto o Worker levou, visível na aba de rede do navegador;
 * - cabeçalhos de segurança básicos (a API só devolve JSON e imagens).
 *
 * Fora do desenvolvimento, grava uma linha de log estruturada por requisição. O log leva o
 * padrão da rota ("/rastreio/:token"), nunca o caminho real: tokens de rastreio e de convite
 * ficam na URL e não podem ir para os logs (LGPD).
 */
export const observabilidade = createMiddleware<AppEnv>(async (c, next) => {
  const inicio = Date.now();
  const id = c.req.header('cf-ray') ?? crypto.randomUUID();
  await next();

  // Resposta 101 (WebSocket) não pode ter os cabeçalhos alterados.
  if (c.req.header('upgrade')) return;
  const ms = Date.now() - inicio;
  c.header('x-request-id', id);
  c.header('server-timing', `app;dur=${ms}`);
  c.header('x-content-type-options', 'nosniff');
  c.header('referrer-policy', 'same-origin');

  if (c.env.AMBIENTE !== 'desenvolvimento') {
    console.log(
      JSON.stringify({
        tipo: 'requisicao',
        id,
        metodo: c.req.method,
        rota: routePath(c, -1),
        status: c.res.status,
        ms,
        papel: c.var.empresa?.papel,
      }),
    );
  }
});
