// Rotas dentro de uma empresa: /empresas/:empresaId/*.
// Todas passam por exigirEmpresa() e usam apenas o escopo da empresa.

import { Hono } from 'hono';
import {
  podeConvidar,
  schemaAtualizarMembro,
  schemaCriarConvite,
} from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { ErroApi, proibido } from '../erros.ts';
import { lerCorpo } from '../validar.ts';
import { exigirEmpresa } from '../middleware/empresa.ts';
import { escopoEmpresa } from '../dados/escopo-empresa.ts';

const escopo = (c: { var: AppEnv['Variables'] }) => escopoEmpresa(c.var.db, c.var.empresa);

export const rotasEmpresa = new Hono<AppEnv>()
  .get('/', exigirEmpresa(), async (c) => c.json(await escopo(c).empresa()))

  .get('/membros', exigirEmpresa('admin', 'despachante'), async (c) =>
    c.json(await escopo(c).listarMembros()),
  )

  .patch('/membros/:vinculoId', exigirEmpresa('admin'), async (c) => {
    const dados = await lerCorpo(c, schemaAtualizarMembro);
    const vinculoId = c.req.param('vinculoId');
    if (vinculoId === c.var.empresa.vinculoId) {
      // Evita que a empresa fique sem administrador por engano.
      throw new ErroApi(422, 'proprio_acesso', 'Você não pode alterar o seu próprio acesso.');
    }
    return c.json(await escopo(c).atualizarMembro(vinculoId, dados));
  })

  .get('/convites', exigirEmpresa('admin', 'despachante'), async (c) =>
    c.json(await escopo(c).listarConvitesPendentes()),
  )

  .post('/convites', exigirEmpresa('admin', 'despachante'), async (c) => {
    const { papel, nomeConvidado } = await lerCorpo(c, schemaCriarConvite);
    if (!podeConvidar(c.var.empresa.papel, papel)) throw proibido('Despachantes só podem convidar motoboys.');
    return c.json(await escopo(c).criarConvite(papel, nomeConvidado), 201);
  })

  .delete('/convites/:conviteId', exigirEmpresa('admin', 'despachante'), async (c) => {
    const e = escopo(c);
    const convite = await e.obterConvitePendente(c.req.param('conviteId'));
    if (!podeConvidar(c.var.empresa.papel, convite.papel)) throw proibido();
    await e.revogarConvite(convite.id);
    return c.body(null, 204);
  });
