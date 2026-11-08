import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { POSICAO_ATRASADA_S, type MotoboyResumo, type PedidoResumo, type PosicaoMotoboy } from '@entregas/shared';
import { useAoVivo } from '../tempo-real.ts';
import { Mapa, type Marcador } from '../componentes/Mapa.tsx';
import { SeloStatus, useMotoboys, usePedidos } from '../componentes/pedido.tsx';
import { AvisoErro, IndicadorConexao } from '../componentes/ui.tsx';

/** Relógio que anda sozinho, para "há 20 s" não congelar na tela. */
function useAgora(intervaloMs = 5_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}

function tempoDesde(iso: string, agora: number) {
  const s = Math.max(0, Math.round((agora - Date.parse(iso)) / 1000));
  if (s < 5) return 'instantes';
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

const atrasada = (p: PosicaoMotoboy, agora: number) => agora - Date.parse(p.registradoEm) > POSICAO_ATRASADA_S * 1000;

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
    <li className="flex flex-col gap-1.5 border-t border-linha py-3">
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
      {pedidos.length > 0 && (
        <ul className="flex flex-col gap-1">
          {pedidos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Link to={`/e/${empresaId}/pedidos/${p.id}`} className="font-cond text-base font-semibold text-mercosul hover:underline">
                Pedido {p.numero}
              </Link>
              <SeloStatus status={p.status} />
              <span className="truncate text-concreto">{p.destino.bairro}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function MapaAoVivo() {
  const { empresaId = '' } = useParams();
  const aoVivo = useAoVivo(empresaId);
  const motoboys = useMotoboys(empresaId);
  const pedidos = usePedidos(empresaId, 'ativos');
  const agora = useAgora();
  const [foco, setFoco] = useState<{ id: string } | null>(null);

  const emTurno = motoboys.data?.filter((m) => m.emTurno) ?? [];
  const marcadores = useMemo<Marcador[]>(
    () =>
      Object.values(aoVivo.motoboys).map((p) => ({
        id: p.vinculoId,
        latitude: p.latitude,
        longitude: p.longitude,
        rotulo: p.nome.trim().split(/\s+/)[0] ?? p.nome,
        atrasado: atrasada(p, agora),
      })),
    [aoVivo.motoboys, agora],
  );
  const pedidosDe = (vinculoId: string) => pedidos.data?.filter((p) => p.motoboy?.vinculoId === vinculoId) ?? [];
  const semMotoboy = pedidos.data?.filter((p) => p.status === 'pendente').length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl">Mapa ao vivo</h1>
          <p className="text-concreto">
            {motoboys.data
              ? `${emTurno.length} ${emTurno.length === 1 ? 'motoboy' : 'motoboys'} em turno.`
              : 'Carregando…'}
            {semMotoboy > 0 && (
              <>
                {' '}
                <Link to={`/e/${empresaId}/pedidos`} className="text-mercosul underline">
                  {semMotoboy} {semMotoboy === 1 ? 'pedido aguarda' : 'pedidos aguardam'} motoboy
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <IndicadorConexao conexao={aoVivo.conexao} />
      </header>

      <AvisoErro erro={motoboys.error ?? pedidos.error} />

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <Mapa
          marcadores={marcadores}
          foco={foco}
          rotulo="Mapa com a posição dos motoboys em turno. A mesma informação está na lista ao lado."
          className="h-[60dvh] min-h-80 xl:h-[calc(100dvh-13rem)]"
        />
        <section aria-labelledby="titulo-em-turno" className="flex flex-col gap-1">
          <h2 id="titulo-em-turno" className="text-2xl">
            Em turno
          </h2>
          {motoboys.data && emTurno.length === 0 && (
            <p className="text-concreto">
              Ninguém em turno agora. O motoboy começa o turno pelo app, e a posição aparece aqui.
            </p>
          )}
          <ul>
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
          <p className="mt-2 text-sm text-concreto">
            A posição só é registrada durante o turno e some do mapa quando o motoboy encerra.
          </p>
        </section>
      </div>
    </div>
  );
}
