import { Hono } from 'hono';
import { and, eq, gt, lt, count } from 'drizzle-orm';
import { schemaDispositivo, schemaEntrar, type EntrarResposta } from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import type { Db } from '../db/index.ts';
import { falhasLogin } from '../db/schema.ts';
import { HASH_FICTICIO, verificarSenha } from '../auth/cripto.ts';
import { apagarCookieSessao, criarSessao, definirCookieSessao, encerrarSessao } from '../auth/sessao.ts';
import { ErroApi } from '../erros.ts';
import { lerCorpo } from '../validar.ts';
import { exigirLogin } from '../middleware/sessao.ts';
import { candidatosLogin, montarEu } from '../dados/usuarios.ts';
import { registrarDispositivo } from '../dados/dispositivos.ts';

const MAX_FALHAS = 5;
const JANELA_FALHAS_MS = 15 * 60 * 1000;

async function conferirLimiteDeFalhas(db: Db, chave: string) {
  const desde = new Date(Date.now() - JANELA_FALHAS_MS);
  const linha = await db
    .select({ total: count() })
    .from(falhasLogin)
    .where(and(eq(falhasLogin.chave, chave), gt(falhasLogin.criadoEm, desde)))
    .get();
  if ((linha?.total ?? 0) >= MAX_FALHAS) {
    throw new ErroApi(429, 'muitas_tentativas', 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');
  }
}

async function registrarFalha(db: Db, chave: string) {
  const antigas = new Date(Date.now() - JANELA_FALHAS_MS);
  await db.batch([
    db.delete(falhasLogin).where(and(eq(falhasLogin.chave, chave), lt(falhasLogin.criadoEm, antigas))),
    db.insert(falhasLogin).values({ chave }),
  ]);
}

export const rotasAuth = new Hono<AppEnv>()
  .post('/entrar', async (c) => {
    const db = c.var.db;
    const { login, senha, modo } = await lerCorpo(c, schemaEntrar);
    const chave = login.toLowerCase();
    await conferirLimiteDeFalhas(db, chave);

    const candidatos = await candidatosLogin(db, login);
    let usuario = null;
    for (const candidato of candidatos) {
      if (await verificarSenha(senha, candidato.senhaHash)) {
        usuario = candidato;
        break;
      }
    }
    // Mesmo custo de CPU quando o login não existe, para não revelar quais contas existem.
    if (candidatos.length === 0) await verificarSenha(senha, HASH_FICTICIO);

    if (!usuario || !usuario.ativo) {
      await registrarFalha(db, chave);
      throw new ErroApi(401, 'credenciais_invalidas', 'Login ou senha incorretos.');
    }

    await db.delete(falhasLogin).where(eq(falhasLogin.chave, chave));
    const sessao = await criarSessao(db, usuario.id, c.req.header('user-agent'));
    const eu = await montarEu(db, usuario.id);

    if (modo === 'token') return c.json<EntrarResposta>({ ...eu, token: sessao.token });
    definirCookieSessao(c, sessao.token, sessao.expiraEm);
    return c.json<EntrarResposta>(eu);
  })

  .post('/sair', async (c) => {
    if (c.var.sessaoId) await encerrarSessao(c.var.db, c.var.sessaoId);
    apagarCookieSessao(c);
    return c.body(null, 204);
  })

  .get('/eu', exigirLogin, async (c) => c.json(await montarEu(c.var.db, c.var.usuario!.id)))

  /**
   * App do motoboy: este celular passa a receber notificação enquanto esta sessão existir.
   * Sair do app (ou a sessão vencer) apaga o registro junto.
   */
  .post('/dispositivo', exigirLogin, async (c) => {
    const dados = await lerCorpo(c, schemaDispositivo);
    await registrarDispositivo(c.var.db, { ...dados, sessaoId: c.var.sessaoId!, usuarioId: c.var.usuario!.id });
    return c.body(null, 204);
  });
