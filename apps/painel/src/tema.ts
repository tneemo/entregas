// Tema claro ou escuro. O index.html aplica o tema antes de pintar (escolha salva ou o do
// sistema); aqui fica a troca pelo painel. A central costuma trabalhar à noite.

import { useSyncExternalStore } from 'react';

export type Tema = 'claro' | 'escuro';

const CHAVE = 'entregas:tema';
const ouvintes = new Set<() => void>();

const ler = (): Tema => (document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro');

function aplicar(tema: Tema) {
  document.documentElement.dataset.tema = tema;
  for (const ouvinte of ouvintes) ouvinte();
}

export function definirTema(tema: Tema) {
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // modo privado: vale só nesta visita
  }
  aplicar(tema);
}

// Sem escolha salva, acompanha o sistema (ex.: o computador escurece ao anoitecer).
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  let salvo: string | null = null;
  try {
    salvo = localStorage.getItem(CHAVE);
  } catch {
    // sem acesso: segue o sistema
  }
  if (!salvo) aplicar(e.matches ? 'escuro' : 'claro');
});

function inscrever(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function useTema(): Tema {
  return useSyncExternalStore(inscrever, ler);
}
