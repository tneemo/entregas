import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ROTULOS } from '@entregas/shared';
import { Botao, Placa } from '../src/componentes.tsx';
import { empresasDoMotoboy, useSessao } from '../src/sessao.tsx';
import { cores, espaco, texto } from '../src/tema.ts';

export default function Empresas() {
  const { eu, sair } = useSessao();
  if (!eu) return <Redirect href="/entrar" />;
  const empresas = empresasDoMotoboy(eu);

  return (
    <ScrollView contentContainerStyle={{ padding: espaco.m, gap: espaco.m }}>
      <Text style={texto.corpo}>Olá, {eu.usuario.nome.split(' ')[0]}. Para qual empresa você vai rodar agora?</Text>
      {empresas.length === 0 ? (
        <Text style={texto.corpo}>
          Sua conta não está ativa como motoboy em nenhuma empresa. Peça um convite ao administrador.
        </Text>
      ) : (
        empresas.map((v) => (
          <Pressable
            key={v.empresa.id}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${v.empresa.nomeFantasia}`}
            onPress={() => router.push(`/${v.empresa.id}`)}
            style={({ pressed }) => ({
              gap: 6,
              backgroundColor: cores.branco,
              padding: espaco.m,
              borderRadius: 8,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Placa textoPlaca={v.empresa.nomeFantasia} />
            <Text style={texto.apoio}>{ROTULOS.tipoEmpresa[v.empresa.tipo]}</Text>
          </Pressable>
        ))
      )}
      <View style={{ marginTop: espaco.g }}>
        <Botao
          titulo="Sair da conta"
          variante="secundario"
          aoTocar={() => sair().then(() => router.replace('/entrar'))}
        />
      </View>
    </ScrollView>
  );
}
