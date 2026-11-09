// Configuração dinâmica por cima do app.json.
//
// google-services.json (Firebase, necessário para a notificação chegar no Android) não fica no
// repositório: no build do EAS ele vem pela variável de arquivo GOOGLE_SERVICES_JSON (ver README).
// Sem ele o app funciona igual, só sem notificação (continua consultando a API).

import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...config,
    name: config.name ?? 'Entregas Motoboy',
    slug: config.slug ?? 'entregas-motoboy',
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
