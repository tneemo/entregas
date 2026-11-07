// A tarefa de GPS precisa ser registrada antes de qualquer tela: o Android pode
// acordar o app só para entregar pontos de localização.
import '../src/rastreio.ts';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProvedorSessao } from '../src/sessao.tsx';
import { cores } from '../src/tema.ts';

const consultas = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

export default function Layout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={consultas}>
        <ProvedorSessao>
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
