// Visão geral da operação: o que está acontecendo agora e como foi o período.
// Os números vêm prontos de /indicadores; aqui é só leitura.

import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  PERIODOS_INDICADORES,
  ROTULOS_PAGAMENTO,
  formatarReais,
  type IndicadoresResposta,
  type PeriodoIndicadores,
} from '@entregas/shared';
import { api } from '../api.ts';
import { AvisoErro, Cartao, Esqueleto, Estrelas } from '../componentes/ui.tsx';

const NOME_PERIODO: Record<PeriodoIndicadores, { aba: string; anterior: string }> = {
  1: { aba: 'Hoje', anterior: 'ontem' },
  7: { aba: '7 dias', anterior: 'os 7 dias anteriores' },
  30: { aba: '30 dias', anterior: 'os 30 dias anteriores' },
};

const numero = (n: number) => n.toLocaleString('pt-BR');
const porcento = (fracao: number) => `${Math.round(fracao * 100)}%`;

function Numero({
  rotulo,
  valor,
  apoio,
  children,
}: {
  rotulo: string;
  valor: ReactNode;
  apoio?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-4">
      <span className="text-sm text-concreto">{rotulo}</span>
      <span className="font-cond text-4xl font-semibold leading-none tabular-nums">{valor}</span>
      {children}
      {apoio && <span className="text-sm text-concreto">{apoio}</span>}
    </div>
  );
}

/** "12% a mais que os 7 dias anteriores"; sem base de comparação, não diz nada. */
function comparar(atual: number, antes: number, periodo: string) {
  if (antes === 0) return atual > 0 ? `Nenhuma entrega em ${periodo.replace(/^os /, '')}.` : undefined;
  const variacao = (atual - antes) / antes;
  if (Math.abs(variacao) < 0.005) return `Igual a ${periodo}.`;
  return `${porcento(Math.abs(variacao))} ${variacao > 0 ? 'a mais' : 'a menos'} que ${periodo}.`;
}

function compararTempo(atual: number | null, antes: number | null, periodo: string) {
  if (atual === null || antes === null) return undefined;
  const diferenca = atual - antes;
  if (diferenca === 0) return `Igual a ${periodo}.`;
  return `${Math.abs(diferenca)} min ${diferenca < 0 ? 'mais rápido' : 'mais lento'} que ${periodo}.`;
}

// Gráfico de barras -------------------------------------------------------------

interface Serie {
  nome: string;
  /** Classe de fundo (token de gráfico). */
  cor: string;
}

interface Coluna {
  chave: string;
  /** Rótulo no eixo; vazio quando não cabe (o detalhe aparece ao passar o mouse). */
  eixo: string;
  /** Rótulo completo, usado no detalhe e na tabela. */
  nome: string;
  valores: number[];
}

/**
 * Barras empilhadas, finas, com base na linha de zero. Passar o mouse (ou focar com Tab)
 * mostra os valores; a mesma informação está na tabela logo abaixo.
 */
function Barras({ titulo, series, colunas }: { titulo: string; series: Serie[]; colunas: Coluna[] }) {
  const totais = colunas.map((c) => c.valores.reduce((soma, v) => soma + v, 0));
  const maior = Math.max(...totais, 1);
  // Topo da escala: o próximo número "redondo" acima do maior valor.
  const passo = maior <= 5 ? 1 : maior <= 10 ? 2 : maior <= 50 ? 10 : 50;
  const topo = Math.ceil(maior / passo) * passo;
  const indiceDoMaior = totais.indexOf(Math.max(...totais));

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xl">{titulo}</h2>
        {series.length > 1 && (
          <ul className="flex gap-4 text-sm text-concreto">
            {series.map((s) => (
              <li key={s.nome} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${s.cor}`} aria-hidden="true" />
                {s.nome}
              </li>
            ))}
          </ul>
        )}
      </figcaption>

      <div className="relative ml-7 h-44" aria-hidden="true">
        {[1, 0.5, 0].map((fracao) => (
          <div
            key={fracao}
            className="absolute inset-x-0 border-t border-linha/70"
            style={{ bottom: `${fracao * 100}%` }}
          >
            <span className="absolute -top-2.5 -left-7 w-6 text-right text-xs tabular-nums text-concreto">
              {Math.round(topo * fracao)}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {colunas.map((c, i) => {
            const total = totais[i]!;
            return (
              <div key={c.chave} className="group relative flex h-full flex-1 flex-col justify-end">
                {i === indiceDoMaior && total > 0 && (
                  <span className="mb-0.5 text-center text-xs font-medium tabular-nums">{total}</span>
                )}
                <div className="mx-auto flex w-full max-w-9 flex-col-reverse gap-0.5">
                  {c.valores.map((valor, s) =>
                    valor > 0 ? (
                      <div
                        key={series[s]!.nome}
                        className={`${series[s]!.cor} last:rounded-t-[4px] group-hover:brightness-110`}
                        style={{ height: `${Math.max(2, (valor / topo) * 176)}px` }}
                      />
                    ) : null,
                  )}
                </div>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-linha bg-superficie px-2.5 py-1.5 text-sm shadow-flutuante group-hover:block">
                  <p className="font-medium">{c.nome}</p>
                  {series.map((s, j) => (
                    <p key={s.nome} className="flex items-center gap-1.5 text-concreto">
                      <span className={`h-2 w-2 rounded-sm ${s.cor}`} />
                      {s.nome}: <span className="tabular-nums text-asfalto">{c.valores[j]}</span>
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="ml-7 flex gap-[3px] text-xs text-concreto" aria-hidden="true">
        {colunas.map((c) => (
          <span key={c.chave} className="flex-1 overflow-visible whitespace-nowrap text-center">
            {c.eixo}
          </span>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-mercosul underline-offset-2 hover:underline">Ver em tabela</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-concreto">
              <tr>
                <th className="py-1 pr-4 font-medium">{titulo}</th>
                {series.map((s) => (
                  <th key={s.nome} className="py-1 pr-4 text-right font-medium">
                    {s.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {colunas.map((c) => (
                <tr key={c.chave} className="border-t border-linha">
                  <th scope="row" className="py-1 pr-4 font-normal">
                    {c.nome}
                  </th>
                  {c.valores.map((v, j) => (
                    <td key={series[j]!.nome} className="py-1 pr-4 text-right">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function colunasPorDia(porDia: IndicadoresResposta['porDia']): Coluna[] {
  // Em 30 dias não cabe um rótulo por barra: um a cada cinco.
  const cadaQuantos = porDia.length > 10 ? 5 : 1;
  return porDia.map((d, i) => {
    const data = new Date(`${d.dia}T12:00:00`);
    const curto =
      porDia.length <= 7
        ? data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
        : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return {
      chave: d.dia,
      eixo: (porDia.length - 1 - i) % cadaQuantos === 0 ? curto : '',
      nome: data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
      valores: [d.entregues, d.naoEntregues],
    };
  });
}

function colunasPorHora(porHora: IndicadoresResposta['porHora']): Coluna[] {
  // Mostra do primeiro ao último horário com movimento (com folga), não as 24 horas vazias.
  const comPedido = porHora.filter((h) => h.pedidos > 0).map((h) => h.hora);
  const de = Math.max(0, Math.min(...comPedido, 10) - 1);
  const ate = Math.min(23, Math.max(...comPedido, 22) + 1);
  return porHora
    .filter((h) => h.hora >= de && h.hora <= ate)
    .map((h) => ({
      chave: String(h.hora),
      eixo: h.hora % 2 === 0 ? `${h.hora}h` : '',
      nome: `Das ${h.hora}h às ${h.hora + 1}h`,
      valores: [h.pedidos],
    }));
}

// Blocos ------------------------------------------------------------------------

function Motoboys({ motoboys }: { motoboys: IndicadoresResposta['motoboys'] }) {
  const maior = Math.max(...motoboys.map((m) => m.entregues), 1);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-motoboys">
      <h2 id="titulo-motoboys" className="text-xl">
        Motoboys
      </h2>
      {motoboys.length === 0 ? (
        <p className="text-concreto">Nenhuma entrega concluída no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left">
            <thead className="text-sm text-concreto">
              <tr>
                <th className="pb-2 font-medium">Motoboy</th>
                <th className="pb-2 font-medium">Entregas</th>
                <th className="pb-2 text-right font-medium">Devolvidas</th>
                <th className="pb-2 text-right font-medium">Tempo médio</th>
                <th className="pb-2 text-right font-medium">Nota</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {motoboys.map((m) => (
                <tr key={m.vinculoId} className="border-t border-linha">
                  <th scope="row" className="py-2.5 pr-4 font-medium">
                    {m.nome}
                  </th>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="w-7 text-right">{m.entregues}</span>
                      <span className="h-2 w-28 rounded-full bg-relevo" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-grafico-1"
                          style={{ width: `${(m.entregues / maior) * 100}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className={`py-2.5 pr-4 text-right ${m.devolvidos ? '' : 'text-concreto'}`}>{m.devolvidos}</td>
                  <td className="py-2.5 pr-4 text-right">
                    {m.tempoMedioMin === null ? '–' : `${m.tempoMedioMin} min`}
                  </td>
                  <td className="py-2.5 text-right">
                    {m.notaMedia === null ? (
                      <span className="text-concreto">sem nota</span>
                    ) : (
                      <span title={`${m.avaliacoes} ${m.avaliacoes === 1 ? 'avaliação' : 'avaliações'}`}>
                        {m.notaMedia.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}
                        <span className="text-sm text-concreto"> ({m.avaliacoes})</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Avaliacoes({ avaliacoes }: { avaliacoes: IndicadoresResposta['avaliacoes'] }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-avaliacoes">
      <h2 id="titulo-avaliacoes" className="text-xl">
        O que os clientes acharam
      </h2>
      {avaliacoes.media === null ? (
        <p className="text-concreto">
          Ainda sem avaliações. O cliente dá a nota pelo link de acompanhamento, depois da entrega.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex flex-col gap-1">
            <span className="font-cond text-5xl font-semibold leading-none tabular-nums">
              {avaliacoes.media.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}
            </span>
            <Estrelas nota={avaliacoes.media} />
            <span className="text-sm text-concreto">
              {numero(avaliacoes.total)} {avaliacoes.total === 1 ? 'avaliação' : 'avaliações'}
            </span>
          </div>
          <ol className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm tabular-nums" reversed>
            {[5, 4, 3, 2, 1].map((nota) => {
              const total = avaliacoes.porNota[nota - 1] ?? 0;
              return (
                <li key={nota} className="flex items-center gap-2">
                  <span className="w-16 text-concreto">
                    {nota} {nota === 1 ? 'estrela' : 'estrelas'}
                  </span>
                  <span className="h-2 flex-1 rounded-full bg-relevo" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-grafico-1"
                      style={{ width: `${(total / avaliacoes.total) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 text-right">{total}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

function Pagamentos({ dados }: { dados: IndicadoresResposta }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-pagamentos">
      <h2 id="titulo-pagamentos" className="text-xl">
        Cobrado na entrega
      </h2>
      {dados.pagamentos.length === 0 ? (
        <p className="text-concreto">Nenhuma entrega concluída no período.</p>
      ) : (
        <table className="w-full text-left tabular-nums">
          <tbody>
            {dados.pagamentos.map((p) => (
              <tr key={p.forma} className="border-b border-linha">
                <th scope="row" className="py-2 font-normal">
                  {ROTULOS_PAGAMENTO[p.forma]}
                </th>
                <td className="py-2 text-right text-concreto">
                  {p.pedidos} {p.pedidos === 1 ? 'pedido' : 'pedidos'}
                </td>
                <td className="py-2 pl-4 text-right font-medium">
                  {p.forma === 'pago' ? '–' : formatarReais(p.valorCentavos)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-2 font-medium">
                Total cobrado pelos motoboys
              </th>
              <td />
              <td className="pt-2 pl-4 text-right font-semibold">{formatarReais(dados.totais.valorCobradoCentavos)}</td>
            </tr>
            <tr className="text-sm text-concreto">
              <th scope="row" className="font-normal">
                Taxas de entrega no período
              </th>
              <td />
              <td className="pl-4 text-right">{formatarReais(dados.totais.taxasEntregaCentavos)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  );
}

export function VisaoGeral() {
  const { empresaId = '' } = useParams();
  const [dias, setDias] = useState<PeriodoIndicadores>(7);
  const indicadores = useQuery({
    queryKey: ['indicadores', empresaId, dias],
    queryFn: () => api<IndicadoresResposta>(`/empresas/${empresaId}/indicadores?dias=${dias}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const d = indicadores.data;
  const periodo = NOME_PERIODO[dias];

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl">Visão geral</h1>
        <fieldset className="flex rounded-md border border-linha bg-superficie p-0.5">
          <legend className="sr-only">Período</legend>
          {PERIODOS_INDICADORES.map((p) => (
            <label
              key={p}
              className={`cursor-pointer rounded px-3 py-1.5 text-[15px] has-focus-visible:outline-3 has-focus-visible:outline-sinal ${
                p === dias ? 'bg-mercosul font-medium text-contraste' : 'text-concreto hover:text-asfalto'
              }`}
            >
              <input type="radio" name="periodo" className="sr-only" checked={p === dias} onChange={() => setDias(p)} />
              {NOME_PERIODO[p].aba}
            </label>
          ))}
        </fieldset>
      </header>

      <AvisoErro erro={indicadores.error} />
      {indicadores.isLoading && <Esqueleto linhas={4} />}

      {d && (
        <div className={`flex flex-col gap-6 ${indicadores.isPlaceholderData ? 'opacity-60' : ''}`}>
          <section aria-labelledby="titulo-agora" className="flex flex-col gap-2">
            <h2 id="titulo-agora" className="text-xl">
              Agora
            </h2>
            <Cartao className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-linha">
              <Numero
                rotulo="Pedidos em andamento"
                valor={d.agora.emAndamento}
                apoio={
                  <Link to={`/e/${empresaId}/pedidos`} className="text-mercosul underline underline-offset-2">
                    Abrir a fila
                  </Link>
                }
              />
              <Numero
                rotulo="Aguardando motoboy"
                valor={<span className={d.agora.semMotoboy ? 'text-sinal' : ''}>{d.agora.semMotoboy}</span>}
              />
              <Numero
                rotulo="Precisam de atenção"
                valor={<span className={d.agora.atencao ? 'text-aluguel' : ''}>{d.agora.atencao}</span>}
              />
              <Numero
                rotulo="Motoboys em turno"
                valor={d.agora.motoboysEmTurno}
                apoio={
                  <Link to={`/e/${empresaId}/mapa`} className="text-mercosul underline underline-offset-2">
                    Ver no mapa
                  </Link>
                }
              />
            </Cartao>
          </section>

          <section aria-labelledby="titulo-periodo" className="flex flex-col gap-2">
            <h2 id="titulo-periodo" className="text-xl">
              {dias === 1 ? 'Hoje' : `Últimos ${dias} dias`}
            </h2>
            <Cartao className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-linha">
              <Numero
                rotulo="Entregas feitas"
                valor={numero(d.totais.entregues)}
                apoio={comparar(d.totais.entregues, d.anterior.entregues, periodo.anterior)}
              />
              <Numero
                rotulo="Tempo médio até entregar"
                valor={d.totais.tempoMedioEntregaMin === null ? '–' : `${d.totais.tempoMedioEntregaMin} min`}
                apoio={
                  compararTempo(d.totais.tempoMedioEntregaMin, d.anterior.tempoMedioEntregaMin, periodo.anterior) ??
                  'Da criação do pedido até a entrega.'
                }
              />
              <Numero
                rotulo="Chegaram ao cliente"
                valor={d.totais.taxaSucesso === null ? '–' : porcento(d.totais.taxaSucesso)}
                apoio={
                  d.totais.devolvidos > 0
                    ? `${d.totais.devolvidos} ${d.totais.devolvidos === 1 ? 'voltou' : 'voltaram'} para a loja, ${d.totais.cancelados} ${d.totais.cancelados === 1 ? 'cancelado' : 'cancelados'}.`
                    : `Nenhuma devolução, ${d.totais.cancelados} ${d.totais.cancelados === 1 ? 'cancelado' : 'cancelados'}.`
                }
              />
              <Numero
                rotulo="Nota dos clientes"
                valor={
                  d.avaliacoes.media === null
                    ? '–'
                    : d.avaliacoes.media.toLocaleString('pt-BR', { minimumFractionDigits: 1 })
                }
                apoio={
                  d.avaliacoes.total > 0
                    ? `${d.avaliacoes.total} ${d.avaliacoes.total === 1 ? 'avaliação' : 'avaliações'}.`
                    : 'Sem avaliações no período.'
                }
              >
                {d.avaliacoes.media !== null && <Estrelas nota={d.avaliacoes.media} tamanho={14} />}
              </Numero>
            </Cartao>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {dias > 1 && (
              <Cartao className="p-5">
                <Barras
                  titulo="Entregas por dia"
                  series={[
                    { nome: 'Entregues', cor: 'bg-grafico-1' },
                    { nome: 'Devolvidas', cor: 'bg-grafico-2' },
                  ]}
                  colunas={colunasPorDia(d.porDia)}
                />
              </Cartao>
            )}
            <Cartao className="p-5">
              <Barras
                titulo="Pedidos por hora do dia"
                series={[{ nome: 'Pedidos', cor: 'bg-grafico-1' }]}
                colunas={colunasPorHora(d.porHora)}
              />
            </Cartao>
            {dias === 1 && (
              <Cartao className="p-5">
                <Pagamentos dados={d} />
              </Cartao>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <Cartao className="p-5">
              <Motoboys motoboys={d.motoboys} />
            </Cartao>
            <div className="flex flex-col gap-6">
              <Cartao className="p-5">
                <Avaliacoes avaliacoes={d.avaliacoes} />
              </Cartao>
              {dias > 1 && (
                <Cartao className="p-5">
                  <Pagamentos dados={d} />
                </Cartao>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
