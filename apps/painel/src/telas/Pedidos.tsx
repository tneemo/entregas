import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GRUPOS_STATUS,
  ROTULOS_PAGAMENTO,
  formatarReais,
  sugerirMotoboys,
  type MotoboyResumo,
  type PedidoDetalhe,
  type PedidoResumo,
  type PosicaoMotoboy,
  type StatusPedido,
  type SugestaoDespacho,
} from '@entregas/shared';
import { api } from '../api.ts';
import { AvisoErro, Cartao, Esqueleto } from '../componentes/ui.tsx';
import {
  SeloStatus,
  contagem,
  haQuanto,
  horaCurta,
  rotuloMotoboy,
  useAgora,
  useMotoboys,
  usePedidos,
} from '../componentes/pedido.tsx';
import { IconeAnterior, IconeBusca, IconeMais, IconeProximo, IconeRaio } from '../componentes/icones.tsx';
import { silenciarAviso, useAoVivo } from '../tempo-real.ts';

const SECOES: { grupo: keyof typeof GRUPOS_STATUS; titulo: string }[] = [
  { grupo: 'atencao', titulo: 'Precisam de atenção' },
  { grupo: 'sem_motoboy', titulo: 'Aguardando motoboy' },
  { grupo: 'com_motoboy', titulo: 'Com motoboy' },
  { grupo: 'em_rota', titulo: 'Em rota de entrega' },
];

/** Pedido parado na fila há mais que isto chama a atenção. */
const ESPERA_LONGA_MIN = 10;

/** "a 4 min da coleta", "livre", "com 2 entregas". */
function motivoDaSugestao(s: SugestaoDespacho) {
  const carga =
    s.pedidosAtivos === 0 ? 'livre' : `com ${s.pedidosAtivos} ${s.pedidosAtivos === 1 ? 'entrega' : 'entregas'}`;
  return s.minutosAteColeta === null ? carga : `a ${s.minutosAteColeta} min da coleta, ${carga}`;
}

/**
 * Despacho em um clique: o painel sugere quem está mais perto da coleta e com menos
 * entregas na mão; a lista completa fica ao lado para quando a central souber melhor.
 */
function Despachar({
  empresaId,
  pedido,
  motoboys,
  posicoes,
}: {
  empresaId: string;
  pedido: PedidoResumo;
  motoboys: MotoboyResumo[] | undefined;
  posicoes: Readonly<Record<string, PosicaoMotoboy>>;
}) {
  const cliente = useQueryClient();
  const agora = useAgora(15_000);
  const atribuir = useMutation({
    mutationFn: (motoboyVinculoId: string) => {
      silenciarAviso(pedido.id);
      return api<PedidoDetalhe>(`/empresas/${empresaId}/pedidos/${pedido.id}/acoes/atribuir`, {
        metodo: 'POST',
        corpo: { motoboyVinculoId },
      });
    },
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['pedidos', empresaId] });
      cliente.invalidateQueries({ queryKey: ['motoboys', empresaId] });
    },
  });
  const sugestao = useMemo(
    () => (motoboys ? sugerirMotoboys(pedido.pontoColeta, motoboys, posicoes, agora)[0] : undefined),
    [motoboys, posicoes, pedido.pontoColeta, agora],
  );

  if (motoboys?.length === 0) {
    return (
      <Link to={`/e/${empresaId}/equipe`} className="text-sm text-mercosul underline">
        Convide um motoboy
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {sugestao && (
        <button
          type="button"
          disabled={atribuir.isPending}
          onClick={() => atribuir.mutate(sugestao.vinculoId)}
          title="Sugestão: mais perto da coleta e com menos entregas"
          className="flex min-h-9 w-full max-w-64 items-center gap-2 rounded-md bg-mercosul px-2.5 py-1 text-left text-contraste transition-colors hover:bg-mercosul-escuro disabled:opacity-60"
        >
          <IconeRaio tamanho={15} className="shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[15px] font-semibold">Chamar {sugestao.nome.split(' ')[0]}</span>
            <span className="block truncate text-xs opacity-85">{motivoDaSugestao(sugestao)}</span>
          </span>
        </button>
      )}
      <select
        aria-label={`Motoboy para o pedido ${pedido.numero}`}
        value=""
        disabled={atribuir.isPending || !motoboys}
        onChange={(e) => e.target.value && atribuir.mutate(e.target.value)}
        className="min-h-9 w-full max-w-64 rounded-md border border-linha bg-superficie px-1.5 text-[15px] text-concreto"
      >
        <option value="">{atribuir.isPending ? 'Atribuindo…' : sugestao ? 'Outro motoboy' : 'Escolher motoboy'}</option>
        {motoboys?.map((m) => (
          <option key={m.vinculoId} value={m.vinculoId}>
            {rotuloMotoboy(m)}
          </option>
        ))}
      </select>
      {atribuir.error && <span className="text-sm text-aluguel">{atribuir.error.message}</span>}
    </div>
  );
}

/** Tempo que o motoboy ainda tem para aceitar, andando de segundo em segundo. */
function PrazoDeAceite({ ate }: { ate: string }) {
  const agora = useAgora(1_000);
  return <span className="text-sm tabular-nums text-concreto">Aceite em {contagem(ate, agora)}</span>;
}

function LinhaPedido({
  empresaId,
  pedido,
  historico,
  motoboys,
  posicoes,
}: {
  empresaId: string;
  pedido: PedidoResumo;
  historico: boolean;
  motoboys?: MotoboyResumo[];
  posicoes: Readonly<Record<string, PosicaoMotoboy>>;
}) {
  const destino = pedido.destino;
  const esperaLonga =
    pedido.status === 'pendente' && Date.now() - Date.parse(pedido.criadoEm) > ESPERA_LONGA_MIN * 60_000;
  return (
    <li className="grid grid-cols-[4.5rem_1fr] gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-relevo/50 md:grid-cols-[4.5rem_1fr_16.5rem_10.5rem] md:items-center">
      <Link
        to={`/e/${empresaId}/pedidos/${pedido.id}`}
        aria-label={`Abrir pedido ${pedido.numero}`}
        className="row-span-2 self-start rounded border-[1.5px] border-asfalto/70 bg-superficie px-1 py-0.5 text-center font-cond text-2xl font-semibold leading-tight tabular-nums text-asfalto hover:border-mercosul hover:text-mercosul md:row-span-1 md:self-center"
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
        {pedido.status === 'pendente' && !historico ? (
          <Despachar empresaId={empresaId} pedido={pedido} motoboys={motoboys} posicoes={posicoes} />
        ) : (
          <div className="flex flex-col items-start gap-1">
            <SeloStatus status={pedido.status} />
            {pedido.motoboy && <span className="text-sm">{pedido.motoboy.nome}</span>}
            {pedido.status === 'atribuido' && pedido.aceiteAte && <PrazoDeAceite ate={pedido.aceiteAte} />}
          </div>
        )}
      </div>
      <div className="col-start-2 text-sm text-concreto md:col-start-auto md:text-right">
        <span className="block">
          {pedido.formaPagamento === 'pago'
            ? ROTULOS_PAGAMENTO.pago
            : `${ROTULOS_PAGAMENTO[pedido.formaPagamento]}: ${formatarReais(pedido.valorACobrarCentavos)}`}
        </span>
        <span
          className={`block ${esperaLonga ? 'font-medium text-aluguel' : ''}`}
          title={new Date(pedido.criadoEm).toLocaleString('pt-BR')}
        >
          {pedido.concluidoEm
            ? `Concluído às ${horaCurta(pedido.concluidoEm)}`
            : `${esperaLonga ? 'Esperando' : 'Criado'} ${haQuanto(pedido.criadoEm)}`}
        </span>
      </div>
    </li>
  );
}

/** Os quatro números da fila, numa barra só: é o que a central olha de relance. */
function Placar({ pedidos }: { pedidos: PedidoResumo[] | undefined }) {
  const conta = (grupo: readonly StatusPedido[]) => pedidos?.filter((p) => grupo.includes(p.status)).length;
  const itens = [
    {
      rotulo: 'Aguardando motoboy',
      total: conta(GRUPOS_STATUS.sem_motoboy),
      destaque: 'text-sinal',
      ancora: 'sem_motoboy',
    },
    { rotulo: 'Com motoboy', total: conta(GRUPOS_STATUS.com_motoboy), destaque: '', ancora: 'com_motoboy' },
    { rotulo: 'Em rota de entrega', total: conta(GRUPOS_STATUS.em_rota), destaque: '', ancora: 'em_rota' },
    { rotulo: 'Precisam de atenção', total: conta(GRUPOS_STATUS.atencao), destaque: 'text-aluguel', ancora: 'atencao' },
  ];
  return (
    <Cartao className="grid grid-cols-2 divide-linha overflow-hidden max-md:[&>*:nth-child(-n+2)]:border-b max-md:[&>*:nth-child(odd)]:border-r md:grid-cols-4 md:divide-x">
      {itens.map((item) => (
        <a
          key={item.ancora}
          href={`#secao-${item.ancora}`}
          className="flex flex-col gap-0.5 border-linha px-4 py-3 transition-colors hover:bg-relevo/60"
        >
          <span
            className={`font-cond text-4xl font-semibold leading-none tabular-nums ${
              item.total ? item.destaque : 'text-concreto/70'
            }`}
          >
            {item.total ?? '–'}
          </span>
          <span className="text-sm text-concreto">{item.rotulo}</span>
        </a>
      ))}
    </Cartao>
  );
}

// Histórico ---------------------------------------------------------------------

const diaISO = (data: Date) => data.toLocaleDateString('en-CA');

function somarDias(dia: string, quantos: number) {
  const data = new Date(`${dia}T12:00:00`);
  data.setDate(data.getDate() + quantos);
  return diaISO(data);
}

function nomeDoDia(dia: string) {
  const hoje = diaISO(new Date());
  if (dia === hoje) return 'Hoje';
  if (dia === somarDias(hoje, -1)) return 'Ontem';
  return new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function Historico({ empresaId }: { empresaId: string }) {
  const hoje = diaISO(new Date());
  const [dia, setDia] = useState(hoje);
  const [texto, setTexto] = useState('');
  const termo = texto.trim();
  const buscando = termo.length >= 2;

  const pedidos = useQuery({
    queryKey: ['pedidos', empresaId, 'historico', buscando ? `busca:${termo}` : dia],
    queryFn: () =>
      api<PedidoResumo[]>(
        `/empresas/${empresaId}/pedidos?${buscando ? `busca=${encodeURIComponent(termo)}` : `situacao=concluidos&dia=${dia}`}`,
      ),
    placeholderData: keepPreviousData,
  });
  const lista = pedidos.data ?? [];
  const entregues = lista.filter((p) => p.status === 'entregue').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1 md:max-w-sm">
          <span className="sr-only">Buscar em todos os pedidos</span>
          <IconeBusca
            tamanho={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-concreto"
          />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Número, nome ou telefone do cliente"
            className="min-h-10 w-full rounded-md border border-linha bg-superficie pr-3 pl-9 outline-none focus:border-mercosul"
          />
        </label>
        {!buscando && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Dia anterior"
              onClick={() => setDia(somarDias(dia, -1))}
              className="rounded-md border border-linha bg-superficie p-2.5 hover:bg-relevo"
            >
              <IconeAnterior tamanho={16} />
            </button>
            <label className="relative">
              <span className="sr-only">Dia</span>
              <input
                type="date"
                value={dia}
                max={hoje}
                onChange={(e) => e.target.value && setDia(e.target.value)}
                className="min-h-10 rounded-md border border-linha bg-superficie px-2 outline-none focus:border-mercosul"
              />
            </label>
            <button
              type="button"
              aria-label="Dia seguinte"
              disabled={dia >= hoje}
              onClick={() => setDia(somarDias(dia, 1))}
              className="rounded-md border border-linha bg-superficie p-2.5 hover:bg-relevo disabled:opacity-40"
            >
              <IconeProximo tamanho={16} />
            </button>
          </div>
        )}
      </div>

      <AvisoErro erro={pedidos.error} />
      {pedidos.isLoading && <Esqueleto />}

      {pedidos.data && (
        <section aria-labelledby="titulo-historico" className="flex flex-col gap-2">
          <h2 id="titulo-historico" className="text-2xl first-letter:uppercase">
            {buscando ? `Resultados para "${termo}"` : nomeDoDia(dia)}{' '}
            <span className="font-sans text-base font-normal text-concreto">
              {buscando
                ? `(${lista.length}${lista.length === 50 ? ' ou mais' : ''})`
                : `(${lista.length} ${lista.length === 1 ? 'concluído' : 'concluídos'}, ${entregues} ${entregues === 1 ? 'entregue' : 'entregues'})`}
            </span>
          </h2>
          {lista.length === 0 ? (
            <p className="text-concreto">
              {buscando ? 'Nenhum pedido com esse número, nome ou telefone.' : 'Nenhum pedido concluído neste dia.'}
            </p>
          ) : (
            <Cartao className={pedidos.isPlaceholderData ? 'opacity-60' : ''}>
              <ul className="divide-y divide-linha">
                {lista.map((p) => (
                  <LinhaPedido key={p.id} empresaId={empresaId} pedido={p} historico posicoes={{}} />
                ))}
              </ul>
            </Cartao>
          )}
        </section>
      )}
    </div>
  );
}

export function Pedidos() {
  const { empresaId = '' } = useParams();
  const [busca, setBusca] = useSearchParams();
  const historico = busca.get('ver') === 'historico' || busca.get('ver') === 'concluidos';

  const pedidos = usePedidos(empresaId, 'ativos');
  const motoboys = useMotoboys(empresaId);
  const aoVivo = useAoVivo(empresaId);

  const aba = (ativa: boolean) =>
    `-mb-px border-b-2 px-1 pb-2 text-[15px] ${ativa ? 'border-mercosul font-semibold text-mercosul' : 'border-transparent text-concreto hover:text-asfalto'}`;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl">Pedidos</h1>
        <Link
          to={`/e/${empresaId}/pedidos/novo`}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-mercosul pr-2 pl-3 text-[15px] font-medium text-contraste hover:bg-mercosul-escuro"
        >
          <IconeMais tamanho={16} />
          Novo pedido
          <kbd className="ml-1 rounded border border-contraste/40 px-1.5 font-sans text-xs" title="Atalho: tecla N">
            N
          </kbd>
        </Link>
      </header>

      <Placar pedidos={pedidos.data} />

      <nav aria-label="Filtro de pedidos" className="flex gap-6 border-b border-linha">
        <button type="button" className={aba(!historico)} onClick={() => setBusca({})}>
          Em andamento
        </button>
        <button type="button" className={aba(historico)} onClick={() => setBusca({ ver: 'historico' })}>
          Histórico e busca
        </button>
      </nav>

      {historico ? (
        <Historico empresaId={empresaId} />
      ) : (
        <>
          <AvisoErro erro={pedidos.error} />
          {pedidos.isLoading && <Esqueleto linhas={4} />}

          {pedidos.data?.length === 0 && (
            <Cartao className="flex flex-col items-start gap-3 p-6">
              <h2 className="text-2xl">Fila vazia</h2>
              <p className="text-concreto">Nenhum pedido em andamento. O próximo que você criar aparece aqui.</p>
              <Link
                to={`/e/${empresaId}/pedidos/novo`}
                className="inline-flex min-h-10 items-center rounded-md bg-mercosul px-4 text-[15px] font-medium text-contraste hover:bg-mercosul-escuro"
              >
                Criar pedido
              </Link>
            </Cartao>
          )}

          {SECOES.map(({ grupo, titulo }) => {
            const status = GRUPOS_STATUS[grupo] as readonly StatusPedido[];
            const lista = pedidos.data?.filter((p) => status.includes(p.status)) ?? [];
            if (lista.length === 0) return null;
            return (
              <section
                key={grupo}
                id={`secao-${grupo}`}
                aria-labelledby={`titulo-${grupo}`}
                className="flex scroll-mt-6 flex-col gap-2"
              >
                <h2 id={`titulo-${grupo}`} className={`text-2xl ${grupo === 'atencao' ? 'text-aluguel' : ''}`}>
                  {titulo} <span className="font-sans text-base font-normal text-concreto">({lista.length})</span>
                </h2>
                <Cartao className={grupo === 'atencao' ? 'border-aluguel/40' : ''}>
                  <ul className="divide-y divide-linha">
                    {lista.map((p) => (
                      <LinhaPedido
                        key={p.id}
                        empresaId={empresaId}
                        pedido={p}
                        historico={false}
                        motoboys={motoboys.data}
                        posicoes={aoVivo.motoboys}
                      />
                    ))}
                  </ul>
                </Cartao>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
