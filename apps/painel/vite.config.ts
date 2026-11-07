import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Em desenvolvimento a API roda no wrangler dev; em produção o mesmo Worker serve os dois.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
