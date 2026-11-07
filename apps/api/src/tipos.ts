import type { Papel } from '@entregas/shared';
import type { Db } from './db/index.ts';
import type { usuarios } from './db/schema.ts';

export type Usuario = typeof usuarios.$inferSelect;

/** Quem está agindo e em qual empresa. Toda leitura/escrita de dados da empresa exige isto. */
export interface ContextoEmpresa {
  empresaId: string;
  usuarioId: string;
  vinculoId: string;
  papel: Papel;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Db;
    usuario: Usuario | null;
    sessaoId: string | null;
    empresa: ContextoEmpresa;
  };
}
