import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROTULOS, type ConvitePublicoResposta, type EntrarResposta } from '@entregas/shared';
import { api } from '../api.ts';
import { useEu } from '../sessao.ts';
import { Placa } from '../componentes/Placa.tsx';
import { AvisoErro, Botao, Campo, erroDoCampo } from '../componentes/ui.tsx';
import { FormularioEntrar, TelaPublica } from './Entrar.tsx';

export function Convite() {
  const { token = '' } = useParams();
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const { data: eu, isLoading: carregandoEu } = useEu();
  const [jaTenhoConta, setJaTenhoConta] = useState(false);
  const [dados, setDados] = useState({ nome: '', email: '', telefone: '', cpf: '', senha: '' });

  const convite = useQuery({
    queryKey: ['convite', token],
    queryFn: () => api<ConvitePublicoResposta>(`/convites/${token}`),
    retry: false,
    staleTime: Infinity, // depois do aceite o convite deixa de existir; mantemos o que foi exibido
  });

  const aceitar = useMutation({
    mutationFn: () => {
      const corpo = Object.fromEntries(Object.entries(dados).filter(([, v]) => v.trim() !== ''));
      return api<EntrarResposta>(`/convites/${token}/aceitar`, { metodo: 'POST', corpo });
    },
    onSuccess: (resposta) => cliente.setQueryData(['eu'], resposta),
  });

  const mudar = (campo: keyof typeof dados) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDados({ ...dados, [campo]: e.target.value });

  if (convite.isLoading || carregandoEu)
    return (
      <TelaPublica>
        <p>Carregando convite…</p>
      </TelaPublica>
    );

  if (convite.error && !aceitar.isSuccess) {
    return (
      <TelaPublica>
        <h1 className="text-3xl">Convite indisponível</h1>
        <p>{convite.error.message} Peça um novo link para quem te convidou.</p>
        <Link to="/entrar" className="text-mercosul underline">
          Ir para o login
        </Link>
      </TelaPublica>
    );
  }

  if (aceitar.isSuccess) {
    const papel = convite.data?.papel;
    return (
      <TelaPublica>
        <h1 className="text-3xl">Pronto, você entrou na equipe</h1>
        {papel === 'motoboy' ? (
          <p>
            Seu acesso está criado. Instale o app Entregas Motoboy (a empresa envia o link) e entre nele com este
            telefone ou CPF e a senha que acabou de criar.
          </p>
        ) : (
          <Botao onClick={() => navegar('/', { replace: true })}>Abrir o painel</Botao>
        )}
      </TelaPublica>
    );
  }

  const c = convite.data!;
  const funcao = ROTULOS.papel[c.papel].toLowerCase();

  function enviar(e: FormEvent) {
    e.preventDefault();
    aceitar.mutate();
  }

  return (
    <TelaPublica>
      <div className="w-64">
        <Placa texto={c.empresa.nomeFantasia} faixa={`${c.empresa.cidade.toUpperCase()} PR`} tamanho="grande" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">
          Convite para {funcao} na {c.empresa.nomeFantasia}
        </h1>
        <p className="text-concreto">
          {ROTULOS.tipoEmpresa[c.empresa.tipo]} em {c.empresa.cidade}.
        </p>
      </div>

      {eu ? (
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <p>
            Você está conectado como <strong>{eu.usuario.nome}</strong>. A {c.empresa.nomeFantasia} vai aparecer junto
            das suas outras empresas.
          </p>
          {c.exige.cpf && !eu.usuario.temCpf && (
            <Campo
              rotulo="CPF"
              inputMode="numeric"
              value={dados.cpf}
              onChange={mudar('cpf')}
              erro={erroDoCampo(aceitar.error, 'cpf')}
              required
            />
          )}
          {c.exige.telefone && !eu.usuario.telefone && (
            <Campo
              rotulo="Celular com DDD"
              type="tel"
              value={dados.telefone}
              onChange={mudar('telefone')}
              erro={erroDoCampo(aceitar.error, 'telefone')}
              required
            />
          )}
          {c.exige.email && !eu.usuario.email && (
            <Campo
              rotulo="E-mail"
              type="email"
              value={dados.email}
              onChange={mudar('email')}
              erro={erroDoCampo(aceitar.error, 'email')}
              required
            />
          )}
          <AvisoErro erro={aceitar.error} />
          <Botao type="submit" carregando={aceitar.isPending}>
            Aceitar convite
          </Botao>
        </form>
      ) : jaTenhoConta ? (
        <div className="flex flex-col gap-4">
          <p>Entre com a conta que você já usa em outra empresa.</p>
          <FormularioEntrar aoEntrar={() => setJaTenhoConta(false)} />
          <Botao variante="discreto" onClick={() => setJaTenhoConta(false)}>
            Criar uma conta nova
          </Botao>
        </div>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <Campo
            rotulo="Nome completo"
            autoComplete="name"
            value={dados.nome}
            onChange={mudar('nome')}
            erro={erroDoCampo(aceitar.error, 'nome')}
            required
          />
          {c.exige.email ? (
            <Campo
              rotulo="E-mail"
              type="email"
              autoComplete="email"
              value={dados.email}
              onChange={mudar('email')}
              erro={erroDoCampo(aceitar.error, 'email')}
              required
            />
          ) : null}
          <Campo
            rotulo={c.exige.telefone ? 'Celular com DDD' : 'Celular com DDD (opcional)'}
            type="tel"
            autoComplete="tel"
            placeholder="(45) 99999-0000"
            value={dados.telefone}
            onChange={mudar('telefone')}
            erro={erroDoCampo(aceitar.error, 'telefone')}
            required={c.exige.telefone}
          />
          {c.exige.cpf && (
            <Campo
              rotulo="CPF"
              inputMode="numeric"
              value={dados.cpf}
              onChange={mudar('cpf')}
              erro={erroDoCampo(aceitar.error, 'cpf')}
              required
            />
          )}
          <Campo
            rotulo="Crie uma senha"
            type="password"
            autoComplete="new-password"
            dica="Pelo menos 8 caracteres."
            value={dados.senha}
            onChange={mudar('senha')}
            erro={erroDoCampo(aceitar.error, 'senha')}
            required
          />
          <AvisoErro erro={aceitar.error} />
          <Botao type="submit" carregando={aceitar.isPending}>
            Criar conta e aceitar
          </Botao>
          <Botao variante="discreto" onClick={() => setJaTenhoConta(true)}>
            Já tenho conta em outra empresa
          </Botao>
        </form>
      )}
    </TelaPublica>
  );
}
