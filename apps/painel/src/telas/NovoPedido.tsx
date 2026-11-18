import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FORMAS_PAGAMENTO,
  ROTULOS_PAGAMENTO,
  lerReais,
  normalizarTelefone,
  sugerirMotoboys,
  type ClienteResposta,
  type DadosCriarPedido,
  type FormaPagamento,
  type PedidoDetalhe,
} from '@entregas/shared';
import { api, ErroDaApi, novaChave } from '../api.ts';
import { silenciarAviso, useAoVivo } from '../tempo-real.ts';
import { AreaTexto, AvisoErro, Botao, Campo, Selecao, erroDoCampo } from '../componentes/ui.tsx';
import {
  EnderecoCampos,
  enderecoEmLinha,
  enderecoVazio,
  paraEnderecoForm,
  rotuloMotoboy,
  useDadosEmpresa,
  useLojas,
  useMotoboys,
  type EnderecoForm,
} from '../componentes/pedido.tsx';

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-linha pt-5">
      <legend className="float-left mb-1 w-full font-cond text-2xl font-semibold">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function NovoPedido() {
  const { empresaId = '' } = useParams();
  const navegar = useNavigate();
  const consultas = useQueryClient();
  const empresa = useDadosEmpresa(empresaId);
  const motoboys = useMotoboys(empresaId);
  const lojas = useLojas(empresaId);
  const lojasAtivas = useMemo(() => lojas.data?.filter((l) => l.ativa) ?? [], [lojas.data]);
  const [lojaId, setLojaId] = useState('');
  const loja = lojasAtivas.find((l) => l.id === lojaId);
  const aoVivo = useAoVivo(empresaId);
  // Uma chave por pedido digitado: clicar duas vezes ou repetir depois de uma queda de
  // internet não cria o mesmo pedido de novo.
  const chave = useRef(novaChave());

  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [entrega, setEntrega] = useState<EnderecoForm>(enderecoVazio());
  const [clienteAviso, setClienteAviso] = useState<string>();

  const [coletaPropria, setColetaPropria] = useState(false);
  const [coletaNome, setColetaNome] = useState('');
  const [coletaTelefone, setColetaTelefone] = useState('');
  const [coleta, setColeta] = useState<EnderecoForm>(enderecoVazio());

  const [forma, setForma] = useState<FormaPagamento>('dinheiro');
  const [valor, setValor] = useState('');
  const [troco, setTroco] = useState('');
  const [taxa, setTaxa] = useState('');
  const [motoboy, setMotoboy] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [erroLocal, setErroLocal] = useState<ErroDaApi | null>(null);

  const dados = empresa.data;
  const enderecoEmpresa = dados?.endereco;
  // Empresa de motofrete coleta no cliente contratante; loja coleta no próprio endereço.
  // Com uma loja atendida escolhida, a coleta é sempre no endereço dela.
  const coletaNoProprioEndereco = !loja && dados?.tipo === 'loja' && Boolean(enderecoEmpresa) && !coletaPropria;
  const automatico = dados?.modoDespacho === 'automatico';

  useEffect(() => {
    if (!dados) return;
    const padrao = enderecoVazio(dados.cidade.nome, dados.cidade.uf);
    setEntrega((atual) => (atual.cidade ? atual : padrao));
    setColeta((atual) => (atual.cidade ? atual : padrao));
  }, [dados]);

  async function buscarCliente() {
    const tel = normalizarTelefone(telefone);
    if (!tel) return;
    try {
      const cliente = await api<ClienteResposta>(`/empresas/${empresaId}/clientes/telefone/${encodeURIComponent(tel)}`);
      setNome(cliente.nome);
      if (cliente.endereco) setEntrega(paraEnderecoForm(cliente.endereco));
      setClienteAviso(`Cliente já atendido: preenchemos o último endereço de ${cliente.nome.split(' ')[0]}.`);
    } catch {
      setClienteAviso(undefined);
    }
  }

  const criar = useMutation({
    mutationFn: (corpo: DadosCriarPedido) => {
      silenciarAviso('novo');
      return api<PedidoDetalhe>(`/empresas/${empresaId}/pedidos`, { metodo: 'POST', corpo, chave: chave.current });
    },
    onSuccess: (pedido) => {
      chave.current = novaChave();
      consultas.invalidateQueries({ queryKey: ['pedidos', empresaId] });
      consultas.invalidateQueries({ queryKey: ['motoboys', empresaId] });
      navegar(`/e/${empresaId}/pedidos/${pedido.id}`);
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    const centavos = {
      valor: forma === 'pago' ? 0 : lerReais(valor),
      troco: troco ? lerReais(troco) : undefined,
      taxa: lerReais(taxa),
    };
    const invalidos = Object.entries({
      valorACobrarCentavos: centavos.valor,
      trocoParaCentavos: centavos.troco,
      taxaEntregaCentavos: centavos.taxa,
    })
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    if (invalidos.length > 0) {
      setErroLocal(
        new ErroDaApi(
          422,
          'validacao',
          'Confira os valores em reais.',
          Object.fromEntries(invalidos.map((k) => [k, ['Valor inválido. Use o formato 12,50.']])),
        ),
      );
      return;
    }
    setErroLocal(null);
    criar.mutate({
      lojaId: loja?.id,
      coleta: loja
        ? { nome: loja.nome, telefone: loja.telefone ?? undefined, endereco: loja.endereco }
        : coletaNoProprioEndereco
          ? { nome: dados!.nomeFantasia, telefone: dados!.telefone ?? undefined, endereco: enderecoEmpresa! }
          : { nome: coletaNome, telefone: coletaTelefone || undefined, endereco: coleta },
      entrega: { nome, telefone, endereco: entrega },
      formaPagamento: forma,
      valorACobrarCentavos: centavos.valor!,
      trocoParaCentavos: forma === 'dinheiro' ? (centavos.troco ?? undefined) : undefined,
      taxaEntregaCentavos: centavos.taxa ?? 0,
      observacoes,
      motoboyVinculoId: motoboy || undefined,
    });
  }

  const erro = erroLocal ?? criar.error;

  // Quem está mais perto do ponto de coleta e com menos entregas na mão. Com loja: os fixos dela
  // primeiro; sem fixo em turno (e com transbordo), os livres. Sem loja: os livres.
  const pontoColeta =
    (loja ? loja.endereco.localizacao : coletaNoProprioEndereco ? enderecoEmpresa?.localizacao : coleta.localizacao) ??
    null;
  const sugestao = useMemo(() => {
    if (!motoboys.data) return undefined;
    const livres = motoboys.data.filter((m) => m.lojaId === null);
    let candidatos = livres;
    if (loja) {
      const fixos = motoboys.data.filter((m) => m.lojaId === loja.id);
      candidatos = fixos.some((m) => m.emTurno) || (fixos.length > 0 && !loja.transbordo) ? fixos : livres;
    }
    return sugerirMotoboys(pontoColeta, candidatos, aoVivo.motoboys)[0];
  }, [motoboys.data, aoVivo.motoboys, pontoColeta, loja]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link to={`/e/${empresaId}/pedidos`} className="text-sm text-mercosul underline">
          Voltar para os pedidos
        </Link>
        <h1 className="text-4xl">Novo pedido</h1>
      </header>

      <form onSubmit={enviar} className="flex flex-col gap-8" noValidate>
        <Secao titulo="Para quem">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Celular do cliente"
              type="tel"
              placeholder="(45) 99999-0000"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              onBlur={buscarCliente}
              dica={clienteAviso ?? 'Se o cliente já pediu antes, o endereço vem preenchido.'}
              erro={erroDoCampo(erro, 'entrega.telefone')}
              required
            />
            <Campo
              rotulo="Nome do cliente"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              erro={erroDoCampo(erro, 'entrega.nome')}
              required
            />
          </div>
          <EnderecoCampos valor={entrega} aoMudar={setEntrega} erro={erro} prefixo="entrega.endereco" tipo="entrega" />
        </Secao>

        <Secao titulo="Coleta">
          {lojasAtivas.length > 0 && (
            <div className="max-w-md">
              <Selecao
                rotulo="Loja"
                value={lojaId}
                onChange={(e) => setLojaId(e.target.value)}
                erro={erroDoCampo(erro, 'lojaId')}
              >
                <option value="">Sem loja (coleta avulsa)</option>
                {lojasAtivas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Selecao>
            </div>
          )}
          {loja ? (
            <p>
              Na {loja.nome}: {enderecoEmLinha(loja.endereco)}.
              {loja.fixos.length > 0 && (
                <span className="text-concreto">
                  {' '}
                  {loja.fixos.length === 1 ? 'Motoboy fixo' : 'Motoboys fixos'}:{' '}
                  {loja.fixos.map((f) => f.nome).join(', ')}.
                </span>
              )}
            </p>
          ) : coletaNoProprioEndereco ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p>
                Na {dados!.nomeFantasia}: {enderecoEmLinha(enderecoEmpresa!)}.
              </p>
              <Botao variante="discreto" onClick={() => setColetaPropria(true)}>
                Coletar em outro endereço
              </Botao>
            </div>
          ) : (
            <>
              {dados?.tipo === 'loja' && !enderecoEmpresa && (
                <p className="text-sm text-concreto">
                  Dica: cadastre o endereço da loja em{' '}
                  <Link to={`/e/${empresaId}/empresa`} className="text-mercosul underline">
                    Dados da empresa
                  </Link>{' '}
                  para não digitar a coleta toda vez.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  rotulo="Nome de quem entrega o pacote (opcional)"
                  value={coletaNome}
                  onChange={(e) => setColetaNome(e.target.value)}
                />
                <Campo
                  rotulo="Telefone na coleta (opcional)"
                  type="tel"
                  value={coletaTelefone}
                  onChange={(e) => setColetaTelefone(e.target.value)}
                  erro={erroDoCampo(erro, 'coleta.telefone')}
                />
              </div>
              <EnderecoCampos valor={coleta} aoMudar={setColeta} erro={erro} prefixo="coleta.endereco" tipo="coleta" />
            </>
          )}
        </Secao>

        <Secao titulo="Pagamento">
          <div className="flex flex-wrap gap-x-6 gap-y-2" role="radiogroup" aria-label="Forma de pagamento">
            {FORMAS_PAGAMENTO.map((f) => (
              <label key={f} className="flex items-center gap-2">
                <input type="radio" name="forma" value={f} checked={forma === f} onChange={() => setForma(f)} />
                {ROTULOS_PAGAMENTO[f]}
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {forma !== 'pago' && (
              <Campo
                rotulo="Valor a cobrar (R$)"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                erro={erroDoCampo(erro, 'valorACobrarCentavos')}
                required
              />
            )}
            {forma === 'dinheiro' && (
              <Campo
                rotulo="Troco para (opcional)"
                inputMode="decimal"
                placeholder="Ex.: 100,00"
                value={troco}
                onChange={(e) => setTroco(e.target.value)}
                erro={erroDoCampo(erro, 'trocoParaCentavos')}
              />
            )}
            <Campo
              rotulo="Taxa de entrega (R$)"
              inputMode="decimal"
              placeholder="0,00"
              value={taxa}
              onChange={(e) => setTaxa(e.target.value)}
              erro={erroDoCampo(erro, 'taxaEntregaCentavos')}
            />
          </div>
        </Secao>

        <Secao titulo="Despacho">
          <Selecao
            rotulo="Motoboy (opcional)"
            value={motoboy}
            onChange={(e) => setMotoboy(e.target.value)}
            erro={erroDoCampo(erro, 'motoboyVinculoId')}
          >
            <option value="">
              {automatico ? 'Deixar o sistema oferecer automaticamente' : 'Deixar aguardando motoboy'}
            </option>
            {motoboys.data?.map((m) => (
              <option key={m.vinculoId} value={m.vinculoId}>
                {rotuloMotoboy(m)}
              </option>
            ))}
          </Selecao>
          {automatico && !motoboy && (
            <p className="-mt-2 rounded border-l-4 border-mercosul bg-superficie px-3 py-2 text-sm">
              Despacho automático ligado: sem motoboy escolhido, o sistema oferece o pedido ao melhor disponível
              {loja && loja.fixos.length > 0 ? ' (primeiro os fixos da loja)' : ''} e passa ao próximo se ele recusar ou
              não responder em {dados!.ofertaSegundos} s.
            </p>
          )}
          {sugestao && sugestao.vinculoId !== motoboy && (
            <p className="-mt-2 flex flex-wrap items-center gap-x-2 text-sm text-concreto">
              Sugestão: {sugestao.nome}
              {sugestao.minutosAteColeta !== null && `, a ${sugestao.minutosAteColeta} min da coleta`}
              {sugestao.pedidosAtivos === 0 ? ', livre.' : `, com ${sugestao.pedidosAtivos} em andamento.`}
              <Botao variante="discreto" onClick={() => setMotoboy(sugestao.vinculoId)}>
                Usar sugestão
              </Botao>
            </p>
          )}
          <AreaTexto
            rotulo="Observações para o motoboy (opcional)"
            placeholder="Ex.: interfone quebrado, ligar ao chegar."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            erro={erroDoCampo(erro, 'observacoes')}
          />
        </Secao>

        <AvisoErro erro={erro} />
        <Botao type="submit" carregando={criar.isPending} className="self-start">
          {criar.isPending ? 'Criando…' : 'Criar pedido'}
        </Botao>
      </form>
    </div>
  );
}
