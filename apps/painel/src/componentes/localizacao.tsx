// Confirmação do endereço no mapa, embaixo dos campos de endereço.
//
// Com o endereço completo, a API busca o ponto (Google, ou OpenStreetMap enquanto não há
// chave). A pessoa confere e, se precisar, clica no mapa ou arrasta o pino até a porta: aí
// o ponto vale como exato. Nada aqui é obrigatório: sem ponto, o pedido sai do mesmo jeito.

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import type { Coordenadas, LocalizarResposta } from '@entregas/shared';
import { api } from '../api.ts';
import { Botao } from './ui.tsx';
import type { EnderecoForm } from './pedido.tsx';

// O mapa (Leaflet) só baixa quando há endereço para mostrar.
const MapaPino = lazy(() => import('./Mapa.tsx').then((m) => ({ default: m.MapaPino })));

/** Espera a pessoa parar de digitar antes de consultar (o OpenStreetMap aceita 1 consulta por segundo). */
const ESPERA_MS = 1000;

const completo = (e: EnderecoForm) =>
  e.logradouro.trim().length >= 2 && e.numero.trim() && e.bairro.trim().length >= 2 && e.cidade.trim() && e.uf.trim();

const chaveDe = (e: EnderecoForm) =>
  [e.logradouro, e.numero, e.bairro, e.cidade, e.uf].map((p) => p.trim().toLowerCase()).join('|');

type Busca = 'parada' | 'buscando' | 'nao_achou' | 'falhou';

export function LocalizacaoEndereco({
  valor,
  aoMudar,
  tipo,
}: {
  valor: EnderecoForm;
  aoMudar: (v: EnderecoForm) => void;
  tipo: 'coleta' | 'entrega';
}) {
  const { empresaId = '' } = useParams();
  const [busca, setBusca] = useState<Busca>('parada');
  const ultimaChave = useRef<string | null>(null);
  // O efeito abaixo lê sempre o endereço mais novo sem reagendar a busca a cada tecla do pino.
  const atual = useRef(valor);
  atual.current = valor;
  const mudar = useRef(aoMudar);
  mudar.current = aoMudar;

  const pronto = Boolean(completo(valor));
  const chave = pronto ? chaveDe(valor) : null;
  const temPonto = Boolean(valor.localizacao);

  async function buscar(forcar = false) {
    const endereco = atual.current;
    const k = chaveDe(endereco);
    if (!forcar && ultimaChave.current === k) return;
    ultimaChave.current = k;
    setBusca('buscando');
    try {
      const { localizacao } = await api<LocalizarResposta>(`/empresas/${empresaId}/enderecos/localizar`, {
        metodo: 'POST',
        corpo: endereco,
      });
      // A pessoa mudou o endereço enquanto buscava: esta resposta não vale mais.
      if (chaveDe(atual.current) !== k) return;
      if (localizacao) {
        mudar.current({ ...atual.current, localizacao });
        setBusca('parada');
      } else setBusca('nao_achou');
    } catch {
      setBusca('falhou');
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: a busca lê refs; só o texto do endereço deve reagendar.
  useEffect(() => {
    if (!chave || temPonto || chave === ultimaChave.current) return;
    const t = setTimeout(() => void buscar(), ESPERA_MS);
    return () => clearTimeout(t);
  }, [chave, temPonto]);

  function marcar(ponto: Coordenadas) {
    mudar.current({ ...atual.current, localizacao: { ...ponto, precisao: 'numero', fonte: 'mapa' } });
    setBusca('parada');
  }

  if (!pronto && !temPonto) return null;

  const l = valor.localizacao;
  let aviso: { texto: string; cor: string };
  if (busca === 'buscando') aviso = { texto: 'Procurando o endereço no mapa…', cor: 'border-linha' };
  else if (l?.fonte === 'mapa') aviso = { texto: 'Local marcado no mapa.', cor: 'border-ok' };
  else if (l?.precisao === 'numero')
    aviso = { texto: 'Achamos o endereço. Confira o pino; se precisar, arraste até a porta.', cor: 'border-ok' };
  else if (l)
    aviso = {
      texto:
        l.precisao === 'rua'
          ? 'Achamos só a rua, não o número. Arraste o pino até a porta para o motoboy chegar certo.'
          : 'Local aproximado. Arraste o pino até a porta para o motoboy chegar certo.',
      cor: 'border-sinal',
    };
  else if (busca === 'falhou')
    aviso = { texto: 'Não deu para buscar agora. Clique no mapa onde fica o endereço.', cor: 'border-sinal' };
  else if (busca === 'nao_achou')
    aviso = { texto: 'Não achamos no mapa. Clique no mapa onde fica o endereço.', cor: 'border-sinal' };
  else aviso = { texto: 'Clique no mapa onde fica o endereço.', cor: 'border-linha' };

  return (
    <div className="flex flex-col gap-2 sm:col-span-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`border-l-4 bg-white px-3 py-1.5 text-sm ${aviso.cor}`} role="status">
          {aviso.texto}
        </p>
        {pronto && busca !== 'buscando' && (
          <Botao variante="discreto" className="text-sm" onClick={() => void buscar(true)}>
            Buscar de novo pelo endereço
          </Botao>
        )}
      </div>
      <Suspense fallback={<div className="h-64 rounded-md border border-linha bg-linha/40" />}>
        <MapaPino
          ponto={l ?? null}
          tipo={tipo}
          aoMarcar={marcar}
          rotulo={`Mapa para marcar o endereço de ${tipo}`}
          className="h-64"
        />
      </Suspense>
    </div>
  );
}
