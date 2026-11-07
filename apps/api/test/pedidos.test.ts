import { beforeAll, describe, expect, it } from 'vitest';
import type { PedidoDetalhe, PedidoResumo } from '@entregas/shared';
import {
  type Cliente,
  aceitarComContaNova,
  empresaComEquipe,
  endereco,
  novoCelular,
  novoPedido,
  novoSuperAdmin,
} from './ajudantes.ts';

type Equipe = Awaited<ReturnType<typeof empresaComEquipe>>;

const acao = (cliente: Cliente, empresaId: string, pedidoId: string, nome: string, corpo: object = {}) =>
  cliente.post(`/empresas/${empresaId}/pedidos/${pedidoId}/acoes/${nome}`, corpo);

const vinculoDe = (pessoa: Equipe['motoboy']) => pessoa.eu.vinculos[0].vinculoId as string;

describe('criação de pedidos', () => {
  let eq: Equipe;
  beforeAll(async () => {
    eq = await empresaComEquipe(await novoSuperAdmin());
  });

  it('numera em sequência, gera código e registra a criação', async () => {
    const central = eq.despachante.cliente;
    const p1 = await novoPedido(central, eq.empresa.id);
    const p2 = await novoPedido(central, eq.empresa.id);

    expect(p2.numero).toBe(p1.numero + 1);
    expect(p1.status).toBe('pendente');
    expect(p1.codigoEntrega).toMatch(/^\d{4}$/);
    expect(p1.eventos.map((e) => e.acao)).toEqual(['criar']);
    expect(p1.acoes).toEqual(['atribuir', 'cancelar']);
    expect(p1.entrega.endereco).toMatchObject({ logradouro: 'Av. Brasil', cep: '85810010', uf: 'PR' });
  });

  it('guarda o destinatário para o próximo pedido', async () => {
    const telefone = novoCelular();
    await novoPedido(eq.admin.cliente, eq.empresa.id, {
      entrega: { nome: 'Bruna Recorrente', telefone, endereco: endereco('Rua Recife', '45', 'Country') },
    });
    const r = await eq.admin.cliente.get(`/empresas/${eq.empresa.id}/clientes/telefone/${encodeURIComponent(telefone)}`);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ nome: 'Bruna Recorrente', endereco: { logradouro: 'Rua Recife', bairro: 'Country' } });
  });

  it('já atribui ao motoboy quando informado', async () => {
    const p = await novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculoDe(eq.motoboy) });
    expect(p.status).toBe('atribuido');
    expect(p.motoboy?.nome).toBe('Motoboy Teste');
    expect(p.eventos.map((e) => e.acao)).toEqual(['criar', 'atribuir']);
  });

  it('valida troco e valores', async () => {
    const r = await eq.admin.cliente.post(`/empresas/${eq.empresa.id}/pedidos`, {
      coleta: { endereco: endereco() },
      entrega: { nome: 'Ana', telefone: novoCelular(), endereco: endereco() },
      formaPagamento: 'dinheiro',
      valorACobrarCentavos: 5000,
      trocoParaCentavos: 2000,
    });
    expect(r.status).toBe(422);
    expect(r.corpo.erro.campos.trocoParaCentavos).toBeDefined();
  });

  it('aponta o campo exato do endereço com erro', async () => {
    const r = await eq.admin.cliente.post(`/empresas/${eq.empresa.id}/pedidos`, {
      coleta: { endereco: endereco() },
      entrega: { nome: 'Ana', telefone: novoCelular(), endereco: { ...endereco(), numero: '' } },
      formaPagamento: 'pix',
      valorACobrarCentavos: 3000,
    });
    expect(r.status).toBe(422);
    expect(r.corpo.erro.campos['entrega.endereco.numero']).toEqual(['Informe o número (ou s/n).']);
  });

  it('motoboy não cria pedido', async () => {
    const r = await eq.motoboy.cliente.post(`/empresas/${eq.empresa.id}/pedidos`, {});
    expect(r.status).toBe(403);
  });
});

describe('fluxo do motoboy', () => {
  let eq: Equipe;
  beforeAll(async () => {
    eq = await empresaComEquipe(await novoSuperAdmin());
  });

  it('vê só os pedidos dele, sem o código de entrega', async () => {
    const meu = await novoPedido(eq.admin.cliente, eq.empresa.id, { motoboyVinculoId: vinculoDe(eq.motoboy) });
    const semMotoboy = await novoPedido(eq.admin.cliente, eq.empresa.id);

    const lista = await eq.motoboy.cliente.get<PedidoResumo[]>(`/empresas/${eq.empresa.id}/pedidos`);
    expect(lista.corpo.map((p) => p.id)).toEqual([meu.id]);

    const detalhe = await eq.motoboy.cliente.get<PedidoDetalhe>(`/empresas/${eq.empresa.id}/pedidos/${meu.id}`);
    expect(detalhe.corpo).not.toHaveProperty('codigoEntrega');
    expect(JSON.stringify(detalhe.corpo)).not.toContain(`"${meu.codigoEntrega}"`);
    expect(detalhe.corpo.entrega.telefone).toBeTruthy();
    expect(detalhe.corpo.acoes).toEqual(['aceitar', 'recusar', 'iniciar_coleta']);

    expect((await eq.motoboy.cliente.get(`/empresas/${eq.empresa.id}/pedidos/${semMotoboy.id}`)).status).toBe(404);
  });

  it('aceita, coleta e entrega com o código; depois o pedido some da lista dele', async () => {
    const E = eq.empresa.id;
    const moto = eq.motoboy.cliente;
    const p = await novoPedido(eq.admin.cliente, E, { motoboyVinculoId: vinculoDe(eq.motoboy) });

    for (const passo of ['aceitar', 'iniciar_coleta', 'coletar']) {
      const r = await acao(moto, E, p.id, passo);
      expect(r.status, passo).toBe(200);
    }

    const errado = p.codigoEntrega === '0000' ? '1111' : '0000';
    const tentativa = await acao(moto, E, p.id, 'entregar', { codigo: errado });
    expect(tentativa.status).toBe(422);
    expect(tentativa.corpo.erro.mensagem).toMatch(/Restam 4/);

    const ok = await acao(moto, E, p.id, 'entregar', { codigo: p.codigoEntrega });
    expect(ok.status).toBe(200);
    expect(ok.corpo.status).toBe('entregue');
    expect(ok.corpo.concluidoEm).not.toBeNull();
    expect(ok.corpo).not.toHaveProperty('codigoEntrega');

    expect((await moto.get(`/empresas/${E}/pedidos/${p.id}`)).status).toBe(404);

    const historico = await eq.admin.cliente.get<PedidoDetalhe>(`/empresas/${E}/pedidos/${p.id}`);
    expect(historico.corpo.eventos.map((e) => [e.acao, e.papel])).toEqual([
      ['criar', 'admin'],
      ['atribuir', 'admin'],
      ['aceitar', 'motoboy'],
      ['iniciar_coleta', 'motoboy'],
      ['coletar', 'motoboy'],
      ['entregar', 'motoboy'],
    ]);

    const concluidos = await eq.admin.cliente.get<PedidoResumo[]>(`/empresas/${E}/pedidos?situacao=concluidos`);
    expect(concluidos.corpo.map((x) => x.id)).toContain(p.id);
    const ativos = await eq.admin.cliente.get<PedidoResumo[]>(`/empresas/${E}/pedidos`);
    expect(ativos.corpo.map((x) => x.id)).not.toContain(p.id);
  });

  it('bloqueia o código para o motoboy após 5 erros; a central ainda confirma', async () => {
    const E = eq.empresa.id;
    const p = await novoPedido(eq.admin.cliente, E, { motoboyVinculoId: vinculoDe(eq.motoboy) });
    await acao(eq.motoboy.cliente, E, p.id, 'iniciar_coleta');
    await acao(eq.motoboy.cliente, E, p.id, 'coletar');

    const errado = p.codigoEntrega === '9999' ? '8888' : '9999';
    for (let i = 0; i < 5; i++) await acao(eq.motoboy.cliente, E, p.id, 'entregar', { codigo: errado });

    const bloqueado = await acao(eq.motoboy.cliente, E, p.id, 'entregar', { codigo: p.codigoEntrega });
    expect(bloqueado.status).toBe(423);
    const visao = await eq.motoboy.cliente.get<PedidoDetalhe>(`/empresas/${E}/pedidos/${p.id}`);
    expect(visao.corpo.codigoBloqueado).toBe(true);
    expect(visao.corpo.acoes).not.toContain('entregar');

    const central = await acao(eq.despachante.cliente, E, p.id, 'entregar', { codigo: p.codigoEntrega });
    expect(central.corpo.status).toBe('entregue');
  });

  it('recusar devolve o pedido para a fila sem motoboy', async () => {
    const E = eq.empresa.id;
    const p = await novoPedido(eq.admin.cliente, E, { motoboyVinculoId: vinculoDe(eq.motoboy) });
    const r = await acao(eq.motoboy.cliente, E, p.id, 'recusar');
    expect(r.corpo.status).toBe('pendente');
    expect(r.corpo.motoboy).toBeNull();
  });
});

describe('central operando sem o app', () => {
  let eq: Equipe;
  beforeAll(async () => {
    eq = await empresaComEquipe(await novoSuperAdmin());
  });

  it('atribui, pula o aceite, registra falha com motivo e conclui a devolução', async () => {
    const E = eq.empresa.id;
    const central = eq.despachante.cliente;
    const p = await novoPedido(central, E);

    expect((await acao(central, E, p.id, 'atribuir', { motoboyVinculoId: vinculoDe(eq.motoboy) })).corpo.status).toBe(
      'atribuido',
    );
    expect((await acao(central, E, p.id, 'iniciar_coleta')).corpo.status).toBe('coletando');
    expect((await acao(central, E, p.id, 'coletar')).corpo.status).toBe('em_rota');

    const semMotivo = await acao(central, E, p.id, 'falhar');
    expect(semMotivo.status).toBe(422);
    const falhou = await acao(central, E, p.id, 'falhar', { motivo: 'Cliente não atendeu' });
    expect(falhou.corpo).toMatchObject({ status: 'falhou', motivo: 'Cliente não atendeu' });

    await acao(central, E, p.id, 'devolver');
    const devolvido = await acao(central, E, p.id, 'concluir_devolucao');
    expect(devolvido.corpo.status).toBe('devolvido');
    expect(devolvido.corpo.acoes).toEqual([]);
  });

  it('recusa transições fora de ordem ou de quem não pode', async () => {
    const E = eq.empresa.id;
    const p = await novoPedido(eq.admin.cliente, E, { motoboyVinculoId: vinculoDe(eq.motoboy) });

    const aceitePelaCentral = await acao(eq.admin.cliente, E, p.id, 'aceitar');
    expect(aceitePelaCentral.status).toBe(403);
    const entregarAntes = await acao(eq.admin.cliente, E, p.id, 'entregar', { codigo: p.codigoEntrega });
    expect(entregarAntes.status).toBe(409);
    const cancelarPeloMotoboy = await acao(eq.motoboy.cliente, E, p.id, 'cancelar', { motivo: 'desisti' });
    expect(cancelarPeloMotoboy.status).toBe(403);
    expect((await acao(eq.admin.cliente, E, p.id, 'voar')).status).toBe(404);

    const cancelado = await acao(eq.admin.cliente, E, p.id, 'cancelar', { motivo: 'Cliente desistiu' });
    expect(cancelado.corpo.status).toBe('cancelado');
  });

  it('lista motoboys ativos com a quantidade de pedidos em andamento', async () => {
    const E = eq.empresa.id;
    await novoPedido(eq.admin.cliente, E, { motoboyVinculoId: vinculoDe(eq.motoboy) });
    const r = await eq.despachante.cliente.get(`/empresas/${E}/motoboys`);
    expect(r.corpo).toHaveLength(1);
    expect(r.corpo[0].vinculoId).toBe(vinculoDe(eq.motoboy));
    expect(r.corpo[0].pedidosAtivos).toBeGreaterThan(0);
  });

  it('admin cadastra o endereço da empresa; despachante não altera', async () => {
    const E = `/empresas/${eq.empresa.id}`;
    const r = await eq.admin.cliente.patch(E, { endereco: endereco('Rua Sete de Setembro', '3000') });
    expect(r.corpo.endereco).toMatchObject({ logradouro: 'Rua Sete de Setembro', numero: '3000' });
    expect((await eq.despachante.cliente.patch(E, { nomeFantasia: 'Outro nome' })).status).toBe(403);
  });
});

describe('isolamento de pedidos entre empresas', () => {
  let a: Equipe;
  let b: Equipe;
  let pedidoB: PedidoDetalhe;
  let telefoneClienteB: string;

  beforeAll(async () => {
    const sa = await novoSuperAdmin();
    a = await empresaComEquipe(sa);
    b = await empresaComEquipe(sa);
    telefoneClienteB = novoCelular();
    pedidoB = await novoPedido(b.admin.cliente, b.empresa.id, {
      entrega: { nome: 'Cliente de B', telefone: telefoneClienteB, endereco: endereco() },
    });
  });

  it('empresa A não lê, não lista e não altera pedidos de B', async () => {
    const A = `/empresas/${a.empresa.id}`;
    const B = `/empresas/${b.empresa.id}`;

    expect((await a.admin.cliente.get(`${B}/pedidos`)).status).toBe(404);
    expect((await a.admin.cliente.get(`${B}/pedidos/${pedidoB.id}`)).status).toBe(404);
    expect((await a.admin.cliente.get(`${A}/pedidos/${pedidoB.id}`)).status).toBe(404);
    expect((await acao(a.admin.cliente, a.empresa.id, pedidoB.id, 'cancelar', { motivo: 'teste' })).status).toBe(404);

    const listaA = await a.admin.cliente.get<PedidoResumo[]>(`${A}/pedidos`);
    expect(listaA.corpo.map((p) => p.id)).not.toContain(pedidoB.id);

    const intacto = await b.admin.cliente.get<PedidoDetalhe>(`${B}/pedidos/${pedidoB.id}`);
    expect(intacto.corpo.status).toBe('pendente');
  });

  it('A não atribui motoboy de B nem B atribui motoboy de A', async () => {
    const pedidoA = await novoPedido(a.admin.cliente, a.empresa.id);
    const r = await acao(a.admin.cliente, a.empresa.id, pedidoA.id, 'atribuir', { motoboyVinculoId: vinculoDe(b.motoboy) });
    expect(r.status).toBe(422);
    const r2 = await acao(b.admin.cliente, b.empresa.id, pedidoB.id, 'atribuir', { motoboyVinculoId: vinculoDe(a.motoboy) });
    expect(r2.status).toBe(422);
  });

  it('cadastro de clientes e lista de motoboys são separados', async () => {
    const busca = await a.admin.cliente.get(
      `/empresas/${a.empresa.id}/clientes/telefone/${encodeURIComponent(telefoneClienteB)}`,
    );
    expect(busca.status).toBe(404);
    const motoboysA = await a.admin.cliente.get(`/empresas/${a.empresa.id}/motoboys`);
    expect(motoboysA.corpo.map((m: any) => m.vinculoId)).toEqual([vinculoDe(a.motoboy)]);
  });

  it('motoboy que atua nas duas empresas só vê em cada uma os pedidos dela', async () => {
    const convite = await b.admin.cliente.post(`/empresas/${b.empresa.id}/convites`, { papel: 'motoboy' });
    await a.motoboy.cliente.post(`/convites/${convite.corpo.caminho.replace('/convite/', '')}/aceitar`);
    const eu = await a.motoboy.cliente.get('/auth/eu');
    const vinculoEmB = eu.corpo.vinculos.find((v: any) => v.empresa.id === b.empresa.id).vinculoId;

    const pedidoA = await novoPedido(a.admin.cliente, a.empresa.id, { motoboyVinculoId: vinculoDe(a.motoboy) });
    const outroB = await novoPedido(b.admin.cliente, b.empresa.id, { motoboyVinculoId: vinculoEmB });

    const emA = await a.motoboy.cliente.get<PedidoResumo[]>(`/empresas/${a.empresa.id}/pedidos`);
    const emB = await a.motoboy.cliente.get<PedidoResumo[]>(`/empresas/${b.empresa.id}/pedidos`);
    expect(emA.corpo.map((p) => p.id)).toEqual([pedidoA.id]);
    expect(emB.corpo.map((p) => p.id)).toEqual([outroB.id]);

    // O vínculo de A não serve para agir num pedido de B.
    expect((await acao(a.motoboy.cliente, a.empresa.id, outroB.id, 'aceitar')).status).toBe(404);
  });

  it('motoboy suspenso deixa de ver os pedidos', async () => {
    const pedido = await novoPedido(a.admin.cliente, a.empresa.id, { motoboyVinculoId: vinculoDe(a.motoboy) });
    const extra = await aceitarComContaNova(
      (await a.admin.cliente.post(`/empresas/${a.empresa.id}/convites`, { papel: 'motoboy' })).corpo.caminho,
      'motoboy',
    );
    await a.admin.cliente.patch(`/empresas/${a.empresa.id}/membros/${vinculoDe(a.motoboy)}`, { status: 'suspenso' });
    expect((await a.motoboy.cliente.get(`/empresas/${a.empresa.id}/pedidos/${pedido.id}`)).status).toBe(404);
    // E não pode mais receber pedidos novos.
    const r = await acao(a.admin.cliente, a.empresa.id, pedido.id, 'atribuir', { motoboyVinculoId: vinculoDe(a.motoboy) });
    expect(r.status).toBe(422);
    expect((await acao(a.admin.cliente, a.empresa.id, pedido.id, 'atribuir', { motoboyVinculoId: vinculoDe(extra) })).status).toBe(200);
  });
});
