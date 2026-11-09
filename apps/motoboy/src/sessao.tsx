import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { EntrarResposta, EuResposta } from '@entregas/shared';
import { api, ErroDaApi } from './api.ts';
import { lerToken, salvarToken } from './armazenamento.ts';
import { pararRastreio } from './rastreio.ts';
import { ativarNotificacoes, type SituacaoNotificacao } from './notificacoes.ts';

interface Sessao {
  carregando: boolean;
  eu: EuResposta | null;
  /** null enquanto não tentou (sem login, ou abrindo). */
  notificacoes: SituacaoNotificacao | null;
  entrar: (login: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const ContextoSessao = createContext<Sessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const consultas = useQueryClient();
  const [carregando, setCarregando] = useState(true);
  const [eu, setEu] = useState<EuResposta | null>(null);
  const [notificacoes, setNotificacoes] = useState<SituacaoNotificacao | null>(null);
  const usuarioId = eu?.usuario.id;

  // Logado: este celular passa a receber aviso de pedido (o cadastro fica preso a esta sessão).
  useEffect(() => {
    if (!usuarioId) {
      setNotificacoes(null);
      return;
    }
    let ativo = true;
    ativarNotificacoes().then((situacao) => ativo && setNotificacoes(situacao));
    return () => {
      ativo = false;
    };
  }, [usuarioId]);

  async function recarregar() {
    if (!(await lerToken())) {
      setEu(null);
      return;
    }
    try {
      setEu(await api<EuResposta>('/auth/eu'));
    } catch (erro) {
      if (erro instanceof ErroDaApi && erro.status === 401) {
        await salvarToken(null);
        setEu(null);
      }
      // Sem internet: mantém o que já tinha.
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: confere a sessão salva só ao abrir o app.
  useEffect(() => {
    recarregar().finally(() => setCarregando(false));
  }, []);

  async function entrar(login: string, senha: string) {
    const r = await api<EntrarResposta>('/auth/entrar', { metodo: 'POST', corpo: { login, senha, modo: 'token' } });
    await salvarToken(r.token ?? null);
    setEu({ usuario: r.usuario, vinculos: r.vinculos });
  }

  async function sair() {
    await pararRastreio();
    await api('/auth/sair', { metodo: 'POST' }).catch(() => undefined);
    await salvarToken(null);
    consultas.clear();
    setEu(null);
  }

  return (
    <ContextoSessao.Provider value={{ carregando, eu, notificacoes, entrar, sair, recarregar }}>
      {children}
    </ContextoSessao.Provider>
  );
}

export function useSessao() {
  const sessao = useContext(ContextoSessao);
  if (!sessao) throw new Error('useSessao fora do ProvedorSessao');
  return sessao;
}

/** Empresas em que a pessoa é motoboy (o app só serve para esse papel). */
export function empresasDoMotoboy(eu: EuResposta | null) {
  return eu?.vinculos.filter((v) => v.papel === 'motoboy') ?? [];
}
