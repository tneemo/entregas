import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { criarDb } from '../src/db/index.ts';
import { convites } from '../src/db/schema.ts';
import {
  Cliente,
  SENHA,
  aceitarComContaNova,
  empresaComEquipe,
  novaEmpresa,
  novoCelular,
  novoCpf,
  novoSuperAdmin,
  tokenDoCaminho,
} from './ajudantes.ts';

describe('convites', () => {
  it('super admin cria empresa já com convite de admin; o link mostra a empresa', async () => {
    const sa = await novoSuperAdmin();
    const { empresa, conviteAdmin } = await novaEmpresa(sa, 'Farmácia Central');

    expect(conviteAdmin.caminho).toMatch(/^\/convite\/[\w-]{40,}$/);
    const publico = await new Cliente().get(`/convites/${tokenDoCaminho(conviteAdmin.caminho)}`);
    expect(publico.status).toBe(200);
    expect(publico.corpo).toMatchObject({
      papel: 'admin',
      empresa: { nomeFantasia: 'Farmácia Central', cidade: 'Cascavel' },
      exige: { email: true, cpf: false },
    });
    expect(publico.corpo).not.toHaveProperty('empresa.cnpj');
    expect(empresa.status).toBe('ativa');
  });

  it('convite de motoboy exige telefone e CPF', async () => {
    const sa = await novoSuperAdmin();
    const { admin, empresa } = await empresaComEquipe(sa);
    const convite = await admin.cliente.post(`/empresas/${empresa.id}/convites`, { papel: 'motoboy' });

    const semCpf = await new Cliente().post(`/convites/${tokenDoCaminho(convite.corpo.caminho)}/aceitar`, {
      nome: 'João',
      telefone: novoCelular(),
      senha: SENHA,
    });
    expect(semCpf.status).toBe(422);
    expect(semCpf.corpo.erro.campos.cpf).toEqual(['Informe o CPF.']);
  });

  it('convite é de uso único', async () => {
    const sa = await novoSuperAdmin();
    const { conviteAdmin } = await novaEmpresa(sa);
    await aceitarComContaNova(conviteAdmin.caminho, 'admin');

    const segundo = await new Cliente().post(`/convites/${tokenDoCaminho(conviteAdmin.caminho)}/aceitar`, {
      nome: 'Outra pessoa',
      email: 'outra@teste.local',
      senha: SENHA,
    });
    expect(segundo.status).toBe(410);
    expect(segundo.corpo.erro.codigo).toBe('convite_usado');
  });

  it('convite revogado ou expirado não pode ser usado', async () => {
    const sa = await novoSuperAdmin();
    const { admin, empresa } = await empresaComEquipe(sa);

    const revogado = await admin.cliente.post(`/empresas/${empresa.id}/convites`, { papel: 'motoboy' });
    expect((await admin.cliente.delete(`/empresas/${empresa.id}/convites/${revogado.corpo.id}`)).status).toBe(204);
    const r1 = await new Cliente().get(`/convites/${tokenDoCaminho(revogado.corpo.caminho)}`);
    expect(r1.corpo.erro.codigo).toBe('convite_revogado');

    const expirado = await admin.cliente.post(`/empresas/${empresa.id}/convites`, { papel: 'motoboy' });
    await criarDb(env.DB)
      .update(convites)
      .set({ expiraEm: new Date(Date.now() - 1000) })
      .where(eq(convites.id, expirado.corpo.id));
    const r2 = await new Cliente().get(`/convites/${tokenDoCaminho(expirado.corpo.caminho)}`);
    expect(r2.corpo.erro.codigo).toBe('convite_expirado');

    const pendentes = await admin.cliente.get(`/empresas/${empresa.id}/convites`);
    expect(pendentes.corpo).toEqual([]);
  });

  it('motoboy com conta usa o mesmo login para entrar em outra empresa', async () => {
    const sa = await novoSuperAdmin();
    const a = await empresaComEquipe(sa);
    const b = await empresaComEquipe(sa);

    const convite = await b.admin.cliente.post(`/empresas/${b.empresa.id}/convites`, { papel: 'motoboy' });
    const aceite = await a.motoboy.cliente.post(`/convites/${tokenDoCaminho(convite.corpo.caminho)}/aceitar`);
    expect(aceite.status).toBe(201);

    const eu = await a.motoboy.cliente.get('/auth/eu');
    expect(eu.corpo.vinculos.map((v: any) => v.empresa.id).sort()).toEqual(
      [a.empresa.id, b.empresa.id].sort(),
    );
  });

  it('não deixa entrar duas vezes na mesma empresa e libera o convite', async () => {
    const sa = await novoSuperAdmin();
    const { admin, empresa, motoboy } = await empresaComEquipe(sa);

    const convite = await admin.cliente.post(`/empresas/${empresa.id}/convites`, { papel: 'motoboy' });
    const token = tokenDoCaminho(convite.corpo.caminho);
    const repetido = await motoboy.cliente.post(`/convites/${token}/aceitar`);
    expect(repetido.status).toBe(409);
    expect(repetido.corpo.erro.codigo).toBe('ja_membro');

    // O convite continua disponível para outra pessoa.
    expect((await new Cliente().get(`/convites/${token}`)).status).toBe(200);
  });

  it('conta nova com telefone ou CPF já cadastrado é recusada', async () => {
    const sa = await novoSuperAdmin();
    const { admin, empresa, motoboy } = await empresaComEquipe(sa);
    const convite = await admin.cliente.post(`/empresas/${empresa.id}/convites`, { papel: 'motoboy' });

    const r = await new Cliente().post(`/convites/${tokenDoCaminho(convite.corpo.caminho)}/aceitar`, {
      nome: 'Duplicado',
      telefone: motoboy.dados.telefone,
      cpf: novoCpf(),
      senha: SENHA,
    });
    expect(r.status).toBe(409);
    expect(r.corpo.erro.codigo).toBe('conta_existente');
    expect(Object.keys(r.corpo.erro.campos)).toEqual(['telefone']);
  });

  it('despachante convida motoboy, mas não despachante nem admin', async () => {
    const sa = await novoSuperAdmin();
    const { despachante, empresa } = await empresaComEquipe(sa);
    const base = `/empresas/${empresa.id}/convites`;

    expect((await despachante.cliente.post(base, { papel: 'motoboy' })).status).toBe(201);
    expect((await despachante.cliente.post(base, { papel: 'despachante' })).status).toBe(403);
    expect((await despachante.cliente.post(base, { papel: 'admin' })).status).toBe(403);
  });
});
