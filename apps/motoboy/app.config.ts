// Configuração dinâmica por cima do app.json.
//
// google-services.json (Firebase, necessário para a notificação chegar no Android) não fica no
// repositório: no build do EAS ele vem pela variável de arquivo GOOGLE_SERVICES_JSON (ver README).
// Sem ele o app funciona igual, só sem notificação (continua consultando a API).
//
// MOTOBOY_WEB=1 (script build:web): versão de navegador servida pelo próprio Worker em /motoboy,
// para quem ainda não tem o app instalado (ex.: iPhone sem conta da Apple). Só funciona com o app
// aberto e a tela acesa; ver README.

import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...config,
    name: config.name ?? 'Entregas Motoboy',
    slug: config.slug ?? 'entregas-motoboy',
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    ...(process.env.MOTOBOY_WEB === '1' ? { experiments: { ...config.experiments, baseUrl: '/motoboy' } } : {}),
  };
};
