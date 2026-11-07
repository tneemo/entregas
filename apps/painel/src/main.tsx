import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './estilo.css';
import { Entrar } from './telas/Entrar.tsx';
import { ConfiguracaoInicial } from './telas/ConfiguracaoInicial.tsx';
import { Convite } from './telas/Convite.tsx';
import { Inicio } from './telas/Inicio.tsx';
import { Layout } from './telas/Layout.tsx';
import { Equipe } from './telas/Equipe.tsx';
import { Empresas } from './telas/Empresas.tsx';
import { TelaPublica } from './telas/Entrar.tsx';

const consultas = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function NaoEncontrada() {
  return (
    <TelaPublica>
      <h1 className="text-3xl">Página não encontrada</h1>
      <a href="/" className="text-mercosul underline">
        Voltar ao início
      </a>
    </TelaPublica>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={consultas}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/configuracao-inicial" element={<ConfiguracaoInicial />} />
          <Route path="/convite/:token" element={<Convite />} />
          <Route element={<Layout />}>
            <Route path="/plataforma/empresas" element={<Empresas />} />
          </Route>
          <Route path="/e/:empresaId" element={<Layout />}>
            <Route path="equipe" element={<Equipe />} />
          </Route>
          <Route path="*" element={<NaoEncontrada />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
