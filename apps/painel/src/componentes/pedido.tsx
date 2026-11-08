import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ROTULOS_STATUS,
  type DadosEmpresaResposta,
  type EnderecoResposta,
  type MotoboyResumo,
  type PedidoResumo,
  type StatusPedido,
} from '@entregas/shared';
import { api } from '../api.ts';
import { Campo, erroDoCampo } from './ui.tsx';

// Cores por situação: âmbar pede ação da central, azul está andando, vermelho deu problema.
const COR_STATUS: Record<StatusPedido, string> = {
  pendente: 'bg-sinal/20 text-asfalto ring-sinal',
  atribuido: 'bg-mercosul/10 text-mercosul ring-mercosul/40',
  aceito: 'bg-mercosul/10 text-mercosul ring-mercosul/40',
  coletando: 'bg-mercosul/10 text-mercosul ring-mercosul/40',
  em_rota: 'bg-mercosul text-white ring-mercosul',
  entregue: 'bg-ok/10 text-ok ring-ok/40',
  falhou: 'bg-aluguel/10 text-aluguel ring-aluguel/50',
  em_devolucao: 'bg-aluguel/10 text-aluguel ring-aluguel/50',
  devolvido: 'bg-linha/60 text-concreto ring-linha',
  cancelado: 'bg-linha/60 text-concreto ring-linha',
};

export function SeloStatus({ status }: { status: StatusPedido }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-sm font-medium ring-1 ${COR_STATUS[status]}`}>
      {ROTULOS_STATUS[status]}
    </span>
  );
}

export function enderecoEmLinha(e: Pick<EnderecoResposta, 'logradouro' | 'numero' | 'bairro'> & { complemento?: string }) {
  return `${e.logradouro}, ${e.numero}${e.complemento ? ` (${e.complemento})` : ''}, ${e.bairro}`;
}

export function horaCurta(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function haQuanto(iso: string) {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `há ${horas} h${minutos % 60 ? ` ${minutos % 60} min` : ''}`;
}

/**
 * Fila de pedidos. O tempo real (tempo-real.ts) avisa na hora quando algo muda;
 * a consulta periódica é só uma rede de segurança para conexões instáveis.
 */
export function usePedidos(empresaId: string, situacao: 'ativos' | 'concluidos') {
  return useQuery({
    queryKey: ['pedidos', empresaId, situacao],
    queryFn: () => api<PedidoResumo[]>(`/empresas/${empresaId}/pedidos?situacao=${situacao}`),
    refetchInterval: 60_000,
  });
}

export function useMotoboys(empresaId: string) {
  return useQuery({
    queryKey: ['motoboys', empresaId],
    queryFn: () => api<MotoboyResumo[]>(`/empresas/${empresaId}/motoboys`),
    staleTime: 15_000,
  });
}

export function useDadosEmpresa(empresaId: string) {
  return useQuery({
    queryKey: ['empresa', empresaId],
    queryFn: () => api<DadosEmpresaResposta>(`/empresas/${empresaId}`),
  });
}

/** A API já ordena quem está em turno primeiro. */
export function rotuloMotoboy(m: MotoboyResumo) {
  if (!m.emTurno) return `${m.nome} (fora do turno)`;
  if (m.pedidosAtivos === 0) return `${m.nome} (em turno, livre)`;
  return `${m.nome} (em turno, ${m.pedidosAtivos} em andamento)`;
}

/** Endereço como o formulário guarda: tudo texto, inclusive vazio. */
export interface EnderecoForm {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  referencia: string;
}

export function enderecoVazio(cidade = '', uf = ''): EnderecoForm {
  return { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade, uf, referencia: '' };
}

export function paraEnderecoForm(e: EnderecoResposta): EnderecoForm {
  return { ...enderecoVazio(), ...e, cep: e.cep ?? '', complemento: e.complemento ?? '', referencia: e.referencia ?? '' };
}

/**
 * Campos de endereço com preenchimento pelo CEP (ViaCEP, consultado pelo navegador).
 * `prefixo` é o caminho do campo na API, para mostrar o erro no lugar certo.
 */
export function EnderecoCampos({
  valor,
  aoMudar,
  erro,
  prefixo,
}: {
  valor: EnderecoForm;
  aoMudar: (v: EnderecoForm) => void;
  erro: unknown;
  prefixo: string;
}) {
  const [cepAviso, setCepAviso] = useState<string | undefined>();
  const mudar = (campo: keyof EnderecoForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    aoMudar({ ...valor, [campo]: e.target.value });
  const erroDe = (campo: keyof EnderecoForm) => erroDoCampo(erro, `${prefixo}.${campo}`);

  async function buscarCep() {
    const cep = valor.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepAviso('Buscando CEP…');
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dados = (await r.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (dados.erro) {
        setCepAviso('CEP não encontrado. Preencha o endereço abaixo.');
        return;
      }
      aoMudar({
        ...valor,
        logradouro: dados.logradouro || valor.logradouro,
        bairro: dados.bairro || valor.bairro,
        cidade: dados.localidade || valor.cidade,
        uf: dados.uf || valor.uf,
      });
      setCepAviso(undefined);
    } catch {
      setCepAviso('Não deu para consultar o CEP agora. Preencha o endereço abaixo.');
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <div className="sm:col-span-2">
        <Campo
          rotulo="CEP (opcional)"
          inputMode="numeric"
          autoComplete="postal-code"
          value={valor.cep}
          onChange={mudar('cep')}
          onBlur={buscarCep}
          dica={cepAviso}
          erro={erroDe('cep')}
        />
      </div>
      <div className="sm:col-span-4">
        <Campo rotulo="Rua" value={valor.logradouro} onChange={mudar('logradouro')} erro={erroDe('logradouro')} required />
      </div>
      <div className="sm:col-span-2">
        <Campo rotulo="Número" value={valor.numero} onChange={mudar('numero')} erro={erroDe('numero')} required />
      </div>
      <div className="sm:col-span-4">
        <Campo rotulo="Complemento (opcional)" value={valor.complemento} onChange={mudar('complemento')} erro={erroDe('complemento')} />
      </div>
      <div className="sm:col-span-3">
        <Campo rotulo="Bairro" value={valor.bairro} onChange={mudar('bairro')} erro={erroDe('bairro')} required />
      </div>
      <div className="sm:col-span-2">
        <Campo rotulo="Cidade" value={valor.cidade} onChange={mudar('cidade')} erro={erroDe('cidade')} required />
      </div>
      <div className="sm:col-span-1">
        <Campo rotulo="UF" maxLength={2} value={valor.uf} onChange={mudar('uf')} erro={erroDe('uf')} required />
      </div>
      <div className="sm:col-span-6">
        <Campo
          rotulo="Ponto de referência (opcional)"
          value={valor.referencia}
          onChange={mudar('referencia')}
          erro={erroDe('referencia')}
        />
      </div>
    </div>
  );
}
