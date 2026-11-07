import type { Context } from 'hono';
import { z } from 'zod';
import { ErroApi, camposInvalidos } from './erros.ts';

/**
 * Lê e valida o corpo JSON. Exigir `application/json` também protege contra CSRF:
 * navegadores não enviam JSON entre origens sem preflight CORS, que esta API não libera.
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
    const { fieldErrors, formErrors } = z.flattenError(resultado.error);
    const campos = Object.fromEntries(
      Object.entries(fieldErrors).filter((par): par is [string, string[]] => Array.isArray(par[1])),
    );
    throw camposInvalidos(campos, formErrors[0] ?? 'Confira os dados informados.');
  }
  return resultado.data;
}
