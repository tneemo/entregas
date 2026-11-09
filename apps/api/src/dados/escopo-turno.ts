// Turno do motoboy e recebimento de GPS. Mesma regra de escopo: tudo filtra por
// ctx.empresaId. LGPD: posição só é aceita com turno aberto nesta empresa, e um
// motoboy só tem um turno aberto por vez (garantido também por índice no banco).

import { and, count, eq, isNull, lt, notInArray } from 'drizzle-orm';
import { RETENCAO_POSICOES_DIAS, STATUS_FINAIS, type TurnoResposta, type schemaPosicoes } from '@entregas/shared';
import type { z } from 'zod';
import type { Db } from '../db/index.ts';
import { violouUnicidade } from '../db/index.ts';
import { empresas, pedidos, posicoes, turnos, vinculos } from '../db/schema.ts';
import type { ContextoEmpresa } from '../tipos.ts';
import { ErroApi } from '../erros.ts';

/** Tolerância para relógio do celular adiantado ou atrasado. */
const FOLGA_RELOGIO_MS = 2 * 60 * 1000;

interface TurnoFechado {
  empresaId: string;
  vinculoId: string;
}

export function escopoTurno(db: Db, ctx: ContextoEmpresa) {
  const { empresaId, usuarioId } = ctx;

  /** Turno aberto desta pessoa, em qualquer empresa. */
  const turnoAberto = () =>
    db
      .select({
        turno: turnos,
        nomeFantasia: empresas.nomeFantasia,
        statusEmpresa: empresas.status,
        statusVinculo: vinculos.status,
      })
      .from(turnos)
      .innerJoin(empresas, eq(empresas.id, turnos.empresaId))
      .innerJoin(vinculos, eq(vinculos.id, turnos.vinculoId))
      .where(and(eq(turnos.usuarioId, usuarioId), isNull(turnos.encerradoEm)))
      .get();

  async function situacao(): Promise<TurnoResposta> {
    const aberto = await turnoAberto();
    if (!aberto) return { turno: null, emOutraEmpresa: null };
    if (aberto.turno.empresaId === empresaId) {
      return {
        turno: { id: aberto.turno.id, iniciadoEm: aberto.turno.iniciadoEm.toISOString() },
        emOutraEmpresa: null,
      };
    }
    return { turno: null, emOutraEmpresa: { empresaId: aberto.turno.empresaId, nomeFantasia: aberto.nomeFantasia } };
  }

  return {
    situacao,

    /**
     * `turnoFechado`: turno esquecido em outra empresa que foi encerrado aqui, para
     * a central daquela empresa tirar o motoboy do mapa.
     */
    async iniciar(): Promise<{ resposta: TurnoResposta; turnoFechado: TurnoFechado | null }> {
      const aberto = await turnoAberto();
      if (aberto?.turno.empresaId === empresaId) return { resposta: await situacao(), turnoFechado: null };
      let turnoFechado: TurnoFechado | null = null;
      if (aberto) {
        // Turno esquecido numa empresa onde ele não pode mais trabalhar: fecha sozinho.
        if (aberto.statusEmpresa !== 'ativa' || aberto.statusVinculo !== 'ativo') {
          await db.update(turnos).set({ encerradoEm: new Date() }).where(eq(turnos.id, aberto.turno.id));
          turnoFechado = { empresaId: aberto.turno.empresaId, vinculoId: aberto.turno.vinculoId };
        } else {
          throw new ErroApi(
            409,
            'turno_em_outra_empresa',
            `Você está em turno na ${aberto.nomeFantasia}. Encerre aquele turno antes de começar aqui.`,
          );
        }
      }
      try {
        await db.insert(turnos).values({ empresaId, vinculoId: ctx.vinculoId, usuarioId, iniciadoEm: new Date() });
      } catch (erro) {
        if (violouUnicidade(erro)) {
          throw new ErroApi(409, 'turno_em_outra_empresa', 'Já existe um turno aberto. Atualize e tente de novo.');
        }
        throw erro;
      }
      return { resposta: await situacao(), turnoFechado };
    },

    async encerrar(): Promise<TurnoResposta> {
      const emAndamento = await db
        .select({ total: count() })
        .from(pedidos)
        .where(
          and(
            eq(pedidos.empresaId, empresaId),
            eq(pedidos.motoboyVinculoId, ctx.vinculoId),
            notInArray(pedidos.status, STATUS_FINAIS),
          ),
        )
        .get();
      const total = emAndamento?.total ?? 0;
      if (total > 0) {
        throw new ErroApi(
          409,
          'entregas_pendentes',
          `Você ainda tem ${total} ${total === 1 ? 'entrega' : 'entregas'} com você. Conclua, devolva ou recuse antes de encerrar o turno.`,
        );
      }
      await db
        .update(turnos)
        .set({ encerradoEm: new Date() })
        .where(and(eq(turnos.empresaId, empresaId), eq(turnos.usuarioId, usuarioId), isNull(turnos.encerradoEm)));
      return situacao();
    },

    /**
     * Recebe pontos acumulados no celular (podem chegar atrasados, quando volta o sinal).
     * `maisRecente` vai para o mapa ao vivo.
     */
    async registrarPosicoes(pontos: z.output<typeof schemaPosicoes>['pontos']) {
      const aberto = await turnoAberto();
      if (!aberto || aberto.turno.empresaId !== empresaId) {
        throw new ErroApi(409, 'sem_turno', 'Sem turno aberto nesta empresa: a localização não é registrada.');
      }
      const inicio = aberto.turno.iniciadoEm.getTime() - FOLGA_RELOGIO_MS;
      const agora = Date.now() + FOLGA_RELOGIO_MS;
      const validos = pontos.filter((p) => {
        const t = Date.parse(p.registradoEm);
        return t >= inicio && t <= agora;
      });
      if (validos.length > 0) {
        // Uma instrução por ponto: o D1 limita 100 parâmetros por instrução.
        const [primeiro, ...resto] = validos.map((p) =>
          db.insert(posicoes).values({
            empresaId,
            turnoId: aberto.turno.id,
            latitude: p.latitude,
            longitude: p.longitude,
            precisaoM: p.precisao ?? null,
            velocidadeMs: p.velocidade ?? null,
            registradoEm: new Date(p.registradoEm),
          }),
        );
        await db.batch([primeiro!, ...resto]);
      }
      const maisRecente = validos.reduce<(typeof validos)[number] | null>(
        (ultimo, p) => (!ultimo || Date.parse(p.registradoEm) > Date.parse(ultimo.registradoEm) ? p : ultimo),
        null,
      );
      return { recebidos: validos.length, descartados: pontos.length - validos.length, maisRecente };
    },
  };
}

/** Apaga pontos de GPS mais antigos que o prazo de retenção. Roda no cron diário. */
export async function expurgarPosicoes(db: Db, agora = new Date()) {
  const limite = new Date(agora.getTime() - RETENCAO_POSICOES_DIAS * 24 * 60 * 60 * 1000);
  const resultado = await db.delete(posicoes).where(lt(posicoes.registradoEm, limite)).run();
  return resultado.meta.changes;
}
