// Esquema do banco (D1/SQLite).
//
// Regra multi-tenant: toda tabela com dados de uma empresa tem `empresa_id`
// e só é acessada pelo escopo em src/dados/escopo-empresa.ts.
// Tabelas globais: cidades, empresas, usuarios, sessoes, falhas_login.

import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  PAPEIS,
  STATUS_EMPRESA,
  STATUS_VINCULO,
  TIPOS_EMPRESA,
  TIPOS_VINCULO,
} from '@entregas/shared';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const criadoEm = () =>
  integer('criado_em', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`)
    .$defaultFn(() => new Date());

const atualizadoEm = () =>
  integer('atualizado_em', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`)
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());

export const cidades = sqliteTable(
  'cidades',
  {
    id: id(),
    nome: text('nome').notNull(),
    uf: text('uf').notNull(),
    codigoIbge: text('codigo_ibge').notNull(),
    /** Exigências municipais de motofrete (documentos), editáveis pelo super admin. */
    regrasDocumentos: text('regras_documentos', { mode: 'json' }).$type<Record<string, unknown>>(),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex('cidades_codigo_ibge_unq').on(t.codigoIbge)],
);

export const empresas = sqliteTable(
  'empresas',
  {
    id: id(),
    tipo: text('tipo', { enum: TIPOS_EMPRESA }).notNull(),
    razaoSocial: text('razao_social').notNull(),
    nomeFantasia: text('nome_fantasia').notNull(),
    cnpj: text('cnpj').notNull(),
    cidadeId: text('cidade_id')
      .notNull()
      .references(() => cidades.id),
    telefone: text('telefone'),
    email: text('email'),
    status: text('status', { enum: STATUS_EMPRESA }).notNull().default('ativa'),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [uniqueIndex('empresas_cnpj_unq').on(t.cnpj)],
);

export const usuarios = sqliteTable(
  'usuarios',
  {
    id: id(),
    nome: text('nome').notNull(),
    email: text('email'),
    /** E.164: +55DDNNNNNNNNN */
    telefone: text('telefone'),
    /** Somente dígitos. */
    cpf: text('cpf'),
    senhaHash: text('senha_hash').notNull(),
    superAdmin: integer('super_admin', { mode: 'boolean' }).notNull().default(false),
    ativo: integer('ativo', { mode: 'boolean' }).notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex('usuarios_email_unq').on(t.email),
    uniqueIndex('usuarios_telefone_unq').on(t.telefone),
    uniqueIndex('usuarios_cpf_unq').on(t.cpf),
  ],
);

export const sessoes = sqliteTable(
  'sessoes',
  {
    /** SHA-256 do token; o token em si nunca é gravado. */
    id: text('id').primaryKey(),
    usuarioId: text('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    criadoEm: criadoEm(),
    expiraEm: integer('expira_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('sessoes_usuario_idx').on(t.usuarioId)],
);

export const falhasLogin = sqliteTable(
  'falhas_login',
  {
    id: id(),
    chave: text('chave').notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index('falhas_login_chave_idx').on(t.chave, t.criadoEm)],
);

export const vinculos = sqliteTable(
  'vinculos',
  {
    id: id(),
    empresaId: text('empresa_id')
      .notNull()
      .references(() => empresas.id),
    usuarioId: text('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    papel: text('papel', { enum: PAPEIS }).notNull(),
    status: text('status', { enum: STATUS_VINCULO }).notNull().default('ativo'),
    tipoVinculo: text('tipo_vinculo', { enum: TIPOS_VINCULO }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex('vinculos_empresa_usuario_unq').on(t.empresaId, t.usuarioId),
    index('vinculos_usuario_idx').on(t.usuarioId),
  ],
);

export const convites = sqliteTable(
  'convites',
  {
    id: id(),
    empresaId: text('empresa_id')
      .notNull()
      .references(() => empresas.id),
    /** SHA-256 do token do link. */
    tokenHash: text('token_hash').notNull(),
    papel: text('papel', { enum: PAPEIS }).notNull(),
    nomeConvidado: text('nome_convidado'),
    criadoPor: text('criado_por')
      .notNull()
      .references(() => usuarios.id),
    criadoEm: criadoEm(),
    expiraEm: integer('expira_em', { mode: 'timestamp_ms' }).notNull(),
    aceitoEm: integer('aceito_em', { mode: 'timestamp_ms' }),
    aceitoPor: text('aceito_por').references(() => usuarios.id),
    revogadoEm: integer('revogado_em', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('convites_token_unq').on(t.tokenHash),
    index('convites_empresa_idx').on(t.empresaId),
  ],
);
