// /empresas/:empresaId/turno — só o motoboy abre, encerra e envia GPS.

import { Hono } from 'hono';
import { schemaPosicoes } from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { lerCorpo } from '../validar.ts';
import { exigirEmpresa } from '../middleware/empresa.ts';
import { escopoTurno } from '../dados/escopo-turno.ts';
import { avisar } from '../central/avisar.ts';

const escopo = (c: { var: AppEnv['Variables'] }) => escopoTurno(c.var.db, c.var.empresa);

export const rotasTurno = new Hono<AppEnv>()
  .use(exigirEmpresa('motoboy'))
  .get('/', async (c) => c.json(await escopo(c).situacao()))
  .post('/', async (c) => {
    const { empresaId, vinculoId } = c.var.empresa;
    const { resposta, turnoFechado } = await escopo(c).iniciar();
    if (turnoFechado) avisar(c, turnoFechado.empresaId, (central) => central.mudouTurno(turnoFechado.vinculoId, false));
    avisar(c, empresaId, (central) => central.mudouTurno(vinculoId, true));
    return c.json(resposta, 201);
  })
  .delete('/', async (c) => {
    const { empresaId, vinculoId } = c.var.empresa;
    const resposta = await escopo(c).encerrar();
    avisar(c, empresaId, (central) => central.mudouTurno(vinculoId, false));
    return c.json(resposta);
  })
  .post('/posicoes', async (c) => {
    const { empresaId, vinculoId } = c.var.empresa;
    const { pontos } = await lerCorpo(c, schemaPosicoes);
    const { maisRecente, ...resposta } = await escopo(c).registrarPosicoes(pontos);
    if (maisRecente) {
      avisar(c, empresaId, (central) =>
        central.registrarPosicao({
          vinculoId,
          nome: c.var.usuario!.nome,
          latitude: maisRecente.latitude,
          longitude: maisRecente.longitude,
          precisao: maisRecente.precisao ?? null,
          velocidade: maisRecente.velocidade ?? null,
          registradoEm: new Date(maisRecente.registradoEm).toISOString(),
        }),
      );
    }
    return c.json(resposta);
  });
