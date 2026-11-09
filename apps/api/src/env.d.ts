// Variáveis e segredos opcionais (wrangler secret put --env <ambiente>). Os obrigatórios vêm do
// .dev.vars e aparecem no worker-configuration.d.ts gerado por `wrangler types`.
interface Env {
  /** Projeto do Sentry; sem ele, os erros ficam só nos logs da Cloudflare. */
  SENTRY_DSN?: string;
  /** Geocoding API do Google; sem ela, a busca de endereço usa o OpenStreetMap (só acha a rua). */
  GOOGLE_MAPS_API_KEY?: string;
  /** "desligado" não consulta nenhum geocodificador (testes). */
  GEOCODIFICADOR?: string;
}
