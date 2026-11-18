import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatarTelefone, type DadosAtualizarLoja, type DadosCriarLoja, type LojaResposta } from '@entregas/shared';
import { api } from '../api.ts';
import { useEu } from '../sessao.ts';
import { AvisoErro, Botao, Campo, Cartao, Esqueleto, Situacao, erroDoCampo } from '../componentes/ui.tsx';
import {
  EnderecoCampos,
  enderecoEmLinha,
  enderecoVazio,
  paraEnderecoForm,
  useDadosEmpresa,
  useLojas,
  type EnderecoForm,
} from '../componentes/pedido.tsx';

interface FormLojaValores {
  nome: string;
  telefone: string;
  endereco: EnderecoForm;
  transbordo: boolean;
}

/** Cadastro e edição da loja: o mesmo formulário. Sem `loja`, cria uma nova. */
function FormLoja({
  empresaId,
  loja,
  cidadePadrao,
  aoTerminar,
}: {
  empresaId: string;
  loja?: LojaResposta;
  cidadePadrao: { nome: string; uf: string };
  aoTerminar: () => void;
}) {
  const consultas = useQueryClient();
  const [form, setForm] = useState<FormLojaValores>(() =>
    loja
      ? {
          nome: loja.nome,
          telefone: loja.telefone ? formatarTelefone(loja.telefone) : '',
          endereco: paraEnderecoForm(loja.endereco),
          transbordo: loja.transbordo,
        }
      : {
          nome: '',
          telefone: '',
          endereco: enderecoVazio(cidadePadrao.nome, cidadePadrao.uf),
          transbordo: true,
        },
  );

  const salvar = useMutation({
    mutationFn: () => {
      if (loja) {
        const corpo: DadosAtualizarLoja = {
          nome: form.nome,
          telefone: form.telefone || null,
          endereco: form.endereco,
          transbordo: form.transbordo,
        };
        return api<LojaResposta>(`/empresas/${empresaId}/lojas/${loja.id}`, { metodo: 'PATCH', corpo });
      }
      const corpo: DadosCriarLoja = {
        nome: form.nome,
        telefone: form.telefone || undefined,
        endereco: form.endereco,
        transbordo: form.transbordo,
      };
      return api<LojaResposta>(`/empresas/${empresaId}/lojas`, { metodo: 'POST', corpo });
    },
    onSuccess: () => {
      consultas.invalidateQueries({ queryKey: ['lojas', empresaId] });
      aoTerminar();
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    salvar.mutate();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          rotulo="Nome da loja"
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          erro={erroDoCampo(salvar.error, 'nome')}
          required
        />
        <Campo
          rotulo="Telefone (opcional)"
          type="tel"
          value={form.telefone}
          onChange={(e) => setForm({ ...form, telefone: e.target.value })}
          erro={erroDoCampo(salvar.error, 'telefone')}
        />
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Endereço de coleta</legend>
        <EnderecoCampos
          valor={form.endereco}
          aoMudar={(endereco) => setForm({ ...form, endereco })}
          erro={salvar.error}
          prefixo="endereco"
          tipo="coleta"
        />
      </fieldset>
      <label className="flex max-w-xl items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 accent-mercosul"
          checked={form.transbordo}
          onChange={(e) => setForm({ ...form, transbordo: e.target.checked })}
        />
        <span className="flex flex-col gap-1">
          <span className="font-medium">Com os fixos ocupados ou fora do turno, oferecer aos motoboys livres</span>
          <span className="text-sm text-concreto">
            Desmarcado, os pedidos desta loja esperam um motoboy fixo dela ficar disponível. Loja sem fixos sempre usa
            os livres.
          </span>
        </span>
      </label>
      <AvisoErro erro={salvar.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" carregando={salvar.isPending}>
          {loja ? 'Salvar loja' : 'Cadastrar loja'}
        </Botao>
        <Botao variante="secundario" onClick={aoTerminar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

function CartaoLoja({
  loja,
  empresaId,
  souAdmin,
  cidadePadrao,
}: {
  loja: LojaResposta;
  empresaId: string;
  souAdmin: boolean;
  cidadePadrao: { nome: string; uf: string };
}) {
  const consultas = useQueryClient();
  const [editando, setEditando] = useState(false);
  const alternar = useMutation({
    mutationFn: () =>
      api<LojaResposta>(`/empresas/${empresaId}/lojas/${loja.id}`, {
        metodo: 'PATCH',
        corpo: { ativa: !loja.ativa } satisfies DadosAtualizarLoja,
      }),
    onSuccess: () => consultas.invalidateQueries({ queryKey: ['lojas', empresaId] }),
  });

  if (editando) {
    return (
      <Cartao className="p-5">
        <h3 className="mb-4 text-xl">Editar {loja.nome}</h3>
        <FormLoja empresaId={empresaId} loja={loja} cidadePadrao={cidadePadrao} aoTerminar={() => setEditando(false)} />
      </Cartao>
    );
  }

  return (
    <Cartao className={`flex flex-col gap-3 p-5 ${loja.ativa ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xl">{loja.nome}</h3>
        <Situacao ativo={loja.ativa} rotulo={loja.ativa ? 'Ativa' : 'Inativa'} />
      </div>
      <p className="text-sm">
        {enderecoEmLinha(loja.endereco)}
        {loja.telefone && <span className="text-concreto"> · {formatarTelefone(loja.telefone)}</span>}
      </p>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-concreto">Motoboys fixos</dt>
        <dd>
          {loja.fixos.length > 0 ? (
            loja.fixos.map((f) => f.nome).join(', ')
          ) : (
            <>
              Nenhum: os pedidos vão para os livres.{' '}
              <Link to={`/e/${empresaId}/equipe`} className="text-mercosul underline">
                Marcar na Equipe
              </Link>
            </>
          )}
        </dd>
        <dt className="text-concreto">Fixos ocupados</dt>
        <dd>{loja.transbordo ? 'Oferece aos livres' : 'Espera um fixo ficar disponível'}</dd>
      </dl>
      {souAdmin && (
        <div className="flex flex-wrap gap-3">
          <Botao variante="secundario" onClick={() => setEditando(true)}>
            Editar
          </Botao>
          <Botao
            variante={loja.ativa ? 'perigo' : 'secundario'}
            carregando={alternar.isPending}
            onClick={() => alternar.mutate()}
          >
            {loja.ativa ? 'Desativar' : 'Reativar'}
          </Botao>
        </div>
      )}
      <AvisoErro erro={alternar.error} />
    </Cartao>
  );
}

export function Lojas() {
  const { empresaId = '' } = useParams();
  const { data: eu } = useEu();
  const vinculo = eu?.vinculos.find((v) => v.empresa.id === empresaId);
  const empresa = useDadosEmpresa(empresaId);
  const lojas = useLojas(empresaId);
  const [cadastrando, setCadastrando] = useState(false);

  if (!vinculo) return null;
  const souAdmin = vinculo.papel === 'admin';
  const cidadePadrao = empresa.data
    ? { nome: empresa.data.cidade.nome, uf: empresa.data.cidade.uf }
    : { nome: '', uf: '' };
  const ativas = lojas.data?.filter((l) => l.ativa).length ?? 0;

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl">Lojas</h1>
          <p className="max-w-2xl text-concreto">
            Lojas que a empresa atende. O pedido de uma loja coleta no endereço dela e vai primeiro para os motoboys
            fixos da loja.
            {lojas.data && ` ${ativas} ${ativas === 1 ? 'loja ativa' : 'lojas ativas'}.`}
          </p>
        </div>
        {souAdmin && !cadastrando && <Botao onClick={() => setCadastrando(true)}>Cadastrar loja</Botao>}
      </header>

      {cadastrando && (
        <Cartao className="p-5">
          <h2 className="mb-4 text-2xl">Nova loja</h2>
          <FormLoja empresaId={empresaId} cidadePadrao={cidadePadrao} aoTerminar={() => setCadastrando(false)} />
        </Cartao>
      )}

      <AvisoErro erro={lojas.error} />
      {lojas.isLoading && <Esqueleto />}
      {lojas.data?.length === 0 && !cadastrando && (
        <p className="text-concreto">
          Nenhuma loja cadastrada.{' '}
          {souAdmin
            ? 'Cadastre a primeira para lançar pedidos com coleta pronta.'
            : 'Peça ao administrador para cadastrar.'}
        </p>
      )}
      <div className="flex flex-col gap-4">
        {lojas.data?.map((l) => (
          <CartaoLoja key={l.id} loja={l} empresaId={empresaId} souAdmin={souAdmin} cidadePadrao={cidadePadrao} />
        ))}
      </div>
    </div>
  );
}
