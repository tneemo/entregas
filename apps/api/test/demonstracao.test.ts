// Empresa de demonstração: aberta a todos os super admins, com entrega de teste e motoboy de teste.

import { describe, expect, it } from 'vitest';
import type {
  DemonstracaoResposta,
  EuResposta,
  LojaResposta,
  MotoboyTesteResposta,
  PedidoDetalhe,
} from '@entregas/shared';
import { Cliente, empresaComEquipe, novoSuperAdmin } from './ajudantes.ts';

describe('empresa de demonstração', () => {
  it('só super admin prepara', async () => {
    const eq = await empresaComEquipe(await novoSuperAdmin());
    expect((await eq.admin.cliente.post('/admin/demonstracao')).status).toBe(403);
    expect((await new Cliente().post('/admin/demonstracao')).status).toBe(401);
  });

  it('é uma só, no modo automático, com lojas, e todo super admin vira administrador', async () => {
    const primeiro = await novoSuperAdmin();
    const r1 = await primeiro.post<DemonstracaoResposta>('/admin/demonstracao');
    expect(r1.status).toBe(201);
    expect(r1.corpo.empresa.demonstracao).toBe(true);
    expect(r1.corpo.conviteMotoboy.caminho).toMatch(/^\/convite\//);
    const E = r1.corpo.empresa.id;

    // Super admin criado depois: preparar de novo dá acesso a ele, sem duplicar empresa nem lojas.
    const segundo = await novoSuperAdmin();
    const r2 = await segundo.post<DemonstracaoResposta>('/admin/demonstracao');
    expect(r2.corpo.empresa.id).toBe(E);
    for (const quem of [primeiro, segundo]) {
      const eu = await quem.get<EuResposta>('/auth/eu');
      expect(eu.corpo.vinculos).toContainEqual(
        expect.objectContaining({ papel: 'admin', empresa: expect.objectContaining({ id: E }) }),
      );
    }
    const lojas = await segundo.get<LojaResposta[]>(`/empresas/${E}/lojas`);
    expect(lojas.corpo).toHaveLength(2);
    const dados = await segundo.get(`/empresas/${E}`);
    expect(dados.corpo).toMatchObject({ modoDespacho: 'automatico', demonstracao: true });

    const lista = await segundo.get<{ id: string; demonstracao: boolean }[]>('/admin/empresas');
    expect(lista.corpo.find((e) => e.id === E)?.demonstracao).toBe(true);
  });

  it('entrega de teste vai para o motoboy de teste em turno e segue até o fim', async () => {
    const superAdmin = await novoSuperAdmin();
    const { corpo: demo } = await superAdmin.post<DemonstracaoResposta>('/admin/demonstracao');
    const E = demo.empresa.id;

    const conta = await superAdmin.post<MotoboyTesteResposta>('/admin/demonstracao/motoboy-teste');
    expect(conta.status).toBe(201);
    expect(conta.corpo.senha).toHaveLength(10);
    // Pedir de novo troca a senha: só a última vale.
    const nova = await superAdmin.post<MotoboyTesteResposta>('/admin/demonstracao/motoboy-teste');
    expect(nova.corpo.login).toBe(conta.corpo.login);

    const app = new Cliente();
    const login = await app.post('/auth/entrar', { login: nova.corpo.login, senha: nova.corpo.senha, modo: 'token' });
    expect(login.status).toBe(200);
    expect(
      (await new Cliente().post('/auth/entrar', { login: conta.corpo.login, senha: conta.corpo.senha })).status,
    ).toBe(401);
    app.token = login.corpo.token;
    expect(login.corpo.vinculos).toContainEqual(
      expect.objectContaining({ papel: 'motoboy', empresa: expect.objectContaining({ id: E }) }),
    );
    expect((await app.post(`/empresas/${E}/turno`)).status).toBe(201);
    await app.post(`/empresas/${E}/turno/posicoes`, {
      pontos: [{ latitude: -24.9555, longitude: -53.4552, registradoEm: new Date().toISOString() }],
    });

    const criado = await superAdmin.post<PedidoDetalhe>('/admin/demonstracao/pedidos');
    expect(criado.status).toBe(201);
    expect(criado.corpo.loja).not.toBeNull();
    expect(criado.corpo.rastreio?.caminho).toMatch(/^\/r\//);

    // O despacho automático oferece ao motoboy de teste (o único em turno, livre).
    const limite = Date.now() + 4000;
    let pedido = criado.corpo;
    while (pedido.status !== 'atribuido' && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 25));
      pedido = (await superAdmin.get<PedidoDetalhe>(`/empresas/${E}/pedidos/${pedido.id}`)).corpo;
    }
    expect(pedido.motoboy?.nome).toBe(nova.corpo.nome);

    for (const passo of ['aceitar', 'iniciar_coleta', 'coletar']) {
      expect((await app.post(`/empresas/${E}/pedidos/${pedido.id}/acoes/${passo}`)).status, passo).toBe(200);
    }
    const entregue = await app.post(`/empresas/${E}/pedidos/${pedido.id}/acoes/entregar`, {
      codigo: criado.corpo.codigoEntrega,
    });
    expect(entregue.status).toBe(200);
    expect(entregue.corpo.status).toBe('entregue');
  });
});
