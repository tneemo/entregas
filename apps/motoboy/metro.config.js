// O Expo detecta o monorepo (npm workspaces) e enxerga packages/shared sozinho.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
