import { Link, useParams, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GRUPOS_STATUS,
  ROTULOS_PAGAMENTO,
  formatarReais,
  type PedidoDetalhe,
  type PedidoResumo,
  type StatusPedido,
} from '@entregas/shared';
import { api } from '../api.ts';
import { AvisoErro } from '../componentes/ui.tsx';
import { SeloStatus, haQuanto, horaCurta, rotuloMotoboy, useMotoboys, usePedidos } from '../componentes/pedido.tsx';

const SECOES: { grupo: keyof typeof GRUPOS_STATUS; titulo: string }[] = [
  { grupo: 'atencao', titulo: 'Precisam de atenção' },
  { grupo: 'sem_motoboy', titulo: 'Aguardando motoboy' },
  { grupo: 'com_motoboy', titulo: 'Com motoboy' },
  { grupo: 'em_rota', titulo: 'Em rota de entrega' },
];

/** Escolher o motoboy direto na lista: o despacho mais comum leva um clique. */
function Despachar({ empresaId, pedido }: { empresaId: string; pedido: PedidoResumo }) {
  const cliente = useQueryClient();
  const motoboys = useMotoboys(empresaId);
  const atribuir = useMutation({
    mutationFn: (motoboyVinculoId: string) =>
      api<PedidoDetalhe>(`/empresas/${empresaId}/pedidos/${pedido.id}/acoes/atribuir`, {
        metodo: 'POST',
        corpo: { motoboyVinculoId },
      }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['pedidos', empresaId] });
      cliente.invalidateQueries({ queryKey: ['motoboys', empresaId] });
    },
  });

  if (motoboys.data?.length === 0) {
    return (
      <Link to={`/e/${empresaId}/equipe`} className="text-sm text-mercosul underline">
        Convide um motoboy
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`Motoboy para o pedido ${pedido.numero}`}
        value=""
        disabled={atribuir.isPending || !motoboys.data}
        onChange={(e) => e.target.value && atribuir.mutate(e.target.value)}
        className="min-h-9 w-full max-w-56 rounded border border-sinal bg-white px-1 text-[15px]"
      >
        <option value="">{atribuir.isPending ? 'Atribuindo…' : 'Escolher motoboy'}</option>
        {motoboys.data?.map((m) => (
          <option key={m.vinculoId} value={m.vinculoId}>
            {rotuloMotoboy(m)}
          </option>
        ))}
      </select>
      {atribuir.error && <span className="text-sm text-aluguel">{atribuir.error.message}</span>}
    </div>
  );
}

function LinhaPedido({
  empresaId,
  pedido,
  concluido,
}: {
  empresaId: string;
  pedido: PedidoResumo;
  concluido: boolean;
}) {
  const destino = pedido.destino;
  return (
    <li className="grid grid-cols-[4rem_1fr] gap-x-4 gap-y-2 border-t border-linha py-3 md:grid-cols-[4rem_1fr_14rem_10rem] md:items-center">
      <Link
        to={`/e/${empresaId}/pedidos/${pedido.id}`}
        className="row-span-2 font-cond text-2xl font-semibold text-mercosul hover:underline md:row-span-1"
        aria-label={`Abrir pedido ${pedido.numero}`}
      >
        {pedido.numero}
      </Link>
      <div className="min-w-0">
        <Link to={`/e/${empresaId}/pedidos/${pedido.id}`} className="block truncate font-medium hover:underline">
          {destino.nome ?? 'Sem nome'}
        </Link>
        <span className="block truncate text-sm text-concreto">
          {destino.logradouro}, {destino.numero}, {destino.bairro}
        </span>
      </div>
      <div className="col-start-2 md:col-start-auto">
        {pedido.status === 'pendente' ? (
          <Despachar empresaId={empresaId} pedido={pedido} />
        ) : (
          <div className="flex flex-col items-start gap-1">
            <SeloStatus status={pedido.status} />
            {pedido.motoboy && <span className="text-sm">{pedido.motoboy.nome}</span>}
            {pedido.status === 'atribuido' && pedido.aceiteAte && (
              <span className="text-sm text-concreto">Aceite até {horaCurta(pedido.aceiteAte)}</span>
            )}
          </div>
        )}
      </div>
      <div className="col-start-2 text-sm text-concreto md:col-start-auto md:text-right">
        <span className="block">
          {pedido.formaPagamento === 'pago'
            ? ROTULOS_PAGAMENTO.pago
            : `${ROTULOS_PAGAMENTO[pedido.formaPagamento]}: ${formatarReais(pedido.valorACobrarCentavos)}`}
        </span>
        <span className="block" title={new Date(pedido.criadoEm).toLocaleString('pt-BR')}>
          {concluido && pedido.concluidoEm
            ? `Concluído às ${horaCurta(pedido.concluidoEm)}`
            : `Criado ${haQuanto(pedido.criadoEm)}`}
        </span>
      </div>
    </li>
  );
}

export function Pedidos() {
  const { empresaId = '' } = useParams();
  const [busca, setBusca] = useSearchParams();
  const concluidos = busca.get('ver') === 'concluidos';

  const pedidos = usePedidos(empresaId, concluidos ? 'concluidos' : 'ativos');

  const aba = (ativa: boolean) =>
    `border-b-2 px-1 pb-2 text-[15px] ${ativa ? 'border-mercosul font-semibold text-mercosul' : 'border-transparent text-concreto hover:text-asfalto'}`;

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl">Pedidos</h1>
          {pedidos.data && (
            <p className="text-concreto">
              {concluidos
                ? `${pedidos.data.length} ${pedidos.data.length === 1 ? 'concluído' : 'concluídos'} hoje.`
                : `${pedidos.data.length} em andamento.`}
            </p>
          )}
        </div>
        <Link
          to={`/e/${empresaId}/pedidos/novo`}
          className="inline-flex min-h-10 items-center rounded-md bg-mercosul px-4 text-[15px] font-medium text-white hover:bg-mercosul-escuro"
        >
          Novo pedido
        </Link>
      </header>

      <nav aria-label="Filtro de pedidos" className="flex gap-6 border-b border-linha">
        <button type="button" className={aba(!concluidos)} onClick={() => setBusca({})}>
          Em andamento
        </button>
        <button type="button" className={aba(concluidos)} onClick={() => setBusca({ ver: 'concluidos' })}>
          Concluídos hoje
        </button>
      </nav>

      <AvisoErro erro={pedidos.error} />

      {pedidos.data?.length === 0 &&
        (concluidos ? (
          <p>Nenhum pedido concluído hoje.</p>
        ) : (
          <p>
            Nenhum pedido em andamento.{' '}
            <Link to={`/e/${empresaId}/pedidos/novo`} className="text-mercosul underline">
              Crie um pedido
            </Link>{' '}
            para despachar.
          </p>
        ))}

      {concluidos && !!pedidos.data?.length && (
        <ul>
          {pedidos.data.map((p) => (
            <LinhaPedido key={p.id} empresaId={empresaId} pedido={p} concluido />
          ))}
        </ul>
      )}

      {!concluidos &&
        SECOES.map(({ grupo, titulo }) => {
          const status = GRUPOS_STATUS[grupo] as readonly StatusPedido[];
          const lista = pedidos.data?.filter((p) => status.includes(p.status)) ?? [];
          if (lista.length === 0) return null;
          return (
            <section key={grupo} aria-labelledby={`secao-${grupo}`} className="flex flex-col gap-1">
              <h2 id={`secao-${grupo}`} className={`text-2xl ${grupo === 'atencao' ? 'text-aluguel' : ''}`}>
                {titulo} <span className="font-sans text-base font-normal text-concreto">({lista.length})</span>
              </h2>
              <ul>
                {lista.map((p) => (
                  <LinhaPedido key={p.id} empresaId={empresaId} pedido={p} concluido={false} />
                ))}
              </ul>
            </section>
          );
        })}
    </div>
  );
}
