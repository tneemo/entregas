// Monitoramento de erros do app (Sentry): erros de JavaScript e travamentos nativos.
// Liga só quando o build recebe EXPO_PUBLIC_SENTRY_DSN (variável do EAS); sem ela, nada é enviado.
//
// Importado antes de tudo (app/_layout.tsx e src/rastreio.ts), porque o Android pode acordar o app
// só para a tarefa de GPS, sem abrir nenhuma tela.
//
// LGPD: as telas mostram nome, telefone e endereço de clientes, então nada de captura de tela,
// hierarquia de views, corpo de requisição ou usuário. Os tokens de convite/rastreio somem das URLs.

import * as Sentry from '@sentry/react-native';
import { semTokens } from '@entregas/shared/privacidade';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

function limparUrls(dados: Record<string, unknown> | undefined) {
  if (!dados) return;
  for (const chave of ['url', 'from', 'to']) {
    const valor = dados[chave];
    if (typeof valor === 'string') dados[chave] = semTokens(valor);
  }
}

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.EXPO_PUBLIC_AMBIENTE ?? 'desenvolvimento',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    reportAccessibilityIdentifier: false,
    tracesSampleRate: 0,
    beforeSend(evento) {
      if (evento.request) {
        if (evento.request.url) evento.request.url = semTokens(evento.request.url);
        evento.request.headers = undefined;
        evento.request.cookies = undefined;
        evento.request.data = undefined;
      }
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

export { Sentry };
