// Tarefas agendadas (Cron Triggers). Rodam para todas as empresas, fora de uma requisição.

import { criarDb } from './db/index.ts';
import { expurgarPosicoes } from './dados/escopo-turno.ts';
import { expirarAceites } from './dados/escopo-pedidos.ts';
import { expurgarIdempotencia } from './dados/idempotencia.ts';
import { central } from './central/avisar.ts';
import { avisos, notificar } from './notificacoes.ts';

/** Os mesmos textos de "triggers.crons" no wrangler.jsonc. */
export const CRONS = { expurgoGps: '0 6 * * *', prazoAceite: '* * * * *' } as const;

/** Retenção dos pontos de GPS (LGPD). */
export async function expurgarGps(env: Env) {
  const apagados = await expurgarPosicoes(criarDb(env.DB));
  console.log(`GPS expurgado: ${apagados} pontos`);
}

/** Limpeza diária: GPS antigo (LGPD) e chaves de idempotência vencidas. */
export async function manutencaoDiaria(env: Env) {
  await expurgarGps(env);
  const chaves = await expurgarIdempotencia(criarDb(env.DB));
  console.log(`Idempotência: ${chaves} chave(s) vencida(s) apagada(s)`);
}

/** Pedidos sem aceite no prazo voltam para a fila; o painel de cada empresa fica sabendo na hora. */
export async function vencerPrazosDeAceite(env: Env) {
  const db = criarDb(env.DB);
  const voltaram = await expirarAceites(db);
  await Promise.all([
    ...voltaram.map(({ empresaId, pedidoId }) =>
      central(env, empresaId)
        .mudouPedido(pedidoId, 'pendente', null)
        .catch((erro) => console.error('tempo real: aviso falhou', erro)),
    ),
    // Quem não respondeu fica sabendo que o pedido não é mais dele.
    notificar(
      env,
      db,
      voltaram.map((v) => avisos.prazoEsgotado(v.usuarioId, v.empresaId, { id: v.pedidoId, numero: v.numero })),
    ),
  ]);
  if (voltaram.length > 0) console.log(`Prazo de aceite esgotado: ${voltaram.length} pedido(s) de volta à fila`);
  return voltaram;
}

export function executarCron(cron: string, env: Env): Promise<unknown> {
  if (cron === CRONS.expurgoGps) return manutencaoDiaria(env);
  if (cron === CRONS.prazoAceite) return vencerPrazosDeAceite(env);
  console.error(`cron sem tarefa: ${cron}`);
  return Promise.resolve();
}
