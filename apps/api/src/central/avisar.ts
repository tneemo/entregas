// Ponte entre as rotas e o Durable Object CentralEmpresa.

import type { Context } from 'hono';
import type { AppEnv } from '../tipos.ts';
import { ErroApi } from '../erros.ts';

export function central(env: Env, empresaId: string) {
  return env.CENTRAL.get(env.CENTRAL.idFromName(empresaId));
}

type Central = ReturnType<typeof central>;

/**
 * Avisa a central em segundo plano, depois de responder. Falha no tempo real não
 * desfaz nem atrasa a operação: o painel se corrige ao reconectar ou na próxima consulta.
 */
export function avisar(c: Context<AppEnv>, empresaId: string, aviso: (central: Central) => Promise<unknown>) {
  c.executionCtx.waitUntil(
    aviso(central(c.env, empresaId)).catch((erro) => console.error('tempo real: aviso falhou', erro)),
  );
}

/** Exige pedido de WebSocket e repassa para a central, que devolve a conexão (101). */
export async function abrirWebSocket(c: Context<AppEnv>, empresaId: string, caminho: string) {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    throw new ErroApi(426, 'esperado_websocket', 'Esta rota só aceita WebSocket.');
  }
  const resposta = await central(c.env, empresaId).fetch(
    new Request(`https://central${caminho}`, { headers: { upgrade: 'websocket' } }),
  );
  if (!resposta.webSocket) return resposta;
  // Resposta nova (cabeçalhos editáveis) para o Hono poder finalizar sem erro.
  return new Response(null, { status: 101, webSocket: resposta.webSocket });
}
