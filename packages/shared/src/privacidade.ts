// O que nunca pode sair do sistema em logs e monitoramento de erros (LGPD e segurança).

/**
 * Segredos que viajam na URL: o token do link de rastreio (/r/, /rastreio/) e o do convite
 * (/convite/ no painel, /convites/ na API). Quem tem o token tem o acesso.
 */
const TOKEN_NA_URL = /\/(rastreio|convites?|r)\/[^/?#]+/g;

/** Troca os tokens de acesso de uma URL (ou texto com URL) por "[token]". */
export function semTokens(texto: string): string {
  return texto.replace(TOKEN_NA_URL, '/$1/[token]');
}
