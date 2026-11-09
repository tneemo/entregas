// Monitoramento de erros (Sentry). Sem o segredo SENTRY_DSN nada é enviado e os erros
// ficam só nos logs da Cloudflare (observability no wrangler.jsonc).
//
// LGPD: o Sentry recebe o erro e onde ele aconteceu, nunca dados de pessoas. Ficam de fora
// o corpo das requisições (CPF, telefone, endereço), cookies, Authorization, IP e os
// segredos que viajam na URL (token do link de rastreio e do convite).
// Só erros: sem rastreamento de desempenho por enquanto (tracesSampleRate 0).

import * as Sentry from '@sentry/cloudflare';
import { semTokens } from '@entregas/shared/privacidade';

const CABECALHOS_PERMITIDOS = new Set(['content-type', 'user-agent', 'sec-fetch-site', 'upgrade']);

export function limparEvento<T extends Sentry.Event>(evento: T): T {
  const req = evento.request;
  if (req) {
    if (req.url) req.url = semTokens(req.url);
    req.data = undefined;
    req.cookies = undefined;
    req.query_string = undefined;
    if (req.headers) {
      req.headers = Object.fromEntries(
        Object.entries(req.headers).filter(([nome]) => CABECALHOS_PERMITIDOS.has(nome.toLowerCase())),
      );
    }
  }
  if (evento.transaction) evento.transaction = semTokens(evento.transaction);
  evento.user = undefined;
  for (const migalha of evento.breadcrumbs ?? []) {
    if (typeof migalha.data?.url === 'string') migalha.data.url = semTokens(migalha.data.url);
    if (migalha.message) migalha.message = semTokens(migalha.message);
  }
  return evento;
}

export function opcoesSentry(env: Env): Sentry.CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN,
    enabled: Boolean(env.SENTRY_DSN),
    environment: env.AMBIENTE,
    // O padrão do SDK coleta tudo; aqui só o mínimo. limparEvento confere de novo antes de enviar.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: [...CABECALHOS_PERMITIDOS] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    beforeSend: limparEvento,
    beforeBreadcrumb: (migalha) => {
      if (typeof migalha.data?.url === 'string') migalha.data.url = semTokens(migalha.data.url);
      return migalha;
    },
  };
}

/** Erro inesperado que virou resposta 500 (o Hono trata antes de o Sentry ver). */
export function registrarErro(erro: unknown) {
  Sentry.captureException(erro);
}

export { Sentry };
