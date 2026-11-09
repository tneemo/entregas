// Primeiro o monitoramento de erros, depois a tarefa de GPS: ela precisa ser registrada antes
// de qualquer tela, porque o Android pode acordar o app só para entregar pontos de localização.
import { Sentry } from '../src/monitoramento.ts';
import '../src/rastreio.ts';

import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { type ErrorBoundaryProps, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProvedorSessao } from '../src/sessao.tsx';
import { OuvirNotificacoes } from '../src/notificacoes.ts';
import { cores, espaco, texto } from '../src/tema.ts';
import { Botao } from '../src/componentes.tsx';

const consultas = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

/** Erro inesperado numa tela: avisa o Sentry e oferece tentar de novo, em vez de fechar o app. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: espaco.g, gap: espaco.m, backgroundColor: cores.papel }}>
      <Text style={texto.titulo}>Algo deu errado</Text>
      <Text style={texto.corpo}>Tente de novo. Se continuar, avise a central.</Text>
      <Botao titulo="Tentar de novo" aoTocar={retry} />
    </View>
  );
}

function Layout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={consultas}>
        <ProvedorSessao>
          <OuvirNotificacoes />
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: cores.mercosul },
              headerTintColor: cores.branco,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: cores.papel },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="entrar" options={{ title: 'Entrar' }} />
            <Stack.Screen name="empresas" options={{ title: 'Suas empresas' }} />
            <Stack.Screen name="[empresaId]/index" options={{ title: 'Turno' }} />
            <Stack.Screen name="[empresaId]/[pedidoId]" options={{ title: 'Entrega' }} />
          </Stack>
        </ProvedorSessao>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// Sentry.wrap registra os toques como contexto dos erros (só o nome do botão, sem dados).
export default Sentry.wrap(Layout);
