import { z } from 'zod';
import {
  normalizarCnpj,
  normalizarEmail,
  normalizarTelefone,
  somenteDigitos,
  validarCnpj,
  validarCpf,
} from './validacao.ts';
import { PAPEIS, STATUS_EMPRESA, STATUS_VINCULO, TIPOS_EMPRESA, TIPOS_VINCULO } from './papeis.ts';
import { ACOES_PEDIDO, FORMAS_PAGAMENTO } from './pedidos.ts';
import { FONTES_LOCALIZACAO, PRECISOES_LOCALIZACAO } from './localizacao.ts';

// Campos reutilizáveis ------------------------------------------------------

const nome = z.string().trim().min(2, 'Informe o nome.').max(120);

export const campoEmail = z.string().trim().pipe(z.email('E-mail inválido.')).transform(normalizarEmail);

export const campoTelefone = z.string().transform((v, ctx) => {
  const tel = normalizarTelefone(v);
  if (!tel) {
    ctx.addIssue({ code: 'custom', message: 'Telefone inválido. Use DDD + número.' });
    return z.NEVER;
  }
  return tel;
});

export const campoCpf = z.string().refine(validarCpf, 'CPF inválido.').transform(somenteDigitos);

export const campoCnpj = z.string().refine(validarCnpj, 'CNPJ inválido.').transform(normalizarCnpj);

export const campoSenha = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(128, 'Senha longa demais.');

// Autenticação --------------------------------------------------------------

export const schemaEntrar = z.object({
  login: z.string().trim().min(3, 'Informe e-mail, telefone ou CPF.').max(254),
  senha: z.string().min(1, 'Informe a senha.').max(128),
  /** "token" devolve o token no corpo (app); padrão é cookie (painel). */
  modo: z.enum(['cookie', 'token']).default('cookie'),
});

export const schemaSetup = z.object({
  token: z.string().min(1),
  nome,
  email: campoEmail,
  senha: campoSenha,
});

// Plataforma (super admin) --------------------------------------------------

export const schemaCriarCidade = z.object({
  nome,
  uf: z
    .string()
    .trim()
    .length(2)
    .transform((v) => v.toUpperCase()),
  codigoIbge: z.string().regex(/^\d{7}$/, 'Código IBGE tem 7 dígitos.'),
});

export const schemaCriarEmpresa = z.object({
  tipo: z.enum(TIPOS_EMPRESA),
  razaoSocial: nome,
  nomeFantasia: nome,
  cnpj: campoCnpj,
  cidadeId: z.string().min(1, 'Escolha a cidade.'),
  telefone: campoTelefone.optional(),
  email: campoEmail.optional(),
});

export const schemaAtualizarEmpresa = z.object({
  status: z.enum(STATUS_EMPRESA),
});

// Equipe da empresa ----------------------------------------------------------

export const schemaCriarConvite = z.object({
  papel: z.enum(PAPEIS),
  /** Só para exibição na lista de convites ("Convite para João"). */
  nomeConvidado: z.string().trim().max(120).optional(),
});

export const schemaAtualizarMembro = z
  .object({
    papel: z.enum(PAPEIS).optional(),
    status: z.enum(STATUS_VINCULO).optional(),
    tipoVinculo: z.enum(TIPOS_VINCULO).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

/** Aceite de convite por quem ainda não tem conta. */
export const schemaAceitarConviteNovaConta = z.object({
  nome,
  email: campoEmail.optional(),
  telefone: campoTelefone.optional(),
  cpf: campoCpf.optional(),
  senha: campoSenha,
  modo: z.enum(['cookie', 'token']).default('cookie'),
});

/** Aceite por quem já está logado (pode completar dados que o papel exige e ainda faltam). */
export const schemaAceitarConviteLogado = z.object({
  email: campoEmail.optional(),
  telefone: campoTelefone.optional(),
  cpf: campoCpf.optional(),
});

export type DadosEntrar = z.input<typeof schemaEntrar>;
export type DadosCriarEmpresa = z.input<typeof schemaCriarEmpresa>;
export type DadosCriarConvite = z.input<typeof schemaCriarConvite>;
export type DadosAtualizarMembro = z.input<typeof schemaAtualizarMembro>;
export type DadosAceitarConviteNovaConta = z.input<typeof schemaAceitarConviteNovaConta>;

// Endereços ------------------------------------------------------------------

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional();

export const schemaLocalizacao = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  precisao: z.enum(PRECISOES_LOCALIZACAO),
  fonte: z.enum(FONTES_LOCALIZACAO),
});

export const schemaEndereco = z.object({
  cep: z
    .string()
    .transform(somenteDigitos)
    .refine((v) => v === '' || v.length === 8, 'CEP tem 8 dígitos.')
    .transform((v) => v || undefined)
    .optional(),
  logradouro: z.string().trim().min(2, 'Informe a rua.').max(160),
  numero: z.string().trim().min(1, 'Informe o número (ou s/n).').max(20),
  complemento: textoOpcional(80),
  bairro: z.string().trim().min(2, 'Informe o bairro.').max(80),
  cidade: z.string().trim().min(2, 'Informe a cidade.').max(80),
  uf: z
    .string()
    .trim()
    .length(2, 'UF tem 2 letras.')
    .transform((v) => v.toUpperCase()),
  referencia: textoOpcional(160),
  /** Ponto no mapa. Sem ele, a API tenta achar pelo texto ao salvar (sem impedir o pedido). */
  localizacao: schemaLocalizacao.optional(),
});

export type Endereco = z.output<typeof schemaEndereco>;

/** Celular do motoboy que recebe notificação: token do Expo Push, preso à sessão do app. */
export const schemaDispositivo = z.object({
  token: z
    .string()
    .trim()
    .regex(/^Expo(nent)?PushToken\[[^\]]{10,200}\]$/, 'Token de notificação inválido.'),
  plataforma: z.enum(['android', 'ios']),
});

export type DadosDispositivo = z.input<typeof schemaDispositivo>;

export const schemaAtualizarDadosEmpresa = z
  .object({
    nomeFantasia: nome.optional(),
    telefone: campoTelefone.nullable().optional(),
    email: campoEmail.nullable().optional(),
    endereco: schemaEndereco.optional(),
    fotoEntregaObrigatoria: z.boolean().optional(),
    prazoAceiteMin: z
      .number()
      .int('Use minutos inteiros.')
      .min(1, 'O prazo mínimo é 1 minuto.')
      .max(60, 'O prazo máximo é 60 minutos.')
      .nullable()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

// Pedidos --------------------------------------------------------------------

const centavos = (rotulo: string) =>
  z
    .number({ error: `Informe ${rotulo}.` })
    .int()
    .min(0, `${rotulo[0]!.toUpperCase()}${rotulo.slice(1)} não pode ser negativo.`)
    .max(10_000_00, 'Valor acima do limite de R$ 10.000,00.');

export const schemaCriarPedido = z
  .object({
    coleta: z.object({
      nome: textoOpcional(120),
      telefone: campoTelefone.optional(),
      endereco: schemaEndereco,
    }),
    entrega: z.object({
      nome,
      telefone: campoTelefone,
      endereco: schemaEndereco,
    }),
    formaPagamento: z.enum(FORMAS_PAGAMENTO),
    /** Quanto o motoboy cobra na porta. Zero quando já está pago. */
    valorACobrarCentavos: centavos('o valor a cobrar'),
    /** Só para dinheiro: o cliente vai pagar com uma nota deste valor. */
    trocoParaCentavos: centavos('o troco').optional(),
    taxaEntregaCentavos: centavos('a taxa de entrega').default(0),
    observacoes: textoOpcional(500),
    /** Já atribui ao motoboy na criação. */
    motoboyVinculoId: z.string().min(1).optional(),
  })
  .superRefine((p, ctx) => {
    if (p.formaPagamento === 'pago' && p.valorACobrarCentavos !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['valorACobrarCentavos'],
        message: 'Pedido já pago não tem valor a cobrar.',
      });
    }
    if (p.formaPagamento !== 'pago' && p.valorACobrarCentavos === 0) {
      ctx.addIssue({ code: 'custom', path: ['valorACobrarCentavos'], message: 'Informe o valor a cobrar na entrega.' });
    }
    if (p.trocoParaCentavos !== undefined) {
      if (p.formaPagamento !== 'dinheiro') {
        ctx.addIssue({
          code: 'custom',
          path: ['trocoParaCentavos'],
          message: 'Troco só vale para pagamento em dinheiro.',
        });
      } else if (p.trocoParaCentavos < p.valorACobrarCentavos) {
        ctx.addIssue({
          code: 'custom',
          path: ['trocoParaCentavos'],
          message: 'O troco precisa ser para um valor maior que o pedido.',
        });
      }
    }
  });

export const schemaAcaoPedido = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'O código tem 4 dígitos.')
    .optional(),
  motivo: z.string().trim().min(3, 'Descreva o motivo.').max(300).optional(),
  motoboyVinculoId: z.string().min(1).optional(),
});

export const schemaParamAcao = z.enum(ACOES_PEDIDO);

export type DadosCriarPedido = z.input<typeof schemaCriarPedido>;
export type DadosAcaoPedido = z.input<typeof schemaAcaoPedidoComPosicao>;
export type DadosAtualizarDadosEmpresa = z.input<typeof schemaAtualizarDadosEmpresa>;

const coordenadas = {
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
};

/** Ações vindas do app levam a posição do motoboy no momento (vai para o histórico). */
export const schemaAcaoPedidoComPosicao = schemaAcaoPedido.extend(coordenadas);

export const schemaPosicoes = z.object({
  pontos: z
    .array(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        precisao: z.number().min(0).max(100_000).optional(),
        velocidade: z.number().min(0).max(100).optional(),
        registradoEm: z.iso.datetime({ offset: true }),
      }),
    )
    .min(1)
    .max(100, 'Envie no máximo 100 pontos por vez.'),
});

export type DadosPosicoes = z.input<typeof schemaPosicoes>;

/** Nota do destinatário pelo link de acompanhamento, depois da entrega. */
export const schemaAvaliacao = z.object({
  nota: z.number().int().min(1, 'Escolha de 1 a 5 estrelas.').max(5, 'Escolha de 1 a 5 estrelas.'),
  comentario: textoOpcional(500),
});

export type DadosAvaliacao = z.input<typeof schemaAvaliacao>;

/** Períodos oferecidos na visão geral (dias, contando hoje). */
export const PERIODOS_INDICADORES = [1, 7, 30] as const;
export type PeriodoIndicadores = (typeof PERIODOS_INDICADORES)[number];
