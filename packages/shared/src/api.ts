// Formatos de resposta da API, compartilhados com o painel e o app.

import type { Papel, StatusEmpresa, StatusVinculo, TipoEmpresa, TipoVinculo } from './papeis.ts';
import type { AcaoPedido, FormaPagamento, RegrasEntrega, StatusPedido, TipoFoto } from './pedidos.ts';
import type { Localizacao } from './localizacao.ts';

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
  /** Ponto no mapa; ausente em endereços antigos ou que nenhum geocodificador achou. */
  localizacao?: Localizacao;
}

/** POST /empresas/:empresaId/enderecos/localizar */
export interface LocalizarResposta {
  /** null: o geocodificador não achou (ou está desligado). A pessoa pode marcar no mapa. */
  localizacao: Localizacao | null;
}

export interface DadosEmpresaResposta extends EmpresaResposta, RegrasEntrega {
  endereco: EnderecoResposta | null;
}

export interface MotoboyResumo {
  vinculoId: string;
  nome: string;
  telefone: string | null;
  pedidosAtivos: number;
  /** Com turno aberto nesta empresa agora. */
  emTurno: boolean;
  /** Tem o app aberto em algum celular com notificação ligada: fica sabendo do pedido na hora. */
  recebeNotificacao: boolean;
}

/** O que vai junto na notificação, para o app abrir a tela certa ao tocar. */
export interface DadosNotificacao {
  tipo: 'pedido';
  empresaId: string;
  pedidoId: string;
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
  /** Atribuído e aguardando aceite: depois desta hora volta sozinho para a fila. */
  aceiteAte: string | null;
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
  /**
   * Distância entre onde o motoboy estava ao registrar a ação e o ponto de entrega, em metros.
   * Só quando os dois pontos existem. Acima de LONGE_DO_DESTINO_M, o painel destaca.
   */
  distanciaDaEntregaM: number | null;
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
  /** Quais dessas ações exigem foto de quem pediu (vazio para a central). */
  fotoObrigatoria: AcaoPedido[];
  eventos: EventoPedidoResposta[];
  fotos: FotoResposta[];
  /** Link público de acompanhamento (só a central recebe, para enviar ao cliente). */
  rastreio?: { caminho: string };
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

/** Página pública de acompanhamento. Só o que o destinatário precisa: nada de telefone, nada de outros pedidos. */
export interface RastreioResposta {
  empresa: { nomeFantasia: string; telefone: string | null };
  numero: number;
  status: StatusPedido;
  horarios: { recebido: string; saiuParaEntrega: string | null; concluido: string | null };
  /** Enquanto o pedido está em andamento; some depois que termina. */
  entrega: Pick<EnderecoResposta, 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf'> | null;
  cobranca: { formaPagamento: FormaPagamento; valorACobrarCentavos: number; trocoParaCentavos: number | null } | null;
  /** O destinatário informa ao entregador. Some quando não há mais entrega a confirmar. */
  codigoEntrega: string | null;
  motoboy: { primeiroNome: string } | null;
  /** Posição do entregador ao vivo pelo WebSocket: só em rota de entrega. */
  aoVivo: boolean;
}
