// Validadores de documentos e contatos brasileiros.

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** CPF: 11 dígitos com dois dígitos verificadores (módulo 11). */
export function validarCpf(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const dv1 = digito(cpf.slice(0, 9), 10);
  const dv2 = digito(cpf.slice(0, 9) + dv1, 11);
  return cpf.endsWith(`${dv1}${dv2}`);
}

export function normalizarCnpj(valor: string): string {
  return valor.replace(/[.\-/\s]/g, '').toUpperCase();
}

/**
 * CNPJ numérico ou alfanumérico (IN RFB 2.229/2024, em vigor desde julho de 2026):
 * 12 caracteres [0-9A-Z] + 2 dígitos verificadores. Cada caractere vale (código ASCII - 48).
 */
export function validarCnpj(valor: string): boolean {
  const cnpj = normalizarCnpj(valor);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;

  const digito = (base: string) => {
    let soma = 0;
    let peso = base.length - 7; // 5 para o 1º DV (12 chars), 6 para o 2º (13 chars)
    for (let i = 0; i < base.length; i++) {
      soma += (base.charCodeAt(i) - 48) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const dv1 = digito(cnpj.slice(0, 12));
  const dv2 = digito(cnpj.slice(0, 12) + dv1);
  return cnpj.endsWith(`${dv1}${dv2}`);
}

/**
 * Normaliza telefone brasileiro para E.164 (+55DDNNNNNNNNN).
 * Aceita com ou sem +55, com máscara. Retorna null se inválido.
 */
export function normalizarTelefone(valor: string): string | null {
  let numero = somenteDigitos(valor);
  if ((numero.length === 12 || numero.length === 13) && numero.startsWith('55')) {
    numero = numero.slice(2);
  }
  if (numero.length !== 10 && numero.length !== 11) return null;

  const ddd = Number(numero.slice(0, 2));
  if (ddd < 11 || ddd > 99 || ddd % 10 === 0) return null;

  const local = numero.slice(2);
  const celular = local.length === 9 && local.startsWith('9');
  const fixo = local.length === 8 && /^[2-5]/.test(local);
  if (!celular && !fixo) return null;

  return `+55${numero}`;
}

export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}

export type TipoLogin = 'email' | 'documento_ou_telefone';

/**
 * Interpreta o identificador digitado no login. E-mail tem precedência;
 * qualquer outra coisa é tratada como CPF ou telefone (um telefone de 11
 * dígitos pode coincidir com um CPF válido, então a API procura pelos dois).
 */
export function interpretarLogin(valor: string): {
  tipo: TipoLogin;
  email?: string;
  cpf?: string;
  telefone?: string;
} {
  if (valor.includes('@')) return { tipo: 'email', email: normalizarEmail(valor) };
  const digitos = somenteDigitos(valor);
  return {
    tipo: 'documento_ou_telefone',
    cpf: validarCpf(digitos) ? digitos : undefined,
    telefone: normalizarTelefone(valor) ?? undefined,
  };
}

export function formatarCpf(cpf: string): string {
  const d = somenteDigitos(cpf);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

export function formatarCnpj(cnpj: string): string {
  const c = normalizarCnpj(cnpj);
  return c.length === 14
    ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
    : cnpj;
}

export function formatarTelefone(e164: string): string {
  const d = somenteDigitos(e164).replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}
