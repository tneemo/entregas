// /empresas/:empresaId/pedidos — fila da central e entregas do motoboy.

import { Hono } from 'hono';
import { z } from 'zod';
import {
  FOTO_MAX_BYTES,
  FOTO_TIPOS_CONTEUDO,
  TIPOS_FOTO,
  schemaAcaoPedidoComPosicao,
  schemaCriarPedido,
  schemaParamAcao,
} from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { ErroApi, naoEncontrado } from '../erros.ts';
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
    const dados = await lerCorpo(c, schemaAcaoPedidoComPosicao);
    return c.json(await escopo(c).executar(c.req.param('pedidoId'), acao.data, dados));
  })

  /** Foto de comprovante: corpo é a imagem em si (image/jpeg, image/png ou image/webp). */
  .post('/:pedidoId/fotos', exigirEmpresa(), async (c) => {
    const tipo = z.enum(TIPOS_FOTO).safeParse(c.req.query('tipo') ?? 'entrega');
    if (!tipo.success) throw naoEncontrado('Tipo de foto desconhecido.');

    const tipoConteudo = c.req.header('content-type')?.split(';')[0]?.trim() ?? '';
    if (!(FOTO_TIPOS_CONTEUDO as readonly string[]).includes(tipoConteudo)) {
      throw new ErroApi(415, 'imagem_invalida', 'Envie uma foto em JPEG, PNG ou WebP.');
    }
    const tamanhoDeclarado = Number(c.req.header('content-length') ?? 0);
    if (tamanhoDeclarado > FOTO_MAX_BYTES) throw new ErroApi(413, 'foto_grande', 'A foto passa de 5 MB.');
    const corpo = await c.req.arrayBuffer();
    if (corpo.byteLength === 0) throw new ErroApi(400, 'foto_vazia', 'A foto chegou vazia.');
    if (corpo.byteLength > FOTO_MAX_BYTES) throw new ErroApi(413, 'foto_grande', 'A foto passa de 5 MB.');

    const foto = await escopo(c).enviarFoto(c.env.FOTOS, c.req.param('pedidoId'), tipo.data, tipoConteudo, corpo);
    return c.json(foto, 201);
  })

  .get('/:pedidoId/fotos/:fotoId', exigirEmpresa(), async (c) => {
    const foto = await escopo(c).obterFoto(c.req.param('pedidoId'), c.req.param('fotoId'));
    const objeto = await c.env.FOTOS.get(foto.chave);
    if (!objeto) throw naoEncontrado('Foto não encontrada.');
    return c.body(objeto.body, 200, {
      'content-type': foto.tipoConteudo,
      'cache-control': 'private, max-age=3600',
    });
  });
