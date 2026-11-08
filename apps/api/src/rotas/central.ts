// /empresas/:empresaId/central — tempo real do painel (admin e despachante).

import { Hono } from 'hono';
import type { AppEnv } from '../tipos.ts';
import { exigirEmpresa } from '../middleware/empresa.ts';
import { abrirWebSocket, central } from '../central/avisar.ts';

export const rotasCentral = new Hono<AppEnv>()
  .use(exigirEmpresa('admin', 'despachante'))

  /** Mapa ao vivo e fila de pedidos: posições, turnos e mudanças de pedido. */
  .get('/ws', (c) => abrirWebSocket(c, c.var.empresa.empresaId, '/painel'))

  /** Mesmas posições do WebSocket, para quem só precisa de uma leitura. */
  .get('/posicoes', async (c) => c.json(await central(c.env, c.var.empresa.empresaId).posicoes()));
