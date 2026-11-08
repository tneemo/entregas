// Mapa do painel e da página de rastreio.
//
// Hoje: Leaflet + OpenStreetMap, sem chave nem custo, para desenvolvimento e piloto.
// A política de uso dos servidores do OSM não comporta volume de produção: quando a
// conta do Google Cloud existir, a troca para o Maps JavaScript acontece só aqui
// (mesmas props), sem mexer nas telas.

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Centro de Cascavel/PR: ponto de partida antes de haver posições. */
const CENTRO_INICIAL: L.LatLngTuple = [-24.9555, -53.4552];

export interface Marcador {
  id: string;
  latitude: number;
  longitude: number;
  rotulo: string;
  /** Sem posição nova há algum tempo: aparece apagado. */
  atrasado?: boolean;
  /** Raio de precisão do GPS, em metros. */
  precisao?: number | null;
}

function icone(m: Marcador) {
  // Montado com textContent: o nome vem do cadastro e não pode virar HTML.
  const raiz = document.createElement('div');
  raiz.className = `marcador-moto${m.atrasado ? ' marcador-moto--atrasado' : ''}`;
  const pino = document.createElement('span');
  pino.className = 'marcador-moto__pino';
  const nome = document.createElement('span');
  nome.className = 'marcador-moto__nome';
  nome.textContent = m.rotulo;
  raiz.append(pino, nome);
  return L.divIcon({ html: raiz, className: '', iconSize: [0, 0], iconAnchor: [0, 0] });
}

export function Mapa({
  marcadores,
  foco,
  seguir = false,
  rotulo,
  className = '',
}: {
  marcadores: Marcador[];
  /** Marcador para centralizar (ex.: clicou no nome na lista). Objeto novo a cada clique. */
  foco?: { id: string } | null;
  /** Acompanha o único marcador quando ele anda (página de rastreio). */
  seguir?: boolean;
  /** Descrição para leitores de tela. */
  rotulo: string;
  className?: string;
}) {
  const elemento = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camadas = useRef(new Map<string, { marcador: L.Marker; circulo: L.Circle | null; chave: string }>());
  const enquadrou = useRef(false);

  useEffect(() => {
    if (!elemento.current) return;
    const m = L.map(elemento.current, { center: CENTRO_INICIAL, zoom: 13, zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    mapa.current = m;
    const atuais = camadas.current;
    return () => {
      m.remove();
      mapa.current = null;
      atuais.clear();
      enquadrou.current = false;
    };
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const vistos = new Set<string>();
    for (const dado of marcadores) {
      vistos.add(dado.id);
      const posicao: L.LatLngTuple = [dado.latitude, dado.longitude];
      const chave = `${dado.rotulo}|${dado.atrasado ? 1 : 0}`;
      const existente = camadas.current.get(dado.id);
      if (existente) {
        existente.marcador.setLatLng(posicao);
        if (existente.chave !== chave) {
          existente.marcador.setIcon(icone(dado));
          existente.chave = chave;
        }
        existente.circulo?.setLatLng(posicao).setRadius(dado.precisao ?? 0);
      } else {
        const marcador = L.marker(posicao, { icon: icone(dado), keyboard: false, title: dado.rotulo }).addTo(m);
        const circulo =
          dado.precisao != null
            ? L.circle(posicao, { radius: dado.precisao, color: '#0b3d91', weight: 1, fillOpacity: 0.08 }).addTo(m)
            : null;
        camadas.current.set(dado.id, { marcador, circulo, chave });
      }
    }
    for (const [id, camada] of camadas.current) {
      if (vistos.has(id)) continue;
      camada.marcador.remove();
      camada.circulo?.remove();
      camadas.current.delete(id);
    }

    // Enquadra na primeira vez que há posições; depois quem manda no zoom é a pessoa.
    if (!enquadrou.current && marcadores.length > 0) {
      enquadrou.current = true;
      if (marcadores.length === 1) m.setView([marcadores[0]!.latitude, marcadores[0]!.longitude], 16);
      else m.fitBounds(L.latLngBounds(marcadores.map((d) => [d.latitude, d.longitude])), { padding: [48, 48], maxZoom: 16 });
    } else if (seguir && marcadores.length === 1) {
      m.panTo([marcadores[0]!.latitude, marcadores[0]!.longitude]);
    }
  }, [marcadores, seguir]);

  useEffect(() => {
    const alvo = foco ? camadas.current.get(foco.id) : undefined;
    if (alvo && mapa.current) mapa.current.flyTo(alvo.marcador.getLatLng(), Math.max(mapa.current.getZoom(), 16));
  }, [foco]);

  return <div ref={elemento} role="region" aria-label={rotulo} className={`z-0 overflow-hidden rounded-md border border-linha bg-linha/40 ${className}`} />;
}
