// Formatos de resposta da API, compartilhados com o painel e o app.

import type {
  Papel,
  StatusEmpresa,
  StatusVinculo,
  TipoEmpresa,
  TipoVinculo,
} from './papeis.ts';
import type { AcaoPedido, FormaPagamento, StatusPedido, TipoFoto } from './pedidos.ts';

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

// Pedidos --------------------------------------------------------------------

export interface EnderecoResposta {
  cep?: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  referencia?: string;
}

export interface DadosEmpresaResposta extends EmpresaResposta {
  endereco: EnderecoResposta | null;
}

export interface MotoboyResumo {
  vinculoId: string;
  nome: string;
  telefone: string | null;
  pedidosAtivos: number;
  /** Com turno aberto nesta empresa agora. */
  emTurno: boolean;
}

export interface ParadaResposta {
  tipo: 'coleta' | 'entrega';
  nome: string | null;
  telefone: string | null;
  endereco: EnderecoResposta;
}

export interface PedidoResumo {
  id: string;
  numero: number;
  status: StatusPedido;
  criadoEm: string;
  atualizadoEm: string;
  concluidoEm: string | null;
  destino: { nome: string | null; bairro: string; logradouro: string; numero: string };
  motoboy: { vinculoId: string; nome: string } | null;
  formaPagamento: FormaPagamento;
  valorACobrarCentavos: number;
}

export interface EventoPedidoResposta {
  id: string;
  acao: AcaoPedido | 'criar';
  de: StatusPedido | null;
  para: StatusPedido;
  autor: string;
  papel: Papel;
  motivo: string | null;
  detalhe: string | null;
  criadoEm: string;
}

export interface PedidoDetalhe extends PedidoResumo {
  coleta: ParadaResposta;
  entrega: ParadaResposta;
  trocoParaCentavos: number | null;
  taxaEntregaCentavos: number;
  observacoes: string | null;
  motivo: string | null;
  /** Só a central vê o código; o motoboy precisa recebê-lo do cliente. */
  codigoEntrega?: string;
  codigoBloqueado: boolean;
  /** O que quem fez a requisição pode fazer agora. */
  acoes: AcaoPedido[];
  eventos: EventoPedidoResposta[];
  fotos: FotoResposta[];
}

export interface ClienteResposta {
  id: string;
  nome: string;
  telefone: string;
  endereco: EnderecoResposta | null;
}

export interface FotoResposta {
  id: string;
  tipo: TipoFoto;
  criadoEm: string;
  /** Caminho da API que devolve a imagem (exige login). */
  url: string;
}

export interface TurnoResposta {
  turno: { id: string; iniciadoEm: string } | null;
  /** Turno aberto em outra empresa: o motoboy só trabalha para uma por vez. */
  emOutraEmpresa: { empresaId: string; nomeFantasia: string } | null;
}
