// Página pública de acompanhamento (/r/<token>), aberta pelo destinatário no celular.
// Entrada separada do painel: sem login, sem React Query nem roteador, e o mapa só
// baixa quando o pedido sai para entrega. Importa do pacote compartilhado só os
// módulos leves (sem zod).

import { StrictMode, Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ErroResposta, MensagemRastreio, RastreioResposta } from '@entregas/shared';
import { ETAPAS_RASTREIO, RASTREIO_HORAS_APOS_CONCLUSAO, situacaoRastreio } from '@entregas/shared/rastreio';
import { ROTULOS_PAGAMENTO, statusFinal } from '@entregas/shared/pedidos';
import { formatarReais } from '@entregas/shared/dinheiro';
import { formatarTelefone } from '@entregas/shared/validacao';
import { POSICAO_UTIL_S, preverChegada, type PrevisaoChegada } from '@entregas/shared/despacho';
import { textoDistancia } from '@entregas/shared/localizacao';
import { IconeEstrela } from '../componentes/icones.tsx';
import '../estilo.css';

const Mapa = lazy(() => import('../componentes/Mapa.tsx').then((m) => ({ default: m.Mapa })));

const token = decodeURIComponent(window.location.pathname.split('/')[2] ?? '');
const ESPERA_MAXIMA_MS = 30_000;

type Carga =
  | { tipo: 'carregando' }
  | { tipo: 'ok'; dados: RastreioResposta }
  | { tipo: 'erro'; status: number; mensagem: string };

type Posicao = Extract<MensagemRastreio, { tipo: 'posicao' }>;

/** "às 14:32" hoje; "em 07/11 às 14:32" em outro dia. */
function quando(iso: string) {
  const data = new Date(iso);
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (new Date().toDateString() === data.toDateString()) return `às ${hora}`;
  return `em ${data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
}

function useAgora(intervaloMs = 5_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}

function haQuanto(iso: string, agora: number) {
  const s = Math.max(0, Math.round((agora - Date.parse(iso)) / 1000));
  if (s < 60) return s < 10 ? 'há instantes' : `há ${s} s`;
  return `há ${Math.floor(s / 60)} min`;
}

/** Busca os dados e mantém o WebSocket aberto enquanto o pedido não termina. */
function useRastreio() {
  const [carga, setCarga] = useState<Carga>({ tipo: 'carregando' });
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const [conectado, setConectado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/rastreio/${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => null)) as ErroResposta | null;
        setCarga({ tipo: 'erro', status: r.status, mensagem: corpo?.erro.mensagem ?? 'Não foi possível carregar.' });
        return;
      }
      const dados = (await r.json()) as RastreioResposta;
      setCarga({ tipo: 'ok', dados });
      if (!dados.aoVivo) setPosicao(null);
    } catch {
      // Sem internet: mantém o que já está na tela e tenta de novo depois.
      setCarga((atual) =>
        atual.tipo === 'ok'
          ? atual
          : { tipo: 'erro', status: 0, mensagem: 'Sem conexão. Confira a internet do celular.' },
      );
    }
  }, []);

  useEffect(() => {
    void carregar();
    const aoVoltar = () => {
      if (!document.hidden) void carregar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [carregar]);

  const emAndamento = carga.tipo === 'ok' && !statusFinal(carga.dados.status);

  useEffect(() => {
    if (!emAndamento) return;
    let ativo = true;
    let ws: WebSocket | null = null;
    let tentativas = 0;
    let reconectar: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const conectar = () => {
      const protocolo = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const atual = new WebSocket(
        `${protocolo}//${window.location.host}/api/v1/rastreio/${encodeURIComponent(token)}/ws`,
      );
      ws = atual;
      atual.onopen = () => {
        tentativas = 0;
        setConectado(true);
        ping = setInterval(() => atual.readyState === WebSocket.OPEN && atual.send('ping'), 25_000);
      };
      atual.onmessage = (e) => {
        if (e.data === 'pong') return;
        const m = JSON.parse(e.data as string) as MensagemRastreio;
        if (m.tipo === 'posicao') setPosicao(m);
        else if (m.tipo === 'sem_posicao') setPosicao(null);
        else void carregar();
      };
      atual.onclose = () => {
        clearInterval(ping);
        setConectado(false);
        if (!ativo) return;
        // Pode ter terminado enquanto estava fora (o servidor fecha ao concluir).
        void carregar();
        reconectar = setTimeout(conectar, Math.min(ESPERA_MAXIMA_MS, 1_000 * 2 ** tentativas++));
      };
    };
    conectar();
    // Rede de segurança para celulares que derrubam conexões em segundo plano.
    const consulta = setInterval(() => void carregar(), 60_000);

    return () => {
      ativo = false;
      clearTimeout(reconectar);
      clearInterval(ping);
      clearInterval(consulta);
      ws?.close(1000);
    };
  }, [emAndamento, carregar]);

  return { carga, posicao, conectado, carregar };
}

function Etapas({ etapa, problema, entregue }: { etapa: number; problema: boolean; entregue: boolean }) {
  return (
    <ol aria-label="Etapas da entrega" className="grid grid-cols-4 gap-1.5">
      {ETAPAS_RASTREIO.map((nome, i) => {
        const feita = i < etapa || entregue;
        const agora = i === etapa && !entregue;
        const cor =
          agora && problema ? 'bg-aluguel' : feita || agora ? (entregue ? 'bg-ok' : 'bg-mercosul') : 'bg-linha';
        return (
          <li key={nome} className="flex flex-col gap-1.5">
            <span className={`h-1.5 rounded-full ${cor}`} aria-hidden />
            <span className={`text-xs leading-tight ${agora ? 'font-semibold text-asfalto' : 'text-concreto'}`}>
              {nome}
              <span className="sr-only">{feita ? ' (concluída)' : agora ? ' (agora)' : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-sm font-medium text-concreto">{titulo}</h2>
      {children}
    </section>
  );
}

function AoVivo({
  dados,
  posicao,
  conectado,
}: {
  dados: RastreioResposta;
  posicao: Posicao | null;
  conectado: boolean;
}) {
  const agora = useAgora();
  const rotulo = dados.motoboy?.primeiroNome ?? 'Entregador';
  return (
    <section className="flex flex-col gap-2" aria-labelledby="titulo-mapa">
      <h2 id="titulo-mapa" className="sr-only">
        Entregador no mapa
      </h2>
      {posicao ? (
        <Suspense fallback={<div className="h-72 rounded-md bg-linha/40" />}>
          <Mapa
            marcadores={[
              {
                id: 'entregador',
                latitude: posicao.latitude,
                longitude: posicao.longitude,
                rotulo,
                precisao: posicao.precisao,
              },
              ...(dados.destino ? [{ id: 'destino', tipo: 'entrega' as const, ...dados.destino, rotulo: 'Você' }] : []),
            ]}
            linhas={dados.destino ? [{ id: 'trajeto', de: posicao, para: dados.destino }] : undefined}
            seguir
            rotulo={`Posição de ${rotulo} no mapa`}
            className="h-72"
          />
        </Suspense>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-linha bg-superficie px-4 text-center text-concreto">
          Aguardando a localização do entregador…
        </div>
      )}
      <p className="text-sm text-concreto" aria-live="polite">
        {!conectado
          ? 'Reconectando…'
          : posicao
            ? `Localização atualizada ${haQuanto(posicao.registradoEm, agora)}.`
            : 'O mapa aparece assim que o celular do entregador enviar a posição.'}
      </p>
    </section>
  );
}

function Pagina() {
  const { carga, posicao, conectado, carregar } = useRastreio();

  if (carga.tipo === 'carregando') {
    return <Moldura>{<p className="text-concreto">Carregando seu pedido…</p>}</Moldura>;
  }
  if (carga.tipo === 'erro') {
    const expirado = carga.status === 410;
    const invalido = carga.status === 404;
    return (
      <Moldura>
        <h1 className="text-3xl">
          {expirado ? 'Este link expirou' : invalido ? 'Link não encontrado' : 'Não deu para carregar'}
        </h1>
        <p>
          {expirado
            ? `O acompanhamento fica disponível até ${RASTREIO_HORAS_APOS_CONCLUSAO} horas depois da entrega.`
            : invalido
              ? 'Confira se o link foi copiado inteiro. Se o problema continuar, fale com quem enviou o pedido.'
              : carga.mensagem}
        </p>
        {!expirado && !invalido && (
          <button
            type="button"
            onClick={() => void carregar()}
            className="inline-flex min-h-11 items-center self-start rounded-md bg-mercosul px-4 font-medium text-contraste"
          >
            Tentar de novo
          </button>
        )}
      </Moldura>
    );
  }

  const d = carga.dados;
  const situacao = situacaoRastreio(d.status, d.empresa.nomeFantasia);
  const entregue = d.status === 'entregue';
  const borda = situacao.problema ? 'border-aluguel' : entregue ? 'border-ok' : 'border-mercosul';
  const momento = d.horarios.concluido
    ? `${entregue ? 'Entregue' : 'Encerrado'} ${quando(d.horarios.concluido)}.`
    : d.horarios.saiuParaEntrega && d.status === 'em_rota'
      ? `Saiu para entrega ${quando(d.horarios.saiuParaEntrega)}.`
      : `Pedido feito ${quando(d.horarios.recebido)}.`;
  const telefone = d.empresa.telefone;
  // Só promete horário com posição recente; com o celular do entregador sem sinal, fica o texto normal.
  const previsao: PrevisaoChegada | null =
    d.aoVivo && d.destino && posicao && Date.now() - Date.parse(posicao.registradoEm) <= POSICAO_UTIL_S * 1000
      ? preverChegada(posicao, d.destino)
      : null;

  return (
    <Moldura>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl">{d.empresa.nomeFantasia}</h1>
        <p className="text-concreto">Acompanhe sua entrega. Pedido nº {d.numero}.</p>
      </header>

      <section
        aria-live="polite"
        className={`flex flex-col gap-2 rounded-lg border border-linha border-l-4 bg-superficie p-4 ${borda}`}
      >
        {previsao ? (
          <>
            <h2 className="text-lg text-concreto">{situacao.titulo}</h2>
            <p className="font-cond text-5xl font-semibold leading-none">
              {previsao.chegando ? 'Chegando' : `Chega em ${previsao.minutos} min`}
            </p>
            <p>
              {previsao.chegando
                ? 'O entregador está na sua rua. Deixe o código à mão.'
                : `O entregador está a ${textoDistancia(previsao.distanciaM)} de você. A previsão se ajusta conforme ele anda.`}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-3xl">{situacao.titulo}</h2>
            <p>{situacao.texto}</p>
          </>
        )}
        <p className="text-sm text-concreto">
          {d.motoboy && !statusFinal(d.status) ? `Entregador: ${d.motoboy.primeiroNome}. ` : ''}
          {momento}
        </p>
      </section>

      {d.status !== 'cancelado' && <Etapas etapa={situacao.etapa} problema={situacao.problema} entregue={entregue} />}

      {d.aoVivo && <AoVivo dados={d} posicao={posicao} conectado={conectado} />}

      {d.podeAvaliar && <Avaliar empresa={d.empresa.nomeFantasia} aoEnviar={carregar} />}
      {d.avaliacao && (
        <section className="flex flex-col gap-2 rounded-lg border border-linha bg-superficie p-4">
          <h2 className="text-xl">Obrigado pela avaliação</h2>
          <Estrelas nota={d.avaliacao.nota} />
          {d.avaliacao.comentario && <p className="text-concreto">"{d.avaliacao.comentario}"</p>}
        </section>
      )}

      {d.codigoEntrega && (
        <section
          className="flex flex-col gap-1 rounded-lg border border-linha bg-superficie p-4"
          aria-labelledby="titulo-codigo"
        >
          <h2 id="titulo-codigo" className="text-sm font-medium text-concreto">
            Código de entrega
          </h2>
          <p className="font-cond text-5xl font-bold tracking-[0.25em] text-mercosul">
            <span className="sr-only">{`Código ${d.codigoEntrega.split('').join(' ')}`}</span>
            <span aria-hidden="true">{d.codigoEntrega}</span>
          </p>
          <p className="text-sm">Informe este código ao entregador quando receber. Não passe para mais ninguém.</p>
        </section>
      )}

      {d.cobranca && (
        <Bloco titulo="Pagamento">
          {d.cobranca.formaPagamento === 'pago' ? (
            <p>Já está pago. Não há nada a pagar na entrega.</p>
          ) : (
            <>
              <p>
                {ROTULOS_PAGAMENTO[d.cobranca.formaPagamento]}:{' '}
                <strong className="font-semibold">{formatarReais(d.cobranca.valorACobrarCentavos)}</strong>
              </p>
              {d.cobranca.trocoParaCentavos !== null && (
                <p className="text-sm text-concreto">
                  Troco para {formatarReais(d.cobranca.trocoParaCentavos)}: o entregador leva{' '}
                  {formatarReais(d.cobranca.trocoParaCentavos - d.cobranca.valorACobrarCentavos)}.
                </p>
              )}
            </>
          )}
        </Bloco>
      )}

      {d.entrega && (
        <Bloco titulo="Endereço de entrega">
          <p>
            {d.entrega.logradouro}, {d.entrega.numero}
            {d.entrega.complemento ? ` (${d.entrega.complemento})` : ''}
          </p>
          <p className="text-sm text-concreto">
            {d.entrega.bairro}, {d.entrega.cidade} – {d.entrega.uf}
          </p>
        </Bloco>
      )}

      {telefone && (
        <Bloco titulo={`Falar com a ${d.empresa.nomeFantasia}`}>
          <div className="flex flex-wrap gap-2">
            <a
              href={`tel:${telefone}`}
              className="inline-flex min-h-11 items-center rounded-md border border-asfalto/30 bg-superficie px-4 font-medium"
            >
              Ligar {formatarTelefone(telefone)}
            </a>
            <a
              href={`https://wa.me/${telefone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Sobre o pedido nº ${d.numero}:`)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center rounded-md bg-ok px-4 font-medium text-contraste"
            >
              WhatsApp
            </a>
          </div>
        </Bloco>
      )}

      <footer className="mt-auto border-t border-linha pt-4 text-xs text-concreto">
        Este link mostra só este pedido e deixa de funcionar {RASTREIO_HORAS_APOS_CONCLUSAO} horas depois da entrega. A
        localização do entregador aparece apenas enquanto ele está a caminho.
      </footer>
    </Moldura>
  );
}

function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="flex gap-1 text-sinal" role="img" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <IconeEstrela key={n} tamanho={24} cheia={n <= nota} />
      ))}
    </span>
  );
}

const PALAVRA_DA_NOTA = ['', 'Ruim', 'Regular', 'Boa', 'Muito boa', 'Excelente'];

/** Estrelas e comentário, logo depois da entrega. Uma avaliação por pedido. */
function Avaliar({ empresa, aoEnviar }: { empresa: string; aoEnviar: () => Promise<void> }) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (nota === 0) return;
    setEnviando(true);
    setErro(undefined);
    try {
      const r = await fetch(`/api/v1/rastreio/${encodeURIComponent(token)}/avaliacao`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nota, comentario }),
      });
      // 409: já avaliado em outra aba. Nos dois casos a página recarrega e mostra a nota.
      if (!r.ok && r.status !== 409) {
        const corpo = (await r.json().catch(() => null)) as ErroResposta | null;
        setErro(corpo?.erro.mensagem ?? 'Não foi possível enviar. Tente de novo.');
        return;
      }
      await aoEnviar();
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-lg border border-linha bg-superficie p-4">
      <h2 className="text-xl">Como foi a entrega?</h2>
      <fieldset className="flex items-center gap-1">
        <legend className="sr-only">Nota de 1 a 5 estrelas</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={`cursor-pointer rounded-md p-1.5 has-focus-visible:outline-3 has-focus-visible:outline-sinal ${
              n <= nota ? 'text-sinal' : 'text-concreto/50'
            }`}
          >
            <input
              type="radio"
              name="nota"
              value={n}
              checked={nota === n}
              onChange={() => setNota(n)}
              className="sr-only"
            />
            <IconeEstrela tamanho={34} cheia={n <= nota} />
            <span className="sr-only">
              {n} {n === 1 ? 'estrela' : 'estrelas'}
            </span>
          </label>
        ))}
        <span className="ml-2 font-medium" aria-live="polite">
          {PALAVRA_DA_NOTA[nota]}
        </span>
      </fieldset>
      {nota > 0 && (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Quer contar algo para a {empresa}? (opcional)
            <textarea
              rows={3}
              maxLength={500}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              className="rounded-md border border-linha bg-superficie px-3 py-2 text-base font-normal outline-none focus:border-mercosul"
            />
          </label>
          {erro && (
            <p role="alert" className="text-sm text-aluguel">
              {erro}
            </p>
          )}
          <button
            type="submit"
            disabled={enviando}
            className="inline-flex min-h-11 items-center self-start rounded-md bg-mercosul px-4 font-medium text-contraste disabled:opacity-60"
          >
            {enviando ? 'Enviando…' : 'Enviar avaliação'}
          </button>
        </>
      )}
    </form>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-6">{children}</main>;
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <Pagina />
  </StrictMode>,
);
