// Acompanhamento público do pedido pelo link /r/<token>, sem login.
//
// É a única leitura de pedido fora de um escopo de empresa: a autorização é o
// próprio token (128 bits aleatórios, impossível de adivinhar). Por isso a resposta
// traz só o que o destinatário precisa, nunca telefones, nomes completos ou outros
// pedidos, e o link expira RASTREIO_HORAS_APOS_CONCLUSAO depois que o pedido termina.

import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  RASTREIO_HORAS_APOS_CONCLUSAO,
  statusFinal,
  type RastreioResposta,
  type StatusPedido,
  type schemaAvaliacao,
} from '@entregas/shared';
import type { z } from 'zod';
import type { Db } from '../db/index.ts';
import { violouUnicidade } from '../db/index.ts';
import { avaliacoes, empresas, eventosPedido, paradas, pedidos, usuarios, vinculos } from '../db/schema.ts';
import { ErroApi, naoEncontrado } from '../erros.ts';

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** Com motoboy indo buscar ou levando: o destinatário vê o primeiro nome de quem vai chegar. */
const MOSTRA_MOTOBOY: readonly StatusPedido[] = ['aceito', 'coletando', 'em_rota', 'falhou'];

export interface Rastreio {
  resposta: RastreioResposta;
  /** Para abrir o WebSocket na central certa; não vai para o navegador. */
  interno: { empresaId: string; pedidoId: string; motoboyVinculoId: string | null };
}

export async function buscarRastreio(db: Db, token: string, agora = Date.now()): Promise<Rastreio> {
  if (!FORMATO_TOKEN.test(token)) throw naoEncontrado('Link de acompanhamento inválido.');

  const linha = await db
    .select({
      pedido: pedidos,
      empresa: { nomeFantasia: empresas.nomeFantasia, telefone: empresas.telefone, status: empresas.status },
      motoboyNome: usuarios.nome,
    })
    .from(pedidos)
    .innerJoin(empresas, eq(empresas.id, pedidos.empresaId))
    .leftJoin(vinculos, eq(vinculos.id, pedidos.motoboyVinculoId))
    .leftJoin(usuarios, eq(usuarios.id, vinculos.usuarioId))
    .where(eq(pedidos.tokenRastreio, token))
    .get();
  if (!linha || linha.empresa.status !== 'ativa') throw naoEncontrado('Link de acompanhamento inválido.');

  const p = linha.pedido;
  if (p.concluidoEm && agora - p.concluidoEm.getTime() > RASTREIO_HORAS_APOS_CONCLUSAO * 60 * 60 * 1000) {
    throw new ErroApi(410, 'rastreio_expirado', 'Este link de acompanhamento expirou.');
  }

  const [destino, saida, avaliacao] = await Promise.all([
    db
      .select({ endereco: paradas.endereco })
      .from(paradas)
      .where(and(eq(paradas.pedidoId, p.id), eq(paradas.empresaId, p.empresaId), eq(paradas.tipo, 'entrega')))
      .get(),
    db
      .select({ criadoEm: eventosPedido.criadoEm })
      .from(eventosPedido)
      .where(
        and(
          eq(eventosPedido.pedidoId, p.id),
          eq(eventosPedido.empresaId, p.empresaId),
          inArray(eventosPedido.acao, ['coletar', 'nova_tentativa']),
        ),
      )
      .orderBy(desc(eventosPedido.criadoEm))
      .get(),
    db
      .select({ nota: avaliacoes.nota, comentario: avaliacoes.comentario })
      .from(avaliacoes)
      .where(and(eq(avaliacoes.pedidoId, p.id), eq(avaliacoes.empresaId, p.empresaId)))
      .get(),
  ]);

  const terminou = statusFinal(p.status);
  const e = destino?.endereco;
  const motoboy =
    MOSTRA_MOTOBOY.includes(p.status) && linha.motoboyNome ? linha.motoboyNome.trim().split(/\s+/)[0]! : null;

  return {
    resposta: {
      empresa: { nomeFantasia: linha.empresa.nomeFantasia, telefone: linha.empresa.telefone },
      numero: p.numero,
      status: p.status,
      horarios: {
        recebido: p.criadoEm.toISOString(),
        saiuParaEntrega: saida?.criadoEm.toISOString() ?? null,
        concluido: p.concluidoEm?.toISOString() ?? null,
      },
      entrega:
        !terminou && e
          ? {
              logradouro: e.logradouro,
              numero: e.numero,
              ...(e.complemento ? { complemento: e.complemento } : {}),
              bairro: e.bairro,
              cidade: e.cidade,
              uf: e.uf,
            }
          : null,
      cobranca: terminou
        ? null
        : {
            formaPagamento: p.formaPagamento,
            valorACobrarCentavos: p.valorACobrarCentavos,
            trocoParaCentavos: p.trocoParaCentavos,
          },
      codigoEntrega: terminou || p.status === 'em_devolucao' ? null : p.codigoEntrega,
      motoboy: motoboy ? { primeiroNome: motoboy } : null,
      aoVivo: p.status === 'em_rota',
      destino:
        p.status === 'em_rota' && e?.localizacao
          ? { latitude: e.localizacao.latitude, longitude: e.localizacao.longitude }
          : null,
      podeAvaliar: p.status === 'entregue' && !avaliacao,
      avaliacao: avaliacao ?? null,
    },
    interno: { empresaId: p.empresaId, pedidoId: p.id, motoboyVinculoId: p.motoboyVinculoId },
  };
}

/**
 * Nota do destinatário pelo link. Só depois de entregue, uma vez por pedido, e enquanto o
 * link vale. Devolve o pedido para a central ser avisada em tempo real.
 */
export async function avaliarEntrega(db: Db, token: string, dados: z.output<typeof schemaAvaliacao>) {
  const { resposta, interno } = await buscarRastreio(db, token);
  if (resposta.status !== 'entregue') {
    throw new ErroApi(409, 'ainda_nao_entregue', 'A avaliação fica disponível depois que o pedido é entregue.');
  }
  try {
    await db.insert(avaliacoes).values({
      empresaId: interno.empresaId,
      pedidoId: interno.pedidoId,
      nota: dados.nota,
      comentario: dados.comentario ?? null,
    });
  } catch (erro) {
    if (violouUnicidade(erro)) throw new ErroApi(409, 'ja_avaliado', 'Este pedido já foi avaliado. Obrigado!');
    throw erro;
  }
  return interno;
}
