// Esquema do banco (D1/SQLite).
//
// Regra multi-tenant: toda tabela com dados de uma empresa tem `empresa_id`
// e só é acessada pelos escopos em src/dados/escopo-*.ts.
// Tabelas globais: cidades, empresas, usuarios, sessoes, dispositivos, falhas_login, idempotencia.

import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  ACOES_PEDIDO,
  FORMAS_PAGAMENTO,
  PAPEIS,
  STATUS_EMPRESA,
  STATUS_PEDIDO,
  STATUS_VINCULO,
  TIPOS_FOTO,
  TIPOS_EMPRESA,
  TIPOS_VINCULO,
  type Endereco,
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
    /** Endereço da loja/base: sugestão padrão de coleta nos pedidos. */
    endereco: text('endereco', { mode: 'json' }).$type<Endereco>(),
    /** Regras de entrega (RegrasEntrega em @entregas/shared). */
    fotoEntregaObrigatoria: integer('foto_entrega_obrigatoria', { mode: 'boolean' }).notNull().default(false),
    prazoAceiteMin: integer('prazo_aceite_min'),
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

/**
 * Celular que recebe notificação (Expo Push). Preso à sessão do app: sair, ser desconectado
 * ou a sessão vencer apaga o registro junto, e ninguém recebe aviso de quem já saiu.
 */
export const dispositivos = sqliteTable(
  'dispositivos',
  {
    /** Token do Expo Push ("ExponentPushToken[...]"): um por aparelho e instalação do app. */
    token: text('token').primaryKey(),
    sessaoId: text('sessao_id')
      .notNull()
      .references(() => sessoes.id, { onDelete: 'cascade' }),
    usuarioId: text('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    plataforma: text('plataforma', { enum: ['android', 'ios'] }).notNull(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index('dispositivos_usuario_idx').on(t.usuarioId), index('dispositivos_sessao_idx').on(t.sessaoId)],
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
  (t) => [uniqueIndex('convites_token_unq').on(t.tokenHash), index('convites_empresa_idx').on(t.empresaId)],
);

/** Destinatários já atendidos, para preencher o pedido pelo telefone. */
export const clientes = sqliteTable(
  'clientes',
  {
    id: id(),
    empresaId: text('empresa_id')
      .notNull()
      .references(() => empresas.id),
    nome: text('nome').notNull(),
    telefone: text('telefone').notNull(),
    /** Último endereço usado. */
    endereco: text('endereco', { mode: 'json' }).$type<Endereco>(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [uniqueIndex('clientes_empresa_telefone_unq').on(t.empresaId, t.telefone)],
);

export const pedidos = sqliteTable(
  'pedidos',
  {
    id: id(),
    empresaId: text('empresa_id')
      .notNull()
      .references(() => empresas.id),
    /** Número curto e sequencial dentro da empresa ("pedido 152"). */
    numero: integer('numero').notNull(),
    status: text('status', { enum: STATUS_PEDIDO }).notNull().default('pendente'),
    motoboyVinculoId: text('motoboy_vinculo_id').references(() => vinculos.id),
    clienteId: text('cliente_id').references(() => clientes.id),
    formaPagamento: text('forma_pagamento', { enum: FORMAS_PAGAMENTO }).notNull(),
    valorACobrarCentavos: integer('valor_a_cobrar_centavos').notNull(),
    trocoParaCentavos: integer('troco_para_centavos'),
    taxaEntregaCentavos: integer('taxa_entrega_centavos').notNull().default(0),
    observacoes: text('observacoes'),
    /** Código de 4 dígitos que o destinatário informa ao receber. */
    codigoEntrega: text('codigo_entrega').notNull(),
    tentativasCodigo: integer('tentativas_codigo').notNull().default(0),
    /**
     * Segredo do link público de acompanhamento (/r/<token>). Fica em claro, ao contrário
     * dos tokens de sessão e convite, porque a central precisa reenviar o link ao cliente.
     * Só dá acesso de leitura ao status deste pedido.
     */
    tokenRastreio: text('token_rastreio').notNull(),
    /** Último motivo de falha ou cancelamento (ou com quem ficou, na entrega sem código). */
    motivo: text('motivo'),
    /**
     * Prazo para o motoboy aceitar, gravado na atribuição (mudar a regra da empresa não
     * mexe em quem já está esperando). Só preenchido enquanto o status é "atribuido".
     */
    aceiteAte: integer('aceite_ate', { mode: 'timestamp_ms' }),
    criadoPor: text('criado_por')
      .notNull()
      .references(() => usuarios.id),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
    concluidoEm: integer('concluido_em', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('pedidos_empresa_numero_unq').on(t.empresaId, t.numero),
    uniqueIndex('pedidos_token_rastreio_unq').on(t.tokenRastreio),
    index('pedidos_empresa_status_idx').on(t.empresaId, t.status),
    index('pedidos_motoboy_status_idx').on(t.motoboyVinculoId, t.status),
    // Histórico e indicadores leem por período dentro da empresa.
    index('pedidos_empresa_concluido_idx').on(t.empresaId, t.concluidoEm),
    index('pedidos_empresa_criado_idx').on(t.empresaId, t.criadoEm),
    // O cron de cada minuto só olha os pedidos esperando aceite com prazo.
    index('pedidos_aceite_ate_idx').on(t.aceiteAte).where(sql`aceite_ate IS NOT NULL`),
  ],
);

/** Pontos do trajeto: hoje uma coleta e uma entrega; preparado para várias entregas. */
export const paradas = sqliteTable(
  'paradas',
  {
    id: id(),
    empresaId: text('empresa_id')
      .notNull()
      .references(() => empresas.id),
    pedidoId: text('pedido_id')
      .notNull()
      .references(() => pedidos.id),
    ordem: integer('ordem').notNull(),
    tipo: text('tipo', { enum: ['coleta', 'entrega'] }).notNull(),
    nome: text('nome'),
    telefone: text('telefone'),
    endereco: text('endereco', { mode: 'json' }).$type<Endereco>().notNull(),
  },
  (t) => [uniqueIndex('paradas_pedido_ordem_unq').on(t.pedidoId, t.ordem)],
);

/** Histórico imutável: quem mudou o quê, quando (e onde, quando vier do app). */
export const eventosPedido = sqliteTable(
  'eventos_pedido',
  {
    id: id(),
    empresaId: text('empresa_id')
      .notNull()
      .references(() => empresas.id),
    pedidoId: text('pedido_id')
      .notNull()
      .references(() => pedidos.id),
    acao: text('acao', { enum: ['criar', ...ACOES_PEDIDO] }).notNull(),
    de: text('de', { enum: STATUS_PEDIDO }),
    para: text('para', { enum: STATUS_PEDIDO }).notNull(),
    usuarioId: text('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    papel: text('papel', { enum: PAPEIS }).notNull(),
    motivo: text('motivo'),
    /** Texto extra para o histórico, ex.: nome do motoboy atribuído. */
    detalhe: text('detalhe'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    criadoEm: criadoEm(),
  },
  (t) => [index('eventos_pedido_idx').on(t.pedidoId, t.criadoEm)],
);

/** Período em que o motoboy está trabalhando para uma empresa. GPS só é aceito com turno aberto. */
export const turnos = sqliteTable(
  'turnos',
  {
    id: id(),
    empresaId: text('empresa_id')
      .notNull()
      .references(() => empresas.id),
    vinculoId: text('vinculo_id')
      .notNull()
      .references(() => vinculos.id),
    /** Repetido do vínculo para garantir um turno aberto por pessoa, em qualquer empresa. */
    usuarioId: text('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    iniciadoEm: integer('iniciado_em', { mode: 'timestamp_ms' }).notNull(),
    encerradoEm: integer('encerrado_em', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('turnos_um_aberto_por_usuario').on(t.usuarioId).where(sql`encerrado_em IS NULL`),
    index('turnos_empresa_idx').on(t.empresaId, t.encerradoEm),
  ],
);

/** Pontos de GPS brutos. Apagados após RETENCAO_POSICOES_DIAS (LGPD). */
export const posicoes = sqliteTable(
  'posicoes',
  {
    id: id(),
    empresaId: text('empresa_id')
      .notNull()
      .references(() => empresas.id),
    turnoId: text('turno_id')
      .notNull()
      .references(() => turnos.id),
    latitude: real('latitude').notNull(),
    longitude: real('longitude').notNull(),
    precisaoM: real('precisao_m'),
    velocidadeMs: real('velocidade_ms'),
    /** Hora do aparelho: pontos podem chegar atrasados quando o celular fica sem sinal. */
    registradoEm: integer('registrado_em', { mode: 'timestamp_ms' }).notNull(),
    recebidoEm: criadoEm(),
  },
  (t) => [
    index('posicoes_turno_idx').on(t.turnoId, t.registradoEm),
    index('posicoes_registrado_idx').on(t.registradoEm),
  ],
);

/** Fotos de comprovante. O arquivo fica no R2; aqui só a referência. */
export const fotosPedido = sqliteTable(
  'fotos_pedido',
  {
    id: id(),
    empresaId: text('empresa_id')
      .notNull()
      .references(() => empresas.id),
    pedidoId: text('pedido_id')
      .notNull()
      .references(() => pedidos.id),
    tipo: text('tipo', { enum: TIPOS_FOTO }).notNull(),
    chave: text('chave').notNull(),
    tipoConteudo: text('tipo_conteudo').notNull(),
    tamanhoBytes: integer('tamanho_bytes').notNull(),
    enviadoPor: text('enviado_por')
      .notNull()
      .references(() => usuarios.id),
    criadoEm: criadoEm(),
  },
  (t) => [index('fotos_pedido_idx').on(t.pedidoId)],
);

/** Nota do destinatário, dada pelo link de acompanhamento depois da entrega. Uma por pedido. */
export const avaliacoes = sqliteTable(
  'avaliacoes',
  {
    id: id(),
    empresaId: text('empresa_id')
      .notNull()
      .references(() => empresas.id),
    pedidoId: text('pedido_id')
      .notNull()
      .references(() => pedidos.id),
    /** 1 a 5 estrelas. */
    nota: integer('nota').notNull(),
    comentario: text('comentario'),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('avaliacoes_pedido_unq').on(t.pedidoId),
    index('avaliacoes_empresa_idx').on(t.empresaId, t.criadoEm),
  ],
);

/**
 * Chaves de idempotência (cabeçalho Idempotency-Key): a resposta da primeira requisição
 * fica guardada por 24 h, e repetir a mesma chave devolve a mesma resposta sem executar
 * de novo. É o que deixa o app repetir "entregar" depois de uma queda de sinal sem medo.
 */
export const idempotencia = sqliteTable(
  'idempotencia',
  {
    usuarioId: text('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    chave: text('chave').notNull(),
    /** Método e caminho da primeira requisição: a mesma chave em outra rota é erro de quem chamou. */
    rota: text('rota').notNull(),
    /** null enquanto a primeira requisição ainda está em andamento. */
    status: integer('status'),
    corpo: text('corpo'),
    criadoEm: criadoEm(),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.chave] }), index('idempotencia_criado_idx').on(t.criadoEm)],
);
