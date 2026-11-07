import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EntrarResposta } from '@entregas/shared';
import { api } from '../api.ts';
import { useEu } from '../sessao.ts';
import { Placa } from '../componentes/Placa.tsx';
import { AvisoErro, Botao, Campo } from '../componentes/ui.tsx';

export function TelaPublica({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
      {children}
    </main>
  );
}

/** Formulário de login reaproveitado na tela de convite. */
export function FormularioEntrar({ aoEntrar }: { aoEntrar: (eu: EntrarResposta) => void }) {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const cliente = useQueryClient();
  const entrar = useMutation({
    mutationFn: () => api<EntrarResposta>('/auth/entrar', { metodo: 'POST', corpo: { login, senha } }),
    onSuccess: (eu) => {
      cliente.setQueryData(['eu'], eu);
      aoEntrar(eu);
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    entrar.mutate();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <Campo
        rotulo="E-mail, telefone ou CPF"
        autoComplete="username"
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        required
      />
      <Campo
        rotulo="Senha"
        type="password"
        autoComplete="current-password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        required
      />
      <AvisoErro erro={entrar.error} />
      <Botao type="submit" carregando={entrar.isPending}>
        {entrar.isPending ? 'Entrando…' : 'Entrar'}
      </Botao>
    </form>
  );
}

export function Entrar() {
  const navegar = useNavigate();
  const { data: eu } = useEu();
  if (eu) return <Navigate to="/" replace />;

  return (
    <TelaPublica>
      <div className="w-56">
        <Placa texto="Entregas" tamanho="grande" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">Entrar no painel</h1>
        <p className="text-concreto">Para administradores e despachantes das empresas.</p>
      </div>
      <FormularioEntrar aoEntrar={() => navegar('/', { replace: true })} />
      <p className="text-sm text-concreto">
        Primeiro acesso à plataforma? <Link to="/configuracao-inicial" className="text-mercosul underline">Configure o super admin</Link>.
      </p>
    </TelaPublica>
  );
}
