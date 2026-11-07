import { env, exports } from 'cloudflare:workers';
import type { CriarEmpresaResposta, Papel } from '@entregas/shared';
import { criarDb } from '../src/db/index.ts';
import { usuarios } from '../src/db/schema.ts';
import { gerarHashSenha } from '../src/auth/cripto.ts';

export const CIDADE_CASCAVEL = 'ibge-4104808';
export const SENHA = 'senha-forte-123';

const sufixo = () => crypto.randomUUID().slice(0, 8);

/** Cliente HTTP que guarda o cookie de sessão, como um navegador. */
export class Cliente {
  cookie: string | null = null;
  token: string | null = null;

  async req<T = any>(metodo: string, caminho: string, corpo?: unknown, extras: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extras };
    if (corpo !== undefined) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    const resposta = await exports.default.fetch(`https://entregas.teste/api/v1${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });

    const setCookie = resposta.headers.get('set-cookie');
    if (setCookie?.startsWith('sessao=')) {
      const valor = setCookie.split(';')[0]!;
      this.cookie = valor === 'sessao=' ? null : valor;
    }
    const texto = await resposta.text();
    return { status: resposta.status, corpo: (texto ? JSON.parse(texto) : null) as T, headers: resposta.headers };
  }

  get<T = any>(caminho: string) {
    return this.req<T>('GET', caminho);
  }

  /** Envia bytes crus (ex.: foto) e devolve a resposta sem interpretar. */
  enviarBytes(caminho: string, bytes: Uint8Array, tipoConteudo: string) {
    const headers: Record<string, string> = { 'content-type': tipoConteudo };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    return exports.default.fetch(`https://entregas.teste/api/v1${caminho}`, { method: 'POST', headers, body: bytes });
  }

  buscarBytes(caminho: string) {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.cookie = this.cookie;
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    return exports.default.fetch(`https://entregas.teste/api/v1${caminho}`, { headers });
  }
  post<T = any>(caminho: string, corpo: unknown = {}) {
    return this.req<T>('POST', caminho, corpo);
  }
  patch<T = any>(caminho: string, corpo: unknown) {
    return this.req<T>('PATCH', caminho, corpo);
  }
  delete<T = any>(caminho: string) {
    return this.req<T>('DELETE', caminho);
  }

  async entrar(login: string, senha = SENHA) {
    const r = await this.post('/auth/entrar', { login, senha });
    if (r.status !== 200) throw new Error(`login falhou (${r.status}): ${JSON.stringify(r.corpo)}`);
    return r;
  }
}

/** Super admin inserido direto no banco (o fluxo de /setup tem teste próprio). */
export async function novoSuperAdmin() {
  const email = `super-${sufixo()}@teste.local`;
  await criarDb(env.DB)
    .insert(usuarios)
    .values({ nome: 'Super Admin', email, senhaHash: await gerarHashSenha(SENHA), superAdmin: true });
  const cliente = new Cliente();
  await cliente.entrar(email);
  return cliente;
}

/** Gera um CNPJ numérico válido e único para o teste. */
export function novoCnpj(): string {
  const base = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b % 10).join('');
  const dv = (s: string) => {
    let soma = 0;
    let peso = s.length - 7;
    for (const ch of s) {
      soma += Number(ch) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base);
  return `${base}${d1}${dv(base + d1)}`;
}

/** Gera um CPF válido e único para o teste. */
export function novoCpf(): string {
  const base = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b % 10).join('');
  const dv = (s: string) => {
    let soma = 0;
    for (let i = 0; i < s.length; i++) soma += Number(s[i]) * (s.length + 1 - i);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base);
  return `${base}${d1}${dv(base + d1)}`;
}

export function novoCelular(): string {
  const n = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b % 10).join('');
  return `(45) 9${n.slice(0, 4)}-${n.slice(4)}`;
}

export async function novaEmpresa(superAdmin: Cliente, nome = `Empresa ${sufixo()}`) {
  const r = await superAdmin.post<CriarEmpresaResposta>('/admin/empresas', {
    tipo: 'loja',
    razaoSocial: `${nome} Ltda`,
    nomeFantasia: nome,
    cnpj: novoCnpj(),
    cidadeId: CIDADE_CASCAVEL,
  });
  if (r.status !== 201) throw new Error(`criar empresa falhou: ${JSON.stringify(r.corpo)}`);
  return r.corpo;
}

export function tokenDoCaminho(caminho: string) {
  return caminho.replace('/convite/', '');
}

/** Aceita um convite criando conta nova; devolve o cliente já logado. */
export async function aceitarComContaNova(caminho: string, papel: Papel) {
  const cliente = new Cliente();
  const dados =
    papel === 'motoboy'
      ? { nome: 'Motoboy Teste', telefone: novoCelular(), cpf: novoCpf(), senha: SENHA }
      : { nome: `Pessoa ${papel}`, email: `${papel}-${sufixo()}@teste.local`, senha: SENHA };
  const r = await cliente.post(`/convites/${tokenDoCaminho(caminho)}/aceitar`, dados);
  if (r.status !== 201) throw new Error(`aceite falhou (${r.status}): ${JSON.stringify(r.corpo)}`);
  return { cliente, dados, eu: r.corpo };
}

/** Empresa completa com admin, despachante e motoboy, cada um logado. */
export async function empresaComEquipe(superAdmin: Cliente) {
  const { empresa, conviteAdmin } = await novaEmpresa(superAdmin);
  const admin = await aceitarComContaNova(conviteAdmin.caminho, 'admin');

  const conviteDesp = await admin.cliente.post(`/empresas/${empresa.id}/convites`, { papel: 'despachante' });
  const despachante = await aceitarComContaNova(conviteDesp.corpo.caminho, 'despachante');

  const conviteMoto = await admin.cliente.post(`/empresas/${empresa.id}/convites`, { papel: 'motoboy' });
  const motoboy = await aceitarComContaNova(conviteMoto.corpo.caminho, 'motoboy');

  return { empresa, admin, despachante, motoboy };
}

export function endereco(logradouro = 'Rua Paraná', numero = '1500', bairro = 'Centro') {
  return { cep: '85810-010', logradouro, numero, bairro, cidade: 'Cascavel', uf: 'PR' };
}

/** Cria um pedido pela central; `extras` sobrescreve campos do corpo. */
export async function novoPedido(central: Cliente, empresaId: string, extras: Record<string, unknown> = {}) {
  const r = await central.post(`/empresas/${empresaId}/pedidos`, {
    coleta: { endereco: endereco('Rua Paraná', '1500') },
    entrega: { nome: 'Ana Cliente', telefone: novoCelular(), endereco: endereco('Av. Brasil', '2000', 'Neva') },
    formaPagamento: 'dinheiro',
    valorACobrarCentavos: 4590,
    trocoParaCentavos: 5000,
    taxaEntregaCentavos: 700,
    ...extras,
  });
  if (r.status !== 201) throw new Error(`criar pedido falhou (${r.status}): ${JSON.stringify(r.corpo)}`);
  return r.corpo as import('@entregas/shared').PedidoDetalhe;
}
