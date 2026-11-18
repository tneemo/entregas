// Mapa de ruas pequeno, montado com as imagens (tiles) do OpenStreetMap, sem biblioteca nativa:
// funciona igual no Android, no iPhone e na versão de navegador. Mostra coleta, entrega e onde
// o motoboy está, enquadrando os pontos. Não arrasta nem dá zoom: é para bater o olho na oferta.
// A navegação continua no Google Maps / Waze.
//
// Política de uso dos tiles do OpenStreetMap: identificar o app (User-Agent) e dar o crédito.
// O painel já usa os mesmos tiles; para volume grande, trocar por um provedor pago (ver ARQUITETURA).

import { useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import type { Coordenadas } from '@entregas/shared';
import { cores } from './tema.ts';

const TILE = 256;
const MARGEM = 36;
const ZOOM_MAX = 16;
const ZOOM_MIN = 11;
const CABECALHOS = Platform.OS === 'web' ? undefined : { 'User-Agent': 'EntregasMotoboy/0.1 (entregas.tneemo.com)' };

export interface PontoMapa extends Coordenadas {
  tipo: 'coleta' | 'entrega' | 'voce';
}

/** Coordenada → pixel no "mundo" de tiles do zoom z (projeção Web Mercator). */
function projetar({ latitude, longitude }: Coordenadas, z: number) {
  const n = TILE * 2 ** z;
  const seno = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * n,
    y: (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * n,
  };
}

const ESTILO_PONTO: Record<PontoMapa['tipo'], { cor: string; letra: string; rotulo: string }> = {
  coleta: { cor: cores.mercosul, letra: 'C', rotulo: 'Coleta' },
  entrega: { cor: cores.aluguel, letra: 'E', rotulo: 'Entrega' },
  voce: { cor: cores.sinal, letra: '', rotulo: 'Você' },
};

export function MapaEstatico({ pontos, altura = 190 }: { pontos: PontoMapa[]; altura?: number }) {
  const [largura, setLargura] = useState(0);
  const medir = (e: { nativeEvent: { layout: { width: number } } }) => setLargura(e.nativeEvent.layout.width);

  if (pontos.length === 0) return null;
  if (largura === 0) return <View onLayout={medir} style={{ height: altura }} />;

  // Maior zoom em que todos os pontos cabem com folga.
  let z = ZOOM_MAX;
  for (; z > ZOOM_MIN; z--) {
    const p = pontos.map((ponto) => projetar(ponto, z));
    const largo = Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x));
    const alto = Math.max(...p.map((q) => q.y)) - Math.min(...p.map((q) => q.y));
    if (largo <= largura - 2 * MARGEM && alto <= altura - 2 * MARGEM) break;
  }
  const px = pontos.map((ponto) => ({ ...ponto, ...projetar(ponto, z) }));
  const centroX = (Math.max(...px.map((q) => q.x)) + Math.min(...px.map((q) => q.x))) / 2;
  const centroY = (Math.max(...px.map((q) => q.y)) + Math.min(...px.map((q) => q.y))) / 2;
  const origemX = centroX - largura / 2;
  const origemY = centroY - altura / 2;

  const tiles: { x: number; y: number }[] = [];
  const limite = 2 ** z;
  for (let x = Math.floor(origemX / TILE); x <= Math.floor((origemX + largura) / TILE); x++) {
    for (let y = Math.floor(origemY / TILE); y <= Math.floor((origemY + altura) / TILE); y++) {
      if (y >= 0 && y < limite) tiles.push({ x, y });
    }
  }

  const coleta = px.find((q) => q.tipo === 'coleta');
  const entrega = px.find((q) => q.tipo === 'entrega');
  const linha =
    coleta && entrega
      ? {
          meioX: (coleta.x + entrega.x) / 2 - origemX,
          meioY: (coleta.y + entrega.y) / 2 - origemY,
          tamanho: Math.hypot(entrega.x - coleta.x, entrega.y - coleta.y),
          angulo: Math.atan2(entrega.y - coleta.y, entrega.x - coleta.x),
        }
      : null;

  const descricao = pontos.map((p) => ESTILO_PONTO[p.tipo].rotulo).join(', ');
  return (
    <View
      onLayout={medir}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Mapa com ${descricao}`}
      style={{ height: altura, overflow: 'hidden', borderRadius: 8, backgroundColor: cores.linha }}
    >
      {tiles.map((t) => (
        <Image
          key={`${t.x}-${t.y}`}
          source={{
            uri: `https://tile.openstreetmap.org/${z}/${((t.x % limite) + limite) % limite}/${t.y}.png`,
            headers: CABECALHOS,
          }}
          style={{
            position: 'absolute',
            left: t.x * TILE - origemX,
            top: t.y * TILE - origemY,
            width: TILE,
            height: TILE,
          }}
        />
      ))}
      {linha && (
        <View
          style={{
            position: 'absolute',
            left: linha.meioX - linha.tamanho / 2,
            top: linha.meioY - 2.5,
            width: linha.tamanho,
            height: 5,
            borderRadius: 3,
            backgroundColor: cores.mercosul,
            opacity: 0.75,
            transform: [{ rotate: `${linha.angulo}rad` }],
          }}
        />
      )}
      {px.map((q) => {
        const estilo = ESTILO_PONTO[q.tipo];
        const tamanho = q.tipo === 'voce' ? 20 : 30;
        return (
          <View
            key={q.tipo}
            style={{
              position: 'absolute',
              left: q.x - origemX - tamanho / 2,
              top: q.y - origemY - tamanho / 2,
              width: tamanho,
              height: tamanho,
              borderRadius: tamanho / 2,
              backgroundColor: estilo.cor,
              borderWidth: 3,
              borderColor: cores.branco,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {estilo.letra ? (
              <Text style={{ color: cores.branco, fontWeight: '800', fontSize: 13 }}>{estilo.letra}</Text>
            ) : null}
          </View>
        );
      })}
      <Text
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          fontSize: 10,
          color: cores.asfalto,
          backgroundColor: 'rgba(255,255,255,0.8)',
          paddingHorizontal: 4,
        }}
      >
        © OpenStreetMap
      </Text>
    </View>
  );
}
