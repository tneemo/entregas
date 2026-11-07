// Valores em centavos (inteiros) para não acumular erro de ponto flutuante.

const formatoReais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarReais(centavos: number): string {
  return formatoReais.format(centavos / 100);
}

/** Converte o que a pessoa digitou ("12,50", "R$ 1.234,5", "12") em centavos. */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (limpo === '') return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}
