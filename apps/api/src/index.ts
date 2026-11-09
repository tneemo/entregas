import { Hono } from 'hono';
import { cors } from 'hono/cors';
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
import { rotasPedidos } from './rotas/pedidos.ts';
import { rotasTurno } from './rotas/turno.ts';
import { rotasConvites } from './rotas/convites.ts';
import { rotasCentral } from './rotas/central.ts';
import { rotasRastreio } from './rotas/rastreio.ts';
import { executarCron } from './tarefas.ts';
import { opcoesSentry, Sentry } from './monitoramento.ts';
import { CentralEmpresa as CentralEmpresaSemMonitor } from './central/central-empresa.ts';

const app = new Hono<AppEnv>().basePath('/api/v1');

// CORS só para as origens de ORIGENS_APP (o app rodando na web em desenvolvimento).
// Sem credenciais: essas chamadas usam Bearer, nunca o cookie do painel.
// WebSocket não usa CORS (a origem é conferida em protegerCsrf), e mexer nos
// cabeçalhos de uma resposta 101 depois de pronta quebra a conexão.
app.use(async (c, next) => {
  const origens = (c.env.ORIGENS_APP ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origens.length === 0 || c.req.header('upgrade')) return next();
  return cors({
    origin: origens,
    allowHeaders: ['authorization', 'content-type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
    maxAge: 600,
  })(c, next);
});
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
app.route('/empresas/:empresaId/pedidos', rotasPedidos);
app.route('/empresas/:empresaId/turno', rotasTurno);
app.route('/empresas/:empresaId/central', rotasCentral);
app.route('/empresas/:empresaId', rotasEmpresa);
app.route('/convites', rotasConvites);
app.route('/rastreio', rotasRastreio);

app.notFound((c) =>
  c.json<ErroResposta>({ erro: { codigo: 'nao_encontrado', mensagem: 'Rota não encontrada.' } }, 404),
);
app.onError(tratarErro);

// Erros dentro do Durable Object (WebSockets do tempo real) também vão para o Sentry.
export const CentralEmpresa = Sentry.instrumentDurableObjectWithSentry(opcoesSentry, CentralEmpresaSemMonitor);
export type CentralEmpresa = CentralEmpresaSemMonitor;

/** /r/<token>: página leve de acompanhamento (rastreio.html do build do painel). */
async function paginaRastreio(request: Request, env: Env) {
  // Os arquivos estáticos servem rastreio.html em /rastreio (sem a extensão).
  const pagina = await env.ASSETS.fetch(new Request(new URL('/rastreio', request.url), request));
  const resposta = new Response(pagina.body, pagina);
  resposta.headers.set('x-robots-tag', 'noindex, nofollow');
  resposta.headers.set('cache-control', 'no-cache');
  return resposta;
}

const worker = {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/r/')) return paginaRastreio(request, env);
    return app.fetch(request, env, ctx);
  },
  /**
   * Cron Triggers do wrangler.jsonc: expurgo diário de GPS e prazo de aceite a cada minuto.
   * Aguarda a tarefa (em vez de waitUntil) para que uma falha marque a execução como erro
   * na Cloudflare e chegue ao Sentry.
   */
  async scheduled(evento, env) {
    await executarCron(evento.cron, env);
  },
} satisfies ExportedHandler<Env>;

export default Sentry.withSentry(opcoesSentry, worker);
