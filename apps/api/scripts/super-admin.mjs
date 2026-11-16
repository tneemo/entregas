// Cria um super admin (ou promove uma conta que já existe) direto no D1.
// Não passa pela API: quem roda precisa estar logado na Cloudflare (wrangler) com acesso ao banco.
//
//   SENHA='uma senha forte' node scripts/super-admin.mjs --env homologacao --email voce@exemplo.com --nome "Seu Nome"
//
// --env         homologacao | producao | local   (local usa o banco do wrangler dev)
// --persist-to  pasta do banco local (ex.: .wrangler/demo), só com --env local
// --email       e-mail de quem será super admin
// --nome        obrigatório só se a conta ainda não existir
// SENHA         variável de ambiente, obrigatória só se a conta ainda não existir (mínimo 10 caracteres).
//               Se a conta já existe, ela só é promovida e a senha dela não muda.
//
// A senha vira hash PBKDF2 aqui mesmo (mesmo formato de src/auth/cripto.ts); só o hash vai para o banco.

import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const ambiente = arg('env');
const email = arg('email')?.trim().toLowerCase();
const nome = arg('nome')?.trim();
const persistir = arg('persist-to');
const senha = process.env.SENHA;

if (!['homologacao', 'producao', 'local'].includes(ambiente) || !email?.includes('@')) {
  console.error(
    'Uso: SENHA=... node scripts/super-admin.mjs --env homologacao|producao|local --email x@y.com --nome "Nome"',
  );
  process.exit(1);
}

const aspas = (t) => `'${String(t).replace(/'/g, "''")}'`;
const base64Url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let criar = '';
if (nome && senha) {
  if (senha.length < 10) {
    console.error('A SENHA precisa ter pelo menos 10 caracteres.');
    process.exit(1);
  }
  const sal = randomBytes(16);
  const hash = pbkdf2Sync(senha, sal, 100_000, 32, 'sha256');
  const senhaHash = `pbkdf2-sha256$100000$${base64Url(sal)}$${base64Url(hash)}`;
  criar = `INSERT INTO usuarios (id, nome, email, senha_hash, super_admin)
SELECT ${aspas(randomUUID())}, ${aspas(nome)}, ${aspas(email)}, ${aspas(senhaHash)}, 1
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = ${aspas(email)});
`;
}
const sql = `${criar}UPDATE usuarios SET super_admin = 1, ativo = 1 WHERE email = ${aspas(email)};
SELECT nome, email, super_admin FROM usuarios WHERE email = ${aspas(email)};
`;

const arquivo = join(mkdtempSync(join(tmpdir(), 'super-admin-')), 'super-admin.sql');
writeFileSync(arquivo, sql, { mode: 0o600 });
try {
  const alvo =
    ambiente === 'local'
      ? ['--local', ...(persistir ? ['--persist-to', persistir] : [])]
      : ['--remote', '--env', ambiente];
  const saida = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', ...alvo, '--file', arquivo, '--json'], {
    cwd: RAIZ,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const resultados = JSON.parse(saida.slice(saida.indexOf('[')));
  const linha = resultados.at(-1)?.results?.[0];
  if (linha?.super_admin) console.log(`OK: ${linha.email} é super admin em ${ambiente}.`);
  else console.error(`Não achei ${email} depois do comando. Se a conta não existe, passe --nome e SENHA.`);
} finally {
  unlinkSync(arquivo);
}
