// /rastreio/:token — acompanhamento público do pedido (sem login).

import { Hono } from 'hono';
import { statusFinal } from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { ErroApi } from '../erros.ts';
import { buscarRastreio } from '../dados/rastreio.ts';
import { abrirWebSocket } from '../central/avisar.ts';

export const rotasRastreio = new Hono<AppEnv>()
  .get('/:token', async (c) => {
    const { resposta } = await buscarRastreio(c.var.db, c.req.param('token'));
    // O token está na URL: nada de cache compartilhado nem indexação.
    return c.json(resposta, 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
  })

  /** Atualizações ao vivo: mudança de status e, em rota, a posição do entregador. */
  .get('/:token/ws', async (c) => {
    const { resposta, interno } = await buscarRastreio(c.var.db, c.req.param('token'));
    if (statusFinal(resposta.status)) {
      throw new ErroApi(409, 'rastreio_concluido', 'Este pedido já terminou; não há mais atualizações.');
    }
    const params = new URLSearchParams({
      pedido: interno.pedidoId,
      motoboy: interno.motoboyVinculoId ?? '',
      status: resposta.status,
    });
    return abrirWebSocket(c, interno.empresaId, `/rastreio?${params}`);
  });
