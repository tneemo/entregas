import type { ErroResposta } from '@entregas/shared';

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

/** Chave para repetir uma operação sem executá-la duas vezes (cabeçalho Idempotency-Key). */
export const novaChave = () => crypto.randomUUID();

export async function api<T>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; chave?: string } = {},
): Promise<T> {
  const { metodo = 'GET', corpo, chave } = opcoes;
  let resposta: Response;
  try {
    resposta = await fetch(`/api/v1${caminho}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: {
        ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
        ...(chave ? { 'idempotency-key': chave } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroDaApi(0, 'sem_conexao', 'Sem conexão com o servidor. Confira a internet e tente de novo.');
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
