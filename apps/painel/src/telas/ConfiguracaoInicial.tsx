import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api.ts';
import { AvisoErro, Botao, Campo, erroDoCampo } from '../componentes/ui.tsx';
import { TelaPublica } from './Entrar.tsx';

/** Cria o primeiro super admin usando o SETUP_TOKEN configurado no Worker. */
export function ConfiguracaoInicial() {
  const [dados, setDados] = useState({ token: '', nome: '', email: '', senha: '' });
  const criar = useMutation({
    mutationFn: () => api('/setup', { metodo: 'POST', corpo: dados }),
  });
  const mudar = (campo: keyof typeof dados) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDados({ ...dados, [campo]: e.target.value });

  function enviar(e: FormEvent) {
    e.preventDefault();
    criar.mutate();
  }

  if (criar.isSuccess) {
    return (
      <TelaPublica>
        <h1 className="text-3xl">Super admin criado</h1>
        <p>Agora entre com o e-mail {dados.email} para cadastrar a primeira empresa.</p>
        <Link to="/entrar" className="text-mercosul underline">
          Ir para o login
        </Link>
      </TelaPublica>
    );
  }

  return (
    <TelaPublica>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">Configuração inicial</h1>
        <p className="text-concreto">
          Cria a conta do dono da plataforma. Só funciona uma vez, com o token definido em SETUP_TOKEN no servidor.
        </p>
      </div>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Campo rotulo="Token de configuração" value={dados.token} onChange={mudar('token')} required />
        <Campo
          rotulo="Seu nome"
          value={dados.nome}
          onChange={mudar('nome')}
          erro={erroDoCampo(criar.error, 'nome')}
          required
        />
        <Campo
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          value={dados.email}
          onChange={mudar('email')}
          erro={erroDoCampo(criar.error, 'email')}
          required
        />
        <Campo
          rotulo="Senha"
          type="password"
          autoComplete="new-password"
          dica="Pelo menos 8 caracteres."
          value={dados.senha}
          onChange={mudar('senha')}
          erro={erroDoCampo(criar.error, 'senha')}
          required
        />
        <AvisoErro erro={criar.error} />
        <Botao type="submit" carregando={criar.isPending}>
          Criar super admin
        </Botao>
      </form>
    </TelaPublica>
  );
}
