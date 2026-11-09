import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErroResposta } from '@entregas/shared';
import { violouUnicidade } from './db/index.ts';
import { registrarErro } from './monitoramento.ts';

export class ErroApi extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly codigo: string,
    mensagem: string,
    readonly campos?: Record<string, string[]>,
  ) {
    super(mensagem);
  }
}

export const naoAutenticado = () => new ErroApi(401, 'nao_autenticado', 'Entre com sua conta para continuar.');

export const proibido = (mensagem = 'Você não tem permissão para esta ação.') => new ErroApi(403, 'proibido', mensagem);

export const naoEncontrado = (mensagem = 'Não encontrado.') => new ErroApi(404, 'nao_encontrado', mensagem);

export const camposInvalidos = (campos: Record<string, string[]>, mensagem = 'Confira os dados informados.') =>
  new ErroApi(422, 'validacao', mensagem, campos);

export function tratarErro(erro: Error, c: Context) {
  if (erro instanceof ErroApi) {
    const corpo: ErroResposta = {
      erro: { codigo: erro.codigo, mensagem: erro.message, ...(erro.campos && { campos: erro.campos }) },
    };
    return c.json(corpo, erro.status);
  }
  if (erro instanceof HTTPException) {
    return c.json<ErroResposta>(
      { erro: { codigo: 'http', mensagem: erro.message || 'Requisição recusada.' } },
      erro.status as ContentfulStatusCode,
    );
  }
  if (violouUnicidade(erro)) {
    return c.json<ErroResposta>(
      { erro: { codigo: 'conflito', mensagem: 'Já existe um registro com estes dados.' } },
      409,
    );
  }
  console.error('erro não tratado', erro);
  registrarErro(erro);
  return c.json<ErroResposta>({ erro: { codigo: 'erro_interno', mensagem: 'Erro inesperado. Tente novamente.' } }, 500);
}
