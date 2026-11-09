import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './estilo.css';
import { iniciarMonitoramento, LimiteDeErro } from './monitoramento.ts';
import { Botao } from './componentes/ui.tsx';
import { Entrar } from './telas/Entrar.tsx';
import { ConfiguracaoInicial } from './telas/ConfiguracaoInicial.tsx';
import { Convite } from './telas/Convite.tsx';
import { Inicio } from './telas/Inicio.tsx';
import { Layout } from './telas/Layout.tsx';
import { Equipe } from './telas/Equipe.tsx';
import { Empresas } from './telas/Empresas.tsx';
import { Pedidos } from './telas/Pedidos.tsx';
import { NovoPedido } from './telas/NovoPedido.tsx';
import { PedidoDetalhe } from './telas/PedidoDetalhe.tsx';
import { DadosEmpresa } from './telas/DadosEmpresa.tsx';
import { TelaPublica } from './telas/Entrar.tsx';

iniciarMonitoramento();

// O mapa (Leaflet) só baixa quando alguém abre a tela.
const MapaAoVivo = lazy(() => import('./telas/MapaAoVivo.tsx').then((m) => ({ default: m.MapaAoVivo })));

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

/** Erro inesperado numa tela: em vez de página em branco, um aviso e o botão de recarregar. */
function ErroInesperado() {
  return (
    <TelaPublica>
      <h1 className="text-3xl">Algo deu errado</h1>
      <p>Recarregue a página. Se o problema continuar, avise o suporte.</p>
      <Botao onClick={() => window.location.reload()}>Recarregar</Botao>
    </TelaPublica>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <LimiteDeErro fallback={<ErroInesperado />}>
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
              <Route path="pedidos" element={<Pedidos />} />
              <Route path="pedidos/novo" element={<NovoPedido />} />
              <Route path="pedidos/:pedidoId" element={<PedidoDetalhe />} />
              <Route
                path="mapa"
                element={
                  <Suspense fallback={<p>Carregando mapa…</p>}>
                    <MapaAoVivo />
                  </Suspense>
                }
              />
              <Route path="equipe" element={<Equipe />} />
              <Route path="empresa" element={<DadosEmpresa />} />
            </Route>
            <Route path="*" element={<NaoEncontrada />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </LimiteDeErro>
  </StrictMode>,
);
