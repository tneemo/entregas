// Primitivas de criptografia sobre a Web Crypto do runtime dos Workers.

const codificador = new TextEncoder();

/** Máximo de iterações de PBKDF2 aceito pelo runtime dos Workers. */
const ITERACOES_PBKDF2 = 100_000;

/** Hash com formato válido e senha desconhecida: iguala o tempo de resposta quando o login não existe. */
export const HASH_FICTICIO = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export function paraBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texto.length + 3) % 4);
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

export function gerarToken(bytes = 32): string {
  return paraBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', codificador.encode(texto));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function iguaisTempoConstante(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): boolean {
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

/** Compara dois segredos em texto sem vazar informação pelo tempo de resposta. */
export async function segredosIguais(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', codificador.encode(s))));
  return iguaisTempoConstante(new Uint8Array(ha!), new Uint8Array(hb!));
}

async function derivar(senha: string, sal: Uint8Array<ArrayBuffer>, iteracoes: number) {
  const chave = await crypto.subtle.importKey('raw', codificador.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes },
    chave,
    256,
  );
  return new Uint8Array(bits);
}

/** Formato: pbkdf2-sha256$<iterações>$<sal>$<hash>, para permitir trocar parâmetros depois. */
export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(senha, sal, ITERACOES_PBKDF2);
  return `pbkdf2-sha256$${ITERACOES_PBKDF2}$${paraBase64Url(sal)}$${paraBase64Url(hash)}`;
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const [algoritmo, iteracoes, sal, hash] = armazenado.split('$');
  if (algoritmo !== 'pbkdf2-sha256' || !iteracoes || !sal || !hash) return false;
  const calculado = await derivar(senha, deBase64Url(sal), Number(iteracoes));
  return iguaisTempoConstante(calculado, deBase64Url(hash));
}
