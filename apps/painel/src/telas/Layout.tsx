import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { GRUPOS_STATUS, ROTULOS, type EuResposta, type StatusPedido } from '@entregas/shared';
import { lembrarEmpresa, useEu, useSair } from '../sessao.ts';
import { Placa } from '../componentes/Placa.tsx';
import { IndicadorConexao } from '../componentes/ui.tsx';
import { usePedidos } from '../componentes/pedido.tsx';
import { Paleta, type Comando } from '../componentes/Paleta.tsx';
import {
  IconeBusca,
  IconeEquipe,
  IconeFila,
  IconeGrafico,
  IconeLoja,
  IconeLua,
  IconeMais,
  IconeMapa,
  IconeSair,
  IconeSino,
  IconeSinoMudo,
  IconeSol,
} from '../componentes/icones.tsx';
import { Avisos, definirSom, useSomLigado } from '../avisos.tsx';
import { definirTema, useTema } from '../tema.ts';
import { useAoVivo } from '../tempo-real.ts';

const PLATAFORMA = 'plataforma';
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

interface ItemMenu {
  para: string;
  rotulo: string;
  icone: ReactNode;
  /** Número ao lado do item (ex.: pedidos esperando motoboy). */
  contagem?: { total: number; urgente: boolean; descricao: string };
}

function itensDoMenu(eu: EuResposta, empresaId: string | undefined, fila: { semMotoboy: number; atencao: number }) {
  const vinculo = eu.vinculos.find((v) => v.empresa.id === empresaId);
  const itens: ItemMenu[] = [];
  if (vinculo && vinculo.papel !== 'motoboy') {
    const base = `/e/${vinculo.empresa.id}`;
    const pendencias = fila.semMotoboy + fila.atencao;
    itens.push(
      {
        para: `${base}/pedidos`,
        rotulo: 'Pedidos',
        icone: <IconeFila />,
        contagem:
          pendencias > 0
            ? {
                total: pendencias,
                urgente: fila.atencao > 0,
                descricao: `${fila.semMotoboy} aguardando motoboy, ${fila.atencao} precisando de atenção`,
              }
            : undefined,
      },
      { para: `${base}/mapa`, rotulo: 'Mapa ao vivo', icone: <IconeMapa /> },
      { para: `${base}/visao-geral`, rotulo: 'Visão geral', icone: <IconeGrafico /> },
      { para: `${base}/equipe`, rotulo: 'Equipe', icone: <IconeEquipe /> },
    );
    if (vinculo.papel === 'admin') {
      itens.push({ para: `${base}/empresa`, rotulo: 'Dados da empresa', icone: <IconeLoja /> });
    }
  }
  if (!empresaId && eu.usuario.superAdmin) {
    itens.push({ para: '/plataforma/empresas', rotulo: 'Empresas', icone: <IconeLoja /> });
  }
  return itens;
}

function Navegacao({ itens }: { itens: ItemMenu[] }) {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {itens.map((item) => (
        <NavLink
          key={item.para}
          to={item.para}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 rounded-md px-3 py-2 text-[15px] transition-colors ${
              isActive
                ? 'bg-pista-relevo font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-sinal'
                : 'text-pista-texto/85 hover:bg-pista-relevo/60 hover:text-white'
            }`
          }
        >
          <span className="shrink-0 opacity-90">{item.icone}</span>
          <span className="flex-1">{item.rotulo}</span>
          {item.contagem && (
            <span
              className={`min-w-6 rounded-full px-1.5 text-center text-sm font-semibold tabular-nums ${
                item.contagem.urgente ? 'bg-[#e0566b] text-white' : 'bg-sinal text-[#1e2529]'
              }`}
            >
              <span aria-hidden="true">{item.contagem.total}</span>
              <span className="sr-only">{item.contagem.descricao}</span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SeletorContexto({ eu, atual }: { eu: EuResposta; atual: string }) {
  const navegar = useNavigate();
  const empresas = eu.vinculos.filter((v) => v.papel !== 'motoboy');
  const opcoes = empresas.length + (eu.usuario.superAdmin ? 1 : 0);
  if (opcoes < 2) return null;

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-pista-apoio">Trocar de empresa</span>
      <select
        value={atual}
        onChange={(e) => {
          const destino = e.target.value;
          if (destino === PLATAFORMA) return navegar('/plataforma/empresas');
          lembrarEmpresa(destino);
          navegar(`/e/${destino}/pedidos`);
        }}
        className="min-h-10 rounded-md border border-white/15 bg-pista-relevo px-2 text-pista-texto"
      >
        {eu.usuario.superAdmin && <option value={PLATAFORMA}>Plataforma (super admin)</option>}
        {empresas.map((v) => (
          <option key={v.empresa.id} value={v.empresa.id}>
            {v.empresa.nomeFantasia}
          </option>
        ))}
      </select>
    </label>
  );
}

function BotaoRodape({ rotulo, onClick, children }: { rotulo: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      onClick={onClick}
      className="rounded-md p-2 text-pista-apoio transition-colors hover:bg-pista-relevo hover:text-white"
    >
      {children}
    </button>
  );
}

const digitando = (alvo: EventTarget | null) =>
  alvo instanceof HTMLElement && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName));

export function Layout() {
  const { data: eu, isLoading } = useEu();
  const { empresaId } = useParams();
  const sair = useSair();
  const local = useLocation();
  const navegar = useNavigate();
  const tema = useTema();
  const som = useSomLigado();
  const [menuAberto, setMenuAberto] = useState(false);
  const [paleta, setPaleta] = useState(false);
  // Uma conexão de tempo real enquanto a central está numa empresa (mapa e fila se atualizam sozinhos).
  const daCentral = Boolean(eu?.vinculos.some((v) => v.empresa.id === empresaId && v.papel !== 'motoboy'));
  const aoVivo = useAoVivo(daCentral ? empresaId : undefined);
  const ativos = usePedidos(empresaId ?? '', 'ativos', daCentral);

  const fila = useMemo(() => {
    const conta = (grupo: readonly StatusPedido[]) => ativos.data?.filter((p) => grupo.includes(p.status)).length ?? 0;
    return { semMotoboy: conta(GRUPOS_STATUS.sem_motoboy), atencao: conta(GRUPOS_STATUS.atencao) };
  }, [ativos.data]);

  const vinculo = eu?.vinculos.find((v) => v.empresa.id === empresaId);
  const placa = vinculo ? vinculo.empresa.nomeFantasia : 'Plataforma';

  // Aba em segundo plano: o título mostra quantos pedidos esperam alguém da central.
  useEffect(() => {
    const pendencias = fila.semMotoboy + fila.atencao;
    document.title = `${pendencias > 0 ? `(${pendencias}) ` : ''}${placa} — Entregas`;
  }, [fila, placa]);

  // Atalhos: Ctrl+K abre a busca; N cria pedido (fora de campos de texto).
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaleta((aberta) => !aberta);
      } else if (
        daCentral &&
        e.key.toLowerCase() === 'n' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !digitando(e.target)
      ) {
        e.preventDefault();
        navegar(`/e/${empresaId}/pedidos/novo`);
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [daCentral, empresaId, navegar]);

  if (isLoading) return <p className="p-6 text-concreto">Carregando…</p>;
  if (!eu) return <Navigate to="/entrar" replace state={{ voltarPara: local.pathname }} />;

  if (empresaId && (!vinculo || vinculo.papel === 'motoboy')) return <Navigate to="/" replace />;
  if (!empresaId && !eu.usuario.superAdmin) return <Navigate to="/" replace />;

  const subtitulo = vinculo
    ? `${ROTULOS.tipoEmpresa[vinculo.empresa.tipo]}. Você é ${ROTULOS.papel[vinculo.papel].toLowerCase()}.`
    : 'Administração da plataforma.';

  const itens = itensDoMenu(eu, empresaId, fila);
  const alternarTema = () => definirTema(tema === 'escuro' ? 'claro' : 'escuro');
  const comandos: Comando[] = [
    ...(daCentral
      ? [
          {
            id: 'novo-pedido',
            rotulo: 'Novo pedido',
            apoio: 'N',
            icone: <IconeMais />,
            executar: () => navegar(`/e/${empresaId}/pedidos/novo`),
          },
        ]
      : []),
    ...itens.map((item) => ({
      id: item.para,
      rotulo: item.rotulo,
      icone: item.icone,
      executar: () => navegar(item.para),
    })),
    ...eu.vinculos
      .filter((v) => v.papel !== 'motoboy' && v.empresa.id !== empresaId)
      .map((v) => ({
        id: `empresa-${v.empresa.id}`,
        rotulo: `Trocar para ${v.empresa.nomeFantasia}`,
        icone: <IconeLoja />,
        executar: () => {
          lembrarEmpresa(v.empresa.id);
          navegar(`/e/${v.empresa.id}/pedidos`);
        },
      })),
    {
      id: 'tema',
      rotulo: tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro',
      icone: tema === 'escuro' ? <IconeSol /> : <IconeLua />,
      executar: alternarTema,
    },
    { id: 'sair', rotulo: 'Sair da conta', icone: <IconeSair />, executar: () => sair.mutate() },
  ];

  const lateral = (
    <div className="flex h-full flex-col gap-5 p-4">
      <div className="flex flex-col gap-2">
        <Placa texto={placa} />
        <p className="text-sm text-pista-apoio">{subtitulo}</p>
      </div>
      <div className="faixa-de-pista" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setPaleta(true)}
        className="flex min-h-10 items-center gap-2 rounded-md border border-white/15 px-3 text-left text-[15px] text-pista-apoio transition-colors hover:border-white/35 hover:text-white"
      >
        <IconeBusca tamanho={16} />
        <span className="flex-1">Buscar ou ir para</span>
        <kbd className="rounded border border-white/20 px-1.5 font-sans text-xs">{MAC ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <Navegacao itens={itens} />
      <SeletorContexto eu={eu} atual={empresaId ?? PLATAFORMA} />
      <div className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-4">
        <IndicadorConexao conexao={aoVivo.conexao} />
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pista-relevo font-cond text-base font-semibold text-white"
          >
            {eu.usuario.nome.trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{eu.usuario.nome}</span>
        </div>
        <div className="-mx-1 flex items-center">
          {daCentral && (
            <BotaoRodape
              rotulo={som ? 'Desligar o som dos alertas' : 'Ligar o som dos alertas'}
              onClick={() => definirSom(!som)}
            >
              {som ? <IconeSino /> : <IconeSinoMudo />}
            </BotaoRodape>
          )}
          <BotaoRodape rotulo={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'} onClick={alternarTema}>
            {tema === 'escuro' ? <IconeSol /> : <IconeLua />}
          </BotaoRodape>
          <button
            type="button"
            onClick={() => sair.mutate()}
            className="ml-auto flex items-center gap-2 rounded-md px-2 py-2 text-sm text-pista-apoio transition-colors hover:bg-pista-relevo hover:text-white"
          >
            <IconeSair tamanho={16} />
            Sair
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16.5rem_1fr]">
      <header className="flex items-center gap-3 bg-pista px-4 py-3 text-pista-texto md:hidden">
        <div className="w-36">
          <Placa texto={placa} />
        </div>
        <button
          type="button"
          aria-label="Buscar ou ir para"
          onClick={() => setPaleta(true)}
          className="ml-auto rounded-md p-2 hover:bg-pista-relevo"
        >
          <IconeBusca />
        </button>
        <button
          type="button"
          aria-expanded={menuAberto}
          aria-controls="menu-lateral"
          onClick={() => setMenuAberto(!menuAberto)}
          className="min-h-10 rounded-md border border-white/20 px-3 text-[15px] font-medium hover:bg-pista-relevo"
        >
          {menuAberto ? 'Fechar menu' : 'Menu'}
        </button>
      </header>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: delegação; o clique vem dos links do menu, que já respondem ao teclado. */}
      <aside
        id="menu-lateral"
        className={`${menuAberto ? 'block' : 'hidden'} bg-pista text-pista-texto md:sticky md:top-0 md:block md:h-dvh md:overflow-y-auto`}
        onClick={(e) => (e.target as HTMLElement).closest('a') && setMenuAberto(false)}
      >
        {lateral}
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-10 md:py-9">
        <Outlet />
      </main>
      <Avisos />
      {paleta && (
        <Paleta empresaId={daCentral ? empresaId : undefined} comandos={comandos} aoFechar={() => setPaleta(false)} />
      )}
    </div>
  );
}
