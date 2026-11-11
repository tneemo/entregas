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

type Opcoes = { metodo?: string; corpo?: unknown; bytes?: Blob; tipoConteudo?: string; chave?: string };

/**
 * Chave de idempotência (cabeçalho Idempotency-Key): repetir a mesma operação com a mesma
 * chave devolve a primeira resposta, sem executar de novo. O sinal de celular cai muito
 * depois que a requisição saiu e antes de a resposta chegar.
 */
export function novaChave(): string {
  const parte = () => Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}-${parte()}${parte()}`;
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Operação que muda algo, com repetição segura: sem conexão, tenta de novo (até 3 vezes)
 * sempre com a mesma chave, então o servidor nunca registra a ação duas vezes.
 */
export async function apiComRepeticao<T>(caminho: string, opcoes: Opcoes & { chave: string }): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await api<T>(caminho, opcoes);
    } catch (erro) {
      const semConexao = erro instanceof ErroDaApi && erro.codigo === 'sem_conexao';
      const emAndamento = erro instanceof ErroDaApi && erro.codigo === 'requisicao_em_andamento';
      if ((!semConexao && !emAndamento) || tentativa >= 3) throw erro;
      await esperar(1_500 * tentativa);
    }
  }
}

/** Chama a API com o token salvo. Usado também pela tarefa de GPS em segundo plano. */
export async function api<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { metodo = 'GET', corpo, bytes, tipoConteudo, chave } = opcoes;
  const token = await lerToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers['content-type'] = 'application/json';
  if (bytes) headers['content-type'] = tipoConteudo ?? 'image/jpeg';
  if (chave) headers['idempotency-key'] = chave;

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
