// Indicadores da operação de uma empresa: o que está acontecendo agora e como foi o
// período. Mesma regra dos outros escopos: toda consulta filtra por ctx.empresaId.
// Tudo sai em uma ida ao banco (batch do D1).

import { and, avg, count, eq, gte, inArray, isNull, lt, notInArray, sql, sum } from 'drizzle-orm';
import {
  FORMAS_PAGAMENTO,
  GRUPOS_STATUS,
  STATUS_FINAIS,
  type IndicadoresResposta,
  type PeriodoIndicadores,
  type StatusPedido,
} from '@entregas/shared';
import type { Db } from '../db/index.ts';
import { avaliacoes, pedidos, turnos, usuarios, vinculos } from '../db/schema.ts';
import type { ContextoEmpresa } from '../tipos.ts';
import { DIA_MS, FUSO_MS, diaLocal, inicioDoDia } from './fuso.ts';

const minutos = (ms: number | string | null) => (ms === null ? null : Math.round(Number(ms) / 60_000));
const umaCasa = (n: number | string | null) => (n === null ? null : Math.round(Number(n) * 10) / 10);

export function escopoIndicadores(db: Db, ctx: ContextoEmpresa) {
  const { empresaId } = ctx;

  return {
    /** `dias` conta hoje: 1 = só hoje, 7 = hoje e os seis dias anteriores. */
    async resumo(dias: PeriodoIndicadores, agora = Date.now()): Promise<IndicadoresResposta> {
      const fim = inicioDoDia(diaLocal(agora)) + DIA_MS;
      const inicio = fim - dias * DIA_MS;
      const inicioAnterior = inicio - dias * DIA_MS;

      const concluidosEntre = (de: number, ate: number) =>
        and(
          eq(pedidos.empresaId, empresaId),
          gte(pedidos.concluidoEm, new Date(de)),
          lt(pedidos.concluidoEm, new Date(ate)),
        );
      const noPeriodo = concluidosEntre(inicio, fim);
      const duracao = sql<number>`${pedidos.concluidoEm} - ${pedidos.criadoEm}`;
      // Dia e hora locais, calculados no banco para agrupar.
      const segundosLocais = (coluna: typeof pedidos.concluidoEm | typeof pedidos.criadoEm) =>
        sql`(${coluna} + ${FUSO_MS}) / 1000`;
      const dia = sql<string>`strftime('%Y-%m-%d', ${segundosLocais(pedidos.concluidoEm)}, 'unixepoch')`;
      const hora = sql<string>`strftime('%H', ${segundosLocais(pedidos.criadoEm)}, 'unixepoch')`;

      const [porStatus, anterior, porDia, porHora, porMotoboy, notasPorMotoboy, porForma, notas, ativos, emTurno] =
        await db.batch([
          db
            .select({
              status: pedidos.status,
              total: count(),
              duracaoMedia: avg(duracao),
              valor: sum(pedidos.valorACobrarCentavos),
              taxas: sum(pedidos.taxaEntregaCentavos),
            })
            .from(pedidos)
            .where(noPeriodo)
            .groupBy(pedidos.status),
          db
            .select({ total: count(), duracaoMedia: avg(duracao) })
            .from(pedidos)
            .where(and(concluidosEntre(inicioAnterior, inicio), eq(pedidos.status, 'entregue'))),
          db
            .select({ dia, status: pedidos.status, total: count() })
            .from(pedidos)
            .where(noPeriodo)
            .groupBy(dia, pedidos.status),
          db
            .select({ hora, total: count() })
            .from(pedidos)
            .where(
              and(
                eq(pedidos.empresaId, empresaId),
                gte(pedidos.criadoEm, new Date(inicio)),
                lt(pedidos.criadoEm, new Date(fim)),
              ),
            )
            .groupBy(hora),
          db
            .select({
              vinculoId: vinculos.id,
              nome: usuarios.nome,
              status: pedidos.status,
              total: count(),
              duracaoMedia: avg(duracao),
            })
            .from(pedidos)
            .innerJoin(vinculos, and(eq(vinculos.id, pedidos.motoboyVinculoId), eq(vinculos.empresaId, empresaId)))
            .innerJoin(usuarios, eq(usuarios.id, vinculos.usuarioId))
            .where(and(noPeriodo, inArray(pedidos.status, ['entregue', 'devolvido'])))
            .groupBy(vinculos.id, usuarios.nome, pedidos.status),
          db
            .select({ vinculoId: pedidos.motoboyVinculoId, media: avg(avaliacoes.nota), total: count() })
            .from(avaliacoes)
            .innerJoin(pedidos, and(eq(pedidos.id, avaliacoes.pedidoId), eq(pedidos.empresaId, empresaId)))
            .where(and(eq(avaliacoes.empresaId, empresaId), noPeriodo))
            .groupBy(pedidos.motoboyVinculoId),
          db
            .select({ forma: pedidos.formaPagamento, total: count(), valor: sum(pedidos.valorACobrarCentavos) })
            .from(pedidos)
            .where(and(noPeriodo, eq(pedidos.status, 'entregue')))
            .groupBy(pedidos.formaPagamento),
          db
            .select({ nota: avaliacoes.nota, total: count() })
            .from(avaliacoes)
            .innerJoin(pedidos, and(eq(pedidos.id, avaliacoes.pedidoId), eq(pedidos.empresaId, empresaId)))
            .where(and(eq(avaliacoes.empresaId, empresaId), noPeriodo))
            .groupBy(avaliacoes.nota),
          db
            .select({ status: pedidos.status, total: count() })
            .from(pedidos)
            .where(and(eq(pedidos.empresaId, empresaId), notInArray(pedidos.status, STATUS_FINAIS)))
            .groupBy(pedidos.status),
          db
            .select({ total: count() })
            .from(turnos)
            .where(and(eq(turnos.empresaId, empresaId), isNull(turnos.encerradoEm))),
        ]);

      const doStatus = (status: StatusPedido) => porStatus.find((l) => l.status === status);
      const entregues = doStatus('entregue')?.total ?? 0;
      const devolvidos = doStatus('devolvido')?.total ?? 0;

      const ativosDe = (grupo: readonly StatusPedido[]) =>
        ativos.filter((l) => grupo.includes(l.status)).reduce((soma, l) => soma + l.total, 0);

      // Todos os dias do período aparecem, mesmo os sem movimento.
      const dias_ = Array.from({ length: dias }, (_, i) => diaLocal(inicio + i * DIA_MS + DIA_MS / 2));
      const totalDeNotas = notas.reduce((soma, l) => soma + l.total, 0);

      const motoboys = new Map<string, IndicadoresResposta['motoboys'][number]>();
      for (const l of porMotoboy) {
        const m = motoboys.get(l.vinculoId) ?? {
          vinculoId: l.vinculoId,
          nome: l.nome,
          entregues: 0,
          devolvidos: 0,
          tempoMedioMin: null,
          notaMedia: null,
          avaliacoes: 0,
        };
        if (l.status === 'entregue') {
          m.entregues = l.total;
          m.tempoMedioMin = minutos(l.duracaoMedia);
        } else {
          m.devolvidos = l.total;
        }
        motoboys.set(l.vinculoId, m);
      }
      for (const l of notasPorMotoboy) {
        const m = l.vinculoId ? motoboys.get(l.vinculoId) : undefined;
        if (!m) continue;
        m.notaMedia = umaCasa(l.media);
        m.avaliacoes = l.total;
      }

      return {
        periodo: { dias, inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString() },
        agora: {
          emAndamento: ativos.reduce((soma, l) => soma + l.total, 0),
          semMotoboy: ativosDe(GRUPOS_STATUS.sem_motoboy),
          emRota: ativosDe(GRUPOS_STATUS.em_rota),
          atencao: ativosDe(GRUPOS_STATUS.atencao),
          motoboysEmTurno: emTurno[0]?.total ?? 0,
        },
        totais: {
          entregues,
          devolvidos,
          cancelados: doStatus('cancelado')?.total ?? 0,
          taxaSucesso: entregues + devolvidos > 0 ? entregues / (entregues + devolvidos) : null,
          tempoMedioEntregaMin: minutos(doStatus('entregue')?.duracaoMedia ?? null),
          valorCobradoCentavos: Number(doStatus('entregue')?.valor ?? 0),
          taxasEntregaCentavos: Number(doStatus('entregue')?.taxas ?? 0),
        },
        anterior: {
          entregues: anterior[0]?.total ?? 0,
          tempoMedioEntregaMin: minutos(anterior[0]?.duracaoMedia ?? null),
        },
        porDia: dias_.map((d) => {
          const doDia = porDia.filter((l) => l.dia === d);
          const feitos = doDia.find((l) => l.status === 'entregue')?.total ?? 0;
          // Cancelado não é entrega que falhou: fica fora do gráfico.
          return { dia: d, entregues: feitos, naoEntregues: doDia.find((l) => l.status === 'devolvido')?.total ?? 0 };
        }),
        porHora: Array.from({ length: 24 }, (_, h) => ({
          hora: h,
          pedidos: porHora.find((l) => Number(l.hora) === h)?.total ?? 0,
        })),
        motoboys: [...motoboys.values()].sort(
          (a, b) => b.entregues - a.entregues || a.nome.localeCompare(b.nome, 'pt-BR'),
        ),
        pagamentos: FORMAS_PAGAMENTO.flatMap((forma) => {
          const l = porForma.find((x) => x.forma === forma);
          return l ? [{ forma, pedidos: l.total, valorCentavos: Number(l.valor ?? 0) }] : [];
        }),
        avaliacoes: {
          media:
            totalDeNotas > 0 ? umaCasa(notas.reduce((soma, l) => soma + l.nota * l.total, 0) / totalDeNotas) : null,
          total: totalDeNotas,
          porNota: [1, 2, 3, 4, 5].map((n) => notas.find((l) => l.nota === n)?.total ?? 0),
        },
      };
    },
  };
}
