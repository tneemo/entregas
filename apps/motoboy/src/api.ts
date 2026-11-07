import type { ErroResposta } from '@entregas/shared';
import { lerToken } from './armazenamento.ts';

export const URL_API = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly campos: Record<string, string[]> = {},
  ) {
    super(mensagem);
  }
}

type Opcoes = { metodo?: string; corpo?: unknown; bytes?: Blob; tipoConteudo?: string };

/** Chama a API com o token salvo. Usado também pela tarefa de GPS em segundo plano. */
export async function api<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { metodo = 'GET', corpo, bytes, tipoConteudo } = opcoes;
  const token = await lerToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers['content-type'] = 'application/json';
  if (bytes) headers['content-type'] = tipoConteudo ?? 'image/jpeg';

  let resposta: Response;
  try {
    resposta = await fetch(`${URL_API}/api/v1${caminho}`, {
      method: metodo,
      headers,
      body: bytes ?? (corpo === undefined ? undefined : JSON.stringify(corpo)),
    });
  } catch {
    throw new ErroDaApi(0, 'sem_conexao', 'Sem conexão. Confira a internet e tente de novo.');
  }

  if (resposta.status === 204) return undefined as T;
  const dados = (await resposta.json().catch(() => null)) as (T & Partial<ErroResposta>) | null;
  if (!resposta.ok) {
    throw new ErroDaApi(
      resposta.status,
      dados?.erro?.codigo ?? 'erro',
      dados?.erro?.mensagem ?? 'Erro inesperado. Tente novamente.',
      dados?.erro?.campos,
    );
  }
  return dados as T;
}
