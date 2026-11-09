// Segredos opcionais (wrangler secret put --env <ambiente>). Os obrigatórios vêm do
// .dev.vars e aparecem no worker-configuration.d.ts gerado por `wrangler types`.
interface Env {
  /** Projeto do Sentry; sem ele, os erros ficam só nos logs da Cloudflare. */
  SENTRY_DSN?: string;
}
