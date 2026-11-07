import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema.ts';

export type Db = DrizzleD1Database<typeof schema> & { $client: D1Database };

export function criarDb(d1: D1Database): Db {
  return drizzle(d1, { schema });
}

export function violouUnicidade(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? `${erro.message} ${String(erro.cause ?? '')}` : String(erro);
  return mensagem.includes('UNIQUE constraint failed');
}

export { schema };
