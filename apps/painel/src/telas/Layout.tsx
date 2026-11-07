import { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { ROTULOS, type EuResposta } from '@entregas/shared';
import { lembrarEmpresa, useEu, useSair } from '../sessao.ts';
import { Placa } from '../componentes/Placa.tsx';
import { Botao } from '../componentes/ui.tsx';

const PLATAFORMA = 'plataforma';

function Navegacao({ eu, empresaId }: { eu: EuResposta; empresaId?: string }) {
  const vinculo = eu.vinculos.find((v) => v.empresa.id === empresaId);
  const item = ({ isActive }: { isActive: boolean }) =>
    `block rounded px-3 py-2 text-[15px] ${isActive ? 'bg-mercosul/10 font-semibold text-mercosul' : 'hover:bg-white'}`;

  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {vinculo && vinculo.papel !== 'motoboy' && (
        <>
          <NavLink to={`/e/${vinculo.empresa.id}/pedidos`} className={item}>
            Pedidos
          </NavLink>
          <NavLink to={`/e/${vinculo.empresa.id}/equipe`} className={item}>
            Equipe
          </NavLink>
          {vinculo.papel === 'admin' && (
            <NavLink to={`/e/${vinculo.empresa.id}/empresa`} className={item}>
              Dados da empresa
            </NavLink>
          )}
        </>
      )}
      {!empresaId && eu.usuario.superAdmin && (
        <NavLink to="/plataforma/empresas" className={item}>
          Empresas
        </NavLink>
      )}
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
      <span className="text-concreto">Trocar de empresa</span>
      <select
        value={atual}
        onChange={(e) => {
          const destino = e.target.value;
          if (destino === PLATAFORMA) return navegar('/plataforma/empresas');
          lembrarEmpresa(destino);
          navegar(`/e/${destino}/pedidos`);
        }}
        className="min-h-10 rounded border border-linha bg-white px-2"
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

export function Layout() {
  const { data: eu, isLoading } = useEu();
  const { empresaId } = useParams();
  const sair = useSair();
  const local = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);

  if (isLoading) return <p className="p-6">Carregando…</p>;
  if (!eu) return <Navigate to="/entrar" replace state={{ voltarPara: local.pathname }} />;

  const vinculo = eu.vinculos.find((v) => v.empresa.id === empresaId);
  if (empresaId && (!vinculo || vinculo.papel === 'motoboy')) return <Navigate to="/" replace />;
  if (!empresaId && !eu.usuario.superAdmin) return <Navigate to="/" replace />;

  const placa = vinculo ? vinculo.empresa.nomeFantasia : 'Plataforma';
  const subtitulo = vinculo
    ? `${ROTULOS.tipoEmpresa[vinculo.empresa.tipo]}. Você é ${ROTULOS.papel[vinculo.papel].toLowerCase()}.`
    : 'Administração da plataforma.';

  const lateral = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <Placa texto={placa} />
        <p className="text-sm text-concreto">{subtitulo}</p>
      </div>
      <SeletorContexto eu={eu} atual={empresaId ?? PLATAFORMA} />
      <Navegacao eu={eu} empresaId={empresaId} />
      <div className="mt-auto flex flex-col gap-2 border-t border-linha pt-4 text-sm">
        <span className="truncate">{eu.usuario.nome}</span>
        <Botao variante="discreto" className="self-start" onClick={() => sair.mutate()}>
          Sair
        </Botao>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <header className="flex items-center gap-3 border-b border-linha px-4 py-3 md:hidden">
        <div className="w-40">
          <Placa texto={placa} />
        </div>
        <Botao
          variante="secundario"
          className="ml-auto"
          aria-expanded={menuAberto}
          aria-controls="menu-lateral"
          onClick={() => setMenuAberto(!menuAberto)}
        >
          {menuAberto ? 'Fechar menu' : 'Menu'}
        </Botao>
      </header>
      <aside
        id="menu-lateral"
        className={`${menuAberto ? 'block' : 'hidden'} border-b border-linha bg-papel md:sticky md:top-0 md:block md:h-dvh md:border-r md:border-b-0`}
        onClick={(e) => (e.target as HTMLElement).closest('a') && setMenuAberto(false)}
      >
        {lateral}
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-10 md:py-10">
        <Outlet />
      </main>
    </div>
  );
}
