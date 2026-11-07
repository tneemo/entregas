import { useState } from 'react';
import { Image, Linking, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROTULOS_PAGAMENTO,
  TRANSICOES,
  formatarReais,
  formatarTelefone,
  statusFinal,
  type AcaoPedido,
  type DadosAcaoPedido,
  type ParadaResposta,
  type PedidoDetalhe,
  type TipoFoto,
} from '@entregas/shared';
import { api, ErroDaApi } from '../../src/api.ts';
import { Aviso, Botao, Campo, Secao, SeloStatus } from '../../src/componentes.tsx';
import { enviarFoto, tirarFoto } from '../../src/foto.ts';
import { posicaoAtual } from '../../src/rastreio.ts';
import { cores, espaco, texto } from '../../src/tema.ts';

const MOTIVOS_FALHA = ['Cliente não atendeu', 'Endereço não encontrado', 'Cliente recusou o pedido', 'Local fechado'];

function enderecoTexto(p: ParadaResposta) {
  const e = p.endereco;
  return `${e.logradouro}, ${e.numero}${e.complemento ? ` (${e.complemento})` : ''}, ${e.bairro}, ${e.cidade} - ${e.uf}`;
}

function Parada({ titulo, parada }: { titulo: string; parada: ParadaResposta }) {
  const destino = encodeURIComponent(enderecoTexto(parada));
  return (
    <Secao titulo={titulo}>
      {parada.nome ? <Text style={[texto.corpo, { fontWeight: '700' }]}>{parada.nome}</Text> : null}
      <Text style={[texto.corpo, { fontSize: 19 }]}>{enderecoTexto(parada)}</Text>
      {parada.endereco.referencia ? <Text style={texto.apoio}>Referência: {parada.endereco.referencia}</Text> : null}
      <View style={{ flexDirection: 'row', gap: espaco.p, flexWrap: 'wrap' }}>
        <View style={{ flexGrow: 1 }}>
          <Botao
            titulo="Google Maps"
            variante="secundario"
            aoTocar={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destino}&travelmode=driving`)}
          />
        </View>
        <View style={{ flexGrow: 1 }}>
          <Botao titulo="Waze" variante="secundario" aoTocar={() => Linking.openURL(`https://waze.com/ul?q=${destino}&navigate=yes`)} />
        </View>
      </View>
      {parada.telefone ? (
        <Botao
          titulo={`Ligar ${formatarTelefone(parada.telefone)}`}
          variante="secundario"
          aoTocar={() => Linking.openURL(`tel:${parada.telefone}`)}
        />
      ) : null}
    </Secao>
  );
}

/** Formulário das ações que pedem dado: código na entrega, motivo na falha. Foto opcional. */
function FormularioAcao({
  acao,
  aoConfirmar,
  aoVoltar,
  enviando,
  erro,
}: {
  acao: 'entregar' | 'falhar';
  aoConfirmar: (dados: DadosAcaoPedido, fotoUri: string | null) => void;
  aoVoltar: () => void;
  enviando: boolean;
  erro: unknown;
}) {
  const [codigo, setCodigo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [erroFoto, setErroFoto] = useState<string>();
  // A mensagem geral traz o que importa (ex.: quantas tentativas restam); mostramos junto do campo.
  const erroCampo = erro instanceof ErroDaApi && (erro.campos.codigo || erro.campos.motivo) ? erro.message : undefined;

  async function fotografar() {
    setErroFoto(undefined);
    try {
      const uri = await tirarFoto();
      if (uri) setFoto(uri);
    } catch (e) {
      setErroFoto(e instanceof Error ? e.message : 'Não foi possível abrir a câmera.');
    }
  }

  return (
    <Secao titulo={acao === 'entregar' ? 'Confirmar entrega' : 'Não foi possível entregar'}>
      {acao === 'entregar' ? (
        <Campo
          rotulo="Código de 4 dígitos que o cliente informou"
          value={codigo}
          onChangeText={(v) => setCodigo(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          style={{ fontSize: 32, letterSpacing: 12, textAlign: 'center' }}
          erro={erroCampo}
        />
      ) : (
        <>
          <Text style={texto.corpo}>O que aconteceu?</Text>
          {MOTIVOS_FALHA.map((m) => (
            <Botao key={m} titulo={m} variante={motivo === m ? 'principal' : 'secundario'} aoTocar={() => setMotivo(m)} />
          ))}
          <Campo rotulo="Ou descreva" value={MOTIVOS_FALHA.includes(motivo) ? '' : motivo} onChangeText={setMotivo} erro={erroCampo} />
        </>
      )}
      {foto ? (
        <Image source={{ uri: foto }} style={{ width: '100%', height: 220, borderRadius: 8 }} resizeMode="cover" accessibilityLabel="Foto do comprovante" />
      ) : null}
      {erroFoto ? <Aviso>{erroFoto}</Aviso> : null}
      <Botao
        titulo={foto ? 'Tirar outra foto' : acao === 'entregar' ? 'Fotografar comprovante (opcional)' : 'Fotografar o local (opcional)'}
        variante="secundario"
        aoTocar={fotografar}
      />
      {erro instanceof Error && !erroCampo ? <Aviso>{erro.message}</Aviso> : null}
      <Botao
        titulo={TRANSICOES[acao].rotulo}
        variante={acao === 'entregar' ? 'sucesso' : 'perigo'}
        carregando={enviando}
        desativado={acao === 'entregar' ? codigo.length !== 4 : motivo.trim().length < 3}
        aoTocar={() => aoConfirmar(acao === 'entregar' ? { codigo } : { motivo }, foto)}
      />
      <Botao titulo="Voltar" variante="secundario" aoTocar={aoVoltar} />
    </Secao>
  );
}

export default function Entrega() {
  const { empresaId = '', pedidoId = '' } = useLocalSearchParams<{ empresaId: string; pedidoId: string }>();
  const consultas = useQueryClient();
  const [aberta, setAberta] = useState<'entregar' | 'falhar' | null>(null);
  const [concluido, setConcluido] = useState<PedidoDetalhe | null>(null);

  const pedido = useQuery({
    queryKey: ['pedido', empresaId, pedidoId],
    queryFn: () => api<PedidoDetalhe>(`/empresas/${empresaId}/pedidos/${pedidoId}`),
    enabled: !concluido,
  });

  const executar = useMutation({
    mutationFn: async ({ acao, dados, fotoUri }: { acao: AcaoPedido; dados: DadosAcaoPedido; fotoUri?: string | null }) => {
      // A foto sobe antes: se a internet cair no meio, a ação ainda não foi registrada.
      if (fotoUri) {
        const tipo: TipoFoto = acao === 'falhar' ? 'falha' : 'entrega';
        await enviarFoto(empresaId, pedidoId, fotoUri, tipo);
      }
      const posicao = await posicaoAtual();
      return api<PedidoDetalhe>(`/empresas/${empresaId}/pedidos/${pedidoId}/acoes/${acao}`, {
        metodo: 'POST',
        corpo: { ...dados, ...posicao },
      });
    },
    onSuccess: (atualizado) => {
      setAberta(null);
      consultas.invalidateQueries({ queryKey: ['entregas', empresaId] });
      // Recusado ou concluído: o pedido sai da lista do motoboy.
      if (statusFinal(atualizado.status) || atualizado.status === 'pendente') setConcluido(atualizado);
      else consultas.setQueryData(['pedido', empresaId, pedidoId], atualizado);
    },
  });

  if (concluido) {
    const mensagem =
      concluido.status === 'entregue'
        ? `Entrega do pedido ${concluido.numero} confirmada.`
        : concluido.status === 'pendente'
          ? `Pedido ${concluido.numero} devolvido para a central.`
          : `Pedido ${concluido.numero} encerrado: ${concluido.status === 'devolvido' ? 'devolvido à origem' : 'cancelado'}.`;
    return (
      <ScrollView contentContainerStyle={{ padding: espaco.m, gap: espaco.m }}>
        <Aviso tipo="ok">{mensagem}</Aviso>
        <Botao titulo="Voltar para as entregas" aoTocar={() => router.back()} />
      </ScrollView>
    );
  }

  if (pedido.isLoading) return <Text style={[texto.corpo, { padding: espaco.m }]}>Carregando…</Text>;
  if (pedido.error || !pedido.data) {
    return (
      <View style={{ padding: espaco.m, gap: espaco.m }}>
        <Aviso>{pedido.error?.message ?? 'Pedido não encontrado.'}</Aviso>
        <Botao titulo="Voltar" variante="secundario" aoTocar={() => router.back()} />
      </View>
    );
  }

  const p = pedido.data;
  const troco = p.trocoParaCentavos !== null ? p.trocoParaCentavos - p.valorACobrarCentavos : null;
  const acoesSimples = p.acoes.filter((a) => a !== 'entregar' && a !== 'falhar');

  return (
    <>
      <Stack.Screen options={{ title: `Pedido ${p.numero}` }} />
      <ScrollView contentContainerStyle={{ padding: espaco.m, gap: espaco.m, paddingBottom: 48 }}>
        <SeloStatus status={p.status} />

        <Secao titulo="Cobrança">
          {p.formaPagamento === 'pago' ? (
            <Text style={[texto.corpo, { fontSize: 22, fontWeight: '700', color: cores.ok }]}>Já pago: não cobrar nada.</Text>
          ) : (
            <Text style={[texto.corpo, { fontSize: 22, fontWeight: '700' }]}>
              Cobrar {formatarReais(p.valorACobrarCentavos)} ({ROTULOS_PAGAMENTO[p.formaPagamento].toLowerCase()})
            </Text>
          )}
          {troco !== null && troco > 0 ? (
            <Text style={[texto.corpo, { fontSize: 19 }]}>
              Cliente paga com {formatarReais(p.trocoParaCentavos!)}: leve {formatarReais(troco)} de troco.
            </Text>
          ) : null}
        </Secao>

        {p.observacoes ? (
          <Aviso tipo="info">{p.observacoes}</Aviso>
        ) : null}
        {p.codigoBloqueado ? <Aviso>Código bloqueado após várias tentativas. Fale com a central para confirmar a entrega.</Aviso> : null}

        {aberta ? (
          <FormularioAcao
            acao={aberta}
            enviando={executar.isPending}
            erro={executar.error}
            aoVoltar={() => {
              setAberta(null);
              executar.reset();
            }}
            aoConfirmar={(dados, fotoUri) => executar.mutate({ acao: aberta, dados, fotoUri })}
          />
        ) : (
          <View style={{ gap: espaco.p }}>
            {executar.error ? <Aviso>{executar.error.message}</Aviso> : null}
            {acoesSimples.map((a) => (
              <Botao
                key={a}
                titulo={TRANSICOES[a].rotulo}
                variante={a === 'recusar' ? 'perigo' : 'principal'}
                carregando={executar.isPending && executar.variables?.acao === a}
                aoTocar={() => executar.mutate({ acao: a, dados: {} })}
              />
            ))}
            {p.acoes.includes('entregar') && (
              <Botao titulo="Confirmar entrega" variante="sucesso" aoTocar={() => setAberta('entregar')} />
            )}
            {p.acoes.includes('falhar') && (
              <Botao titulo="Não foi possível entregar" variante="perigo" aoTocar={() => setAberta('falhar')} />
            )}
          </View>
        )}

        <Parada titulo="Entregar para" parada={p.entrega} />
        <Parada titulo="Coletar em" parada={p.coleta} />
      </ScrollView>
    </>
  );
}
