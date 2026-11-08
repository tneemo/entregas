import { defineConfig, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** /r/<token> abre a página leve de rastreio (em produção quem faz isso é o Worker). */
const rastreioNoDev: Connect.NextHandleFunction = (req, _res, next) => {
  if (req.url?.startsWith('/r/')) req.url = '/rastreio.html';
  next();
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'rastreio-no-dev',
      configureServer: (server) => void server.middlewares.use(rastreioNoDev),
      configurePreviewServer: (server) => void server.middlewares.use(rastreioNoDev),
    },
  ],
  build: {
    // Duas páginas: o painel e o rastreio público, cada uma com o seu pacote.
    rolldownOptions: {
      input: { painel: 'index.html', rastreio: 'rastreio.html' },
    },
  },
  server: {
    port: 5173,
    // Em desenvolvimento a API roda no wrangler dev; em produção o mesmo Worker serve os dois.
    // ws: true repassa os WebSockets do mapa ao vivo e do rastreio.
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
});
