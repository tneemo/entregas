import { Hono } from 'hono';
import type { ErroResposta } from '@entregas/shared';
import type { AppEnv } from './tipos.ts';
import { criarDb } from './db/index.ts';
import { tratarErro } from './erros.ts';
import { protegerCsrf } from './middleware/csrf.ts';
import { carregarSessao } from './middleware/sessao.ts';
import { rotasSetup } from './rotas/setup.ts';
import { rotasAuth } from './rotas/auth.ts';
import { rotasAdmin } from './rotas/admin.ts';
import { rotasEmpresa } from './rotas/empresa.ts';
import { rotasConvites } from './rotas/convites.ts';

const app = new Hono<AppEnv>().basePath('/api/v1');

app.use(async (c, next) => {
  c.set('db', criarDb(c.env.DB));
  await next();
});
app.use(protegerCsrf);
app.use(carregarSessao);

app.get('/saude', (c) => c.json({ ok: true }));
app.route('/setup', rotasSetup);
app.route('/auth', rotasAuth);
app.route('/admin', rotasAdmin);
app.route('/empresas/:empresaId', rotasEmpresa);
app.route('/convites', rotasConvites);

app.notFound((c) =>
  c.json<ErroResposta>({ erro: { codigo: 'nao_encontrado', mensagem: 'Rota não encontrada.' } }, 404),
);
app.onError(tratarErro);

export default app;
