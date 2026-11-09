// Cria o primeiro super admin da plataforma. Só funciona se o segredo SETUP_TOKEN
// estiver configurado e ainda não existir nenhum super admin.

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { schemaSetup } from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { usuarios } from '../db/schema.ts';
import { gerarHashSenha, segredosIguais } from '../auth/cripto.ts';
import { ErroApi, naoEncontrado } from '../erros.ts';
import { lerCorpo } from '../validar.ts';
import { garantirDadosUnicos, montarEu } from '../dados/usuarios.ts';

export const rotasSetup = new Hono<AppEnv>().post('/', async (c) => {
  const esperado = c.env.SETUP_TOKEN as string | undefined;
  if (!esperado) throw naoEncontrado();

  const dados = await lerCorpo(c, schemaSetup);
  if (!(await segredosIguais(dados.token, esperado))) {
    throw new ErroApi(403, 'token_invalido', 'Token de configuração inválido.');
  }

  const db = c.var.db;
  const existente = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.superAdmin, true)).get();
  if (existente) throw new ErroApi(409, 'ja_configurado', 'A plataforma já tem um super admin.');

  await garantirDadosUnicos(db, { email: dados.email });
  const usuario = await db
    .insert(usuarios)
    .values({
      nome: dados.nome,
      email: dados.email,
      senhaHash: await gerarHashSenha(dados.senha),
      superAdmin: true,
    })
    .returning({ id: usuarios.id })
    .get();

  return c.json(await montarEu(db, usuario.id), 201);
});
