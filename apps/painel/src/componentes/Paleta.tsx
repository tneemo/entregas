// Paleta de comandos (Ctrl+K): ir para qualquer tela ou achar um pedido pelo número,
// nome ou telefone do cliente sem tirar a mão do teclado.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ROTULOS_STATUS, type PedidoResumo } from '@entregas/shared';
import { api } from '../api.ts';
import { IconeBusca, IconeFila } from './icones.tsx';

export interface Comando {
  id: string;
  rotulo: string;
  /** Texto de apoio à direita (atalho, situação). */
  apoio?: string;
  icone?: ReactNode;
  executar: () => void;
}

function useAtrasado<T>(valor: T, ms: number) {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}

export function Paleta({
  empresaId,
  comandos,
  aoFechar,
}: {
  /** Com empresa, o que for digitado também busca pedidos. */
  empresaId?: string;
  comandos: Comando[];
  aoFechar: () => void;
}) {
  const navegar = useNavigate();
  const idLista = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [marcado, setMarcado] = useState(0);
  const termo = useAtrasado(texto.trim(), 180);

  const pedidos = useQuery({
    queryKey: ['pedidos', empresaId, 'busca', termo],
    queryFn: () => api<PedidoResumo[]>(`/empresas/${empresaId}/pedidos?busca=${encodeURIComponent(termo)}`),
    enabled: Boolean(empresaId) && termo.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const itens = useMemo<Comando[]>(() => {
    const minusculo = texto.trim().toLocaleLowerCase('pt-BR');
    const filtrados = comandos.filter((c) => c.rotulo.toLocaleLowerCase('pt-BR').includes(minusculo));
    const achados: Comando[] =
      termo.length >= 2 && texto.trim().length >= 2
        ? (pedidos.data ?? []).slice(0, 8).map((p) => ({
            id: `pedido-${p.id}`,
            rotulo: `Pedido ${p.numero}, ${p.destino.nome ?? 'sem nome'}`,
            apoio: ROTULOS_STATUS[p.status],
            icone: <IconeFila />,
            executar: () => navegar(`/e/${empresaId}/pedidos/${p.id}`),
          }))
        : [];
    return [...achados, ...filtrados];
  }, [comandos, texto, termo, pedidos.data, navegar, empresaId]);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  // A lista mudou: o marcado volta para o primeiro.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage ao texto digitado, não ao valor.
  useEffect(() => setMarcado(0), [texto, pedidos.data]);

  function escolher(comando: Comando | undefined) {
    if (!comando) return;
    aoFechar();
    comando.executar();
  }

  function tecla(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMarcado((i) => Math.min(itens.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMarcado((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      escolher(itens[marcado]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      aoFechar();
    }
  }

  const buscando = pedidos.isFetching && termo.length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12dvh]">
      <button
        type="button"
        aria-label="Fechar busca"
        tabIndex={-1}
        onClick={aoFechar}
        className="absolute inset-0 cursor-default bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar ou ir para"
        className="relative flex max-h-[70dvh] w-full max-w-xl animate-entrar flex-col overflow-hidden rounded-xl border border-linha bg-superficie shadow-flutuante"
      >
        <div className="flex items-center gap-3 border-b border-linha px-4">
          <IconeBusca className="shrink-0 text-concreto" />
          <input
            ref={campo}
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-activedescendant={itens[marcado] ? `${idLista}-${itens[marcado].id}` : undefined}
            aria-label="Buscar ou ir para"
            placeholder={empresaId ? 'Número do pedido, cliente, telefone ou tela' : 'Para onde ir'}
            autoComplete="off"
            spellCheck={false}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={tecla}
            className="min-h-14 w-full bg-transparent text-lg outline-none placeholder:text-concreto"
          />
          {buscando && <span className="shrink-0 text-sm text-concreto">Buscando…</span>}
        </div>
        <div id={idLista} role="listbox" aria-label="Resultados" tabIndex={-1} className="overflow-y-auto p-2">
          {itens.map((c, i) => (
            <div
              key={c.id}
              id={`${idLista}-${c.id}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === marcado}
              onPointerMove={() => setMarcado(i)}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => escolher(c)}
              onKeyDown={tecla}
              className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 ${
                i === marcado ? 'bg-mercosul/10 text-mercosul' : ''
              }`}
            >
              <span className="shrink-0 text-concreto">{c.icone}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{c.rotulo}</span>
              {c.apoio && <span className="shrink-0 text-sm text-concreto">{c.apoio}</span>}
            </div>
          ))}
          {itens.length === 0 && (
            <p className="px-3 py-6 text-center text-concreto">
              {buscando ? 'Buscando…' : 'Nada encontrado. Tente o número do pedido ou o nome do cliente.'}
            </p>
          )}
        </div>
        <p className="border-t border-linha px-4 py-2 text-xs text-concreto">
          Setas para escolher, Enter para abrir, Esc para fechar.
        </p>
      </div>
    </div>
  );
}
