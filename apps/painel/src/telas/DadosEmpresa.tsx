import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PRAZOS_ACEITE_MIN,
  ROTULOS,
  formatarCnpj,
  formatarTelefone,
  type DadosEmpresaResposta,
  type RegrasEntrega,
} from '@entregas/shared';
import { api } from '../api.ts';
import { AvisoErro, Botao, Campo, Selecao, erroDoCampo } from '../componentes/ui.tsx';
import { EnderecoCampos, enderecoVazio, paraEnderecoForm, useDadosEmpresa, type EnderecoForm } from '../componentes/pedido.tsx';

export function DadosEmpresa() {
  const { empresaId = '' } = useParams();
  const consultas = useQueryClient();
  const empresa = useDadosEmpresa(empresaId);
  const [form, setForm] = useState({ nomeFantasia: '', telefone: '', email: '' });
  const [endereco, setEndereco] = useState<EnderecoForm>(enderecoVazio());
  const [regras, setRegras] = useState<RegrasEntrega>({ fotoEntregaObrigatoria: false, prazoAceiteMin: null });

  useEffect(() => {
    const e = empresa.data;
    if (!e) return;
    setForm({
      nomeFantasia: e.nomeFantasia,
      telefone: e.telefone ? formatarTelefone(e.telefone) : '',
      email: e.email ?? '',
    });
    setEndereco(e.endereco ? paraEnderecoForm(e.endereco) : enderecoVazio(e.cidade.nome, e.cidade.uf));
    setRegras({ fotoEntregaObrigatoria: e.fotoEntregaObrigatoria, prazoAceiteMin: e.prazoAceiteMin });
  }, [empresa.data]);

  const salvar = useMutation({
    mutationFn: () =>
      api<DadosEmpresaResposta>(`/empresas/${empresaId}`, {
        metodo: 'PATCH',
        corpo: {
          nomeFantasia: form.nomeFantasia,
          telefone: form.telefone || null,
          email: form.email || null,
          endereco,
          ...regras,
        },
      }),
    onSuccess: (dados) => {
      consultas.setQueryData(['empresa', empresaId], dados);
      consultas.invalidateQueries({ queryKey: ['eu'] });
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    salvar.mutate();
  }

  if (!empresa.data) return <AvisoErro erro={empresa.error} />;
  const e = empresa.data;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl">Dados da empresa</h1>
        <p className="text-concreto">
          {ROTULOS.tipoEmpresa[e.tipo]}, {e.razaoSocial}, CNPJ {formatarCnpj(e.cnpj)}.
        </p>
      </header>
      <form onSubmit={enviar} className="flex flex-col gap-6" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            rotulo="Nome fantasia"
            value={form.nomeFantasia}
            onChange={(ev) => setForm({ ...form, nomeFantasia: ev.target.value })}
            erro={erroDoCampo(salvar.error, 'nomeFantasia')}
          />
          <Campo
            rotulo="Telefone"
            type="tel"
            value={form.telefone}
            onChange={(ev) => setForm({ ...form, telefone: ev.target.value })}
            erro={erroDoCampo(salvar.error, 'telefone')}
          />
          <Campo
            rotulo="E-mail"
            type="email"
            value={form.email}
            onChange={(ev) => setForm({ ...form, email: ev.target.value })}
            erro={erroDoCampo(salvar.error, 'email')}
          />
        </div>
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 font-cond text-2xl font-semibold">Endereço</legend>
          <p className="text-sm text-concreto">
            {e.tipo === 'loja'
              ? 'É de onde saem as entregas: vira o endereço de coleta padrão nos pedidos.'
              : 'Endereço da base da empresa.'}
          </p>
          <EnderecoCampos valor={endereco} aoMudar={setEndereco} erro={salvar.error} prefixo="endereco" />
        </fieldset>
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 font-cond text-2xl font-semibold">Regras de entrega</legend>
          <div className="max-w-md">
            <Selecao
              rotulo="Prazo para o motoboy aceitar"
              value={regras.prazoAceiteMin ?? ''}
              onChange={(ev) => setRegras({ ...regras, prazoAceiteMin: ev.target.value ? Number(ev.target.value) : null })}
              erro={erroDoCampo(salvar.error, 'prazoAceiteMin')}
            >
              <option value="">Sem prazo</option>
              {/* Mantém um valor fora da lista que tenha vindo da API. */}
              {[...new Set([...PRAZOS_ACEITE_MIN, ...(regras.prazoAceiteMin ? [regras.prazoAceiteMin] : [])])]
                .sort((a, b) => a - b)
                .map((min) => (
                  <option key={min} value={min}>
                    {min} minutos
                  </option>
                ))}
            </Selecao>
            <p className="mt-1 text-sm text-concreto">
              Se o motoboy não aceitar nem recusar nesse tempo, o pedido volta sozinho para a fila sem motoboy (conferido
              a cada minuto). Vale para os pedidos atribuídos depois de salvar.
            </p>
          </div>
          <label className="flex max-w-xl items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-mercosul"
              checked={regras.fotoEntregaObrigatoria}
              onChange={(ev) => setRegras({ ...regras, fotoEntregaObrigatoria: ev.target.checked })}
            />
            <span className="flex flex-col gap-1">
              <span className="font-medium">Exigir foto também na entrega com código</span>
              <span className="text-sm text-concreto">
                A foto já é obrigatória quando o motoboy não consegue entregar e quando entrega sem o código (por
                exemplo, deixou na portaria). Pelo painel, a central registra sem foto.
              </span>
            </span>
          </label>
        </fieldset>
        <AvisoErro erro={salvar.error} />
        <div className="flex items-center gap-4">
          <Botao type="submit" carregando={salvar.isPending}>
            Salvar dados
          </Botao>
          {salvar.isSuccess && !salvar.isPending && (
            <span role="status" className="text-ok">
              Dados salvos.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
