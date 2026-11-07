# Entregas

Plataforma multiempresa de entregas com motoboys. Piloto em Cascavel/PR.
Decisões, pesquisa e roteiro em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Estrutura

```
apps/api      Worker da Cloudflare (Hono + D1): API em /api/v1 e entrega do painel
apps/painel   Painel web (React + Vite + Tailwind)
packages/shared  Validações (CPF, CNPJ alfanumérico, telefone), schemas e tipos da API
```

## Rodar localmente

Requisitos: Node.js 22+ e npm.

```bash
npm install
```

```bash
cp apps/api/.dev.vars.exemplo apps/api/.dev.vars
```

```bash
npm run db:migrar:local -w @entregas/api
```

```bash
npm run dev
```

O painel abre em http://localhost:5173 (a API roda em http://localhost:8787 e o Vite repassa `/api`).

No primeiro acesso, abra **/configuracao-inicial** e use o `SETUP_TOKEN` do `.dev.vars` para criar o super admin.
Depois: cadastre uma empresa, envie o link de convite ao administrador dela, e ele convida despachantes e motoboys.

## Testes

```bash
npm test
```

```bash
npm run typecheck
```

Os testes da API rodam dentro do runtime dos Workers (`@cloudflare/vitest-plugin`) com um D1 local.
`apps/api/test/isolamento.test.ts` garante que uma empresa não lê nem altera dados de outra:
toda rota nova em `/empresas/:empresaId` deve ganhar um caso lá.

## Banco de dados

O esquema fica em `apps/api/src/db/schema.ts`. Depois de alterá-lo:

```bash
npm run db:gerar -w @entregas/api
```

## Publicar na Cloudflare (ainda não feito)

1. `npx wrangler login`
2. `npx wrangler d1 create entregas` e copiar o `database_id` para `apps/api/wrangler.jsonc`
3. `npx wrangler d1 migrations apply DB --remote` (dentro de `apps/api`)
4. `npx wrangler secret put SETUP_TOKEN` (dentro de `apps/api`)
5. `npm run deploy -w @entregas/api`

Use o plano **Workers Paid**: o hash de senha (PBKDF2, 100 mil iterações) passa do limite de CPU do plano gratuito.
