// Formatos de resposta da API, compartilhados com o painel e o app.

import type {
  Papel,
  StatusEmpresa,
  StatusVinculo,
  TipoEmpresa,
  TipoVinculo,
} from './papeis.ts';

export interface ErroResposta {
  erro: { codigo: string; mensagem: string; campos?: Record<string, string[]> };
}

export interface UsuarioResposta {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  temCpf: boolean;
  superAdmin: boolean;
}

export interface VinculoDoUsuario {
  vinculoId: string;
  papel: Papel;
  empresa: { id: string; nomeFantasia: string; tipo: TipoEmpresa };
}

export interface EuResposta {
  usuario: UsuarioResposta;
  vinculos: VinculoDoUsuario[];
}

export interface EntrarResposta extends EuResposta {
  /** Presente apenas quando o login pediu modo "token". */
  token?: string;
}

export interface CidadeResposta {
  id: string;
  nome: string;
  uf: string;
  codigoIbge: string;
}

export interface EmpresaResposta {
  id: string;
  tipo: TipoEmpresa;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  telefone: string | null;
  email: string | null;
  status: StatusEmpresa;
  cidade: { id: string; nome: string; uf: string };
  criadoEm: string;
}

export interface ConviteCriadoResposta {
  id: string;
  papel: Papel;
  /** Caminho relativo do link (ex.: /convite/abc). Só aparece na criação. */
  caminho: string;
  expiraEm: string;
}

export interface CriarEmpresaResposta {
  empresa: EmpresaResposta;
  conviteAdmin: ConviteCriadoResposta;
}

export interface ConvitePendenteResposta {
  id: string;
  papel: Papel;
  nomeConvidado: string | null;
  criadoPor: string;
  criadoEm: string;
  expiraEm: string;
}

export interface ConvitePublicoResposta {
  papel: Papel;
  expiraEm: string;
  empresa: { nomeFantasia: string; tipo: TipoEmpresa; cidade: string };
  /** Dados que o aceite vai exigir para este papel. */
  exige: { email: boolean; telefone: boolean; cpf: boolean };
}

export interface MembroResposta {
  vinculoId: string;
  papel: Papel;
  status: StatusVinculo;
  tipoVinculo: TipoVinculo | null;
  entrouEm: string;
  usuario: { id: string; nome: string; email: string | null; telefone: string | null };
}
