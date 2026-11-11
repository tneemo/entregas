import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  POSICAO_ATRASADA_S,
  preverChegada,
  textoPrevisao,
  type MotoboyResumo,
  type PedidoResumo,
  type PosicaoMotoboy,
} from '@entregas/shared';
import { useAoVivo } from '../tempo-real.ts';
import { Mapa, type Linha, type Marcador } from '../componentes/Mapa.tsx';
import { SeloStatus, useAgora, useMotoboys, usePedidos } from '../componentes/pedido.tsx';
import { AvisoErro, Cartao, IndicadorConexao } from '../componentes/ui.tsx';

function tempoDesde(iso: string, agora: number) {
  const s = Math.max(0, Math.round((agora - Date.parse(iso)) / 1000));
  if (s < 5) return 'instantes';
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

const atrasada = (p: PosicaoMotoboy, agora: number) => agora - Date.parse(p.registradoEm) > POSICAO_ATRASADA_S * 1000;

/** Previsão de chegada ao cliente, quando há posição recente e o endereço tem ponto no mapa. */
function chegada(pedido: PedidoResumo, posicao: PosicaoMotoboy | undefined, agora: number) {
  if (pedido.status !== 'em_rota' || !posicao || !pedido.destino.coordenadas || atrasada(posicao, agora)) return null;
  return textoPrevisao(preverChegada(posicao, pedido.destino.coordenadas));
}

function LinhaMotoboy({
  motoboy,
  posicao,
  pedidos,
  agora,
  empresaId,
  aoFocar,
}: {
  motoboy: MotoboyResumo;
  posicao: PosicaoMotoboy | undefined;
  pedidos: PedidoResumo[];
  agora: number;
  empresaId: string;
  aoFocar: () => void;
}) {
  const parado = posicao && atrasada(posicao, agora);
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        {posicao ? (
          <button type="button" onClick={aoFocar} className="text-left font-medium text-mercosul hover:underline">
            {motoboy.nome}
          </button>
        ) : (
          <span className="font-medium">{motoboy.nome}</span>
        )}
        <span className="shrink-0 text-sm text-concreto">
          {pedidos.length === 0 ? 'Livre' : `${pedidos.length} ${pedidos.length === 1 ? 'entrega' : 'entregas'}`}
        </span>
      </div>
      <span className="inline-flex items-center gap-1.5 text-sm text-concreto">
        <span className={`h-2 w-2 rounded-full ${!posicao ? 'bg-linha' : parado ? 'bg-sinal' : 'bg-ok'}`} aria-hidden />
        {!posicao
          ? 'Ainda sem localização'
          : parado
            ? `Sem sinal há ${tempoDesde(posicao.registradoEm, agora)}`
            : `Posição atualizada há ${tempoDesde(posicao.registradoEm, agora)}`}
      </span>
      {!motoboy.recebeNotificacao && (
        <span className="text-sm text-concreto">
          Sem notificação no celular: pedido novo, só com o app aberto. Avise por telefone.
        </span>
      )}
      {pedidos.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {pedidos.map((p) => {
            const previsao = chegada(p, posicao, agora);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <Link
                  to={`/e/${empresaId}/pedidos/${p.id}`}
                  className="font-cond text-base font-semibold text-mercosul hover:underline"
                >
                  Pedido {p.numero}
                </Link>
                <SeloStatus status={p.status} />
                <span className="truncate text-concreto">{p.destino.bairro}</span>
                {previsao && (
                  <span className="basis-full font-medium">
                    {previsao === 'Chegando' ? 'Chegando ao cliente' : `Chega ao cliente em ${previsao}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function MapaAoVivo() {
  const { empresaId = '' } = useParams();
  const navegar = useNavigate();
  const aoVivo = useAoVivo(empresaId);
  const motoboys = useMotoboys(empresaId);
  const pedidos = usePedidos(empresaId, 'ativos');
  const agora = useAgora();
  const [foco, setFoco] = useState<{ id: string } | null>(null);

  const emTurno = motoboys.data?.filter((m) => m.emTurno) ?? [];
  const pedidosDe = (vinculoId: string) => pedidos.data?.filter((p) => p.motoboy?.vinculoId === vinculoId) ?? [];
  const semMotoboy = pedidos.data?.filter((p) => p.status === 'pendente') ?? [];

  // Motoboys, pedidos esperando (no ponto de coleta) e o destino de cada entrega na rua.
  const { marcadores, linhas } = useMemo(() => {
    const marcadores: Marcador[] = Object.values(aoVivo.motoboys).map((p) => ({
      id: p.vinculoId,
      latitude: p.latitude,
      longitude: p.longitude,
      rotulo: p.nome.trim().split(/\s+/)[0] ?? p.nome,
      atrasado: atrasada(p, agora),
    }));
    const linhas: Linha[] = [];
    const coletasVistas = new Set<string>();
    for (const p of pedidos.data ?? []) {
      if (p.status === 'pendente' && p.pontoColeta) {
        // Vários pedidos esperando na mesma loja: um pino só, com a contagem.
        const chave = `${p.pontoColeta.latitude},${p.pontoColeta.longitude}`;
        if (coletasVistas.has(chave)) continue;
        coletasVistas.add(chave);
        const iguais = (pedidos.data ?? []).filter(
          (o) =>
            o.status === 'pendente' &&
            o.pontoColeta?.latitude === p.pontoColeta!.latitude &&
            o.pontoColeta?.longitude === p.pontoColeta!.longitude,
        );
        marcadores.push({
          id: `espera:${p.id}`,
          tipo: 'espera',
          ...p.pontoColeta,
          rotulo: iguais.length === 1 ? `${p.numero} aguarda motoboy` : `${iguais.length} aguardam motoboy`,
        });
      } else if (p.status === 'em_rota' && p.destino.coordenadas) {
        marcadores.push({ id: `entrega:${p.id}`, tipo: 'entrega', ...p.destino.coordenadas, rotulo: String(p.numero) });
        const posicao = p.motoboy && aoVivo.motoboys[p.motoboy.vinculoId];
        if (posicao) linhas.push({ id: p.id, de: posicao, para: p.destino.coordenadas });
      }
    }
    return { marcadores, linhas };
  }, [aoVivo.motoboys, pedidos.data, agora]);

  function aoClicarNoMapa(id: string) {
    const [tipo, pedidoId] = id.split(':');
    if (tipo === 'entrega') navegar(`/e/${empresaId}/pedidos/${pedidoId}`);
    else if (tipo === 'espera') navegar(`/e/${empresaId}/pedidos`);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl">Mapa ao vivo</h1>
          <p className="text-concreto">
            {motoboys.data
              ? `${emTurno.length} ${emTurno.length === 1 ? 'motoboy' : 'motoboys'} em turno.`
              : 'Carregando…'}
            {semMotoboy.length > 0 && (
              <>
                {' '}
                <Link to={`/e/${empresaId}/pedidos`} className="font-medium text-mercosul underline">
                  {semMotoboy.length} {semMotoboy.length === 1 ? 'pedido aguarda' : 'pedidos aguardam'} motoboy
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <IndicadorConexao conexao={aoVivo.conexao} />
      </header>

      <AvisoErro erro={motoboys.error ?? pedidos.error} />

      <div className="grid gap-5 xl:grid-cols-[1fr_21rem]">
        <div className="flex flex-col gap-2">
          <Mapa
            marcadores={marcadores}
            linhas={linhas}
            foco={foco}
            aoClicar={aoClicarNoMapa}
            rotulo="Mapa com os motoboys em turno, os pedidos aguardando motoboy e o destino das entregas na rua. A mesma informação está na lista ao lado."
            className="h-[60dvh] min-h-80 xl:h-[calc(100dvh-14rem)]"
          />
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-concreto" aria-label="Legenda do mapa">
            <li className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-full border-2 border-white bg-[#0b3d91] ring-1 ring-asfalto"
                aria-hidden
              />
              Motoboy
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#b3122a]" aria-hidden />
              Destino de entrega na rua
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#e5a50a]" aria-hidden />
              Pedido aguardando motoboy
            </li>
          </ul>
        </div>
        <section aria-labelledby="titulo-em-turno" className="flex flex-col gap-2">
          <h2 id="titulo-em-turno" className="text-2xl">
            Em turno
          </h2>
          {motoboys.data && emTurno.length === 0 ? (
            <p className="text-concreto">
              Ninguém em turno agora. O motoboy começa o turno pelo app, e a posição aparece aqui.
            </p>
          ) : (
            <Cartao>
              <ul className="divide-y divide-linha">
                {emTurno.map((m) => (
                  <LinhaMotoboy
                    key={m.vinculoId}
                    motoboy={m}
                    posicao={aoVivo.motoboys[m.vinculoId]}
                    pedidos={pedidosDe(m.vinculoId)}
                    agora={agora}
                    empresaId={empresaId}
                    aoFocar={() => setFoco({ id: m.vinculoId })}
                  />
                ))}
              </ul>
            </Cartao>
          )}
          <p className="mt-1 text-sm text-concreto">
            A posição só é registrada durante o turno e some do mapa quando o motoboy encerra.
          </p>
        </section>
      </div>
    </div>
  );
}
