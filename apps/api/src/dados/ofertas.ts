// Despacho automático: oferece cada pedido sem motoboy ao melhor motoboy disponível, um de cada vez.
//
// É tarefa do sistema, como expirarAceites(): roda fora de uma requisição, chamada pelo
// CentralEmpresa (um por empresa, que serializa as rodadas e guarda o alarme do prazo).
// Toda consulta filtra pelo empresaId recebido, igual aos escopos.
//
// Ciclo de um pedido no modo automático:
//   pendente → (oferecer) atribuido, com prazo curto → motoboy aceita: segue o fluxo normal.
//                                                    → recusa ou deixa passar: volta a pendente,
//                                                      e a próxima rodada oferece a outro.
// Quem recusou ou deixou passar um pedido não recebe o mesmo pedido de novo. Sem ninguém
// disponível, o pedido fica na fila e a central vê no painel; a rodada se repete a cada 30 s.

import { and, asc, eq, inArray, isNotNull, min, sql } from 'drizzle-orm';
import { escolherParaOferta, type CandidatoOferta, type PosicaoCandidato } from '@entregas/shared';
import type { Db } from '../db/index.ts';
import {
  dispositivos,
  empresas,
  eventosPedido,
  lojas,
  paradas,
  pedidos,
  sessoes,
  turnos,
  usuarios,
  vinculos,
} from '../db/schema.ts';
import { eventoSeMudou } from './escopo-pedidos.ts';

/** Quantos pedidos da fila cada rodada tenta despachar. */
const LOTE = 20;

export interface Oferecido {
  pedidoId: string;
  numero: number;
  vinculoId: string;
  usuarioId: string;
  /** Bairro da coleta, para o texto da notificação (nada de nome ou telefone). */
  bairroColeta: string;
  /** Tempo para responder. */
  segundos: number;
}

export interface RodadaDespacho {
  /** O modo automático está ligado nesta empresa. */
  automatico: boolean;
  oferecidos: Oferecido[];
  /** Ainda há pedido sem motoboy: vale tentar de novo daqui a pouco (alguém pode ficar livre). */
  restamPendentes: boolean;
  /** Menor prazo de aceite em aberto na empresa: hora de conferir quem não respondeu. */
  proximoPrazo: Date | null;
}

const coordenadas = (e: { localizacao?: { latitude: number; longitude: number } } | null | undefined) =>
  e?.localizacao ? { latitude: e.localizacao.latitude, longitude: e.localizacao.longitude } : null;

async function menorPrazo(db: Db, empresaId: string): Promise<Date | null> {
  const linha = await db
    .select({ prazo: min(pedidos.aceiteAte) })
    .from(pedidos)
    .where(and(eq(pedidos.empresaId, empresaId), eq(pedidos.status, 'atribuido'), isNotNull(pedidos.aceiteAte)))
    .get();
  return linha?.prazo ?? null;
}

async function candidatos(db: Db, empresaId: string) {
  const agora = Date.now();
  return db
    .select({
      vinculoId: vinculos.id,
      usuarioId: vinculos.usuarioId,
      nome: usuarios.nome,
      lojaId: vinculos.lojaId,
      emTurno:
        sql<number>`EXISTS (SELECT 1 FROM ${turnos} WHERE ${turnos.vinculoId} = ${vinculos.id} AND ${turnos.encerradoEm} IS NULL)`.mapWith(
          Boolean,
        ),
      pedidosAtivos:
        sql<number>`(SELECT COUNT(*) FROM ${pedidos} WHERE ${pedidos.motoboyVinculoId} = ${vinculos.id} AND ${pedidos.status} NOT IN ('entregue', 'devolvido', 'cancelado'))`.mapWith(
          Number,
        ),
      ofertaPendente:
        sql<number>`EXISTS (SELECT 1 FROM ${pedidos} WHERE ${pedidos.motoboyVinculoId} = ${vinculos.id} AND ${pedidos.status} = 'atribuido')`.mapWith(
          Boolean,
        ),
      recebeNotificacao:
        sql<number>`EXISTS (SELECT 1 FROM ${dispositivos} INNER JOIN ${sessoes} ON ${sessoes.id} = ${dispositivos.sessaoId} WHERE ${dispositivos.usuarioId} = ${vinculos.usuarioId} AND ${sessoes.expiraEm} > ${agora})`.mapWith(
          Boolean,
        ),
    })
    .from(vinculos)
    .innerJoin(usuarios, eq(usuarios.id, vinculos.usuarioId))
    .where(and(eq(vinculos.empresaId, empresaId), eq(vinculos.papel, 'motoboy'), eq(vinculos.status, 'ativo')))
    .orderBy(asc(usuarios.nome))
    .all();
}

/**
 * Uma rodada de despacho automático de uma empresa. `posicoes`: última posição de cada
 * motoboy em turno (o CentralEmpresa guarda), para saber quem está perto da coleta.
 */
export async function despacharPendentes(
  db: Db,
  empresaId: string,
  posicoes: Readonly<Record<string, PosicaoCandidato | undefined>>,
  agora = new Date(),
): Promise<RodadaDespacho> {
  const empresa = await db
    .select({ modo: empresas.modoDespacho, segundos: empresas.ofertaSegundos, status: empresas.status })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .get();
  if (!empresa || empresa.status !== 'ativa' || empresa.modo !== 'automatico') {
    return { automatico: false, oferecidos: [], restamPendentes: false, proximoPrazo: null };
  }

  const fila = await db
    .select({ id: pedidos.id, numero: pedidos.numero, lojaId: pedidos.lojaId, coleta: paradas.endereco })
    .from(pedidos)
    .innerJoin(paradas, and(eq(paradas.pedidoId, pedidos.id), eq(paradas.ordem, 0)))
    .where(and(eq(pedidos.empresaId, empresaId), eq(pedidos.status, 'pendente')))
    .orderBy(asc(pedidos.criadoEm))
    .limit(LOTE)
    .all();
  if (fila.length === 0) {
    return { automatico: true, oferecidos: [], restamPendentes: false, proximoPrazo: await menorPrazo(db, empresaId) };
  }

  const [motoboys, lojasDaEmpresa, recusas] = await Promise.all([
    candidatos(db, empresaId),
    db.select({ id: lojas.id, transbordo: lojas.transbordo }).from(lojas).where(eq(lojas.empresaId, empresaId)).all(),
    db
      .select({ pedidoId: eventosPedido.pedidoId, usuarioId: eventosPedido.usuarioId })
      .from(eventosPedido)
      .where(
        and(
          eq(eventosPedido.empresaId, empresaId),
          inArray(
            eventosPedido.pedidoId,
            fila.map((p) => p.id),
          ),
          inArray(eventosPedido.acao, ['recusar', 'expirar_aceite']),
        ),
      )
      .all(),
  ]);

  const vinculoDoUsuario = new Map(motoboys.map((m) => [m.usuarioId, m.vinculoId]));
  const recusaram = new Map<string, Set<string>>();
  for (const r of recusas) {
    const vinculoId = vinculoDoUsuario.get(r.usuarioId);
    if (!vinculoId) continue;
    recusaram.set(r.pedidoId, (recusaram.get(r.pedidoId) ?? new Set()).add(vinculoId));
  }
  const transbordo = new Map(lojasDaEmpresa.map((l) => [l.id, l.transbordo]));
  const lojasComFixos = new Set(motoboys.flatMap((m) => (m.lojaId ? [m.lojaId] : [])));
  // Cópia mutável: quem recebe uma oferta nesta rodada não recebe outra.
  const disponiveis: (CandidatoOferta & { usuarioId: string })[] = motoboys.map((m) => ({ ...m }));

  const d1 = db.$client;
  const prazo = new Date(agora.getTime() + empresa.segundos * 1000);
  const tentativas: (Oferecido & { nome: string })[] = [];
  let semNinguem = 0;

  for (const p of fila) {
    const escolha = escolherParaOferta(
      {
        coleta: coordenadas(p.coleta),
        lojaId: p.lojaId,
        lojaTemFixos: Boolean(p.lojaId && lojasComFixos.has(p.lojaId)),
        transbordo: p.lojaId ? (transbordo.get(p.lojaId) ?? true) : true,
        recusaram: recusaram.get(p.id) ?? new Set(),
      },
      disponiveis,
      posicoes,
      agora.getTime(),
    );
    if (!escolha) {
      semNinguem++;
      continue;
    }
    const motoboy = disponiveis.find((m) => m.vinculoId === escolha.vinculoId)!;
    motoboy.ofertaPendente = true;
    motoboy.pedidosAtivos++;
    tentativas.push({
      pedidoId: p.id,
      numero: p.numero,
      vinculoId: motoboy.vinculoId,
      usuarioId: motoboy.usuarioId,
      nome: motoboy.nome,
      bairroColeta: p.coleta.bairro,
      segundos: empresa.segundos,
    });
  }

  let oferecidos: Oferecido[] = [];
  if (tentativas.length > 0) {
    const instrucoes = tentativas.flatMap((t) => {
      // Só oferece se o pedido ainda está na fila (a central pode ter atribuído nesse meio-tempo).
      const atualizar = db
        .update(pedidos)
        .set({
          status: 'atribuido',
          motoboyVinculoId: t.vinculoId,
          aceiteAte: prazo,
          ofertaAutomatica: true,
          atualizadoEm: agora,
        })
        .where(and(eq(pedidos.id, t.pedidoId), eq(pedidos.empresaId, empresaId), eq(pedidos.status, 'pendente')))
        .toSQL();
      return [
        d1.prepare(atualizar.sql).bind(...atualizar.params),
        eventoSeMudou(d1, {
          empresaId,
          pedidoId: t.pedidoId,
          acao: 'oferecer',
          de: 'pendente',
          para: 'atribuido',
          // O histórico exige uma pessoa: a oferta fica no nome de quem a recebeu.
          usuarioId: t.usuarioId,
          papel: 'motoboy',
          detalhe: t.nome,
          criadoEm: agora,
        }),
      ];
    });
    const resultados = await d1.batch(instrucoes);
    oferecidos = tentativas.filter((_, i) => resultados[i * 2]!.meta.changes === 1).map(({ nome: _nome, ...o }) => o);
  }

  return {
    automatico: true,
    oferecidos,
    restamPendentes: semNinguem > 0 || fila.length === LOTE,
    proximoPrazo: await menorPrazo(db, empresaId),
  };
}

/** Empresas no modo automático com pedido na fila: o cron de cada minuto acorda a central delas. */
export async function empresasComFilaAutomatica(db: Db): Promise<string[]> {
  const linhas = await db
    .selectDistinct({ empresaId: pedidos.empresaId })
    .from(pedidos)
    .innerJoin(empresas, eq(empresas.id, pedidos.empresaId))
    .where(and(eq(pedidos.status, 'pendente'), eq(empresas.modoDespacho, 'automatico'), eq(empresas.status, 'ativa')))
    .limit(200)
    .all();
  return linhas.map((l) => l.empresaId);
}
