// Pedidos de uma empresa. Mesma regra de escopo-empresa.ts: tudo filtra por
// ctx.empresaId. Além disso, o motoboy só enxerga os pedidos atribuídos a ele
// que ainda estão em andamento, e nunca recebe o código de entrega.
// A exceção é expirarAceites(), tarefa do sistema que roda para todas as empresas.

import { and, asc, count, desc, eq, gte, inArray, lt, lte, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  FOTO_DA_ACAO,
  MAX_TENTATIVAS_CODIGO,
  ROTULOS_STATUS,
  STATUS_FINAIS,
  TRANSICOES,
  acoesPermitidas,
  atorDoPapel,
  caminhoRastreio,
  fotoObrigatoria,
  statusFinal,
  type AcaoPedido,
  type ClienteResposta,
  type FotoResposta,
  type MotoboyResumo,
  type PedidoDetalhe,
  type PedidoResumo,
  type RegrasEntrega,
  type StatusPedido,
  type TipoFoto,
  type schemaAcaoPedidoComPosicao,
  type schemaCriarPedido,
} from '@entregas/shared';
import type { z } from 'zod';
import type { Db } from '../db/index.ts';
import { clientes, empresas, eventosPedido, fotosPedido, paradas, pedidos, turnos, usuarios, vinculos } from '../db/schema.ts';
import type { ContextoEmpresa } from '../tipos.ts';
import { ErroApi, camposInvalidos, naoEncontrado, proibido } from '../erros.ts';
import { gerarToken } from '../auth/cripto.ts';

type DadosCriar = z.output<typeof schemaCriarPedido>;
type DadosAcao = z.output<typeof schemaAcaoPedidoComPosicao>;

/** Assinaturas dos formatos aceitos: não basta o cabeçalho dizer que é imagem. */
const ASSINATURAS: Record<string, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
};
const EXTENSAO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export type Situacao = 'ativos' | 'concluidos';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Início do dia em Cascavel (UTC-3, sem horário de verão desde 2019). */
function inicioDoDia(dia?: string): number {
  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return Date.parse(`${dia ?? hoje}T00:00:00-03:00`);
}

function gerarCodigo(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String(n! % 10_000).padStart(4, '0');
}

function prazoDeAceite(regras: RegrasEntrega, agora: Date): Date | null {
  return regras.prazoAceiteMin ? new Date(agora.getTime() + regras.prazoAceiteMin * 60_000) : null;
}

interface NovoEvento {
  empresaId: string;
  pedidoId: string;
  acao: AcaoPedido;
  de: StatusPedido;
  para: StatusPedido;
  usuarioId: string;
  papel: ContextoEmpresa['papel'];
  motivo?: string | null;
  detalhe?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  criadoEm: Date;
}

/**
 * Evento do histórico que só é gravado se a instrução anterior do mesmo batch mudou
 * exatamente uma linha. O batch do D1 é uma transação e changes() olha a instrução
 * anterior, então a mudança de status e o evento acontecem juntos ou não acontecem.
 * (O Drizzle não aceita SQL bruto dentro de batch no D1, por isso o cliente direto.)
 */
function eventoSeMudou(d1: D1Database, e: NovoEvento) {
  return d1
    .prepare(
      `INSERT INTO eventos_pedido (id, empresa_id, pedido_id, acao, de, para, usuario_id, papel, motivo, detalhe, latitude, longitude, criado_em)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
    )
    .bind(
      crypto.randomUUID(),
      e.empresaId,
      e.pedidoId,
      e.acao,
      e.de,
      e.para,
      e.usuarioId,
      e.papel,
      e.motivo ?? null,
      e.detalhe ?? null,
      e.latitude ?? null,
      e.longitude ?? null,
      e.criadoEm.getTime(),
    );
}

/**
 * Cron de cada minuto: pedido atribuído cujo prazo de aceite acabou volta para a fila
 * sem motoboy. O evento fica no nome do motoboy que não respondeu. Devolve os pedidos
 * que voltaram, para avisar o tempo real de cada empresa.
 */
export async function expirarAceites(db: Db, agora = new Date()) {
  const vencidos = await db
    .select({ id: pedidos.id, empresaId: pedidos.empresaId, usuarioId: vinculos.usuarioId })
    .from(pedidos)
    .innerJoin(vinculos, eq(vinculos.id, pedidos.motoboyVinculoId))
    .where(and(eq(pedidos.status, 'atribuido'), lte(pedidos.aceiteAte, agora)))
    .limit(50)
    .all();
  if (vencidos.length === 0) return [];

  const d1 = db.$client;
  const instrucoes = vencidos.flatMap((p) => {
    // As condições se repetem: se a central trocou o motoboy nesse meio-tempo, o prazo é outro.
    const atualizar = db
      .update(pedidos)
      .set({ status: 'pendente', motoboyVinculoId: null, aceiteAte: null, atualizadoEm: agora })
      .where(
        and(
          eq(pedidos.id, p.id),
          eq(pedidos.empresaId, p.empresaId),
          eq(pedidos.status, 'atribuido'),
          lte(pedidos.aceiteAte, agora),
        ),
      )
      .toSQL();
    return [
      d1.prepare(atualizar.sql).bind(...atualizar.params),
      eventoSeMudou(d1, {
        empresaId: p.empresaId,
        pedidoId: p.id,
        acao: 'expirar_aceite',
        de: 'atribuido',
        para: 'pendente',
        usuarioId: p.usuarioId,
        papel: 'motoboy',
        criadoEm: agora,
      }),
    ];
  });
  const resultados = await d1.batch(instrucoes);
  return vencidos
    .filter((_, i) => resultados[i * 2]!.meta.changes === 1)
    .map((p) => ({ empresaId: p.empresaId, pedidoId: p.id }));
}

export function escopoPedidos(db: Db, ctx: ContextoEmpresa) {
  const { empresaId } = ctx;
  const ator = atorDoPapel(ctx.papel);
  const ehMotoboy = ator === 'motoboy';

  const visiveis = () =>
    and(
      eq(pedidos.empresaId, empresaId),
      ehMotoboy
        ? and(eq(pedidos.motoboyVinculoId, ctx.vinculoId), notInArray(pedidos.status, STATUS_FINAIS))
        : undefined,
    );

  const destino = alias(paradas, 'destino');
  const usuarioMotoboy = alias(usuarios, 'usuario_motoboy');

  const selecaoResumo = {
    pedido: pedidos,
    destinoNome: destino.nome,
    destinoEndereco: destino.endereco,
    motoboyNome: usuarioMotoboy.nome,
  };

  const consultaResumo = () =>
    db
      .select(selecaoResumo)
      .from(pedidos)
      .innerJoin(destino, and(eq(destino.pedidoId, pedidos.id), eq(destino.ordem, 1)))
      .leftJoin(vinculos, eq(vinculos.id, pedidos.motoboyVinculoId))
      .leftJoin(usuarioMotoboy, eq(usuarioMotoboy.id, vinculos.usuarioId));

  type LinhaResumo = Awaited<ReturnType<ReturnType<typeof consultaResumo>['all']>>[number];

  const paraResumo = ({ pedido: p, destinoNome, destinoEndereco: e, motoboyNome }: LinhaResumo): PedidoResumo => ({
    id: p.id,
    numero: p.numero,
    status: p.status,
    criadoEm: p.criadoEm.toISOString(),
    atualizadoEm: p.atualizadoEm.toISOString(),
    concluidoEm: p.concluidoEm?.toISOString() ?? null,
    destino: { nome: destinoNome, bairro: e.bairro, logradouro: e.logradouro, numero: e.numero },
    motoboy: p.motoboyVinculoId && motoboyNome ? { vinculoId: p.motoboyVinculoId, nome: motoboyNome } : null,
    formaPagamento: p.formaPagamento,
    valorACobrarCentavos: p.valorACobrarCentavos,
    aceiteAte: p.aceiteAte?.toISOString() ?? null,
  });

  async function regras(): Promise<RegrasEntrega> {
    const linha = await db
      .select({ fotoEntregaObrigatoria: empresas.fotoEntregaObrigatoria, prazoAceiteMin: empresas.prazoAceiteMin })
      .from(empresas)
      .where(eq(empresas.id, empresaId))
      .get();
    return linha ?? { fotoEntregaObrigatoria: false, prazoAceiteMin: null };
  }

  /** Confere se o vínculo é de um motoboy ativo desta empresa. */
  async function motoboyValido(vinculoId: string | undefined) {
    const motoboy = vinculoId
      ? await db
          .select({ id: vinculos.id, nome: usuarios.nome })
          .from(vinculos)
          .innerJoin(usuarios, eq(usuarios.id, vinculos.usuarioId))
          .where(
            and(
              eq(vinculos.id, vinculoId),
              eq(vinculos.empresaId, empresaId),
              eq(vinculos.papel, 'motoboy'),
              eq(vinculos.status, 'ativo'),
            ),
          )
          .get()
      : undefined;
    if (!motoboy) throw camposInvalidos({ motoboyVinculoId: ['Escolha um motoboy ativo da empresa.'] });
    return motoboy;
  }

  /**
   * `logoAposAcao`: resposta a uma ação que o próprio motoboy acabou de fazer (entregar,
   * recusar). O pedido sai da visão dele, mas ele precisa ver o resultado do que fez.
   */
  async function detalhe(pedidoId: string, logoAposAcao = false): Promise<PedidoDetalhe> {
    const filtro = logoAposAcao ? eq(pedidos.empresaId, empresaId) : visiveis();
    const linha = await consultaResumo().where(and(filtro, eq(pedidos.id, pedidoId))).get();
    if (!linha) throw naoEncontrado('Pedido não encontrado.');

    const [pontos, eventos, fotos, regrasEmpresa] = await Promise.all([
      db
        .select()
        .from(paradas)
        .where(and(eq(paradas.pedidoId, pedidoId), eq(paradas.empresaId, empresaId)))
        .orderBy(asc(paradas.ordem))
        .all(),
      db
        .select({ evento: eventosPedido, autor: usuarios.nome })
        .from(eventosPedido)
        .innerJoin(usuarios, eq(usuarios.id, eventosPedido.usuarioId))
        .where(and(eq(eventosPedido.pedidoId, pedidoId), eq(eventosPedido.empresaId, empresaId)))
        .orderBy(asc(eventosPedido.criadoEm))
        .all(),
      db
        .select()
        .from(fotosPedido)
        .where(and(eq(fotosPedido.pedidoId, pedidoId), eq(fotosPedido.empresaId, empresaId)))
        .orderBy(asc(fotosPedido.criadoEm))
        .all(),
      // A foto só é exigida do motoboy; a central registra sem foto (ex.: ele ligou).
      ehMotoboy ? regras() : null,
    ]);

    const p = linha.pedido;
    const parada = (tipo: 'coleta' | 'entrega') => {
      const x = pontos.find((ponto) => ponto.tipo === tipo)!;
      return { tipo, nome: x.nome, telefone: x.telefone, endereco: x.endereco };
    };
    const codigoBloqueado = p.tentativasCodigo >= MAX_TENTATIVAS_CODIGO;
    let acoes = acoesPermitidas(p.status, ator);
    // Código bloqueado: nem com código nem sem ele; só a central confirma.
    if (ehMotoboy && codigoBloqueado) acoes = acoes.filter((a) => a !== 'entregar' && a !== 'entregar_sem_codigo');

    return {
      ...paraResumo(linha),
      coleta: parada('coleta'),
      entrega: parada('entrega'),
      trocoParaCentavos: p.trocoParaCentavos,
      taxaEntregaCentavos: p.taxaEntregaCentavos,
      observacoes: p.observacoes,
      motivo: p.motivo,
      ...(ehMotoboy ? {} : { codigoEntrega: p.codigoEntrega, rastreio: { caminho: caminhoRastreio(p.tokenRastreio) } }),
      codigoBloqueado,
      acoes,
      fotoObrigatoria: regrasEmpresa ? acoes.filter((a) => fotoObrigatoria(a, regrasEmpresa)) : [],
      eventos: eventos.map(({ evento: e, autor }) => ({
        id: e.id,
        acao: e.acao,
        de: e.de,
        para: e.para,
        autor,
        papel: e.papel,
        motivo: e.motivo,
        detalhe: e.detalhe,
        criadoEm: e.criadoEm.toISOString(),
      })),
      fotos: fotos.map(
        (f): FotoResposta => ({
          id: f.id,
          tipo: f.tipo,
          criadoEm: f.criadoEm.toISOString(),
          url: `/api/v1/empresas/${empresaId}/pedidos/${pedidoId}/fotos/${f.id}`,
        }),
      ),
    };
  }

  return {
    async listar(situacao: Situacao, dia?: string): Promise<PedidoResumo[]> {
      const inicio = inicioDoDia(dia);
      const filtro =
        situacao === 'ativos'
          ? notInArray(pedidos.status, STATUS_FINAIS)
          : and(
              inArray(pedidos.status, STATUS_FINAIS),
              gte(pedidos.concluidoEm, new Date(inicio)),
              lt(pedidos.concluidoEm, new Date(inicio + DIA_MS)),
            );
      const linhas = await consultaResumo()
        .where(and(visiveis(), filtro))
        .orderBy(situacao === 'ativos' ? asc(pedidos.numero) : desc(pedidos.concluidoEm))
        .limit(300)
        .all();
      return linhas.map(paraResumo);
    },

    detalhe: (pedidoId: string) => detalhe(pedidoId),

    async criar(dados: DadosCriar): Promise<PedidoDetalhe> {
      if (ehMotoboy) throw proibido();
      const motoboy = dados.motoboyVinculoId ? await motoboyValido(dados.motoboyVinculoId) : null;

      // Guarda o destinatário para preencher o próximo pedido pelo telefone.
      const cliente = await db
        .insert(clientes)
        .values({ empresaId, nome: dados.entrega.nome, telefone: dados.entrega.telefone, endereco: dados.entrega.endereco })
        .onConflictDoUpdate({
          target: [clientes.empresaId, clientes.telefone],
          set: { nome: dados.entrega.nome, endereco: dados.entrega.endereco, atualizadoEm: new Date() },
        })
        .returning({ id: clientes.id })
        .get();

      const pedidoId = crypto.randomUUID();
      const status: StatusPedido = motoboy ? 'atribuido' : 'pendente';
      const aceiteAte = motoboy ? prazoDeAceite(await regras(), new Date()) : null;
      const evento = { empresaId, pedidoId, usuarioId: ctx.usuarioId, papel: ctx.papel };

      await db.batch([
        db.insert(pedidos).values({
          id: pedidoId,
          empresaId,
          // Atômico: o D1 executa uma instrução por vez.
          numero: sql`(SELECT COALESCE(MAX(${pedidos.numero}), 0) + 1 FROM ${pedidos} WHERE ${pedidos.empresaId} = ${empresaId})`,
          status,
          motoboyVinculoId: motoboy?.id ?? null,
          aceiteAte,
          clienteId: cliente.id,
          formaPagamento: dados.formaPagamento,
          valorACobrarCentavos: dados.valorACobrarCentavos,
          trocoParaCentavos: dados.trocoParaCentavos ?? null,
          taxaEntregaCentavos: dados.taxaEntregaCentavos,
          observacoes: dados.observacoes ?? null,
          codigoEntrega: gerarCodigo(),
          tokenRastreio: gerarToken(16),
          criadoPor: ctx.usuarioId,
        }),
        db.insert(paradas).values([
          { empresaId, pedidoId, ordem: 0, tipo: 'coleta', nome: dados.coleta.nome ?? null, telefone: dados.coleta.telefone ?? null, endereco: dados.coleta.endereco },
          { empresaId, pedidoId, ordem: 1, tipo: 'entrega', nome: dados.entrega.nome, telefone: dados.entrega.telefone, endereco: dados.entrega.endereco },
        ]),
        db.insert(eventosPedido).values([
          { ...evento, acao: 'criar', de: null, para: 'pendente' },
          ...(motoboy
            ? [{ ...evento, acao: 'atribuir' as const, de: 'pendente' as const, para: 'atribuido' as const, detalhe: motoboy.nome }]
            : []),
        ]),
      ]);
      return detalhe(pedidoId);
    },

    async executar(pedidoId: string, acao: AcaoPedido, dados: DadosAcao): Promise<PedidoDetalhe> {
      const pedido = await db
        .select()
        .from(pedidos)
        .where(and(visiveis(), eq(pedidos.id, pedidoId)))
        .get();
      if (!pedido) throw naoEncontrado('Pedido não encontrado.');

      const transicao = TRANSICOES[acao];
      if (!(transicao.quem as readonly string[]).includes(ator)) throw proibido();
      if (!(transicao.de as readonly StatusPedido[]).includes(pedido.status)) {
        throw new ErroApi(
          409,
          'acao_invalida',
          `Não é possível "${transicao.rotulo.toLowerCase()}" com o pedido em "${ROTULOS_STATUS[pedido.status].toLowerCase()}".`,
        );
      }

      const exige = 'exige' in transicao ? transicao.exige : undefined;
      if (exige === 'motivo' && !dados.motivo) {
        throw camposInvalidos({
          motivo: [acao === 'entregar_sem_codigo' ? 'Diga com quem ou onde ficou.' : 'Descreva o motivo.'],
        });
      }

      const codigoBloqueado = ehMotoboy && pedido.tentativasCodigo >= MAX_TENTATIVAS_CODIGO;
      if (codigoBloqueado && (acao === 'entregar' || acao === 'entregar_sem_codigo')) {
        throw new ErroApi(423, 'codigo_bloqueado', 'Código bloqueado após várias tentativas. Fale com a central.');
      }

      const regrasEmpresa = ehMotoboy || transicao.para === 'atribuido' ? await regras() : null;
      if (ehMotoboy && regrasEmpresa && fotoObrigatoria(acao, regrasEmpresa)) {
        const tipo = FOTO_DA_ACAO[acao as keyof typeof FOTO_DA_ACAO];
        // Vale a foto desta etapa: enviada depois da última mudança de status do pedido.
        const foto = await db
          .select({ id: fotosPedido.id })
          .from(fotosPedido)
          .where(
            and(
              eq(fotosPedido.pedidoId, pedido.id),
              eq(fotosPedido.empresaId, empresaId),
              eq(fotosPedido.tipo, tipo),
              gte(
                fotosPedido.criadoEm,
                sql`(SELECT MAX(${eventosPedido.criadoEm}) FROM ${eventosPedido} WHERE ${eventosPedido.pedidoId} = ${pedido.id} AND ${eventosPedido.empresaId} = ${empresaId})`,
              ),
            ),
          )
          .get();
        if (!foto) {
          throw new ErroApi(
            422,
            'foto_obrigatoria',
            acao === 'falhar' ? 'Tire uma foto do local antes de registrar.' : 'Tire a foto do comprovante antes de confirmar.',
          );
        }
      }

      let motoboyVinculoId = pedido.motoboyVinculoId;
      let detalheEvento: string | null = null;
      if (exige === 'motoboy') {
        const motoboy = await motoboyValido(dados.motoboyVinculoId);
        motoboyVinculoId = motoboy.id;
        detalheEvento = motoboy.nome;
      }
      if (transicao.para === 'pendente') motoboyVinculoId = null;

      if (exige === 'codigo') {
        if (!dados.codigo) throw camposInvalidos({ codigo: ['Informe o código de 4 dígitos do cliente.'] });
        if (dados.codigo !== pedido.codigoEntrega) {
          await db
            .update(pedidos)
            .set({ tentativasCodigo: sql`${pedidos.tentativasCodigo} + 1` })
            .where(and(eq(pedidos.id, pedido.id), eq(pedidos.empresaId, empresaId)));
          const restantes = MAX_TENTATIVAS_CODIGO - pedido.tentativasCodigo - 1;
          throw camposInvalidos(
            { codigo: ['Código incorreto.'] },
            ehMotoboy && restantes > 0
              ? `Código incorreto. Restam ${restantes} tentativa(s).`
              : 'Código incorreto. Confira com o cliente.',
          );
        }
      }

      const agora = new Date();
      // Só muda se ninguém alterou o pedido desde a leitura acima.
      const atualizar = db
        .update(pedidos)
        .set({
          status: transicao.para,
          motoboyVinculoId,
          motivo: dados.motivo ?? pedido.motivo,
          // Toda nova atribuição recomeça o prazo; qualquer outra mudança o encerra.
          aceiteAte: transicao.para === 'atribuido' && regrasEmpresa ? prazoDeAceite(regrasEmpresa, agora) : null,
          concluidoEm: statusFinal(transicao.para) ? agora : null,
          atualizadoEm: agora,
        })
        .where(and(eq(pedidos.id, pedido.id), eq(pedidos.empresaId, empresaId), eq(pedidos.status, pedido.status)))
        .toSQL();
      const d1 = db.$client;
      const [resultado] = await d1.batch([
        d1.prepare(atualizar.sql).bind(...atualizar.params),
        eventoSeMudou(d1, {
          empresaId,
          pedidoId: pedido.id,
          acao,
          de: pedido.status,
          para: transicao.para,
          usuarioId: ctx.usuarioId,
          papel: ctx.papel,
          motivo: dados.motivo,
          detalhe: detalheEvento,
          latitude: dados.latitude,
          longitude: dados.longitude,
          criadoEm: agora,
        }),
      ]);
      if (resultado!.meta.changes !== 1) {
        throw new ErroApi(409, 'pedido_mudou', 'O pedido acabou de mudar de situação. Atualize a tela e tente de novo.');
      }
      return detalhe(pedido.id, true);
    },

    async motoboys(): Promise<MotoboyResumo[]> {
      return db
        .select({
          vinculoId: vinculos.id,
          nome: usuarios.nome,
          telefone: usuarios.telefone,
          pedidosAtivos: count(pedidos.id),
          emTurno: sql<number>`EXISTS (SELECT 1 FROM ${turnos} WHERE ${turnos.vinculoId} = ${vinculos.id} AND ${turnos.encerradoEm} IS NULL)`.mapWith(Boolean).as('em_turno'),
        })
        .from(vinculos)
        .innerJoin(usuarios, eq(usuarios.id, vinculos.usuarioId))
        .leftJoin(
          pedidos,
          and(eq(pedidos.motoboyVinculoId, vinculos.id), notInArray(pedidos.status, STATUS_FINAIS)),
        )
        .where(and(eq(vinculos.empresaId, empresaId), eq(vinculos.papel, 'motoboy'), eq(vinculos.status, 'ativo')))
        .groupBy(vinculos.id, usuarios.nome, usuarios.telefone)
        // Quem está em turno aparece primeiro na hora de despachar.
        .orderBy(sql`em_turno DESC`, asc(usuarios.nome))
        .all() as Promise<MotoboyResumo[]>;
    },

    async enviarFoto(
      bucket: R2Bucket,
      pedidoId: string,
      tipo: TipoFoto,
      tipoConteudo: string,
      corpo: ArrayBuffer,
    ): Promise<FotoResposta> {
      const pedido = await db
        .select({ id: pedidos.id })
        .from(pedidos)
        .where(and(visiveis(), eq(pedidos.id, pedidoId)))
        .get();
      if (!pedido) throw naoEncontrado('Pedido não encontrado.');

      const confere = ASSINATURAS[tipoConteudo];
      if (!confere || !confere(new Uint8Array(corpo.slice(0, 12)))) {
        throw new ErroApi(415, 'imagem_invalida', 'Envie uma foto em JPEG, PNG ou WebP.');
      }

      const id = crypto.randomUUID();
      const chave = `empresas/${empresaId}/pedidos/${pedidoId}/${id}.${EXTENSAO[tipoConteudo]}`;
      await bucket.put(chave, corpo, { httpMetadata: { contentType: tipoConteudo } });
      const foto = await db
        .insert(fotosPedido)
        .values({ id, empresaId, pedidoId, tipo, chave, tipoConteudo, tamanhoBytes: corpo.byteLength, enviadoPor: ctx.usuarioId })
        .returning()
        .get();
      return {
        id: foto.id,
        tipo: foto.tipo,
        criadoEm: foto.criadoEm.toISOString(),
        url: `/api/v1/empresas/${empresaId}/pedidos/${pedidoId}/fotos/${foto.id}`,
      };
    },

    /** Referência da foto, se o pedido estiver visível para quem pede. */
    async obterFoto(pedidoId: string, fotoId: string) {
      const linha = await db
        .select({ chave: fotosPedido.chave, tipoConteudo: fotosPedido.tipoConteudo })
        .from(fotosPedido)
        .innerJoin(pedidos, eq(pedidos.id, fotosPedido.pedidoId))
        .where(and(visiveis(), eq(fotosPedido.id, fotoId), eq(fotosPedido.pedidoId, pedidoId), eq(fotosPedido.empresaId, empresaId)))
        .get();
      if (!linha) throw naoEncontrado('Foto não encontrada.');
      return linha;
    },

    async clientePorTelefone(telefone: string): Promise<ClienteResposta> {
      const cliente = await db
        .select()
        .from(clientes)
        .where(and(eq(clientes.empresaId, empresaId), eq(clientes.telefone, telefone)))
        .get();
      if (!cliente) throw naoEncontrado('Cliente não encontrado.');
      return { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone, endereco: cliente.endereco };
    },
  };
}
