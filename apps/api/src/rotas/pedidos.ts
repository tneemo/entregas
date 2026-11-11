// /empresas/:empresaId/pedidos — fila da central e entregas do motoboy.

import { type Context, Hono } from 'hono';
import { z } from 'zod';
import {
  type AcaoPedido,
  FOTO_MAX_BYTES,
  FOTO_TIPOS_CONTEUDO,
  TIPOS_FOTO,
  schemaAcaoPedidoComPosicao,
  schemaCriarPedido,
  schemaParamAcao,
  type PedidoDetalhe,
} from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { ErroApi, naoEncontrado } from '../erros.ts';
import { lerCorpo } from '../validar.ts';
import { exigirEmpresa } from '../middleware/empresa.ts';
import { escopoPedidos } from '../dados/escopo-pedidos.ts';
import { avisar } from '../central/avisar.ts';
import { comLocalizacao } from '../geocodificacao.ts';
import { type Aviso, avisos, notificar } from '../notificacoes.ts';

const escopo = (c: { var: AppEnv['Variables'] }) => escopoPedidos(c.var.db, c.var.empresa);

type QuemAvisar = { vinculoId: string; aviso: (usuarioId: string) => Aviso };

/** Notifica motoboys depois de responder; a ação já valeu, mesmo que o aviso não chegue. */
function avisarMotoboys(c: Context<AppEnv>, lista: QuemAvisar[]) {
  if (lista.length === 0) return;
  c.executionCtx.waitUntil(
    (async () => {
      const usuarios = await escopo(c).usuariosDosMotoboys(lista.map((q) => q.vinculoId));
      const prontos = lista.flatMap((q) => {
        const usuarioId = usuarios.get(q.vinculoId);
        return usuarioId ? [q.aviso(usuarioId)] : [];
      });
      await notificar(c.env, c.var.db, prontos);
    })().catch((erro) => console.error('notificação: falhou ao montar os avisos', erro)),
  );
}

/**
 * Quem precisa saber de uma ação da central: o motoboy que recebeu o pedido, o que perdeu,
 * e o que tinha o pedido cancelado. Ações do próprio motoboy (aceitar, recusar) não avisam ninguém.
 */
function quemAvisar(empresaId: string, acao: AcaoPedido, pedido: PedidoDetalhe, antes: string | null): QuemAvisar[] {
  const depois = pedido.motoboy?.vinculoId ?? null;
  const lista: QuemAvisar[] = [];
  if (depois && depois !== antes) {
    lista.push({ vinculoId: depois, aviso: (u) => avisos.novoPedido(u, empresaId, pedido) });
  }
  if (antes && acao === 'cancelar') {
    lista.push({ vinculoId: antes, aviso: (u) => avisos.cancelado(u, empresaId, pedido) });
  } else if (antes && depois !== antes) {
    lista.push({ vinculoId: antes, aviso: (u) => avisos.retirado(u, empresaId, pedido) });
  }
  return lista;
}

const filtroLista = z.object({
  situacao: z.enum(['ativos', 'concluidos']).default('ativos'),
  dia: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  busca: z
    .string()
    .trim()
    .max(80)
    .transform((v) => v || undefined)
    .optional(),
});

export const rotasPedidos = new Hono<AppEnv>()
  .get('/', exigirEmpresa(), async (c) => {
    const filtro = filtroLista.safeParse(c.req.query());
    if (!filtro.success) throw naoEncontrado('Filtro inválido.');
    return c.json(await escopo(c).listar(filtro.data.situacao, filtro.data.dia, filtro.data.busca));
  })

  .post('/', exigirEmpresa('admin', 'despachante'), async (c) => {
    const dados = await lerCorpo(c, schemaCriarPedido);
    // Endereço sem pino (painel não achou, ou API/integração): tenta pelo texto, sem travar o pedido.
    const [coleta, entrega] = await Promise.all([
      comLocalizacao(c.env, dados.coleta.endereco),
      comLocalizacao(c.env, dados.entrega.endereco),
    ]);
    dados.coleta.endereco = coleta;
    dados.entrega.endereco = entrega;
    const pedido = await escopo(c).criar(dados);
    const { empresaId } = c.var.empresa;
    avisar(c, empresaId, (central) => central.mudouPedido(pedido.id, pedido.status, pedido.motoboy?.vinculoId ?? null));
    if (pedido.motoboy) {
      avisarMotoboys(c, [
        { vinculoId: pedido.motoboy.vinculoId, aviso: (u) => avisos.novoPedido(u, empresaId, pedido) },
      ]);
    }
    return c.json(pedido, 201);
  })

  .get('/:pedidoId', exigirEmpresa(), async (c) => c.json(await escopo(c).detalhe(c.req.param('pedidoId'))))

  /** Toda mudança de situação passa por aqui; a máquina de estados decide quem pode o quê. */
  .post('/:pedidoId/acoes/:acao', exigirEmpresa(), async (c) => {
    const acao = schemaParamAcao.safeParse(c.req.param('acao'));
    if (!acao.success) throw naoEncontrado('Ação desconhecida.');
    const dados = await lerCorpo(c, schemaAcaoPedidoComPosicao);
    const { pedido, motoboyAntes } = await escopo(c).executar(c.req.param('pedidoId'), acao.data, dados);
    const { empresaId, papel } = c.var.empresa;
    // Avisa painel e rastreio; a resposta ao motoboy pode omitir dados, mas status e motoboy vêm sempre.
    avisar(c, empresaId, (central) => central.mudouPedido(pedido.id, pedido.status, pedido.motoboy?.vinculoId ?? null));
    if (papel !== 'motoboy') avisarMotoboys(c, quemAvisar(empresaId, acao.data, pedido, motoboyAntes));
    return c.json(pedido);
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
