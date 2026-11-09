// Notificações no celular do motoboy, pelo Expo Push (que entrega pelo Firebase Cloud
// Messaging no Android). Sem isto, o app só descobre pedido novo quando está aberto.
//
// - Sai depois da resposta (waitUntil): notificação que falha não desfaz nem atrasa a operação.
//   O app continua consultando a cada 15 s com o turno aberto, como rede de segurança.
// - O texto aparece na tela bloqueada: só número do pedido e bairros, nunca nome ou telefone.
// - Aparelho que o Expo diz não existir mais (app desinstalado) é esquecido na hora.
// - EXPO_ACCESS_TOKEN (opcional): exige o token da conta Expo para enviar (Enhanced Security).

import type { DadosNotificacao, PedidoDetalhe } from '@entregas/shared';
import type { Db } from './db/index.ts';
import { esquecerDispositivos, tokensDosUsuarios } from './dados/dispositivos.ts';
import { registrarErro } from './monitoramento.ts';

const URL_EXPO = 'https://exp.host/--/api/v2/push/send';
/** O Expo aceita até 100 mensagens por chamada. */
const LOTE = 100;
/** Aviso de pedido velho não ajuda: depois de 15 min sem chegar, o Firebase descarta. */
const VALIDADE_S = 15 * 60;

export interface Aviso {
  usuarioId: string;
  titulo: string;
  texto: string;
  dados: DadosNotificacao;
}

interface MensagemExpo {
  to: string;
  title: string;
  body: string;
  data: DadosNotificacao;
  channelId: string;
  priority: 'high';
  sound: 'default';
  ttl: number;
}

type Recibo = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

const bairros = (p: Pick<PedidoDetalhe, 'coleta' | 'entrega'>) =>
  `Coleta: ${p.coleta.endereco.bairro} · Entrega: ${p.entrega.endereco.bairro}`;

const dadosDo = (empresaId: string, pedidoId: string): DadosNotificacao => ({ tipo: 'pedido', empresaId, pedidoId });

/** Textos de cada situação, num lugar só. */
export const avisos = {
  novoPedido: (usuarioId: string, empresaId: string, p: PedidoDetalhe): Aviso => ({
    usuarioId,
    titulo: `Pedido ${p.numero} para você`,
    texto: `${bairros(p)}. Toque para ver e aceitar.`,
    dados: dadosDo(empresaId, p.id),
  }),
  retirado: (usuarioId: string, empresaId: string, p: PedidoDetalhe): Aviso => ({
    usuarioId,
    titulo: `Pedido ${p.numero} saiu da sua lista`,
    texto: 'A central passou este pedido para outra pessoa ou de volta para a fila.',
    dados: dadosDo(empresaId, p.id),
  }),
  cancelado: (usuarioId: string, empresaId: string, p: PedidoDetalhe): Aviso => ({
    usuarioId,
    titulo: `Pedido ${p.numero} cancelado`,
    texto: 'A central cancelou este pedido. Se já estava com o item, fale com ela.',
    dados: dadosDo(empresaId, p.id),
  }),
  prazoEsgotado: (usuarioId: string, empresaId: string, pedido: { id: string; numero: number }): Aviso => ({
    usuarioId,
    titulo: `Pedido ${pedido.numero} voltou para a central`,
    texto: 'O prazo para aceitar acabou sem resposta.',
    dados: dadosDo(empresaId, pedido.id),
  }),
};

/** Manda os avisos para todos os celulares de cada pessoa. Nunca lança: erro vai para o log e o Sentry. */
export async function notificar(env: Env, db: Db, lista: Aviso[]): Promise<void> {
  if (lista.length === 0) return;
  try {
    const aparelhos = await tokensDosUsuarios(db, [...new Set(lista.map((a) => a.usuarioId))]);
    const mensagens: MensagemExpo[] = lista.flatMap((a) =>
      aparelhos
        .filter((d) => d.usuarioId === a.usuarioId)
        .map((d) => ({
          to: d.token,
          title: a.titulo,
          body: a.texto,
          data: a.dados,
          channelId: 'pedidos',
          priority: 'high',
          sound: 'default',
          ttl: VALIDADE_S,
        })),
    );
    for (let i = 0; i < mensagens.length; i += LOTE) {
      await enviarLote(env, db, mensagens.slice(i, i + LOTE));
    }
  } catch (erro) {
    console.error('notificação falhou', erro);
    registrarErro(erro);
  }
}

async function enviarLote(env: Env, db: Db, lote: MensagemExpo[]) {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  if (env.EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
  const r = await fetch(URL_EXPO, {
    method: 'POST',
    headers,
    body: JSON.stringify(lote),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Expo Push: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const { data: recibos = [] } = (await r.json()) as { data?: Recibo[] };

  // Os recibos vêm na mesma ordem das mensagens.
  const esquecer: string[] = [];
  recibos.forEach((recibo, i) => {
    if (recibo.status !== 'error') return;
    if (recibo.details?.error === 'DeviceNotRegistered') esquecer.push(lote[i]!.to);
    else console.warn('Expo Push recusou uma mensagem:', recibo.details?.error ?? recibo.message);
  });
  await esquecerDispositivos(db, esquecer);
}
