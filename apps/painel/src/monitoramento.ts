// Monitoramento de erros do painel (Sentry). Só liga quando o build recebe VITE_SENTRY_DSN
// (o GitHub Actions passa em homologação e produção); no desenvolvimento, nada é enviado.
//
// LGPD: vai o erro e a tela onde aconteceu, nunca dados de pessoas. Sem gravação de sessão,
// sem corpo de requisição, cookies ou usuário, e os tokens de convite/rastreio da URL somem.
// A página pública de rastreio não carrega isto (precisa ser leve no celular do cliente).

import * as Sentry from '@sentry/react';
import { semTokens } from '@entregas/shared/privacidade';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

function limparUrls(dados: Record<string, unknown> | undefined) {
  if (!dados) return;
  for (const chave of ['url', 'from', 'to']) {
    const valor = dados[chave];
    if (typeof valor === 'string') dados[chave] = semTokens(valor);
  }
}

export function iniciarMonitoramento() {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: (import.meta.env.VITE_AMBIENTE as string | undefined) ?? 'desenvolvimento',
    release: import.meta.env.VITE_VERSAO as string | undefined,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    // Erros de extensões do navegador não são nossos.
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-web-extension:\/\//],
    beforeSend(evento) {
      if (evento.request?.url) evento.request.url = semTokens(evento.request.url);
      if (evento.request) {
        evento.request.headers = undefined;
        evento.request.cookies = undefined;
        evento.request.data = undefined;
      }
      if (evento.transaction) evento.transaction = semTokens(evento.transaction);
      evento.user = undefined;
      for (const migalha of evento.breadcrumbs ?? []) limparUrls(migalha.data);
      return evento;
    },
    beforeBreadcrumb(migalha) {
      limparUrls(migalha.data);
      return migalha;
    },
  });
}

export const LimiteDeErro = Sentry.ErrorBoundary;
