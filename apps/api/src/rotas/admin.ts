// Rotas do super admin (dono da plataforma): cidades e empresas.

import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  PAPEIS,
  schemaAtualizarEmpresa,
  schemaCriarCidade,
  schemaCriarEmpresa,
  type CidadeResposta,
  type CriarEmpresaResposta,
  type DemonstracaoResposta,
} from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { violouUnicidade } from '../db/index.ts';
import { cidades, empresas } from '../db/schema.ts';
import { ErroApi, camposInvalidos, naoEncontrado } from '../erros.ts';
import { lerCorpo } from '../validar.ts';
import { exigirSuperAdmin } from '../middleware/sessao.ts';
import { criarConvite } from '../dados/convites.ts';
import { empresaResposta } from '../dados/formatos.ts';
import { criarEntregaDeTeste, motoboyDeTeste, prepararDemonstracao } from '../dados/demonstracao.ts';
import { avisar } from '../central/avisar.ts';

const cidadeResposta = (c: typeof cidades.$inferSelect): CidadeResposta => ({
  id: c.id,
  nome: c.nome,
  uf: c.uf,
  codigoIbge: c.codigoIbge,
});

export const rotasAdmin = new Hono<AppEnv>()
  .use(exigirSuperAdmin)

  .get('/cidades', async (c) => {
    const linhas = await c.var.db.select().from(cidades).orderBy(cidades.nome).all();
    return c.json(linhas.map(cidadeResposta));
  })

  .post('/cidades', async (c) => {
    const dados = await lerCorpo(c, schemaCriarCidade);
    try {
      const cidade = await c.var.db.insert(cidades).values(dados).returning().get();
      return c.json(cidadeResposta(cidade), 201);
    } catch (erro) {
      if (violouUnicidade(erro)) throw new ErroApi(409, 'cidade_existente', 'Esta cidade já está cadastrada.');
      throw erro;
    }
  })

  .get('/empresas', async (c) => {
    const linhas = await c.var.db
      .select({ empresa: empresas, cidade: cidades })
      .from(empresas)
      .innerJoin(cidades, eq(cidades.id, empresas.cidadeId))
      .orderBy(desc(empresas.criadoEm))
      .all();
    return c.json(linhas.map((l) => empresaResposta(l.empresa, l.cidade)));
  })

  .post('/empresas', async (c) => {
    const db = c.var.db;
    const dados = await lerCorpo(c, schemaCriarEmpresa);

    const cidade = await db.select().from(cidades).where(eq(cidades.id, dados.cidadeId)).get();
    if (!cidade) throw camposInvalidos({ cidadeId: ['Cidade não encontrada.'] });

    let empresa: typeof empresas.$inferSelect;
    try {
      empresa = await db.insert(empresas).values(dados).returning().get();
    } catch (erro) {
      if (violouUnicidade(erro)) {
        throw new ErroApi(409, 'cnpj_existente', 'Já existe uma empresa com este CNPJ.', {
          cnpj: ['CNPJ já cadastrado.'],
        });
      }
      throw erro;
    }

    const conviteAdmin = await criarConvite(db, {
      empresaId: empresa.id,
      papel: 'admin',
      criadoPor: c.var.usuario!.id,
    });
    return c.json<CriarEmpresaResposta>({ empresa: empresaResposta(empresa, cidade), conviteAdmin }, 201);
  })

  .patch('/empresas/:id', async (c) => {
    const db = c.var.db;
    const dados = await lerCorpo(c, schemaAtualizarEmpresa);
    const atualizada = await db
      .update(empresas)
      .set(dados)
      .where(eq(empresas.id, c.req.param('id')))
      .returning()
      .get();
    if (!atualizada) throw naoEncontrado('Empresa não encontrada.');
    const cidade = await db.select().from(cidades).where(eq(cidades.id, atualizada.cidadeId)).get();
    return c.json(empresaResposta(atualizada, cidade!));
  })

  /**
   * Empresa de demonstração (dados fictícios) para testar e apresentar em produção. Cria na
   * primeira vez; depois só completa (lojas, acesso de super admins novos) e gera outro convite.
   */
  .post('/demonstracao', async (c) =>
    c.json<DemonstracaoResposta>(await prepararDemonstracao(c.var.db, c.var.usuario!.id), 201),
  )

  /** Entrega de teste na demonstração: segue o fluxo real (despacho, app, código, rastreio). */
  .post('/demonstracao/pedidos', async (c) => {
    const { empresaId, pedido } = await criarEntregaDeTeste(c.var.db, c.var.usuario!.id);
    avisar(c, empresaId, async (central) => {
      await central.mudouPedido(pedido.id, pedido.status, null);
      await central.despachar(empresaId);
    });
    return c.json(pedido, 201);
  })

  /** Conta de motoboy de teste do super admin (para entrar no app e receber as entregas de teste). */
  .post('/demonstracao/motoboy-teste', async (c) => c.json(await motoboyDeTeste(c.var.db, c.var.usuario!), 201))

  /** Novo convite para uma empresa (ex.: o link do admin expirou). */
  .post('/empresas/:id/convites', async (c) => {
    const db = c.var.db;
    const { papel } = await lerCorpo(c, z.object({ papel: z.enum(PAPEIS).default('admin') }));
    const empresa = await db
      .select({ id: empresas.id })
      .from(empresas)
      .where(eq(empresas.id, c.req.param('id')))
      .get();
    if (!empresa) throw naoEncontrado('Empresa não encontrada.');
    const convite = await criarConvite(db, { empresaId: empresa.id, papel, criadoPor: c.var.usuario!.id });
    return c.json(convite, 201);
  });
