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
    },
  };
});
