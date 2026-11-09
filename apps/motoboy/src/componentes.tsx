import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { ROTULOS_STATUS, type StatusPedido } from '@entregas/shared';
import { cores, espaco, texto } from './tema.ts';

type Variante = 'principal' | 'secundario' | 'perigo' | 'sucesso';

const FUNDO: Record<Variante, string> = {
  principal: cores.mercosul,
  secundario: cores.branco,
  perigo: cores.branco,
  sucesso: cores.ok,
};
const LETRA: Record<Variante, string> = {
  principal: cores.branco,
  secundario: cores.asfalto,
  perigo: cores.aluguel,
  sucesso: cores.branco,
};

export function Botao({
  titulo,
  aoTocar,
  variante = 'principal',
  carregando = false,
  desativado = false,
}: {
  titulo: string;
  aoTocar: () => void;
  variante?: Variante;
  carregando?: boolean;
  desativado?: boolean;
}) {
  const inativo = desativado || carregando;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inativo, busy: carregando }}
      disabled={inativo}
      onPress={aoTocar}
      style={({ pressed }) => [
        estilos.botao,
        { backgroundColor: FUNDO[variante], opacity: inativo ? 0.6 : pressed ? 0.85 : 1 },
        variante === 'secundario' && { borderColor: cores.linha, borderWidth: 2 },
        variante === 'perigo' && { borderColor: cores.aluguel, borderWidth: 2 },
      ]}
    >
      {carregando ? <ActivityIndicator color={LETRA[variante]} /> : null}
      <Text style={[estilos.botaoTexto, { color: LETRA[variante] }]}>{titulo}</Text>
    </Pressable>
  );
}

export function Campo({ rotulo, erro, ...props }: TextInputProps & { rotulo: string; erro?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        accessibilityLabel={rotulo}
        placeholderTextColor={cores.concreto}
        {...props}
        style={[estilos.campo, erro ? { borderColor: cores.aluguel } : null, props.style]}
      />
      {erro ? <Text style={[texto.apoio, { color: cores.aluguel }]}>{erro}</Text> : null}
    </View>
  );
}

export function Aviso({ children, tipo = 'erro' }: { children: ReactNode; tipo?: 'erro' | 'info' | 'ok' }) {
  const cor = tipo === 'erro' ? cores.aluguel : tipo === 'ok' ? cores.ok : cores.sinal;
  return (
    <View accessibilityRole="alert" style={[estilos.aviso, { borderLeftColor: cor }]}>
      <Text style={texto.corpo}>{children}</Text>
    </View>
  );
}

/** Identidade da empresa no formato de placa de moto de aluguel, igual ao painel. */
export function Placa({ textoPlaca, faixa = 'PARANÁ' }: { textoPlaca: string; faixa?: string }) {
  return (
    <View style={estilos.placa} accessible accessibilityLabel={textoPlaca}>
      <View style={estilos.placaFaixa}>
        <Text style={estilos.placaFaixaTexto}>{faixa}</Text>
      </View>
      <Text numberOfLines={1} style={estilos.placaTexto}>
        {textoPlaca.toUpperCase()}
      </Text>
    </View>
  );
}

const COR_STATUS: Partial<Record<StatusPedido, string>> = {
  atribuido: cores.sinal,
  em_rota: cores.mercosul,
  falhou: cores.aluguel,
  em_devolucao: cores.aluguel,
  entregue: cores.ok,
};

export function SeloStatus({ status }: { status: StatusPedido }) {
  const cor = COR_STATUS[status] ?? cores.concreto;
  return (
    <View style={[estilos.selo, { borderColor: cor }]}>
      <Text style={[estilos.seloTexto, { color: cor }]}>{ROTULOS_STATUS[status]}</Text>
    </View>
  );
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={estilos.secao}>
      <Text style={texto.subtitulo} accessibilityRole="header">
        {titulo}
      </Text>
      {children}
    </View>
  );
}

const estilos = StyleSheet.create({
  botao: {
    minHeight: 56,
    borderRadius: 8,
    paddingHorizontal: espaco.m,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: espaco.p,
  },
  botaoTexto: { fontSize: 18, fontWeight: '700' },
  rotulo: { fontSize: 16, fontWeight: '600', color: cores.asfalto },
  campo: {
    minHeight: 56,
    borderWidth: 2,
    borderColor: cores.linha,
    borderRadius: 8,
    backgroundColor: cores.branco,
    paddingHorizontal: espaco.m,
    fontSize: 20,
    color: cores.asfalto,
  },
  aviso: { borderLeftWidth: 5, backgroundColor: cores.branco, padding: espaco.m, borderRadius: 4 },
  placa: {
    borderWidth: 2,
    borderColor: cores.asfalto,
    borderRadius: 6,
    backgroundColor: cores.branco,
    overflow: 'hidden',
  },
  placaFaixa: { backgroundColor: cores.mercosul, paddingHorizontal: 8, paddingVertical: 2 },
  placaFaixaTexto: { color: cores.branco, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  placaTexto: {
    color: cores.aluguel,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  selo: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  seloTexto: { fontSize: 15, fontWeight: '700' },
  secao: { gap: espaco.p, backgroundColor: cores.branco, padding: espaco.m, borderRadius: 8 },
});
