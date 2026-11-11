import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../tipos.ts';
import { ErroApi } from '../erros.ts';
import { guardarResposta, liberarChave, reservarChave } from '../dados/idempotencia.ts';

const FORMATO_CHAVE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Cabeçalho Idempotency-Key em qualquer POST autenticado: a primeira requisição executa e a
 * resposta de sucesso fica guardada; repetir a mesma chave devolve a mesma resposta, sem criar
 * outro pedido nem registrar a entrega duas vezes. Quem chama gera uma chave por intenção
 * ("criar este pedido", "entregar o pedido 152") e a reutiliza a cada nova tentativa.
 *
 * Erros não ficam guardados: a tentativa seguinte executa de verdade.
 */
export const idempotencia = createMiddleware<AppEnv>(async (c, next) => {
  const chave = c.req.header('idempotency-key');
  const usuario = c.var.usuario;
  if (!chave || !usuario || c.req.method !== 'POST') return next();
  if (!FORMATO_CHAVE.test(chave)) {
    throw new ErroApi(
      400,
      'chave_idempotencia_invalida',
      'Idempotency-Key deve ter de 8 a 128 letras, números, hífen ou sublinhado.',
    );
  }

  const { db } = c.var;
  const reserva = await reservarChave(db, usuario.id, chave, `POST ${c.req.path}`);
  if (reserva.tipo === 'repetida') {
    return c.body(reserva.corpo, reserva.status as 200, {
      'content-type': 'application/json',
      'idempotent-replayed': 'true',
    });
  }
  if (reserva.tipo === 'outra_rota') {
    throw new ErroApi(422, 'chave_idempotencia_reutilizada', 'Esta Idempotency-Key já foi usada em outra operação.');
  }
  if (reserva.tipo === 'em_andamento') {
    throw new ErroApi(409, 'requisicao_em_andamento', 'A mesma operação ainda está em andamento. Tente de novo.');
  }

  try {
    await next();
  } catch (erro) {
    await liberarChave(db, usuario.id, chave);
    throw erro;
  }
  // Erros tratados pelo onError chegam aqui como resposta pronta.
  const resposta = c.res;
  const json = resposta.headers.get('content-type')?.includes('application/json');
  if (resposta.ok && json) {
    await guardarResposta(db, usuario.id, chave, resposta.status, await resposta.clone().text());
  } else {
    await liberarChave(db, usuario.id, chave);
  }
});
