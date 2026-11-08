// Acompanhamento do pedido pelo destinatário (link público, sem login) e mensagens
// de tempo real trocadas por WebSocket com o painel e com a página de rastreio.

import type { StatusPedido } from './pedidos.ts';

/** Por quanto tempo o link continua mostrando o resultado depois que o pedido termina. */
export const RASTREIO_HORAS_APOS_CONCLUSAO = 48;

/**
 * Última posição com mais tempo que isto sai do mapa: turno esquecido aberto,
 * celular desligado. Abaixo disso o painel mostra "sem sinal há X min".
 */
export const POSICAO_VALIDA_HORAS = 12;

/** A partir daqui a posição é considerada parada/sem sinal (o app envia a cada 15–60 s). */
export const POSICAO_ATRASADA_S = 150;

/** Etapas mostradas ao destinatário, na ordem. */
export const ETAPAS_RASTREIO = ['Recebido', 'Buscando o pedido', 'Saiu para entrega', 'Entregue'] as const;

interface SituacaoRastreio {
  titulo: string;
  texto: string;
  /** Índice em ETAPAS_RASTREIO. */
  etapa: number;
  problema: boolean;
}

/** Como cada status aparece para quem vai receber. `empresa` é o nome fantasia. */
export function situacaoRastreio(status: StatusPedido, empresa: string): SituacaoRastreio {
  switch (status) {
    case 'pendente':
      return { titulo: 'Pedido recebido', texto: `A ${empresa} recebeu seu pedido e vai chamar um entregador.`, etapa: 0, problema: false };
    case 'atribuido':
      return { titulo: 'Pedido recebido', texto: 'Um entregador foi chamado para buscar seu pedido.', etapa: 0, problema: false };
    case 'aceito':
      return { titulo: 'Entregador confirmado', texto: 'O entregador vai buscar seu pedido.', etapa: 1, problema: false };
    case 'coletando':
      return { titulo: 'Buscando seu pedido', texto: 'O entregador está indo buscar seu pedido.', etapa: 1, problema: false };
    case 'em_rota':
      return { titulo: 'Saiu para entrega', texto: 'O entregador está a caminho.', etapa: 2, problema: false };
    case 'entregue':
      return { titulo: 'Pedido entregue', texto: 'Seu pedido foi entregue. Obrigado!', etapa: 3, problema: false };
    case 'falhou':
      return {
        titulo: 'Não conseguimos entregar',
        texto: `O entregador não conseguiu concluir a entrega. A ${empresa} vai falar com você.`,
        etapa: 2,
        problema: true,
      };
    case 'em_devolucao':
      return { titulo: 'Entrega não realizada', texto: `O pedido está voltando para a ${empresa}.`, etapa: 2, problema: true };
    case 'devolvido':
      return { titulo: 'Entrega não realizada', texto: `O pedido voltou para a ${empresa}.`, etapa: 2, problema: true };
    case 'cancelado':
      return { titulo: 'Pedido cancelado', texto: `Este pedido foi cancelado. Em caso de dúvida, fale com a ${empresa}.`, etapa: 0, problema: true };
  }
}

/** Caminho do link público a partir do token. */
export const caminhoRastreio = (token: string) => `/r/${token}`;

// Tempo real ------------------------------------------------------------------

/** Última posição de um motoboy em turno, como o painel recebe. */
export interface PosicaoMotoboy {
  vinculoId: string;
  nome: string;
  latitude: number;
  longitude: number;
  precisao: number | null;
  velocidade: number | null;
  /** Hora do aparelho. */
  registradoEm: string;
}

/** Do servidor para o painel (mapa ao vivo e fila de pedidos). */
export type MensagemCentral =
  /** Ao conectar: quem tem posição agora. */
  | { tipo: 'motoboys'; motoboys: PosicaoMotoboy[] }
  | { tipo: 'posicao'; motoboy: PosicaoMotoboy }
  | { tipo: 'turno'; vinculoId: string; emTurno: boolean }
  | { tipo: 'pedido'; pedidoId: string; status: StatusPedido };

/** Do servidor para a página de rastreio. Só traz a posição do entregador daquele pedido, só em rota. */
export type MensagemRastreio =
  | { tipo: 'posicao'; latitude: number; longitude: number; precisao: number | null; registradoEm: string }
  | { tipo: 'sem_posicao' }
  /** O pedido mudou: a página busca os dados de novo. */
  | { tipo: 'status' };
