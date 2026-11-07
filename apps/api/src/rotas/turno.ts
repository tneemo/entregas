// /empresas/:empresaId/turno — só o motoboy abre, encerra e envia GPS.

import { Hono } from 'hono';
import { schemaPosicoes } from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { lerCorpo } from '../validar.ts';
import { exigirEmpresa } from '../middleware/empresa.ts';
import { escopoTurno } from '../dados/escopo-turno.ts';

const escopo = (c: { var: AppEnv['Variables'] }) => escopoTurno(c.var.db, c.var.empresa);

export const rotasTurno = new Hono<AppEnv>()
  .use(exigirEmpresa('motoboy'))
  .get('/', async (c) => c.json(await escopo(c).situacao()))
  .post('/', async (c) => c.json(await escopo(c).iniciar(), 201))
  .delete('/', async (c) => c.json(await escopo(c).encerrar()))
  .post('/posicoes', async (c) => {
    const { pontos } = await lerCorpo(c, schemaPosicoes);
    return c.json(await escopo(c).registrarPosicoes(pontos));
  });
