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

// Campos reutilizáveis ------------------------------------------------------

const nome = z.string().trim().min(2, 'Informe o nome.').max(120);

export const campoEmail = z
  .string()
  .trim()
  .pipe(z.email('E-mail inválido.'))
  .transform(normalizarEmail);

export const campoTelefone = z
  .string()
  .transform((v, ctx) => {
    const tel = normalizarTelefone(v);
    if (!tel) {
      ctx.addIssue({ code: 'custom', message: 'Telefone inválido. Use DDD + número.' });
      return z.NEVER;
    }
    return tel;
  });

export const campoCpf = z
  .string()
  .refine(validarCpf, 'CPF inválido.')
  .transform(somenteDigitos);

export const campoCnpj = z
  .string()
  .refine(validarCnpj, 'CNPJ inválido.')
  .transform(normalizarCnpj);

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
  uf: z.string().trim().length(2).transform((v) => v.toUpperCase()),
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
