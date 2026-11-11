import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PAPEIS,
  ROTULOS,
  TIPOS_VINCULO,
  formatarTelefone,
  podeConvidar,
  type ConviteCriadoResposta,
  type ConvitePendenteResposta,
  type DadosAtualizarMembro,
  type MembroResposta,
  type Papel,
} from '@entregas/shared';
import { api } from '../api.ts';
import { useEu } from '../sessao.ts';
import { LinkConvite } from '../componentes/LinkConvite.tsx';
import { AvisoErro, Botao, Campo, Selecao, Situacao, dataCurta } from '../componentes/ui.tsx';

function Convidar({ empresaId, nomeEmpresa, meuPapel }: { empresaId: string; nomeEmpresa: string; meuPapel: Papel }) {
  const cliente = useQueryClient();
  const permitidos = PAPEIS.filter((p) => podeConvidar(meuPapel, p));
  const [papel, setPapel] = useState<Papel>('motoboy');
  const [nome, setNome] = useState('');
  const [criado, setCriado] = useState<ConviteCriadoResposta | null>(null);

  const criar = useMutation({
    mutationFn: () =>
      api<ConviteCriadoResposta>(`/empresas/${empresaId}/convites`, {
        metodo: 'POST',
        corpo: { papel, nomeConvidado: nome || undefined },
      }),
    onSuccess: (convite) => {
      setCriado(convite);
      setNome('');
      cliente.invalidateQueries({ queryKey: ['convites', empresaId] });
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    criar.mutate();
  }

  return (
    <section aria-labelledby="titulo-convidar" className="flex flex-col gap-4">
      <h2 id="titulo-convidar" className="text-2xl">
        Convidar para a equipe
      </h2>
      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-start">
        <Selecao rotulo="Função" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
          {permitidos.map((p) => (
            <option key={p} value={p}>
              {ROTULOS.papel[p]}
            </option>
          ))}
        </Selecao>
        <Campo
          rotulo="Nome da pessoa (opcional)"
          dica="Só para você reconhecer o convite na lista."
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Botao type="submit" carregando={criar.isPending} className="sm:mt-6">
          Gerar convite
        </Botao>
      </form>
      <AvisoErro erro={criar.error} />
      {criado && <LinkConvite convite={criado} nomeEmpresa={nomeEmpresa} aoFechar={() => setCriado(null)} />}
    </section>
  );
}

function LinhaMembro({
  membro,
  empresaId,
  souAdmin,
  souEu,
}: {
  membro: MembroResposta;
  empresaId: string;
  souAdmin: boolean;
  souEu: boolean;
}) {
  const cliente = useQueryClient();
  const atualizar = useMutation({
    mutationFn: (dados: DadosAtualizarMembro) =>
      api<MembroResposta>(`/empresas/${empresaId}/membros/${membro.vinculoId}`, { metodo: 'PATCH', corpo: dados }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['membros', empresaId] }),
  });
  const editavel = souAdmin && !souEu;
  const ativo = membro.status === 'ativo';
  const contato = membro.usuario.telefone ? formatarTelefone(membro.usuario.telefone) : membro.usuario.email;

  return (
    <tr className="border-t border-linha align-middle">
      <td className="py-3 pr-4">
        <span className="font-medium">{membro.usuario.nome}</span>
        {souEu && <span className="text-concreto"> (você)</span>}
        <span className="block text-sm text-concreto xl:hidden">{contato}</span>
        {atualizar.error && <span className="block text-sm text-aluguel">{atualizar.error.message}</span>}
      </td>
      <td className="hidden py-3 pr-4 text-sm xl:table-cell">{contato}</td>
      <td className="py-3 pr-4">
        {editavel ? (
          <select
            aria-label={`Função de ${membro.usuario.nome}`}
            value={membro.papel}
            disabled={atualizar.isPending}
            onChange={(e) => atualizar.mutate({ papel: e.target.value as Papel })}
            className="min-h-9 rounded border border-linha bg-superficie px-1"
          >
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {ROTULOS.papel[p]}
              </option>
            ))}
          </select>
        ) : (
          ROTULOS.papel[membro.papel]
        )}
      </td>
      <td className="py-3 pr-4">
        {membro.papel !== 'motoboy' ? (
          <span className="text-concreto">
            <span aria-hidden="true">–</span>
            <span className="sr-only">Não se aplica</span>
          </span>
        ) : editavel ? (
          <select
            aria-label={`Vínculo de ${membro.usuario.nome}`}
            value={membro.tipoVinculo ?? ''}
            disabled={atualizar.isPending}
            onChange={(e) =>
              atualizar.mutate({ tipoVinculo: (e.target.value || null) as DadosAtualizarMembro['tipoVinculo'] })
            }
            className="min-h-9 rounded border border-linha bg-superficie px-1"
          >
            <option value="">Não informado</option>
            {TIPOS_VINCULO.map((t) => (
              <option key={t} value={t}>
                {ROTULOS.tipoVinculo[t]}
              </option>
            ))}
          </select>
        ) : membro.tipoVinculo ? (
          ROTULOS.tipoVinculo[membro.tipoVinculo]
        ) : (
          'Não informado'
        )}
      </td>
      <td className="py-3 pr-4">
        <Situacao ativo={ativo} rotulo={ROTULOS.statusVinculo[membro.status]} />
      </td>
      <td className="py-3 text-right">
        {editavel && (
          <Botao
            variante={ativo ? 'perigo' : 'secundario'}
            carregando={atualizar.isPending}
            onClick={() => atualizar.mutate({ status: ativo ? 'suspenso' : 'ativo' })}
          >
            {ativo ? 'Suspender' : 'Reativar'}
          </Botao>
        )}
      </td>
    </tr>
  );
}

function ConvitesPendentes({ empresaId, meuPapel }: { empresaId: string; meuPapel: Papel }) {
  const cliente = useQueryClient();
  const convites = useQuery({
    queryKey: ['convites', empresaId],
    queryFn: () => api<ConvitePendenteResposta[]>(`/empresas/${empresaId}/convites`),
  });
  const cancelar = useMutation({
    mutationFn: (id: string) => api(`/empresas/${empresaId}/convites/${id}`, { metodo: 'DELETE' }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['convites', empresaId] }),
  });

  if (!convites.data?.length) return null;
  return (
    <section aria-labelledby="titulo-pendentes" className="flex flex-col gap-3">
      <h2 id="titulo-pendentes" className="text-2xl">
        Convites aguardando resposta
      </h2>
      <ul className="flex flex-col">
        {convites.data.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-linha py-3">
            <span className="h-2 w-2 rounded-full bg-sinal" aria-hidden />
            <span className="font-medium">
              {c.nomeConvidado || `Convite de ${ROTULOS.papel[c.papel].toLowerCase()}`}
            </span>
            <span className="text-sm text-concreto">
              {ROTULOS.papel[c.papel]}, criado por {c.criadoPor}, vale até {dataCurta(c.expiraEm)}
            </span>
            {podeConvidar(meuPapel, c.papel) && (
              <Botao variante="discreto" className="ml-auto" onClick={() => cancelar.mutate(c.id)}>
                Cancelar convite
              </Botao>
            )}
          </li>
        ))}
      </ul>
      <AvisoErro erro={cancelar.error} />
    </section>
  );
}

export function Equipe() {
  const { empresaId = '' } = useParams();
  const { data: eu } = useEu();
  const vinculo = eu?.vinculos.find((v) => v.empresa.id === empresaId);
  const membros = useQuery({
    queryKey: ['membros', empresaId],
    queryFn: () => api<MembroResposta[]>(`/empresas/${empresaId}/membros`),
  });

  if (!eu || !vinculo) return null;
  const souAdmin = vinculo.papel === 'admin';
  const motoboys = membros.data?.filter((m) => m.papel === 'motoboy' && m.status === 'ativo').length ?? 0;

  return (
    <div className="flex max-w-5xl flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl">Equipe</h1>
        {membros.data && (
          <p className="text-concreto">
            {membros.data.length} {membros.data.length === 1 ? 'pessoa' : 'pessoas'}, {motoboys}{' '}
            {motoboys === 1 ? 'motoboy ativo' : 'motoboys ativos'}.
          </p>
        )}
      </header>

      <Convidar empresaId={empresaId} nomeEmpresa={vinculo.empresa.nomeFantasia} meuPapel={vinculo.papel} />
      <ConvitesPendentes empresaId={empresaId} meuPapel={vinculo.papel} />

      <section aria-labelledby="titulo-membros" className="flex flex-col gap-3">
        <h2 id="titulo-membros" className="text-2xl">
          Pessoas com acesso
        </h2>
        <AvisoErro erro={membros.error} />
        {membros.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-concreto">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Nome</th>
                  <th className="hidden pb-2 pr-4 font-medium xl:table-cell">Contato</th>
                  <th className="pb-2 pr-4 font-medium">Função</th>
                  <th className="pb-2 pr-4 font-medium">Vínculo</th>
                  <th className="pb-2 pr-4 font-medium">Situação</th>
                  <th className="pb-2">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {membros.data.map((m) => (
                  <LinhaMembro
                    key={m.vinculoId}
                    membro={m}
                    empresaId={empresaId}
                    souAdmin={souAdmin}
                    souEu={m.vinculoId === vinculo.vinculoId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
