// Único caminho para ler e escrever dados de uma empresa.
//
// O D1 não tem Row Level Security, então o isolamento entre empresas é feito aqui:
// toda consulta filtra por `ctx.empresaId`, que vem do middleware exigirEmpresa()
// depois de conferir o vínculo do usuário. Rotas de empresa não devem consultar
// tabelas com empresa_id diretamente; os testes de isolamento cobrem este arquivo.

import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  ConvitePendenteResposta,
  DadosAtualizarMembro,
  DadosEmpresaResposta,
  MembroResposta,
  Papel,
  schemaAtualizarDadosEmpresa,
} from '@entregas/shared';
import type { Db } from '../db/index.ts';
import { cidades, convites, empresas, usuarios, vinculos } from '../db/schema.ts';
import type { ContextoEmpresa } from '../tipos.ts';
import { naoEncontrado } from '../erros.ts';
import { criarConvite } from './convites.ts';
import { empresaResposta } from './formatos.ts';

export function escopoEmpresa(db: Db, ctx: ContextoEmpresa) {
  const { empresaId } = ctx;

  const selecaoMembro = {
    vinculoId: vinculos.id,
    papel: vinculos.papel,
    status: vinculos.status,
    tipoVinculo: vinculos.tipoVinculo,
    criadoEm: vinculos.criadoEm,
    usuarioId: usuarios.id,
    nome: usuarios.nome,
    email: usuarios.email,
    telefone: usuarios.telefone,
  };

  const empresa = async (): Promise<DadosEmpresaResposta> => {
    const linha = await db
      .select({ empresa: empresas, cidade: cidades })
      .from(empresas)
      .innerJoin(cidades, eq(cidades.id, empresas.cidadeId))
      .where(eq(empresas.id, empresaId))
      .get();
    if (!linha) throw naoEncontrado('Empresa não encontrada.');
    const e = linha.empresa;
    return {
      ...empresaResposta(e, linha.cidade),
      endereco: e.endereco ?? null,
      fotoEntregaObrigatoria: e.fotoEntregaObrigatoria,
      prazoAceiteMin: e.prazoAceiteMin,
    };
  };

  const buscarMembro = (vinculoId: string) =>
    db
      .select(selecaoMembro)
      .from(vinculos)
      .innerJoin(usuarios, eq(usuarios.id, vinculos.usuarioId))
      .where(and(eq(vinculos.id, vinculoId), eq(vinculos.empresaId, empresaId)))
      .get();

  type LinhaMembro = NonNullable<Awaited<ReturnType<typeof buscarMembro>>>;

  const paraMembro = (l: LinhaMembro): MembroResposta => ({
    vinculoId: l.vinculoId,
    papel: l.papel,
    status: l.status,
    tipoVinculo: l.tipoVinculo,
    entrouEm: l.criadoEm.toISOString(),
    usuario: { id: l.usuarioId, nome: l.nome, email: l.email, telefone: l.telefone },
  });

  const obterMembro = async (vinculoId: string): Promise<MembroResposta> => {
    const linha = await buscarMembro(vinculoId);
    if (!linha) throw naoEncontrado('Membro não encontrado.');
    return paraMembro(linha);
  };

  return {
    ctx,

    empresa,

    async atualizarDados(dados: z.output<typeof schemaAtualizarDadosEmpresa>): Promise<DadosEmpresaResposta> {
      await db.update(empresas).set(dados).where(eq(empresas.id, empresaId));
      return empresa();
    },

    async listarMembros(): Promise<MembroResposta[]> {
      const linhas = await db
        .select(selecaoMembro)
        .from(vinculos)
        .innerJoin(usuarios, eq(usuarios.id, vinculos.usuarioId))
        .where(eq(vinculos.empresaId, empresaId))
        .orderBy(usuarios.nome)
        .all();
      return linhas.map(paraMembro);
    },

    obterMembro,

    async atualizarMembro(vinculoId: string, dados: DadosAtualizarMembro): Promise<MembroResposta> {
      const atual = await buscarMembro(vinculoId);
      if (!atual) throw naoEncontrado('Membro não encontrado.');

      const papelFinal = dados.papel ?? atual.papel;
      // Tipo de vínculo (CLT/MEI/freelancer) só se aplica a motoboys.
      const tipoVinculo =
        papelFinal === 'motoboy' ? (dados.tipoVinculo !== undefined ? dados.tipoVinculo : atual.tipoVinculo) : null;

      await db
        .update(vinculos)
        .set({ papel: papelFinal, status: dados.status ?? atual.status, tipoVinculo })
        .where(and(eq(vinculos.id, vinculoId), eq(vinculos.empresaId, empresaId)));
      return obterMembro(vinculoId);
    },

    async listarConvitesPendentes(): Promise<ConvitePendenteResposta[]> {
      const linhas = await db
        .select({ convite: convites, criadoPor: usuarios.nome })
        .from(convites)
        .innerJoin(usuarios, eq(usuarios.id, convites.criadoPor))
        .where(
          and(
            eq(convites.empresaId, empresaId),
            isNull(convites.aceitoEm),
            isNull(convites.revogadoEm),
            gt(convites.expiraEm, new Date()),
          ),
        )
        .orderBy(desc(convites.criadoEm))
        .all();
      return linhas.map(({ convite, criadoPor }) => ({
        id: convite.id,
        papel: convite.papel,
        nomeConvidado: convite.nomeConvidado,
        criadoPor,
        criadoEm: convite.criadoEm.toISOString(),
        expiraEm: convite.expiraEm.toISOString(),
      }));
    },

    criarConvite(papel: Papel, nomeConvidado?: string) {
      return criarConvite(db, { empresaId, papel, criadoPor: ctx.usuarioId, nomeConvidado });
    },

    async obterConvitePendente(conviteId: string) {
      const convite = await db
        .select({ id: convites.id, papel: convites.papel })
        .from(convites)
        .where(
          and(
            eq(convites.id, conviteId),
            eq(convites.empresaId, empresaId),
            isNull(convites.aceitoEm),
            isNull(convites.revogadoEm),
          ),
        )
        .get();
      if (!convite) throw naoEncontrado('Convite não encontrado.');
      return convite;
    },

    async revogarConvite(conviteId: string) {
      await db
        .update(convites)
        .set({ revogadoEm: new Date() })
        .where(and(eq(convites.id, conviteId), eq(convites.empresaId, empresaId)));
    },
  };
}

export type EscopoEmpresa = ReturnType<typeof escopoEmpresa>;
