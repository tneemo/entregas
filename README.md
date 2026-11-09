# Entregas

Plataforma multiempresa de entregas com motoboys. Piloto em Cascavel/PR.
Decisões, pesquisa e roteiro em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Estrutura

```
apps/api      Worker da Cloudflare (Hono + D1): API em /api/v1 e entrega do painel
apps/painel   Painel web (React + Vite + Tailwind)
apps/motoboy  App Android do motoboy (Expo + expo-router)
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

O painel abre em http://localhost:5173 (a API roda em http://localhost:8787 e o Vite repassa `/api`, inclusive os WebSockets do tempo real).
O mapa ao vivo fica em **Mapa ao vivo** no menu. O link de acompanhamento do cliente (`/r/<token>`) aparece no
detalhe do pedido, junto do código de entrega.

O `wrangler dev` não dispara os crons sozinho. Para vencer na hora os prazos de aceite (cron de cada minuto):

```bash
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

No primeiro acesso, abra **/configuracao-inicial** e use o `SETUP_TOKEN` do `.dev.vars` para criar o super admin.
Depois: cadastre uma empresa, envie o link de convite ao administrador dela, e ele convida despachantes e motoboys.

## App do motoboy (apps/motoboy, Expo)

Para testar telas e fluxo no navegador (sem GPS em segundo plano nem câmera de verdade):

```bash
cp apps/motoboy/.env.exemplo apps/motoboy/.env
```

```bash
npm run web -w @entregas/motoboy
```

Abre em http://localhost:8081 e fala com a API local (o `.dev.vars` libera essa origem via `ORIGENS_APP`).

No celular Android, na mesma rede Wi-Fi do computador:

1. Rode a API aceitando conexões da rede: `npm run dev:rede -w @entregas/api`
2. Em `apps/motoboy/.env`, troque `EXPO_PUBLIC_API_URL` pelo IP do computador (ex.: `http://192.168.0.10:8787`)
3. `npm run start -w @entregas/motoboy` e abra o QR code no app Expo Go

O Expo Go roda quase tudo, mas **não faz GPS com a tela apagada**. Para testar de verdade, gere o APK
de teste, que fala com a API publicada (endereço no perfil `teste` de `apps/motoboy/eas.json`). Dentro de
`apps/motoboy`, com uma conta gratuita na Expo:

```bash
npx eas-cli build -p android --profile teste
```

O build roda na nuvem da Expo e termina com um link (e QR code) para baixar o APK no celular.

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

## Publicar na Cloudflare

No ar em https://entregas.joaopedropavanete.workers.dev: ambiente `producao` do `apps/api/wrangler.jsonc`,
com o banco D1 `entregas` e o bucket R2 `entregas-fotos`. A parte de cima do `wrangler.jsonc` é só para
desenvolvimento local (o `database_id` zerado identifica o banco local; não troque).

Se houver migration nova, aplique antes do deploy (dentro de `apps/api`):

```bash
npx wrangler d1 migrations apply DB --remote --env producao
```

Para publicar a API e o painel:

```bash
npm run deploy -w @entregas/api
```

O primeiro super admin é criado na tela de configuração inicial do painel, com o segredo `SETUP_TOKEN`
(`npx wrangler secret put SETUP_TOKEN --env producao`). Depois disso ele não serve para mais nada e pode ser
apagado com `npx wrangler secret delete SETUP_TOKEN --env producao`.

No PowerShell do Windows, se o `npx` for bloqueado pela política de scripts, use `npx.cmd`.

Use o plano **Workers Paid**: o hash de senha (PBKDF2, 100 mil iterações) gasta uns 25 ms de CPU por login,
acima dos 10 ms do plano gratuito.
