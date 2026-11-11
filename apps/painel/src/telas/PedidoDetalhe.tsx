import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LONGE_DO_DESTINO_M,
  ROTULOS_EVENTO,
  ROTULOS_PAGAMENTO,
  ROTULOS_PRECISAO,
  ROTULOS_STATUS,
  TRANSICOES,
  formatarReais,
  formatarTelefone,
  textoDistancia,
  type AcaoPedido,
  type DadosAcaoPedido,
  type EventoPedidoResposta,
  type ParadaResposta,
  type PedidoDetalhe as Pedido,
} from '@entregas/shared';
import { api } from '../api.ts';
import { useEu } from '../sessao.ts';
import {
  AreaTexto,
  AvisoErro,
  Botao,
  Campo,
  Cartao,
  Esqueleto,
  Estrelas,
  Selecao,
  erroDoCampo,
} from '../componentes/ui.tsx';
import { silenciarAviso } from '../tempo-real.ts';
import { SeloStatus, enderecoEmLinha, horaCurta, rotuloMotoboy, useMotoboys } from '../componentes/pedido.tsx';
import type { Marcador } from '../componentes/Mapa.tsx';

// O mapa (Leaflet) só baixa quando o pedido tem algum ponto para mostrar.
const Mapa = lazy(() => import('../componentes/Mapa.tsx').then((m) => ({ default: m.Mapa })));

/** Ações que o motoboy faz na porta do cliente: longe dela, a central precisa saber. */
const ACOES_NA_PORTA = new Set<EventoPedidoResposta['acao']>(['entregar', 'entregar_sem_codigo', 'falhar']);

function DistanciaDaPorta({ evento }: { evento: EventoPedidoResposta }) {
  const metros = evento.distanciaDaEntregaM;
  if (metros === null || !ACOES_NA_PORTA.has(evento.acao)) return null;
  if (metros <= LONGE_DO_DESTINO_M) {
    return <p className="text-sm text-ok">No endereço de entrega (a {textoDistancia(metros)}).</p>;
  }
  return (
    <p className="border-l-4 border-aluguel bg-superficie px-2 py-1 text-sm">
      Registrado a {textoDistancia(metros)} do endereço de entrega. Confira com o motoboy.
    </p>
  );
}

function MapaDoPedido({ pedido }: { pedido: Pedido }) {
  const marcadores = useMemo(() => {
    const lista: Marcador[] = [];
    for (const [tipo, parada] of [
      ['coleta', pedido.coleta],
      ['entrega', pedido.entrega],
    ] as const) {
      const l = parada.endereco.localizacao;
      if (l)
        lista.push({
          id: tipo,
          tipo,
          latitude: l.latitude,
          longitude: l.longitude,
          rotulo: tipo === 'coleta' ? 'Coleta' : 'Entrega',
        });
    }
    return lista;
  }, [pedido.coleta, pedido.entrega]);
  if (marcadores.length === 0) return null;
  return (
    <Suspense fallback={<div className="h-72 rounded-md border border-linha bg-linha/40" />}>
      <Mapa marcadores={marcadores} rotulo={`Mapa do pedido ${pedido.numero}: coleta e entrega`} className="h-72" />
    </Suspense>
  );
}

function Parada({ titulo, parada }: { titulo: string; parada: ParadaResposta }) {
  const e = parada.endereco;
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-xl">{titulo}</h2>
      {parada.nome && <p className="font-medium">{parada.nome}</p>}
      {parada.telefone && (
        <a href={`tel:${parada.telefone}`} className="text-mercosul underline">
          {formatarTelefone(parada.telefone)}
        </a>
      )}
      <p>{enderecoEmLinha(e)}</p>
      <p className="text-sm text-concreto">
        {e.cidade} – {e.uf}
        {e.cep ? `, CEP ${e.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}` : ''}
      </p>
      {e.referencia && <p className="text-sm">Referência: {e.referencia}</p>}
      {!e.localizacao ? (
        <p className="text-sm text-concreto">Sem ponto no mapa: o motoboy navega pelo endereço escrito.</p>
      ) : e.localizacao.precisao !== 'numero' ? (
        <p className="text-sm text-concreto">Ponto no mapa {ROTULOS_PRECISAO[e.localizacao.precisao]}.</p>
      ) : null}
    </section>
  );
}

/** Link de acompanhamento + código que o cliente informa ao motoboy, com envio pronto pelo WhatsApp. */
function CodigoEntrega({ pedido, nomeEmpresa }: { pedido: Pedido; nomeEmpresa: string }) {
  const [copiado, setCopiado] = useState(false);
  if (!pedido.codigoEntrega) return null;
  const tel = pedido.entrega.telefone?.replace(/\D/g, '');
  const primeiroNome = pedido.entrega.nome?.split(' ')[0] ?? '';
  const link = pedido.rastreio ? `${window.location.origin}${pedido.rastreio.caminho}` : null;
  const mensagem = [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! Seu pedido nº ${pedido.numero} da ${nomeEmpresa} vai sair para entrega.`,
    link && `Acompanhe por aqui: ${link}`,
    `Quando receber, informe ao entregador o código ${pedido.codigoEntrega}.`,
  ]
    .filter(Boolean)
    .join('\n');

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2_500);
    } catch {
      window.prompt('Copie o link de acompanhamento:', link);
    }
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-linha border-l-4 border-l-mercosul bg-superficie p-4"
      aria-labelledby="titulo-codigo"
    >
      <h2 id="titulo-codigo" className="text-xl">
        Código de entrega
      </h2>
      <p className="font-cond text-5xl font-bold tracking-[0.2em] text-mercosul">
        <span className="sr-only">{`Código ${pedido.codigoEntrega.split('').join(' ')}`}</span>
        <span aria-hidden="true">{pedido.codigoEntrega}</span>
      </p>
      <p className="text-sm text-concreto">
        O cliente informa este código ao motoboy na entrega. O motoboy não vê o código no app. Pelo link, o cliente
        acompanha o pedido e vê o entregador no mapa quando ele sai para entrega.
        {pedido.codigoBloqueado && ' O motoboy errou o código 5 vezes; só a central pode confirmar agora.'}
      </p>
      {tel && (
        <a
          href={`https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center self-start rounded-md bg-ok px-4 text-[15px] font-medium text-contraste hover:brightness-110"
        >
          Enviar link e código pelo WhatsApp
        </a>
      )}
      {link && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Botao variante="discreto" onClick={copiar}>
            {copiado ? 'Link copiado' : 'Copiar link de acompanhamento'}
          </Botao>
          <a href={link} target="_blank" rel="noreferrer" className="text-mercosul underline-offset-2 hover:underline">
            Ver como o cliente vê
          </a>
          <span role="status" className="sr-only">
            {copiado ? 'Link copiado' : ''}
          </span>
        </div>
      )}
    </section>
  );
}

/** Botões das ações permitidas; as que pedem dado abrem um pequeno formulário. */
function Acoes({ empresaId, pedido }: { empresaId: string; pedido: Pedido }) {
  const consultas = useQueryClient();
  const motoboys = useMotoboys(empresaId);
  const [aberta, setAberta] = useState<AcaoPedido | null>(null);
  const [dados, setDados] = useState<DadosAcaoPedido>({});

  const executar = useMutation({
    mutationFn: ({ acao, corpo }: { acao: AcaoPedido; corpo: DadosAcaoPedido }) => {
      // Quem fez a ação já sabe o resultado: não precisa do aviso de tempo real.
      silenciarAviso(pedido.id);
      return api<Pedido>(`/empresas/${empresaId}/pedidos/${pedido.id}/acoes/${acao}`, { metodo: 'POST', corpo });
    },
    onSuccess: (atualizado) => {
      consultas.setQueryData(['pedido', empresaId, pedido.id], atualizado);
      consultas.invalidateQueries({ queryKey: ['pedidos', empresaId] });
      consultas.invalidateQueries({ queryKey: ['motoboys', empresaId] });
      setAberta(null);
      setDados({});
    },
  });

  if (pedido.acoes.length === 0) return null;

  function clicar(acao: AcaoPedido) {
    executar.reset();
    if ('exige' in TRANSICOES[acao]) {
      setAberta(aberta === acao ? null : acao);
      setDados({});
    } else {
      executar.mutate({ acao, corpo: {} });
    }
  }

  function confirmar(e: FormEvent) {
    e.preventDefault();
    if (aberta) executar.mutate({ acao: aberta, corpo: dados });
  }

  const exige = aberta && 'exige' in TRANSICOES[aberta] ? (TRANSICOES[aberta] as { exige: string }).exige : null;
  const destrutiva = (a: AcaoPedido) => a === 'cancelar' || a === 'falhar' || a === 'desatribuir';

  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-acoes">
      <h2 id="titulo-acoes" className="text-xl">
        O que fazer agora
      </h2>
      <div className="flex flex-wrap gap-2">
        {pedido.acoes.map((acao) => (
          <Botao
            key={acao}
            variante={destrutiva(acao) ? 'perigo' : aberta === acao ? 'principal' : 'secundario'}
            aria-expanded={'exige' in TRANSICOES[acao] ? aberta === acao : undefined}
            carregando={executar.isPending && executar.variables?.acao === acao}
            onClick={() => clicar(acao)}
          >
            {acao === 'atribuir' && pedido.motoboy ? 'Trocar motoboy' : TRANSICOES[acao].rotulo}
          </Botao>
        ))}
      </div>

      {aberta && (
        <form onSubmit={confirmar} className="flex flex-col gap-3 rounded-lg border border-linha bg-superficie p-4">
          {exige === 'motoboy' && (
            <Selecao
              rotulo="Motoboy"
              value={dados.motoboyVinculoId ?? ''}
              onChange={(e) => setDados({ motoboyVinculoId: e.target.value })}
              erro={erroDoCampo(executar.error, 'motoboyVinculoId')}
            >
              <option value="">Escolha</option>
              {motoboys.data
                ?.filter((m) => m.vinculoId !== pedido.motoboy?.vinculoId)
                .map((m) => (
                  <option key={m.vinculoId} value={m.vinculoId}>
                    {rotuloMotoboy(m)}
                  </option>
                ))}
            </Selecao>
          )}
          {exige === 'codigo' && (
            <Campo
              rotulo="Código informado pelo cliente"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              value={dados.codigo ?? ''}
              onChange={(e) => setDados({ codigo: e.target.value.replace(/\D/g, '') })}
              erro={erroDoCampo(executar.error, 'codigo')}
            />
          )}
          {exige === 'motivo' && (
            <AreaTexto
              rotulo={aberta === 'cancelar' ? 'Por que o pedido foi cancelado?' : 'O que aconteceu?'}
              placeholder={aberta === 'falhar' ? 'Ex.: cliente não atendeu, endereço não encontrado.' : undefined}
              value={dados.motivo ?? ''}
              onChange={(e) => setDados({ motivo: e.target.value })}
              erro={erroDoCampo(executar.error, 'motivo')}
            />
          )}
          <div className="flex gap-2">
            <Botao type="submit" variante={destrutiva(aberta) ? 'perigo' : 'principal'} carregando={executar.isPending}>
              {TRANSICOES[aberta].rotulo}
            </Botao>
            <Botao variante="discreto" onClick={() => setAberta(null)}>
              Voltar
            </Botao>
          </div>
        </form>
      )}
      <AvisoErro erro={executar.error} />
    </section>
  );
}

export function PedidoDetalhe() {
  const { empresaId = '', pedidoId = '' } = useParams();
  const { data: eu } = useEu();
  const nomeEmpresa = eu?.vinculos.find((v) => v.empresa.id === empresaId)?.empresa.nomeFantasia ?? '';
  const pedido = useQuery({
    queryKey: ['pedido', empresaId, pedidoId],
    queryFn: () => api<Pedido>(`/empresas/${empresaId}/pedidos/${pedidoId}`),
    // O tempo real avisa quando muda; isto é só uma rede de segurança.
    refetchInterval: 60_000,
  });

  if (pedido.isLoading) return <Esqueleto linhas={4} className="max-w-5xl" />;
  if (pedido.error || !pedido.data) return <AvisoErro erro={pedido.error ?? new Error('Pedido não encontrado.')} />;
  const p = pedido.data;
  const semCodigo = p.status === 'entregue' && p.eventos.at(-1)?.acao === 'entregar_sem_codigo';

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link to={`/e/${empresaId}/pedidos`} className="text-sm text-mercosul underline">
          Voltar para os pedidos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl">Pedido {p.numero}</h1>
          <SeloStatus status={p.status} />
        </div>
        <p className="text-concreto">
          Criado às {horaCurta(p.criadoEm)}
          {p.motoboy ? `. Motoboy: ${p.motoboy.nome}.` : '. Ainda sem motoboy.'}
          {p.status === 'atribuido' &&
            p.aceiteAte &&
            ` Se ele não aceitar até ${horaCurta(p.aceiteAte)}, o pedido volta para a fila.`}
        </p>
        {p.motivo && (p.status === 'falhou' || p.status === 'cancelado' || p.status === 'em_devolucao') && (
          <p className="border-l-4 border-aluguel bg-superficie px-3 py-2">Motivo: {p.motivo}</p>
        )}
        {semCodigo && (
          <p className="border-l-4 border-sinal bg-superficie px-3 py-2">
            Entregue sem o código. Com quem ou onde ficou: {p.motivo}. Confira a foto do motoboy.
          </p>
        )}
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-8">
          <Acoes empresaId={empresaId} pedido={p} />
          <div className="grid gap-8 sm:grid-cols-2">
            <Parada titulo="Entregar para" parada={p.entrega} />
            <Parada titulo="Coletar em" parada={p.coleta} />
          </div>
          <MapaDoPedido pedido={p} />
          <section className="flex flex-col gap-1">
            <h2 className="text-xl">Pagamento</h2>
            <p>
              {ROTULOS_PAGAMENTO[p.formaPagamento]}
              {p.formaPagamento !== 'pago' && `: cobrar ${formatarReais(p.valorACobrarCentavos)}`}
            </p>
            {p.trocoParaCentavos !== null && (
              <p>
                Troco para {formatarReais(p.trocoParaCentavos)}: levar{' '}
                {formatarReais(p.trocoParaCentavos - p.valorACobrarCentavos)}.
              </p>
            )}
            <p className="text-sm text-concreto">Taxa de entrega: {formatarReais(p.taxaEntregaCentavos)}</p>
          </section>
          {p.observacoes && (
            <section className="flex flex-col gap-1">
              <h2 className="text-xl">Observações</h2>
              <p className="whitespace-pre-line">{p.observacoes}</p>
            </section>
          )}
          {p.fotos.length > 0 && (
            <section className="flex flex-col gap-2" aria-labelledby="titulo-fotos">
              <h2 id="titulo-fotos" className="text-xl">
                Fotos do motoboy
              </h2>
              <ul className="flex flex-wrap gap-3">
                {p.fotos.map((f) => (
                  <li key={f.id}>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col gap-1 text-sm text-concreto"
                    >
                      <img
                        src={f.url}
                        alt={`Foto de ${f.tipo === 'falha' ? 'tentativa de entrega' : f.tipo} às ${horaCurta(f.criadoEm)}`}
                        className="h-32 w-32 rounded border border-linha bg-superficie object-cover"
                        loading="lazy"
                      />
                      {f.tipo === 'falha' ? 'Tentativa' : f.tipo === 'coleta' ? 'Coleta' : 'Entrega'},{' '}
                      {horaCurta(f.criadoEm)}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-8">
          {p.status !== 'entregue' && p.status !== 'cancelado' && p.status !== 'devolvido' && (
            <CodigoEntrega pedido={p} nomeEmpresa={nomeEmpresa} />
          )}
          {p.avaliacao && (
            <Cartao className="flex flex-col gap-2 p-4">
              <h2 className="text-xl">Avaliação do cliente</h2>
              <div className="flex items-center gap-2">
                <Estrelas nota={p.avaliacao.nota} tamanho={20} />
                <span className="text-sm text-concreto">às {horaCurta(p.avaliacao.criadoEm)}</span>
              </div>
              {p.avaliacao.comentario ? (
                <p className="whitespace-pre-line">{p.avaliacao.comentario}</p>
              ) : (
                <p className="text-sm text-concreto">Sem comentário.</p>
              )}
            </Cartao>
          )}
          {p.status === 'entregue' && p.avaliacao === null && (
            <p className="text-sm text-concreto">
              O cliente ainda não avaliou. A nota é dada pelo link de acompanhamento, que vale por 48 horas depois da
              entrega.
            </p>
          )}
          <section className="flex flex-col gap-3" aria-labelledby="titulo-historico">
            <h2 id="titulo-historico" className="text-xl">
              Histórico
            </h2>
            <ol className="flex flex-col">
              {p.eventos.map((e) => (
                <li
                  key={e.id}
                  className="relative grid grid-cols-[3.5rem_1fr] gap-x-3 border-l-2 border-linha py-2 pl-4 before:absolute before:top-3.5 before:-left-[5px] before:h-2 before:w-2 before:rounded-full before:bg-concreto last:before:bg-mercosul last:before:ring-4 last:before:ring-mercosul/20"
                >
                  <time dateTime={e.criadoEm} className="text-sm tabular-nums text-concreto">
                    {horaCurta(e.criadoEm)}
                  </time>
                  <div>
                    <p className="font-medium">
                      {ROTULOS_EVENTO[e.acao]}
                      {e.detalhe ? `: ${e.detalhe}` : ''}
                    </p>
                    <p className="text-sm text-concreto">
                      {e.autor}
                      {e.papel === 'motoboy' ? ' (motoboy)' : ''}. {ROTULOS_STATUS[e.para]}.
                    </p>
                    {e.motivo && (
                      <p className="text-sm">
                        {e.acao === 'entregar_sem_codigo' ? 'Com quem ficou' : 'Motivo'}: {e.motivo}
                      </p>
                    )}
                    <DistanciaDaPorta evento={e} />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
