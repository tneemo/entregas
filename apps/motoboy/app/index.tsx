import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { empresasDoMotoboy, useSessao } from '../src/sessao.tsx';
import { cores } from '../src/tema.ts';

/** Sem login vai para Entrar; com uma empresa só, direto para o turno. */
export default function Inicio() {
  const { carregando, eu } = useSessao();
  if (carregando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.papel }}>
        <ActivityIndicator size="large" color={cores.mercosul} />
      </View>
    );
  }
  if (!eu) return <Redirect href="/entrar" />;
  const empresas = empresasDoMotoboy(eu);
  if (empresas.length === 1) return <Redirect href={`/${empresas[0]!.empresa.id}`} />;
  return <Redirect href="/empresas" />;
}
