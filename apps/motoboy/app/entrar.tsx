import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Aviso, Botao, Campo, Placa } from '../src/componentes.tsx';
import { useSessao } from '../src/sessao.tsx';
import { espaco, texto } from '../src/tema.ts';

const homologacao = process.env.EXPO_PUBLIC_AMBIENTE === 'homologacao';
const producao = process.env.EXPO_PUBLIC_AMBIENTE === 'producao';

export default function Entrar() {
  const { eu, entrar } = useSessao();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  if (eu) return <Redirect href="/" />;

  async function enviar() {
    setErro(undefined);
    setEnviando(true);
    try {
      await entrar(login, senha);
      router.replace('/');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: espaco.g, gap: espaco.g, flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ width: 220 }}>
          <Placa textoPlaca="Entregas" />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={texto.titulo}>App do motoboy</Text>
          <Text style={texto.apoio}>Entre com o celular ou CPF e a senha que você criou no convite.</Text>
          {producao ? <Text style={texto.apoio}>Ambiente de produção.</Text> : null}
          {homologacao ? (
            <Text style={texto.apoio}>
              Ambiente de homologação. Use uma conta criada no site de homologação; as contas de produção são separadas.
            </Text>
          ) : null}
        </View>
        <Campo
          rotulo="Celular ou CPF"
          value={login}
          onChangeText={setLogin}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="username"
          placeholder="(45) 99999-0000"
        />
        <Campo
          rotulo="Senha"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={enviar}
        />
        {erro ? <Aviso>{erro}</Aviso> : null}
        <Botao
          titulo={enviando ? 'Entrando…' : 'Entrar'}
          aoTocar={enviar}
          carregando={enviando}
          desativado={!login || !senha}
        />
        <Text style={texto.apoio}>Ainda não tem acesso? Peça o link de convite para a empresa.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
