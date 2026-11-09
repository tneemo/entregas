import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROTULOS_PAGAMENTO,
  formatarReais,
  type PedidoResumo,
  type TurnoResposta,
} from '@entregas/shared';
import { api } from '../../src/api.ts';
import { Aviso, Botao, Placa, Secao, SeloStatus } from '../../src/componentes.tsx';
import {
  enviarFila,
  iniciarRastreio,
  pararRastreio,
  rastreioAtivo,
  type ResultadoRastreio,
} from '../../src/rastreio.ts';
import { empresasDoMotoboy, useSessao } from '../../src/sessao.tsx';
import { cores, espaco, texto } from '../../src/tema.ts';

const AVISO_GPS: Record<ResultadoRastreio, { tipo: 'ok' | 'info' | 'erro'; texto: string }> = {
  segundo_plano: { tipo: 'ok', texto: 'Localização ligada, inclusive com a tela apagada.' },
  so_com_app_aberto: {
    tipo: 'info',
    texto:
      'A localização só é enviada com o app aberto. Para funcionar com a tela apagada, permita a localização "o tempo todo" nas configurações.',
  },
  sem_permissao: { tipo: 'erro', texto: 'Localização negada: a central não vai ver você no mapa.' },
};

function horaCurta(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function CartaoEntrega({ empresaId, pedido }: { empresaId: string; pedido: PedidoResumo }) {
  const d = pedido.destino;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir pedido ${pedido.numero}, ${d.nome ?? ''}`}
      onPress={() => router.push(`/${empresaId}/${pedido.id}`)}
      style={({ pressed }) => ({
        backgroundColor: cores.branco,
        borderRadius: 8,
        padding: espaco.m,
        gap: 6,
        borderLeftWidth: 6,
        borderLeftColor: pedido.status === 'atribuido' ? cores.sinal : cores.mercosul,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[texto.titulo, { color: cores.mercosul }]}>{pedido.numero}</Text>
        <SeloStatus status={pedido.status} />
      </View>
      <Text style={[texto.corpo, { fontWeight: '700' }]}>{d.nome ?? 'Sem nome'}</Text>
      <Text style={texto.corpo}>
        {d.logradouro}, {d.numero}, {d.bairro}
      </Text>
      {pedido.status === 'atribuido' && pedido.aceiteAte ? (
        <Text style={[texto.apoio, { fontWeight: '700', color: cores.asfalto }]}>
          Aceite até {horaCurta(pedido.aceiteAte)}
        </Text>
      ) : null}
      <Text style={texto.apoio}>
        {pedido.formaPagamento === 'pago'
          ? 'Já pago: não cobrar'
          : `${ROTULOS_PAGAMENTO[pedido.formaPagamento]}: ${formatarReais(pedido.valorACobrarCentavos)}`}
      </Text>
    </Pressable>
  );
}

export default function Turno() {
  const { empresaId = '' } = useLocalSearchParams<{ empresaId: string }>();
  const { eu, sair } = useSessao();
  const consultas = useQueryClient();
  const [gps, setGps] = useState<ResultadoRastreio | null>(null);
  const empresas = empresasDoMotoboy(eu);
  const vinculo = empresas.find((v) => v.empresa.id === empresaId);
  const nomeEmpresa = vinculo?.empresa.nomeFantasia ?? '';

  const turno = useQuery({
    queryKey: ['turno', empresaId],
    queryFn: () => api<TurnoResposta>(`/empresas/${empresaId}/turno`),
    enabled: Boolean(vinculo),
  });
  const emTurno = Boolean(turno.data?.turno);

  const entregas = useQuery({
    queryKey: ['entregas', empresaId],
    queryFn: () => api<PedidoResumo[]>(`/empresas/${empresaId}/pedidos`),
    enabled: Boolean(vinculo),
    // Sem notificação push ainda: com turno aberto, confere a cada 15 s.
    refetchInterval: emTurno ? 15_000 : false,
  });

  // App reaberto com turno aberto: garante que o GPS continua e esvazia a fila.
  useEffect(() => {
    if (!emTurno) return;
    (async () => {
      if (!(await rastreioAtivo())) setGps(await iniciarRastreio(empresaId, nomeEmpresa));
      else setGps((atual) => atual ?? 'segundo_plano');
      await enviarFila();
    })();
  }, [emTurno, empresaId, nomeEmpresa]);

  const iniciar = useMutation({
    mutationFn: async () => {
      const r = await api<TurnoResposta>(`/empresas/${empresaId}/turno`, { metodo: 'POST' });
      setGps(await iniciarRastreio(empresaId, nomeEmpresa));
      return r;
    },
    onSuccess: (r) => consultas.setQueryData(['turno', empresaId], r),
  });

  const encerrar = useMutation({
    mutationFn: async () => {
      const r = await api<TurnoResposta>(`/empresas/${empresaId}/turno`, { metodo: 'DELETE' });
      await pararRastreio();
      setGps(null);
      return r;
    },
    onSuccess: (r) => consultas.setQueryData(['turno', empresaId], r),
  });

  if (!eu) return <Redirect href="/entrar" />;
  if (!vinculo) return <Redirect href="/" />;

  const outra = turno.data?.emOutraEmpresa;
  const lista = entregas.data ?? [];

  return (
    <>
      <Stack.Screen options={{ title: emTurno ? 'Em turno' : 'Fora de turno' }} />
      <ScrollView
        contentContainerStyle={{ padding: espaco.m, gap: espaco.m }}
        refreshControl={
          <RefreshControl
            refreshing={entregas.isRefetching}
            onRefresh={() => {
              entregas.refetch();
              turno.refetch();
            }}
          />
        }
      >
        <Placa textoPlaca={nomeEmpresa} />
        {empresas.length > 1 && (
          <Botao titulo="Trocar de empresa" variante="secundario" aoTocar={() => router.push('/empresas')} />
        )}

        <Secao titulo="Turno">
          {outra ? (
            <>
              <Aviso tipo="info">Você está em turno na {outra.nomeFantasia}. Encerre aquele turno para rodar aqui.</Aviso>
              <Botao titulo={`Ir para ${outra.nomeFantasia}`} aoTocar={() => router.replace(`/${outra.empresaId}`)} />
            </>
          ) : emTurno ? (
            <>
              <Text style={texto.corpo}>Em turno desde {horaCurta(turno.data!.turno!.iniciadoEm)}.</Text>
              {gps && <Aviso tipo={AVISO_GPS[gps].tipo}>{AVISO_GPS[gps].texto}</Aviso>}
              {gps === 'so_com_app_aberto' && Platform.OS !== 'web' && (
                <Botao titulo="Abrir configurações" variante="secundario" aoTocar={() => Linking.openSettings()} />
              )}
              {encerrar.error && <Aviso>{encerrar.error.message}</Aviso>}
              <Botao
                titulo="Encerrar turno"
                variante="perigo"
                carregando={encerrar.isPending}
                aoTocar={() => encerrar.mutate()}
              />
            </>
          ) : (
            <>
              <Text style={texto.corpo}>
                Ao começar o turno, sua localização passa a ser enviada à {nomeEmpresa}, inclusive com a tela apagada,
                para a central acompanhar as entregas. Ao encerrar o turno, o envio para.
              </Text>
              {iniciar.error && <Aviso>{iniciar.error.message}</Aviso>}
              <Botao titulo="Começar turno" variante="sucesso" carregando={iniciar.isPending} aoTocar={() => iniciar.mutate()} />
            </>
          )}
        </Secao>

        <Text style={texto.subtitulo} accessibilityRole="header">
          Suas entregas {lista.length > 0 ? `(${lista.length})` : ''}
        </Text>
        {entregas.error && <Aviso>{entregas.error.message}</Aviso>}
        {lista.length === 0 && !entregas.isLoading ? (
          <Text style={texto.apoio}>
            Nenhuma entrega com você agora. Quando a central atribuir um pedido, ele aparece aqui.
          </Text>
        ) : (
          lista.map((p) => <CartaoEntrega key={p.id} empresaId={empresaId} pedido={p} />)
        )}

        <View style={{ marginTop: espaco.g }}>
          <Botao
            titulo="Sair da conta"
            variante="secundario"
            desativado={emTurno}
            aoTocar={() => sair().then(() => router.replace('/entrar'))}
          />
          {emTurno && <Text style={[texto.apoio, { marginTop: 6 }]}>Encerre o turno antes de sair da conta.</Text>}
        </View>
      </ScrollView>
    </>
  );
}
