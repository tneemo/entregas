// /empresas/:empresaId/pedidos — fila da central e entregas do motoboy.

import { Hono } from 'hono';
import { z } from 'zod';
import { schemaAcaoPedido, schemaCriarPedido, schemaParamAcao } from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { naoEncontrado } from '../erros.ts';
import { lerCorpo } from '../validar.ts';
import { exigirEmpresa } from '../middleware/empresa.ts';
import { escopoPedidos } from '../dados/escopo-pedidos.ts';

const escopo = (c: { var: AppEnv['Variables'] }) => escopoPedidos(c.var.db, c.var.empresa);

const filtroLista = z.object({
  situacao: z.enum(['ativos', 'concluidos']).default('ativos'),
  dia: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const rotasPedidos = new Hono<AppEnv>()
  .get('/', exigirEmpresa(), async (c) => {
    const filtro = filtroLista.safeParse(c.req.query());
    if (!filtro.success) throw naoEncontrado('Filtro inválido.');
    return c.json(await escopo(c).listar(filtro.data.situacao, filtro.data.dia));
  })

  .post('/', exigirEmpresa('admin', 'despachante'), async (c) => {
    const dados = await lerCorpo(c, schemaCriarPedido);
    return c.json(await escopo(c).criar(dados), 201);
  })

  .get('/:pedidoId', exigirEmpresa(), async (c) => c.json(await escopo(c).detalhe(c.req.param('pedidoId'))))

  /** Toda mudança de situação passa por aqui; a máquina de estados decide quem pode o quê. */
  .post('/:pedidoId/acoes/:acao', exigirEmpresa(), async (c) => {
    const acao = schemaParamAcao.safeParse(c.req.param('acao'));
    if (!acao.success) throw naoEncontrado('Ação desconhecida.');
    const dados = await lerCorpo(c, schemaAcaoPedido);
    return c.json(await escopo(c).executar(c.req.param('pedidoId'), acao.data, dados));
  });
