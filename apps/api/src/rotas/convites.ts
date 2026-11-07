// Rotas públicas do link de convite: /convite/<token> no painel chama estas.

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {
  schemaAceitarConviteLogado,
  schemaAceitarConviteNovaConta,
  type ConvitePublicoResposta,
  type EntrarResposta,
} from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { usuarios } from '../db/schema.ts';
import { gerarHashSenha } from '../auth/cripto.ts';
import { criarSessao, definirCookieSessao } from '../auth/sessao.ts';
import { camposInvalidos } from '../erros.ts';
import { lerCorpo } from '../validar.ts';
import {
  concluirConvite,
  conviteValido,
  exigenciasDoPapel,
  liberarConvite,
  reservarConvite,
} from '../dados/convites.ts';
import { garantirDadosUnicos, montarEu } from '../dados/usuarios.ts';

type Exigencias = ReturnType<typeof exigenciasDoPapel>;
const ROTULOS = { email: 'Informe o e-mail.', telefone: 'Informe o telefone.', cpf: 'Informe o CPF.' };

/** Campos exigidos pelo papel que não vieram nem já estão na conta. */
function faltando(exige: Exigencias, dados: Partial<Record<keyof Exigencias, string | null | undefined>>) {
  const campos = (Object.keys(exige) as (keyof Exigencias)[]).filter((k) => exige[k] && !dados[k]);
  if (campos.length > 0) throw camposInvalidos(Object.fromEntries(campos.map((k) => [k, [ROTULOS[k]]])));
}

export const rotasConvites = new Hono<AppEnv>()
  .get('/:token', async (c) => {
    const { convite, empresa, cidade } = await conviteValido(c.var.db, c.req.param('token'));
    return c.json<ConvitePublicoResposta>({
      papel: convite.papel,
      expiraEm: convite.expiraEm.toISOString(),
      empresa: { nomeFantasia: empresa.nomeFantasia, tipo: empresa.tipo, cidade },
      exige: exigenciasDoPapel(convite.papel),
    });
  })

  .post('/:token/aceitar', async (c) => {
    const db = c.var.db;
    const { convite } = await conviteValido(db, c.req.param('token'));
    const exige = exigenciasDoPapel(convite.papel);
    const logado = c.var.usuario;

    if (logado) {
      // Quem já tem conta (ex.: motoboy de outra empresa) só completa o que faltar.
      const dados = await lerCorpo(c, schemaAceitarConviteLogado);
      const completar = {
        email: logado.email ? undefined : dados.email,
        telefone: logado.telefone ? undefined : dados.telefone,
        cpf: logado.cpf ? undefined : dados.cpf,
      };
      faltando(exige, {
        email: logado.email ?? completar.email,
        telefone: logado.telefone ?? completar.telefone,
        cpf: logado.cpf ?? completar.cpf,
      });
      await garantirDadosUnicos(db, completar, logado.id);

      await reservarConvite(db, convite.id);
      const novosDados = Object.fromEntries(Object.entries(completar).filter(([, v]) => v));
      if (Object.keys(novosDados).length > 0) {
        await db.update(usuarios).set(novosDados).where(eq(usuarios.id, logado.id));
      }
      await concluirConvite(db, convite, logado.id);
      return c.json<EntrarResposta>(await montarEu(db, logado.id), 201);
    }

    const { modo, senha, ...dados } = await lerCorpo(c, schemaAceitarConviteNovaConta);
    faltando(exige, dados);
    if (!dados.email && !dados.telefone) throw camposInvalidos({ telefone: [ROTULOS.telefone] });
    await garantirDadosUnicos(db, dados);

    await reservarConvite(db, convite.id);
    let usuarioId: string;
    try {
      const novo = await db
        .insert(usuarios)
        .values({
          nome: dados.nome,
          email: dados.email ?? null,
          telefone: dados.telefone ?? null,
          cpf: dados.cpf ?? null,
          senhaHash: await gerarHashSenha(senha),
        })
        .returning({ id: usuarios.id })
        .get();
      usuarioId = novo.id;
    } catch (erro) {
      await liberarConvite(db, convite.id);
      throw erro;
    }
    await concluirConvite(db, convite, usuarioId);

    const sessao = await criarSessao(db, usuarioId, c.req.header('user-agent'));
    const eu = await montarEu(db, usuarioId);
    if (modo === 'token') return c.json<EntrarResposta>({ ...eu, token: sessao.token }, 201);
    definirCookieSessao(c, sessao.token, sessao.expiraEm);
    return c.json<EntrarResposta>(eu, 201);
  });
