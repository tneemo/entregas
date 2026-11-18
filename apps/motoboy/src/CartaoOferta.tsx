// Oferta de pedido, no estilo dos apps de entrega: mapa da coleta até a entrega, distâncias,
// quanto vale, quanto cobrar, o tempo correndo e dois botões grandes. Aparece no topo da lista
// para todo pedido esperando o aceite (oferta automática ou atribuição da central).

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ROTULOS_PAGAMENTO,
  distanciaMetros,
  formatarReais,
  minutosDeTrajeto,
  type Coordenadas,
  type PedidoDetalhe,
  type PedidoResumo,
} from '@entregas/shared';
import { apiComRepeticao, novaChave } from './api.ts';
import { Aviso } from './componentes.tsx';
import { MapaEstatico, type PontoMapa } from './MapaEstatico.tsx';
import { posicaoAtual } from './rastreio.ts';
import { cores, espaco, texto } from './tema.ts';

const km = (metros: number) => `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;

/** "≈ 1,2 km · 4 min": distância em linha reta e o tempo estimado de moto na cidade. */
function trecho(de: Coordenadas | null | undefined, ate: Coordenadas | null | undefined) {
  if (!de || !ate) return null;
  const metros = distanciaMetros(de, ate);
  return `≈ ${km(metros)} · ${minutosDeTrajeto(metros)} min`;
}

function useSegundosRestantes(ate: string | null) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!ate) return;
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, [ate]);
  return ate ? Math.max(0, Math.round((Date.parse(ate) - agora) / 1000)) : null;
}

export function CartaoOferta({ empresaId, pedido }: { empresaId: string; pedido: PedidoResumo }) {
  const consultas = useQueryClient();
  const [voce, setVoce] = useState<Coordenadas>();
  const chaves = useRef<Record<string, string>>({});
  const restantes = useSegundosRestantes(pedido.aceiteAte);
  // O prazo conta a partir da atribuição (atualizadoEm é a hora em que o pedido chegou a você).
  const total = pedido.aceiteAte
    ? Math.max(1, (Date.parse(pedido.aceiteAte) - Date.parse(pedido.atualizadoEm)) / 1000)
    : null;

  useEffect(() => {
    posicaoAtual().then(setVoce);
  }, []);

  const responder = useMutation({
    mutationFn: async (acao: 'aceitar' | 'recusar') => {
      chaves.current[acao] ??= novaChave();
      const posicao = await posicaoAtual();
      return apiComRepeticao<PedidoDetalhe>(`/empresas/${empresaId}/pedidos/${pedido.id}/acoes/${acao}`, {
        metodo: 'POST',
        corpo: posicao ?? {},
        chave: chaves.current[acao]!,
      });
    },
    onSuccess: (_r, acao) => {
      consultas.invalidateQueries({ queryKey: ['entregas', empresaId] });
      if (acao === 'aceitar') router.push(`/${empresaId}/${pedido.id}`);
    },
  });

  const pontos: PontoMapa[] = [
    ...(pedido.pontoColeta ? [{ ...pedido.pontoColeta, tipo: 'coleta' as const }] : []),
    ...(pedido.destino.coordenadas ? [{ ...pedido.destino.coordenadas, tipo: 'entrega' as const }] : []),
    ...(voce ? [{ ...voce, tipo: 'voce' as const }] : []),
  ];
  const ateColeta = trecho(voce, pedido.pontoColeta);
  const coletaEntrega = trecho(pedido.pontoColeta, pedido.destino.coordenadas);
  const urgente = restantes !== null && restantes <= 15;
  const esgotado = restantes === 0;

  return (
    <View
      accessibilityLabel={`Oferta do pedido ${pedido.numero}`}
      style={{
        backgroundColor: cores.branco,
        borderRadius: 12,
        borderWidth: 3,
        borderColor: cores.sinal,
        overflow: 'hidden',
      }}
    >
      <View style={{ backgroundColor: cores.sinal, paddingHorizontal: espaco.m, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: cores.asfalto }}>
            {pedido.ofertaAutomatica ? 'Nova entrega para você' : 'A central mandou para você'}
          </Text>
          {restantes !== null && (
            <Text
              accessibilityLabel={`${restantes} segundos para responder`}
              style={{ fontSize: 22, fontWeight: '800', color: urgente ? cores.aluguel : cores.asfalto }}
            >
              {restantes} s
            </Text>
          )}
        </View>
        {restantes !== null && total !== null && (
          <View style={{ height: 6, backgroundColor: 'rgba(30,37,41,0.15)', borderRadius: 3, marginTop: 8 }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                width: `${Math.min(100, (restantes / total) * 100)}%`,
                backgroundColor: urgente ? cores.aluguel : cores.asfalto,
              }}
            />
          </View>
        )}
      </View>

      <MapaEstatico pontos={pontos} altura={160} />

      <View style={{ padding: espaco.m, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={[texto.titulo, { color: cores.ok }]}>
            {formatarReais(pedido.taxaEntregaCentavos)} <Text style={texto.apoio}>taxa de entrega</Text>
          </Text>
          <Text style={texto.apoio}>Pedido {pedido.numero}</Text>
        </View>
        <Linha
          cor={cores.mercosul}
          letra="C"
          titulo={pedido.loja?.nome ?? pedido.origem.nome ?? 'Coleta'}
          detalhe={`${pedido.origem.bairro}${ateColeta ? ` · você está a ${ateColeta}` : ''}`}
        />
        <Linha
          cor={cores.aluguel}
          letra="E"
          titulo={pedido.destino.bairro}
          detalhe={`${pedido.destino.logradouro}, ${pedido.destino.numero}${coletaEntrega ? ` · ${coletaEntrega} da coleta` : ''}`}
        />
        <Text style={[texto.corpo, { fontWeight: '700' }]}>
          {pedido.formaPagamento === 'pago'
            ? 'Já pago: não cobrar nada'
            : `Cobrar ${formatarReais(pedido.valorACobrarCentavos)} (${ROTULOS_PAGAMENTO[pedido.formaPagamento]})`}
        </Text>
        {responder.error && <Aviso>{responder.error.message}</Aviso>}
        {esgotado ? (
          <Aviso tipo="info">O tempo acabou. Se a oferta não sumir sozinha, puxe a lista para atualizar.</Aviso>
        ) : (
          <View style={{ flexDirection: 'row', gap: espaco.p }}>
            <BotaoOferta
              titulo="Recusar"
              fundo={cores.branco}
              letra={cores.aluguel}
              borda={cores.aluguel}
              ocupado={responder.isPending && responder.variables === 'recusar'}
              desativado={responder.isPending}
              aoTocar={() => responder.mutate('recusar')}
              flex={1}
            />
            <BotaoOferta
              titulo="Aceitar"
              fundo={cores.ok}
              letra={cores.branco}
              borda={cores.ok}
              ocupado={responder.isPending && responder.variables === 'aceitar'}
              desativado={responder.isPending}
              aoTocar={() => responder.mutate('aceitar')}
              flex={2}
            />
          </View>
        )}
        <Pressable accessibilityRole="link" onPress={() => router.push(`/${empresaId}/${pedido.id}`)}>
          <Text style={[texto.apoio, { color: cores.mercosul, textDecorationLine: 'underline', textAlign: 'center' }]}>
            Ver todos os detalhes
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Linha({ cor, letra, titulo, detalhe }: { cor: string; letra: string; titulo: string; detalhe: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: cor,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
        }}
      >
        <Text style={{ color: cores.branco, fontWeight: '800', fontSize: 13 }}>{letra}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[texto.corpo, { fontWeight: '700' }]}>{titulo}</Text>
        <Text style={texto.apoio}>{detalhe}</Text>
      </View>
    </View>
  );
}

function BotaoOferta({
  titulo,
  fundo,
  letra,
  borda,
  ocupado,
  desativado,
  aoTocar,
  flex,
}: {
  titulo: string;
  fundo: string;
  letra: string;
  borda: string;
  ocupado: boolean;
  desativado: boolean;
  aoTocar: () => void;
  flex: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: desativado, busy: ocupado }}
      disabled={desativado}
      onPress={aoTocar}
      style={({ pressed }) => ({
        flex,
        minHeight: 64,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: borda,
        backgroundColor: fundo,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: desativado && !ocupado ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 20, fontWeight: '800', color: letra }}>{ocupado ? 'Enviando…' : titulo}</Text>
    </Pressable>
  );
}
