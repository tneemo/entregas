import { Navigate } from 'react-router';
import { ultimaEmpresa, useEu, useSair } from '../sessao.ts';
import { Botao } from '../componentes/ui.tsx';
import { TelaPublica } from './Entrar.tsx';

/** Decide para onde levar quem abre "/": última empresa usada, primeira empresa ou painel da plataforma. */
export function Inicio() {
  const { data: eu, isLoading } = useEu();
  const sair = useSair();

  if (isLoading) return <p className="p-6">Carregando…</p>;
  if (!eu) return <Navigate to="/entrar" replace />;

  const doPainel = eu.vinculos.filter((v) => v.papel !== 'motoboy');
  const lembrada = doPainel.find((v) => v.empresa.id === ultimaEmpresa());
  const destino = lembrada ?? doPainel[0];
  if (destino) return <Navigate to={`/e/${destino.empresa.id}/pedidos`} replace />;
  if (eu.usuario.superAdmin) return <Navigate to="/plataforma/empresas" replace />;

  return (
    <TelaPublica>
      <h1 className="text-3xl">Olá, {eu.usuario.nome.split(' ')[0]}</h1>
      <p>
        {eu.vinculos.length > 0
          ? 'Sua conta é de motoboy. O trabalho do dia a dia acontece no app do motoboy, que chega na próxima etapa.'
          : 'Você ainda não faz parte de nenhuma empresa ativa. Peça um convite ao administrador da empresa.'}
      </p>
      <Botao variante="secundario" className="self-start" onClick={() => sair.mutate()}>
        Sair
      </Botao>
    </TelaPublica>
  );
}
