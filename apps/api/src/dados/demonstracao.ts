// Empresa de demonstração da plataforma, para testar e mostrar o sistema em produção sem
// misturar com a operação de ninguém.
//
// - Uma só, marcada com empresas.demonstracao. Preparar de novo não duplica nada: só completa.
// - Todo super admin vira administrador dela (inclusive os criados depois, ao preparar de novo).
// - Vem no modo automático, com duas lojas fictícias em Cascavel. Os motoboys são pessoas de
//   verdade com o app no celular, que entram pelo convite (link) que a preparação devolve.
// - A "entrega de teste" é um pedido comum dessa empresa para um destinatário fictício: passa
//   pelo despacho, pelo app, pelo código e pelo link de acompanhamento como qualquer outro.

import { and, asc, eq } from 'drizzle-orm';
import {
  formatarTelefone,
  type DemonstracaoResposta,
  type Endereco,
  type MotoboyTesteResposta,
  type PedidoDetalhe,
} from '@entregas/shared';
import type { Db } from '../db/index.ts';
import { violouUnicidade } from '../db/index.ts';
import { cidades, empresas, lojas, usuarios, vinculos } from '../db/schema.ts';
import { ErroApi } from '../erros.ts';
import { gerarHashSenha } from '../auth/cripto.ts';
import { criarConvite } from './convites.ts';
import { escopoPedidos } from './escopo-pedidos.ts';
import { empresaResposta } from './formatos.ts';

const CASCAVEL_IBGE = '4104808';

/** Pontos aproximados (precisão de rua): o app navega pelo texto do endereço. */
const ponto = (latitude: number, longitude: number) =>
  ({ latitude, longitude, precisao: 'rua', fonte: 'busca' }) as const;

const endereco = (
  logradouro: string,
  numero: string,
  bairro: string,
  localizacao: ReturnType<typeof ponto>,
): Endereco => ({ logradouro, numero, bairro, cidade: 'Cascavel', uf: 'PR', localizacao });

const BASE = endereco('Rua Paraná', '2000', 'Centro', ponto(-24.9555, -53.4552));

const LOJAS = [
  {
    nome: 'Pizzaria Bella Massa (demonstração)',
    telefone: '+554532220001',
    endereco: endereco('Rua Paraná', '1500', 'Centro', ponto(-24.9553, -53.4589)),
  },
  {
    nome: 'Farmácia Bem Estar (demonstração)',
    telefone: '+554532220002',
    endereco: endereco('Avenida Brasil', '5000', 'Centro', ponto(-24.9563, -53.4636)),
  },
];

const DESTINOS = [
  endereco('Rua Recife', '1200', 'Centro', ponto(-24.9522, -53.461)),
  endereco('Avenida Tancredo Neves', '2000', 'Neva', ponto(-24.964, -53.452)),
  endereco('Rua Souza Naves', '3000', 'Country', ponto(-24.947, -53.474)),
  endereco('Rua Carlos Gomes', '800', 'Cancelli', ponto(-24.9405, -53.4555)),
];

/** CNPJ válido e aleatório: a empresa é fictícia, mas o cadastro exige um CNPJ correto. */
function cnpjFicticio(): string {
  const base = `${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b % 10).join('')}0001`;
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

async function obterOuCriarEmpresa(db: Db) {
  const existente = await db.select().from(empresas).where(eq(empresas.demonstracao, true)).get();
  if (existente) return existente;

  const cidade =
    (await db.select().from(cidades).where(eq(cidades.codigoIbge, CASCAVEL_IBGE)).get()) ??
    (await db.select().from(cidades).orderBy(asc(cidades.nome)).get());
  if (!cidade) throw new ErroApi(422, 'sem_cidade', 'Cadastre uma cidade antes de preparar a demonstração.');

  for (let tentativa = 0; ; tentativa++) {
    try {
      return await db
        .insert(empresas)
        .values({
          tipo: 'motofrete',
          razaoSocial: 'Empresa de Demonstração (dados fictícios)',
          nomeFantasia: 'Demonstração',
          cnpj: cnpjFicticio(),
          cidadeId: cidade.id,
          endereco: BASE,
          modoDespacho: 'automatico',
          ofertaSegundos: 90,
          demonstracao: true,
        })
        .returning()
        .get();
    } catch (erro) {
      // CNPJ sorteado repetido (improvável): sorteia outro.
      if (!violouUnicidade(erro) || tentativa >= 3) throw erro;
    }
  }
}

export async function prepararDemonstracao(db: Db, superAdminId: string): Promise<DemonstracaoResposta> {
  const empresa = await obterOuCriarEmpresa(db);

  const lojasAtuais = await db.select({ nome: lojas.nome }).from(lojas).where(eq(lojas.empresaId, empresa.id)).all();
  const faltando = LOJAS.filter((l) => !lojasAtuais.some((a) => a.nome === l.nome));
  if (faltando.length > 0) {
    await db.insert(lojas).values(faltando.map((l) => ({ ...l, empresaId: empresa.id })));
  }

  // Todo super admin ativo administra a demonstração. Quem já tem vínculo fica como está.
  const superAdmins = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.superAdmin, true), eq(usuarios.ativo, true)))
    .all();
  if (superAdmins.length > 0) {
    await db
      .insert(vinculos)
      .values(superAdmins.map((u) => ({ empresaId: empresa.id, usuarioId: u.id, papel: 'admin' as const })))
      .onConflictDoNothing();
  }

  const cidade = await db.select().from(cidades).where(eq(cidades.id, empresa.cidadeId)).get();
  const conviteMotoboy = await criarConvite(db, {
    empresaId: empresa.id,
    papel: 'motoboy',
    criadoPor: superAdminId,
    nomeConvidado: 'Motoboy de teste',
  });
  return { empresa: empresaResposta(empresa, cidade!), conviteMotoboy };
}

/** Um pedido de teste numa das lojas fictícias, para um destinatário fictício. */
export async function criarEntregaDeTeste(
  db: Db,
  superAdminId: string,
): Promise<{ empresaId: string; pedido: PedidoDetalhe }> {
  const empresa = await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.demonstracao, true)).get();
  if (!empresa) throw new ErroApi(409, 'sem_demonstracao', 'Prepare a empresa de demonstração primeiro.');

  const vinculo = await db
    .select({ id: vinculos.id, papel: vinculos.papel })
    .from(vinculos)
    .where(and(eq(vinculos.empresaId, empresa.id), eq(vinculos.usuarioId, superAdminId), eq(vinculos.status, 'ativo')))
    .get();
  if (!vinculo || vinculo.papel === 'motoboy') {
    throw new ErroApi(409, 'sem_acesso_demonstracao', 'Prepare a demonstração de novo para ganhar acesso a ela.');
  }

  const lojasAtivas = await db
    .select()
    .from(lojas)
    .where(and(eq(lojas.empresaId, empresa.id), eq(lojas.ativa, true)))
    .orderBy(asc(lojas.nome))
    .all();
  const sorteio = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0]! % n;
  const loja = lojasAtivas.length > 0 ? lojasAtivas[sorteio(lojasAtivas.length)]! : null;

  const ctx = { empresaId: empresa.id, usuarioId: superAdminId, vinculoId: vinculo.id, papel: vinculo.papel };
  const pedido = await escopoPedidos(db, ctx).criar({
    lojaId: loja?.id,
    coleta: loja
      ? { nome: loja.nome, telefone: loja.telefone ?? undefined, endereco: loja.endereco }
      : { nome: 'Base da demonstração', endereco: BASE },
    entrega: {
      nome: 'Cliente de Teste',
      telefone: '+5545999990000',
      endereco: DESTINOS[sorteio(DESTINOS.length)]!,
    },
    formaPagamento: 'pago',
    valorACobrarCentavos: 0,
    taxaEntregaCentavos: 700,
    observacoes: 'Entrega de TESTE (empresa de demonstração). Não há pacote de verdade.',
  });
  return { empresaId: empresa.id, pedido };
}

const sorteioDigitos = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b % 10).join('');

/** Senha fácil de digitar no celular (sem 0/O, 1/l): 10 caracteres. */
function senhaDeTeste(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => letras[b % letras.length]).join('');
}

/**
 * Conta de motoboy de teste do super admin, na demonstração. Cada pessoa só tem um papel por
 * empresa, e o super admin já é administrador dela; por isso o motoboy de teste é outra conta,
 * com telefone fictício. Pedir de novo troca a senha (a anterior deixa de valer).
 */
export async function motoboyDeTeste(db: Db, superAdmin: { id: string; nome: string }): Promise<MotoboyTesteResposta> {
  const empresa = await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.demonstracao, true)).get();
  if (!empresa) throw new ErroApi(409, 'sem_demonstracao', 'Prepare a empresa de demonstração primeiro.');

  // O e-mail (domínio .invalid, que não existe) amarra a conta de teste ao super admin.
  const email = `motoboy-teste-${superAdmin.id.slice(0, 8)}@demonstracao.invalid`;
  const senha = senhaDeTeste();
  const senhaHash = await gerarHashSenha(senha);
  let conta = await db.select().from(usuarios).where(eq(usuarios.email, email)).get();
  if (conta) {
    await db.update(usuarios).set({ senhaHash, ativo: true }).where(eq(usuarios.id, conta.id));
  } else {
    for (let tentativa = 0; !conta; tentativa++) {
      try {
        conta = await db
          .insert(usuarios)
          .values({
            nome: `${superAdmin.nome.split(' ')[0]} (motoboy de teste)`,
            email,
            // Celular fictício de Cascavel, só para entrar no app.
            telefone: `+55459${sorteioDigitos(8)}`,
            senhaHash,
          })
          .returning()
          .get();
      } catch (erro) {
        if (!violouUnicidade(erro) || tentativa >= 3) throw erro;
      }
    }
  }
  await db
    .insert(vinculos)
    .values({ empresaId: empresa.id, usuarioId: conta.id, papel: 'motoboy', tipoVinculo: 'freelancer' })
    .onConflictDoUpdate({ target: [vinculos.empresaId, vinculos.usuarioId], set: { status: 'ativo' } });

  return { nome: conta.nome, login: formatarTelefone(conta.telefone!), email, senha };
}
