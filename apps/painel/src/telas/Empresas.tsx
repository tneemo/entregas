import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROTULOS,
  TIPOS_EMPRESA,
  formatarCnpj,
  type CidadeResposta,
  type ConviteCriadoResposta,
  type CriarEmpresaResposta,
  type DadosCriarEmpresa,
  type EmpresaResposta,
  type TipoEmpresa,
} from '@entregas/shared';
import { api } from '../api.ts';
import { LinkConvite } from '../componentes/LinkConvite.tsx';
import { AvisoErro, Botao, Campo, Selecao, Situacao, erroDoCampo } from '../componentes/ui.tsx';

const VAZIO = {
  tipo: 'loja' as TipoEmpresa,
  nomeFantasia: '',
  razaoSocial: '',
  cnpj: '',
  cidadeId: '',
  telefone: '',
  email: '',
};

function CadastrarEmpresa({ aoCadastrar }: { aoCadastrar: (r: CriarEmpresaResposta) => void }) {
  const cliente = useQueryClient();
  const [dados, setDados] = useState(VAZIO);
  const cidades = useQuery({ queryKey: ['cidades'], queryFn: () => api<CidadeResposta[]>('/admin/cidades') });

  const criar = useMutation({
    mutationFn: () => {
      const corpo: DadosCriarEmpresa = {
        ...dados,
        cidadeId: dados.cidadeId || cidades.data?.[0]?.id || '',
        telefone: dados.telefone || undefined,
        email: dados.email || undefined,
      };
      return api<CriarEmpresaResposta>('/admin/empresas', { metodo: 'POST', corpo });
    },
    onSuccess: (r) => {
      setDados(VAZIO);
      cliente.invalidateQueries({ queryKey: ['empresas'] });
      aoCadastrar(r);
    },
  });

  const mudar = (campo: keyof typeof dados) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDados({ ...dados, [campo]: e.target.value });
  const erro = (campo: string) => erroDoCampo(criar.error, campo);

  function enviar(e: FormEvent) {
    e.preventDefault();
    criar.mutate();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5 border-l-4 border-mercosul bg-superficie p-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Tipo de empresa</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {TIPOS_EMPRESA.map((t) => (
            <label key={t} className="flex items-center gap-2">
              <input type="radio" name="tipo" value={t} checked={dados.tipo === t} onChange={mudar('tipo')} />
              {ROTULOS.tipoEmpresa[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          rotulo="Nome fantasia"
          value={dados.nomeFantasia}
          onChange={mudar('nomeFantasia')}
          erro={erro('nomeFantasia')}
          required
        />
        <Campo
          rotulo="Razão social"
          value={dados.razaoSocial}
          onChange={mudar('razaoSocial')}
          erro={erro('razaoSocial')}
          required
        />
        <Campo
          rotulo="CNPJ"
          dica="Aceita o formato novo, com letras."
          value={dados.cnpj}
          onChange={mudar('cnpj')}
          erro={erro('cnpj')}
          required
        />
        <Selecao rotulo="Cidade" value={dados.cidadeId} onChange={mudar('cidadeId')} erro={erro('cidadeId')}>
          {cidades.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} – {c.uf}
            </option>
          ))}
        </Selecao>
        <Campo
          rotulo="Telefone (opcional)"
          type="tel"
          value={dados.telefone}
          onChange={mudar('telefone')}
          erro={erro('telefone')}
        />
        <Campo
          rotulo="E-mail (opcional)"
          type="email"
          value={dados.email}
          onChange={mudar('email')}
          erro={erro('email')}
        />
      </div>
      <AvisoErro erro={criar.error} />
      <Botao type="submit" carregando={criar.isPending} className="self-start">
        Cadastrar empresa
      </Botao>
    </form>
  );
}

function LinhaEmpresa({
  empresa,
  aoConvidar,
}: {
  empresa: EmpresaResposta;
  aoConvidar: (c: ConviteCriadoResposta) => void;
}) {
  const cliente = useQueryClient();
  const ativa = empresa.status === 'ativa';
  const alternar = useMutation({
    mutationFn: () =>
      api(`/admin/empresas/${empresa.id}`, { metodo: 'PATCH', corpo: { status: ativa ? 'suspensa' : 'ativa' } }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['empresas'] }),
  });
  const convidar = useMutation({
    mutationFn: () =>
      api<ConviteCriadoResposta>(`/admin/empresas/${empresa.id}/convites`, {
        metodo: 'POST',
        corpo: { papel: 'admin' },
      }),
    onSuccess: aoConvidar,
  });

  return (
    <tr className="border-t border-linha align-middle">
      <td className="py-3 pr-4">
        <span className="font-medium">{empresa.nomeFantasia}</span>
        <span className="block text-sm text-concreto">{ROTULOS.tipoEmpresa[empresa.tipo]}</span>
      </td>
      <td className="hidden py-3 pr-4 text-sm md:table-cell">{formatarCnpj(empresa.cnpj)}</td>
      <td className="py-3 pr-4 text-sm">{empresa.cidade.nome}</td>
      <td className="py-3 pr-4">
        <Situacao ativo={ativa} rotulo={ROTULOS.statusEmpresa[empresa.status]} />
      </td>
      <td className="py-3">
        <div className="flex flex-wrap justify-end gap-2">
          <Botao variante="secundario" carregando={convidar.isPending} onClick={() => convidar.mutate()}>
            Convidar admin
          </Botao>
          <Botao
            variante={ativa ? 'perigo' : 'secundario'}
            carregando={alternar.isPending}
            onClick={() => alternar.mutate()}
          >
            {ativa ? 'Suspender' : 'Reativar'}
          </Botao>
        </div>
      </td>
    </tr>
  );
}

export function Empresas() {
  const [formAberto, setFormAberto] = useState(false);
  const [convite, setConvite] = useState<{ convite: ConviteCriadoResposta; nome: string } | null>(null);
  const empresas = useQuery({ queryKey: ['empresas'], queryFn: () => api<EmpresaResposta[]>('/admin/empresas') });

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl">Empresas</h1>
          <p className="text-concreto">Lojas e empresas de motofrete que usam a plataforma.</p>
        </div>
        {!formAberto && <Botao onClick={() => setFormAberto(true)}>Cadastrar empresa</Botao>}
      </header>

      {formAberto && (
        <CadastrarEmpresa
          aoCadastrar={(r) => {
            setFormAberto(false);
            setConvite({ convite: r.conviteAdmin, nome: r.empresa.nomeFantasia });
          }}
        />
      )}
      {convite && (
        <LinkConvite convite={convite.convite} nomeEmpresa={convite.nome} aoFechar={() => setConvite(null)} />
      )}

      <AvisoErro erro={empresas.error} />
      {empresas.data?.length === 0 && !formAberto && (
        <p>Nenhuma empresa cadastrada. Cadastre a primeira e envie o convite para o administrador dela.</p>
      )}
      {!!empresas.data?.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-sm text-concreto">
              <tr>
                <th className="pb-2 pr-4 font-medium">Empresa</th>
                <th className="hidden pb-2 pr-4 font-medium md:table-cell">CNPJ</th>
                <th className="pb-2 pr-4 font-medium">Cidade</th>
                <th className="pb-2 pr-4 font-medium">Situação</th>
                <th className="pb-2">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {empresas.data.map((e) => (
                <LinhaEmpresa
                  key={e.id}
                  empresa={e}
                  aoConvidar={(c) => setConvite({ convite: c, nome: e.nomeFantasia })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
