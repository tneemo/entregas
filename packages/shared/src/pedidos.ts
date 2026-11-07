// Ciclo de vida do pedido: estados, ações e quem pode executar cada uma.
// A API valida toda mudança de status por aqui; o painel e o app usam o
// mesmo mapa para mostrar só os botões permitidos.

import type { Papel } from './papeis.ts';

export const STATUS_PEDIDO = [
  'pendente',
  'atribuido',
  'aceito',
  'coletando',
  'em_rota',
  'entregue',
  'falhou',
  'em_devolucao',
  'devolvido',
  'cancelado',
] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export const STATUS_FINAIS = ['entregue', 'devolvido', 'cancelado'] as const satisfies StatusPedido[];

export function statusFinal(status: StatusPedido): boolean {
  return (STATUS_FINAIS as readonly StatusPedido[]).includes(status);
}

export const ROTULOS_STATUS: Record<StatusPedido, string> = {
  pendente: 'Aguardando motoboy',
  atribuido: 'Aguardando aceite',
  aceito: 'Aceito pelo motoboy',
  coletando: 'Indo coletar',
  em_rota: 'Em rota de entrega',
  entregue: 'Entregue',
  falhou: 'Não entregue',
  em_devolucao: 'Voltando à origem',
  devolvido: 'Devolvido',
  cancelado: 'Cancelado',
};

/** "central" = admin ou despachante, agindo pelo painel (inclusive em nome do motoboy). */
export type Ator = 'motoboy' | 'central';

export function atorDoPapel(papel: Papel): Ator {
  return papel === 'motoboy' ? 'motoboy' : 'central';
}

interface Transicao {
  de: readonly StatusPedido[];
  para: StatusPedido;
  quem: readonly Ator[];
  /** Dado obrigatório para a ação. */
  exige?: 'codigo' | 'motivo' | 'motoboy';
  rotulo: string;
}

export const TRANSICOES = {
  atribuir: {
    de: ['pendente', 'atribuido', 'aceito', 'coletando'],
    para: 'atribuido',
    quem: ['central'],
    exige: 'motoboy',
    rotulo: 'Atribuir motoboy',
  },
  desatribuir: {
    de: ['atribuido', 'aceito', 'coletando'],
    para: 'pendente',
    quem: ['central'],
    rotulo: 'Tirar do motoboy',
  },
  aceitar: { de: ['atribuido'], para: 'aceito', quem: ['motoboy'], rotulo: 'Aceitar' },
  recusar: { de: ['atribuido'], para: 'pendente', quem: ['motoboy'], rotulo: 'Recusar' },
  // A central pode pular o aceite: há empresas cujos motoboys recebem o pedido pelo WhatsApp.
  iniciar_coleta: {
    de: ['atribuido', 'aceito'],
    para: 'coletando',
    quem: ['motoboy', 'central'],
    rotulo: 'A caminho da coleta',
  },
  coletar: { de: ['coletando'], para: 'em_rota', quem: ['motoboy', 'central'], rotulo: 'Coletado, saiu para entrega' },
  entregar: {
    de: ['em_rota'],
    para: 'entregue',
    quem: ['motoboy', 'central'],
    exige: 'codigo',
    rotulo: 'Confirmar entrega',
  },
  falhar: {
    de: ['em_rota'],
    para: 'falhou',
    quem: ['motoboy', 'central'],
    exige: 'motivo',
    rotulo: 'Não foi possível entregar',
  },
  nova_tentativa: { de: ['falhou'], para: 'em_rota', quem: ['motoboy', 'central'], rotulo: 'Tentar entregar de novo' },
  devolver: { de: ['falhou'], para: 'em_devolucao', quem: ['motoboy', 'central'], rotulo: 'Devolver à origem' },
  concluir_devolucao: {
    de: ['em_devolucao'],
    para: 'devolvido',
    quem: ['motoboy', 'central'],
    rotulo: 'Devolução concluída',
  },
  // Depois da coleta o item já saiu: cancelar vira devolução.
  cancelar: {
    de: ['pendente', 'atribuido', 'aceito', 'coletando'],
    para: 'cancelado',
    quem: ['central'],
    exige: 'motivo',
    rotulo: 'Cancelar pedido',
  },
} as const satisfies Record<string, Transicao>;

export type AcaoPedido = keyof typeof TRANSICOES;
export const ACOES_PEDIDO = Object.keys(TRANSICOES) as AcaoPedido[];

export function podeExecutar(acao: AcaoPedido, status: StatusPedido, ator: Ator): boolean {
  const t: Transicao = TRANSICOES[acao];
  return t.de.includes(status) && t.quem.includes(ator);
}

/** Ações disponíveis para um ator neste status, na ordem em que devem aparecer. */
export function acoesPermitidas(status: StatusPedido, ator: Ator): AcaoPedido[] {
  return ACOES_PEDIDO.filter((a) => podeExecutar(a, status, ator));
}

/** Tentativas erradas do código de entrega antes de bloquear para o motoboy. */
export const MAX_TENTATIVAS_CODIGO = 5;

export const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'cartao', 'pago'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const ROTULOS_PAGAMENTO: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix na entrega',
  cartao: 'Cartão na entrega',
  pago: 'Já pago',
};

/** Agrupamento usado pela central para organizar a fila. */
export const GRUPOS_STATUS = {
  sem_motoboy: ['pendente'],
  com_motoboy: ['atribuido', 'aceito', 'coletando'],
  em_rota: ['em_rota'],
  atencao: ['falhou', 'em_devolucao'],
} as const satisfies Record<string, readonly StatusPedido[]>;

/** Como cada ação aparece no histórico do pedido. */
export const ROTULOS_EVENTO: Record<AcaoPedido | 'criar', string> = {
  criar: 'Pedido criado',
  atribuir: 'Atribuído ao motoboy',
  desatribuir: 'Retirado do motoboy',
  aceitar: 'Motoboy aceitou',
  recusar: 'Motoboy recusou',
  iniciar_coleta: 'A caminho da coleta',
  coletar: 'Coletado, saiu para entrega',
  entregar: 'Entregue ao cliente',
  falhar: 'Não foi possível entregar',
  nova_tentativa: 'Nova tentativa de entrega',
  devolver: 'Voltando à origem',
  concluir_devolucao: 'Devolvido à origem',
  cancelar: 'Pedido cancelado',
};
