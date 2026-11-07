import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EuResposta } from '@entregas/shared';
import { api, ErroDaApi } from './api.ts';

export function useEu() {
  return useQuery({
    queryKey: ['eu'],
    queryFn: async () => {
      try {
        return await api<EuResposta>('/auth/eu');
      } catch (erro) {
        if (erro instanceof ErroDaApi && erro.status === 401) return null;
        throw erro;
      }
    },
    staleTime: 60_000,
  });
}

export function useSair() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/sair', { metodo: 'POST' }),
    onSettled: () => {
      cliente.clear();
      window.location.assign('/entrar');
    },
  });
}

const CHAVE_ULTIMA_EMPRESA = 'entregas:ultima-empresa';

export function lembrarEmpresa(id: string) {
  try {
    localStorage.setItem(CHAVE_ULTIMA_EMPRESA, id);
  } catch {
    // modo privado: só não lembra
  }
}

export function ultimaEmpresa(): string | null {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_EMPRESA);
  } catch {
    return null;
  }
}
