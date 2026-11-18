import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROTULOS,
  TIPOS_EMPRESA,
  formatarCnpj,
  type CidadeResposta,
  type ConviteCriadoResposta,
  type CriarEmpresaResposta,
  type DadosCriarEmpresa,
  type DemonstracaoResposta,
  type EmpresaResposta,
  type MotoboyTesteResposta,
  type PedidoDetalhe,
  type TipoEmpresa,
} from '@entregas/shared';
import { api, novaChave } from '../api.ts';
import { lembrarEmpresa } from '../sessao.ts';
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

/**
 * Empresa de demonstração: dados fictícios em produção, para testar e apresentar sem tocar
 * na operação de ninguém. Todo super admin é administrador dela.
 */
function Demonstracao({ empresa }: { empresa: EmpresaResposta | undefined }) {
  const cliente = useQueryClient();
  const [convite, setConvite] = useState<ConviteCriadoResposta | null>(null);
  const [conta, setConta] = useState<MotoboyTesteResposta | null>(null);
  const [ultimo, setUltimo] = useState<PedidoDetalhe | null>(null);

  const preparar = useMutation({
    mutationFn: () => api<DemonstracaoResposta>('/admin/demonstracao', { metodo: 'POST' }),
    onSuccess: (r) => {
      setConvite(r.conviteMotoboy);
      lembrarEmpresa(r.empresa.id);
      cliente.invalidateQueries({ queryKey: ['empresas'] });
      cliente.invalidateQueries({ queryKey: ['eu'] });
    },
  });
  const motoboy = useMutation({
    mutationFn: () => api<MotoboyTesteResposta>('/admin/demonstracao/motoboy-teste', { metodo: 'POST' }),
    onSuccess: setConta,
  });
  const entrega = useMutation({
    mutationFn: () => api<PedidoDetalhe>('/admin/demonstracao/pedidos', { metodo: 'POST', chave: novaChave() }),
    onSuccess: setUltimo,
  });

  return (
    <section className="flex flex-col gap-4 border-l-4 border-sinal bg-superficie p-5" aria-labelledby="demo-titulo">
      <div className="flex flex-col gap-1">
        <h2 id="demo-titulo" className="font-cond text-2xl font-semibold">
          Empresa de demonstração
        </h2>
        <p className="text-[15px] text-concreto">
          Para testar e apresentar em produção sem misturar com a operação de ninguém: duas lojas fictícias em Cascavel,
          despacho automático ligado, e todo super admin entra como administrador. Os motoboys são celulares de verdade,
          com o app.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Botao carregando={preparar.isPending} onClick={() => preparar.mutate()}>
          {empresa ? 'Atualizar acesso e gerar convite' : 'Preparar demonstração'}
        </Botao>
        {empresa && (
          <>
            <Botao variante="secundario" carregando={motoboy.isPending} onClick={() => motoboy.mutate()}>
              Meu motoboy de teste
            </Botao>
            <Botao variante="secundario" carregando={entrega.isPending} onClick={() => entrega.mutate()}>
              Gerar entrega de teste
            </Botao>
            <Link
              to={`/e/${empresa.id}/pedidos`}
              onClick={() => lembrarEmpresa(empresa.id)}
              className="inline-flex min-h-10 items-center px-2 text-[15px] text-mercosul underline"
            >
              Abrir a demonstração
            </Link>
          </>
        )}
      </div>
      <AvisoErro erro={preparar.error ?? motoboy.error ?? entrega.error} />
      {conta && (
        <div className="flex flex-col gap-1 rounded-md border border-linha bg-papel p-4 text-[15px]" aria-live="polite">
          <p>
            Entre no app do motoboy com <strong>{conta.login}</strong> e a senha{' '}
            <strong className="font-mono tracking-wide">{conta.senha}</strong>.
          </p>
          <p className="text-sm text-concreto">
            A senha só aparece agora; pedir de novo troca por outra. É uma conta separada da sua porque cada pessoa tem
            um papel só por empresa, e você já é administrador da demonstração. Abra o turno no app para receber as
            entregas de teste.
          </p>
        </div>
      )}
      {ultimo && empresa && (
        <p className="text-[15px]" aria-live="polite">
          Entrega de teste{' '}
          <Link to={`/e/${empresa.id}/pedidos/${ultimo.id}`} className="font-semibold text-mercosul underline">
            nº {ultimo.numero}
          </Link>{' '}
          criada{ultimo.loja ? ` na ${ultimo.loja.nome}` : ''}. Código de entrega:{' '}
          <strong>{ultimo.codigoEntrega}</strong>. O sistema oferece ao motoboy em turno mais perto da coleta.
        </p>
      )}
      {convite && <LinkConvite convite={convite} nomeEmpresa="Demonstração" aoFechar={() => setConvite(null)} />}
    </section>
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
        <span className="block text-sm text-concreto">
          {empresa.demonstracao ? 'Demonstração (dados fictícios)' : ROTULOS.tipoEmpresa[empresa.tipo]}
        </span>
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

      {empresas.data && <Demonstracao empresa={empresas.data.find((e) => e.demonstracao)} />}

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
