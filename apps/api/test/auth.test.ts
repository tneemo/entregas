import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { criarDb } from '../src/db/index.ts';
import { usuarios } from '../src/db/schema.ts';
import { Cliente, SENHA, empresaComEquipe, novoSuperAdmin } from './ajudantes.ts';

describe('setup do primeiro super admin', () => {
  it('cria o super admin uma única vez e exige o token', async () => {
    const db = criarDb(env.DB);
    // Garante o estado "plataforma nova" neste arquivo.
    await db.update(usuarios).set({ superAdmin: false }).where(eq(usuarios.superAdmin, true));

    const cliente = new Cliente();
    const dados = { nome: 'Dono', email: 'dono@entregas.local', senha: SENHA };

    const tokenErrado = await cliente.post('/setup', { ...dados, token: 'errado' });
    expect(tokenErrado.status).toBe(403);

    const ok = await cliente.post('/setup', { ...dados, token: 'token-de-teste' });
    expect(ok.status).toBe(201);
    expect(ok.corpo.usuario.superAdmin).toBe(true);

    const deNovo = await cliente.post('/setup', { ...dados, email: 'outro@entregas.local', token: 'token-de-teste' });
    expect(deNovo.status).toBe(409);
  });
});

describe('login', () => {
  it('entra com cookie HttpOnly e encerra a sessão ao sair', async () => {
    const admin = await novoSuperAdmin();
    expect(admin.cookie).toMatch(/^sessao=/);

    const eu = await admin.get('/auth/eu');
    expect(eu.status).toBe(200);
    expect(eu.corpo.usuario.superAdmin).toBe(true);
    expect(eu.corpo.usuario).not.toHaveProperty('senhaHash');

    const cookieAntigo = admin.cookie;
    expect((await admin.post('/auth/sair')).status).toBe(204);

    const reutilizado = new Cliente();
    reutilizado.cookie = cookieAntigo;
    expect((await reutilizado.get('/auth/eu')).status).toBe(401);
  });

  it('motoboy entra por telefone ou CPF em modo token (app)', async () => {
    const sa = await novoSuperAdmin();
    const { motoboy } = await empresaComEquipe(sa);

    for (const login of [motoboy.dados.telefone!, motoboy.dados.cpf!]) {
      const app = new Cliente();
      const r = await app.post('/auth/entrar', { login, senha: SENHA, modo: 'token' });
      expect(r.status).toBe(200);
      expect(r.corpo.token).toBeTypeOf('string');
      expect(r.headers.get('set-cookie')).toBeNull();

      app.token = r.corpo.token;
      const eu = await app.get('/auth/eu');
      expect(eu.corpo.vinculos).toHaveLength(1);
      expect(eu.corpo.vinculos[0].papel).toBe('motoboy');
    }
  });

  it('recusa senha errada com mensagem genérica e bloqueia após 5 falhas', async () => {
    const sa = await novoSuperAdmin();
    const { admin } = await empresaComEquipe(sa);
    const email = admin.dados.email!;
    const anonimo = new Cliente();

    for (let i = 0; i < 5; i++) {
      const r = await anonimo.post('/auth/entrar', { login: email, senha: 'errada' });
      expect(r.status).toBe(401);
      expect(r.corpo.erro.mensagem).toBe('Login ou senha incorretos.');
    }
    const bloqueado = await anonimo.post('/auth/entrar', { login: email, senha: SENHA });
    expect(bloqueado.status).toBe(429);
  });

  it('login inexistente recebe a mesma resposta de senha errada', async () => {
    const r = await new Cliente().post('/auth/entrar', { login: 'ninguem@teste.local', senha: 'x' });
    expect(r.status).toBe(401);
    expect(r.corpo.erro.codigo).toBe('credenciais_invalidas');
  });

  it('exige JSON nas rotas que alteram dados', async () => {
    const r = await new Cliente().req('POST', '/auth/entrar');
    expect(r.status).toBe(415);
  });
});

describe('CSRF', () => {
  it('bloqueia requisição de outro site que usaria o cookie do painel', async () => {
    const sa = await novoSuperAdmin();
    const { empresa, admin } = await empresaComEquipe(sa);
    const caminho = `/empresas/${empresa.id}/convites`;

    const deFora = await admin.cliente.req('POST', caminho, { papel: 'motoboy' }, { 'sec-fetch-site': 'cross-site' });
    expect(deFora.status).toBe(403);
    const origemErrada = await admin.cliente.req(
      'POST',
      caminho,
      { papel: 'motoboy' },
      { origin: 'https://golpe.example' },
    );
    expect(origemErrada.status).toBe(403);

    const doPainel = await admin.cliente.req(
      'POST',
      caminho,
      { papel: 'motoboy' },
      { 'sec-fetch-site': 'same-origin' },
    );
    expect(doPainel.status).toBe(201);
  });

  it('app com Bearer não depende de Origin', async () => {
    const sa = await novoSuperAdmin();
    const { empresa, admin } = await empresaComEquipe(sa);
    const app = new Cliente();
    const login = await app.post('/auth/entrar', { login: admin.dados.email, senha: SENHA, modo: 'token' });
    app.token = login.corpo.token;

    const convite = await app.post(`/empresas/${empresa.id}/convites`, { papel: 'motoboy' });
    expect(convite.status).toBe(201);
    expect((await app.delete(`/empresas/${empresa.id}/convites/${convite.corpo.id}`)).status).toBe(204);
  });
});
