import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig(async () => {
  const migracoes = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migracoes,
            SETUP_TOKEN: 'token-de-teste',
            ORIGENS_APP: 'http://localhost:8081',
            // Nada de chamadas ao Google/OpenStreetMap nos testes.
            GEOCODIFICADOR: 'desligado',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/preparar.ts'],
      // Cada teste sobe requisições de verdade no workerd (Worker, D1, Durable Object, WebSocket).
      // Na máquina compartilhada do CI, com os 13 arquivos em paralelo, já vimos teste de 60 ms
      // levar 2 s; 5 s (o padrão) derrubava o fluxo de rastreio, que faz ~15 idas e voltas.
      // Teste travado de verdade continua falhando: as esperas por mensagem têm limite próprio de 3 s.
      testTimeout: 20_000,
    },
  };
});
