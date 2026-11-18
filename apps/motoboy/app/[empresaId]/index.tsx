import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROTULOS_PAGAMENTO, formatarReais, type PedidoResumo, type TurnoResposta } from '@entregas/shared';
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
import { CartaoOferta } from '../../src/CartaoOferta.tsx';
import { alertarOferta, liberarSom, manterTelaAcesa, telaAcesaDisponivel } from '../../src/navegador.ts';
import { cores, espaco, texto } from '../../src/tema.ts';

const AVISO_GPS: Record<ResultadoRastreio, { tipo: 'ok' | 'info' | 'erro'; texto: string }> = {
  segundo_plano: { tipo: 'ok', texto: 'Localização ligada, inclusive com a tela apagada.' },
  so_com_app_aberto: {
    tipo: 'info',
    texto:
      Platform.OS === 'web'
        ? 'Versão de navegador: a localização só é enviada com esta tela aberta e acesa. Não bloqueie o celular nem troque de app durante o turno.'
        : `A localização só é enviada com o app aberto. Para funcionar com a tela apagada, permita a localização ${
            Platform.OS === 'ios' ? '"Sempre"' : '"o tempo todo"'
          } nas configurações.`,
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
  const { eu, sair, notificacoes } = useSessao();
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
    // Com turno aberto, confere sozinho: a cada 10 s sem notificação (oferta tem prazo curto);
    // com ela, só como rede de segurança.
    refetchInterval: emTurno ? (notificacoes === 'ativa' ? 60_000 : 10_000) : false,
  });

  // Oferta nova na lista: alerta sonoro na versão de navegador (no app, a notificação já tocou).
  const ofertasVistas = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!entregas.data) return;
    const ofertas = entregas.data.filter((p) => p.status === 'atribuido').map((p) => p.id);
    const novas = ofertasVistas.current ? ofertas.filter((id) => !ofertasVistas.current!.has(id)) : [];
    ofertasVistas.current = new Set(ofertas);
    if (novas.length > 0) alertarOferta();
  }, [entregas.data]);

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
      // Dentro do toque: o navegador do iPhone só deixa tocar o alerta depois de um toque.
      liberarSom();
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
  const ofertas = lista.filter((p) => p.status === 'atribuido');
  const emAndamento = lista.filter((p) => p.status !== 'atribuido');

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
        {/* Oferta primeiro: é o que tem prazo correndo. */}
        {ofertas.map((p) => (
          <CartaoOferta key={p.id} empresaId={empresaId} pedido={p} />
        ))}
        <Placa textoPlaca={nomeEmpresa} />
        {empresas.length > 1 && (
          <Botao titulo="Trocar de empresa" variante="secundario" aoTocar={() => router.push('/empresas')} />
        )}

        <Secao titulo="Turno">
          {outra ? (
            <>
              <Aviso tipo="info">
                Você está em turno na {outra.nomeFantasia}. Encerre aquele turno para rodar aqui.
              </Aviso>
              <Botao titulo={`Ir para ${outra.nomeFantasia}`} aoTocar={() => router.replace(`/${outra.empresaId}`)} />
            </>
          ) : emTurno ? (
            <>
              <Text style={texto.corpo}>Em turno desde {horaCurta(turno.data!.turno!.iniciadoEm)}.</Text>
              {gps && <Aviso tipo={AVISO_GPS[gps].tipo}>{AVISO_GPS[gps].texto}</Aviso>}
              {Platform.OS === 'web' && (
                <Botao
                  titulo={telaAcesaDisponivel() ? 'Manter a tela acesa e ligar o som' : 'Ligar o som dos alertas'}
                  variante="secundario"
                  aoTocar={() => {
                    // Reforço manual: alguns navegadores só aceitam com um toque da pessoa.
                    liberarSom();
                    void manterTelaAcesa(true);
                  }}
                />
              )}
              {gps === 'so_com_app_aberto' && Platform.OS !== 'web' && (
                <Botao titulo="Abrir configurações" variante="secundario" aoTocar={() => Linking.openSettings()} />
              )}
              {notificacoes === 'negada' && (
                <>
                  <Aviso>
                    Notificações desligadas: com o celular no bolso, você não fica sabendo de pedido novo. Ligue nas
                    configurações do app.
                  </Aviso>
                  <Botao titulo="Ligar notificações" variante="secundario" aoTocar={() => Linking.openSettings()} />
                </>
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
              <Botao
                titulo="Começar turno"
                variante="sucesso"
                carregando={iniciar.isPending}
                aoTocar={() => iniciar.mutate()}
              />
            </>
          )}
        </Secao>

        <Text style={texto.subtitulo} accessibilityRole="header">
          Suas entregas {emAndamento.length > 0 ? `(${emAndamento.length})` : ''}
        </Text>
        {entregas.error && <Aviso>{entregas.error.message}</Aviso>}
        {emAndamento.length === 0 && !entregas.isLoading ? (
          <Text style={texto.apoio}>
            {ofertas.length > 0
              ? 'Aceite a oferta acima para ela entrar aqui.'
              : 'Nenhuma entrega com você agora. Quando chegar uma oferta, ela aparece aqui em cima.'}
          </Text>
        ) : (
          emAndamento.map((p) => <CartaoEntrega key={p.id} empresaId={empresaId} pedido={p} />)
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
