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

## Demonstração com dados

Para ver o painel cheio (duas semanas de entregas, avaliações, motoboys andando no mapa) sem tocar no seu banco
de desenvolvimento. A demonstração usa um banco local separado, em `apps/api/.wrangler/demo`:

```bash
npm run demo:preparar -w @entregas/api
```

```bash
npm run dev:demo -w @entregas/api
```

```bash
npm run dev -w @entregas/painel
```

```bash
npm run demo -w @entregas/api
```

O último comando cria a empresa e os pedidos, mostra as contas para entrar (a senha fica em
`apps/api/scripts/demo.mjs`) e continua movendo os motoboys até Ctrl+C. Só funciona em banco vazio: para
recomeçar, apague `apps/api/.wrangler/demo` e prepare de novo.

## O que o painel faz além da fila

- **Despacho sugerido**: em cada pedido aguardando, um botão chama o motoboy em turno mais perto da coleta e com
  menos entregas (cálculo em `packages/shared/src/despacho.ts`, refeito a cada posição nova).
- **Visão geral** (menu): números de agora e do período (hoje, 7 ou 30 dias), entregas por dia, pico por hora,
  desempenho por motoboy, valores cobrados e nota dos clientes.
- **Histórico e busca**: pedidos concluídos de qualquer dia e busca por número, nome ou telefone.
- **Ctrl+K** abre a busca rápida (telas e pedidos); **N** cria um pedido.
- **Avisos em tempo real** quando um pedido não é entregue, volta para a fila ou é concluído, com som opcional
  (sino no rodapé do menu) e contagem de pendências no título da aba.
- **Tema escuro** (lua/sol no rodapé do menu; sem escolha, segue o sistema).
- **Link do cliente**: previsão de chegada, destino no mapa e avaliação com estrelas depois da entrega.

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

O Expo Go roda quase tudo, mas **não faz GPS com a tela apagada**. Para testar de verdade, gere um APK
pela Expo (conta gratuita), dentro de `apps/motoboy`. O perfil `homologacao` fala com a homologação;
o perfil `teste` fala com a produção (endereços em `apps/motoboy/eas.json`):

```bash
npx eas-cli build -p android --profile homologacao
```

O build roda na nuvem da Expo e termina com um link (e QR code) para baixar o APK no celular.

## Verificar antes de subir

Lint e formatação (Biome), tipos e testes, na mesma ordem do CI:

```bash
npm run verificar
```

Para formatar e corrigir o que o Biome resolve sozinho:

```bash
npm run lint:corrigir
```

O lint também protege o isolamento entre empresas: em `apps/api/src`, só `src/dados` (e `src/db`) pode importar
tabelas com `empresa_id` do esquema. Rotas e middlewares chamam funções dos escopos.

Requisições que mudam algo aceitam o cabeçalho `Idempotency-Key` (8 a 128 letras, números, `-` ou `_`): repetir a
mesma chave em até 24 h devolve a primeira resposta sem executar de novo. O painel usa ao criar pedido e o app ao
registrar ações (com até 3 tentativas automáticas quando o sinal cai). Toda resposta leva `x-request-id` e
`server-timing`; em homologação e produção cada requisição gera uma linha de log com o padrão da rota (nunca o
token da URL).

Os testes da API rodam dentro do runtime dos Workers (`@cloudflare/vitest-plugin`) com um D1 local.
`apps/api/test/isolamento.test.ts` garante que uma empresa não lê nem altera dados de outra:
toda rota nova em `/empresas/:empresaId` deve ganhar um caso lá.

## Banco de dados

O esquema fica em `apps/api/src/db/schema.ts`. Depois de alterá-lo:

```bash
npm run db:gerar -w @entregas/api
```

## Ambientes e publicação

| Ambiente | Endereço | Banco D1 / bucket R2 | Como é publicado |
| --- | --- | --- | --- |
| Desenvolvimento | http://localhost:5173 | local (`database_id` zerado; não troque) | `npm run dev` |
| Homologação | https://entregas-homologacao.joaopedropavanete.workers.dev | `entregas-homologacao` / `entregas-fotos-homologacao` | sozinho, a cada push na `main` que passa no CI |
| Produção | https://entregas.joaopedropavanete.workers.dev | `entregas` / `entregas-fotos` | à mão: GitHub → Actions → **Produção** → Run workflow |

Os ambientes ficam em `env` no `apps/api/wrangler.jsonc`. O GitHub Actions (`.github/workflows`) roda a
verificação em todo PR e push; ao publicar, aplica as migrations do banco e depois o Worker (API + painel), e
confere `/api/v1/saude`. Como as migrations entram antes do código, elas precisam funcionar com a versão anterior
por alguns segundos: adicionar tabela/coluna pode; apagar ou renomear, só em dois deploys.

### Configurar o CI (uma vez)

1. Na Cloudflare, crie um token em *My Profile → API Tokens* com o modelo **Edit Cloudflare Workers**,
   acrescente a permissão **D1: Edit** e limite à sua conta.
2. Guarde no repositório (o `gh` pede o valor):

```bash
gh secret set CLOUDFLARE_API_TOKEN -R tneemo/entregas
```

3. Opcional, recomendado: em *Settings → Environments → producao*, adicione você como revisor obrigatório.
   Assim, todo deploy em produção espera um clique de aprovação.

### Publicar sem o CI

Se precisar publicar do computador (dentro de `apps/api` ou com `-w @entregas/api`):

```bash
npm run db:migrar:homologacao -w @entregas/api
```

```bash
npm run deploy:homologacao -w @entregas/api
```

Para produção, os mesmos comandos com `producao` no lugar de `homologacao`.

### Primeiro acesso de cada ambiente

O primeiro super admin é criado na tela de configuração inicial do painel, com o segredo `SETUP_TOKEN`
(`npx wrangler secret put SETUP_TOKEN --env homologacao`, ou `--env producao`). Depois disso ele não serve
para mais nada e pode ser apagado com `npx wrangler secret delete SETUP_TOKEN --env <ambiente>`.

### Notificação no celular do motoboy (Firebase, uma vez)

A API já envia (pelo Expo Push); falta o app saber falar com o Firebase. Sem isto o app funciona, mas só
descobre pedido novo quando está aberto (consulta a cada 15 s), e o painel mostra "sem notificação".

1. No [Firebase](https://console.firebase.google.com), crie um projeto e adicione um app **Android** com o pacote
   `br.com.entregas.motoboy`. Baixe o `google-services.json` (fica fora do git, está no `.gitignore`).
2. Entregue o arquivo aos builds pelo EAS, dentro de `apps/motoboy`:

```bash
npx eas-cli env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment preview --environment production --visibility secret
```

3. No Firebase, em *Configurações do projeto → Contas de serviço*, gere uma chave privada (JSON) e envie para
   o EAS em *Android → Push Notifications (FCM V1)*:

```bash
npx eas-cli credentials -p android
```

4. Gere um APK novo (`--profile homologacao` ou `teste`). Ao entrar, o app pede permissão de notificação.

Se o projeto no Expo exigir token para enviar (*Enhanced Security for Push Notifications*), guarde-o no Worker
com `npx wrangler secret put EXPO_ACCESS_TOKEN --env <ambiente>`.

### Busca de endereços no mapa (Google, opcional)

Sem configuração, a API busca os endereços no OpenStreetMap, que em Cascavel só acha a rua: o painel avisa e
pede para arrastar o pino até a porta. Com uma conta no Google Cloud (faturamento ativo; o uso do piloto cabe na
cota gratuita), ative a **Geocoding API**, crie uma chave restrita a ela e guarde no Worker:

```bash
npx wrangler secret put GOOGLE_MAPS_API_KEY --env homologacao
```

(e `--env producao`). Nos testes, `GEOCODIFICADOR=desligado` evita qualquer consulta externa.

### Monitoramento de erros (Sentry, opcional)

Sem configuração, nada é enviado e os erros da API ficam só nos logs da Cloudflare. Com uma conta no
[Sentry](https://sentry.io), crie três projetos (API: *Cloudflare Workers*; painel: *React*; app:
*React Native*) e:

- **API**: `npx wrangler secret put SENTRY_DSN --env homologacao` (e `--env producao`).
- **Painel**: no GitHub, as variáveis `SENTRY_ORG`, `SENTRY_PROJETO_PAINEL` e `SENTRY_DSN_PAINEL`, e o segredo
  `SENTRY_AUTH_TOKEN` (envia os source maps; eles não ficam públicos no site).
- **App**: na Expo, as variáveis `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` e `SENTRY_AUTH_TOKEN`
  nos ambientes *preview* (homologação) e *production*. Vale para o próximo APK gerado.

Por causa da LGPD, o Sentry recebe só o erro e onde ele aconteceu: sem corpo de requisição, cookies, usuário,
IP, captura de tela, nem os tokens de rastreio e convite que vão na URL (`packages/shared/src/privacidade.ts`).

No PowerShell do Windows, se o `npx` for bloqueado pela política de scripts, use `npx.cmd`.

Use o plano **Workers Paid**: o hash de senha (PBKDF2, 100 mil iterações) gasta uns 25 ms de CPU por login,
acima dos 10 ms do plano gratuito.
