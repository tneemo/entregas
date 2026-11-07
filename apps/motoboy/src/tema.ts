// Mesma paleta do painel: placa de moto de aluguel (faixa azul, letras vermelhas).
// No app, letras e botões são maiores: o motoboy usa na rua, no sol, às vezes de luva.

export const cores = {
  papel: '#f4f6f8',
  branco: '#ffffff',
  asfalto: '#1e2529',
  concreto: '#5f6b73',
  linha: '#d5dbe0',
  mercosul: '#0b3d91',
  aluguel: '#b3122a',
  sinal: '#e5a50a',
  ok: '#1f7a4d',
} as const;

export const espaco = { p: 8, m: 16, g: 24 } as const;

export const texto = {
  titulo: { fontSize: 28, fontWeight: '700', color: cores.asfalto },
  subtitulo: { fontSize: 20, fontWeight: '700', color: cores.asfalto },
  corpo: { fontSize: 17, color: cores.asfalto, lineHeight: 24 },
  apoio: { fontSize: 15, color: cores.concreto, lineHeight: 21 },
} as const;
