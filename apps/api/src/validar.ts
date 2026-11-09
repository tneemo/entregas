import type { Context } from 'hono';
import type { z } from 'zod';
import { ErroApi, camposInvalidos } from './erros.ts';

/**
 * Lê e valida o corpo JSON. Exigir `application/json` também protege contra CSRF:
 * navegadores não enviam JSON entre origens sem preflight CORS, que esta API não libera.
 *
 * Erros por campo usam o caminho completo ("entrega.endereco.numero"), para o
 * formulário marcar o campo exato.
 */
export async function lerCorpo<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  if (!c.req.header('content-type')?.includes('application/json')) {
    throw new ErroApi(415, 'tipo_conteudo', 'Envie os dados em JSON.');
  }
  let bruto: unknown;
  try {
    bruto = await c.req.json();
  } catch {
    throw new ErroApi(400, 'json_invalido', 'JSON inválido.');
  }
  const resultado = schema.safeParse(bruto);
  if (!resultado.success) {
    const campos: Record<string, string[]> = {};
    let geral: string | undefined;
    for (const problema of resultado.error.issues) {
      if (problema.path.length === 0) {
        geral ??= problema.message;
        continue;
      }
      const campo = problema.path.join('.');
      campos[campo] = [...(campos[campo] ?? []), problema.message];
    }
    throw camposInvalidos(campos, geral ?? 'Confira os dados informados.');
  }
  return resultado.data;
}
