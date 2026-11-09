// O Expo detecta o monorepo (npm workspaces) e enxerga packages/shared sozinho.
// getSentryExpoConfig = getDefaultConfig do Expo + identificador nos pacotes, para o Sentry
// casar cada erro com o source map certo.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
