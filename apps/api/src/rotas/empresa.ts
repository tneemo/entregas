// Rotas dentro de uma empresa: /empresas/:empresaId/*.
// Todas passam por exigirEmpresa() e usam apenas o escopo da empresa.

import { Hono } from 'hono';
import {
  normalizarTelefone,
  podeConvidar,
  schemaAtualizarDadosEmpresa,
  schemaAtualizarMembro,
  schemaCriarConvite,
  schemaEndereco,
  type LocalizarResposta,
} from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { ErroApi, naoEncontrado, proibido } from '../erros.ts';
import { lerCorpo } from '../validar.ts';
import { exigirEmpresa } from '../middleware/empresa.ts';
import { escopoEmpresa } from '../dados/escopo-empresa.ts';
import { escopoPedidos } from '../dados/escopo-pedidos.ts';
import { comLocalizacao, geocodificar } from '../geocodificacao.ts';

const escopo = (c: { var: AppEnv['Variables'] }) => escopoEmpresa(c.var.db, c.var.empresa);

export const rotasEmpresa = new Hono<AppEnv>()
  .get('/', exigirEmpresa(), async (c) => c.json(await escopo(c).empresa()))

  .patch('/', exigirEmpresa('admin'), async (c) => {
    const dados = await lerCorpo(c, schemaAtualizarDadosEmpresa);
    // Endereço da loja é o ponto de coleta padrão: sem pino marcado, tenta achar pelo texto.
    if (dados.endereco) dados.endereco = await comLocalizacao(c.env, dados.endereco);
    return c.json(await escopo(c).atualizarDados(dados));
  })

  /** Busca o ponto no mapa de um endereço digitado (painel: novo pedido, dados da empresa). */
  .post('/enderecos/localizar', exigirEmpresa('admin', 'despachante'), async (c) => {
    const endereco = await lerCorpo(c, schemaEndereco);
    return c.json<LocalizarResposta>({ localizacao: await geocodificar(c.env, endereco) });
  })

  .get('/motoboys', exigirEmpresa('admin', 'despachante'), async (c) =>
    c.json(await escopoPedidos(c.var.db, c.var.empresa).motoboys()),
  )

  /** Preenche o pedido a partir do telefone de quem já recebeu antes. */
  .get('/clientes/telefone/:telefone', exigirEmpresa('admin', 'despachante'), async (c) => {
    const telefone = normalizarTelefone(c.req.param('telefone'));
    if (!telefone) throw naoEncontrado('Cliente não encontrado.');
    return c.json(await escopoPedidos(c.var.db, c.var.empresa).clientePorTelefone(telefone));
  })

  .get('/membros', exigirEmpresa('admin', 'despachante'), async (c) => c.json(await escopo(c).listarMembros()))

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
