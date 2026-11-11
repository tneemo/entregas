// Garante que uma empresa nunca lê nem altera dados de outra.
// Toda rota nova de /empresas/:empresaId deve ganhar um caso aqui.

import { beforeAll, describe, expect, it } from 'vitest';
import { Cliente, empresaComEquipe, endereco, novoSuperAdmin } from './ajudantes.ts';

type Equipe = Awaited<ReturnType<typeof empresaComEquipe>>;

describe('isolamento entre empresas', () => {
  let sa: Cliente;
  let a: Equipe;
  let b: Equipe;
  let conviteB: { id: string };

  beforeAll(async () => {
    sa = await novoSuperAdmin();
    a = await empresaComEquipe(sa);
    b = await empresaComEquipe(sa);
    conviteB = (await b.admin.cliente.post(`/empresas/${b.empresa.id}/convites`, { papel: 'motoboy' })).corpo;
  });

  it('admin de A recebe 404 em todas as rotas de B', async () => {
    const cliente = a.admin.cliente;
    const B = `/empresas/${b.empresa.id}`;
    const tentativas = [
      cliente.get(B),
      cliente.get(`${B}/membros`),
      cliente.get(`${B}/convites`),
      cliente.post(`${B}/convites`, { papel: 'motoboy' }),
      cliente.delete(`${B}/convites/${conviteB.id}`),
      cliente.patch(`${B}/membros/${b.motoboy.eu.vinculos[0].vinculoId}`, { status: 'suspenso' }),
      cliente.get(`${B}/central/posicoes`),
      cliente.get(`${B}/indicadores`),
      cliente.get(`${B}/pedidos?busca=ana`),
      cliente.post(`${B}/enderecos/localizar`, endereco()),
      cliente.req('GET', `${B}/central/ws`, undefined, { upgrade: 'websocket', 'sec-fetch-site': 'same-origin' }),
    ];
    for (const r of await Promise.all(tentativas)) {
      expect(r.status).toBe(404);
      expect(JSON.stringify(r.corpo)).not.toContain(b.empresa.nomeFantasia);
    }
  });

  it('IDs de B usados dentro da rota de A não são encontrados', async () => {
    const A = `/empresas/${a.empresa.id}`;
    const vinculoB = b.motoboy.eu.vinculos[0].vinculoId;

    const patch = await a.admin.cliente.patch(`${A}/membros/${vinculoB}`, { status: 'suspenso' });
    expect(patch.status).toBe(404);
    const del = await a.admin.cliente.delete(`${A}/convites/${conviteB.id}`);
    expect(del.status).toBe(404);

    // Nada mudou em B.
    const membrosB = await b.admin.cliente.get(`/empresas/${b.empresa.id}/membros`);
    expect(membrosB.corpo.find((m: any) => m.vinculoId === vinculoB).status).toBe('ativo');
    const convitesB = await b.admin.cliente.get(`/empresas/${b.empresa.id}/convites`);
    expect(convitesB.corpo.map((c: any) => c.id)).toContain(conviteB.id);
  });

  it('listas de A contêm apenas pessoas de A', async () => {
    const membros = await a.admin.cliente.get(`/empresas/${a.empresa.id}/membros`);
    const ids = membros.corpo.map((m: any) => m.usuario.id);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain(b.admin.eu.usuario.id);
    expect(ids).not.toContain(b.motoboy.eu.usuario.id);
  });

  it('membros não expõem CPF nem senha', async () => {
    const membros = await a.admin.cliente.get(`/empresas/${a.empresa.id}/membros`);
    const texto = JSON.stringify(membros.corpo);
    expect(texto).not.toContain(a.motoboy.dados.cpf!);
    expect(texto).not.toMatch(/senha|pbkdf2/i);
  });

  it('super admin não entra nas rotas internas de uma empresa', async () => {
    expect((await sa.get(`/empresas/${a.empresa.id}/membros`)).status).toBe(404);
  });

  it('quem não é super admin não acessa /admin', async () => {
    expect((await a.admin.cliente.get('/admin/empresas')).status).toBe(403);
    expect((await new Cliente().get('/admin/empresas')).status).toBe(401);
  });
});

describe('papéis e suspensões', () => {
  it('motoboy não lista a equipe; despachante não altera membros', async () => {
    const sa = await novoSuperAdmin();
    const { empresa, motoboy, despachante } = await empresaComEquipe(sa);
    const E = `/empresas/${empresa.id}`;

    expect((await motoboy.cliente.get(E)).status).toBe(200);
    expect((await motoboy.cliente.get(`${E}/membros`)).status).toBe(403);
    expect(
      (await despachante.cliente.patch(`${E}/membros/${motoboy.eu.vinculos[0].vinculoId}`, { status: 'suspenso' }))
        .status,
    ).toBe(403);
  });

  it('admin não altera o próprio acesso', async () => {
    const sa = await novoSuperAdmin();
    const { empresa, admin } = await empresaComEquipe(sa);
    const r = await admin.cliente.patch(`/empresas/${empresa.id}/membros/${admin.eu.vinculos[0].vinculoId}`, {
      papel: 'motoboy',
    });
    expect(r.status).toBe(422);
  });

  it('membro suspenso perde o acesso na hora; tipo de vínculo só vale para motoboy', async () => {
    const sa = await novoSuperAdmin();
    const { empresa, admin, motoboy, despachante } = await empresaComEquipe(sa);
    const E = `/empresas/${empresa.id}`;
    const vinculoMoto = motoboy.eu.vinculos[0].vinculoId;

    const mei = await admin.cliente.patch(`${E}/membros/${vinculoMoto}`, { tipoVinculo: 'mei' });
    expect(mei.corpo.tipoVinculo).toBe('mei');

    const desp = await admin.cliente.patch(`${E}/membros/${despachante.eu.vinculos[0].vinculoId}`, {
      tipoVinculo: 'clt',
    });
    expect(desp.corpo.tipoVinculo).toBeNull();

    await admin.cliente.patch(`${E}/membros/${vinculoMoto}`, { status: 'suspenso' });
    expect((await motoboy.cliente.get(E)).status).toBe(404);
    expect((await motoboy.cliente.get('/auth/eu')).corpo.vinculos).toEqual([]);
  });

  it('empresa suspensa pelo super admin bloqueia toda a equipe', async () => {
    const sa = await novoSuperAdmin();
    const { empresa, admin } = await empresaComEquipe(sa);

    const r = await sa.patch(`/admin/empresas/${empresa.id}`, { status: 'suspensa' });
    expect(r.corpo.status).toBe('suspensa');
    expect((await admin.cliente.get(`/empresas/${empresa.id}`)).status).toBe(404);
  });
});
