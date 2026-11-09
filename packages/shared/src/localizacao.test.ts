import { describe, expect, it } from 'vitest';
import { distanciaMetros, localizacaoExata, textoDistancia } from './localizacao.ts';
import { schemaEndereco } from './schemas.ts';

describe('distanciaMetros', () => {
  it('mede em linha reta, em metros', () => {
    // Dois pontos no centro de Cascavel, a ~1,9 km um do outro.
    const d = distanciaMetros({ latitude: -24.9578, longitude: -53.4595 }, { latitude: -24.9556, longitude: -53.4782 });
    expect(d).toBeGreaterThan(1800);
    expect(d).toBeLessThan(2000);
    expect(distanciaMetros({ latitude: -24.95, longitude: -53.45 }, { latitude: -24.95, longitude: -53.45 })).toBe(0);
  });

  it('escreve do jeito que a central lê', () => {
    expect(textoDistancia(42)).toBe('40 m');
    expect(textoDistancia(856)).toBe('860 m');
    expect(textoDistancia(1234)).toBe('1,2 km');
  });
});

describe('localização no endereço', () => {
  const base = { logradouro: 'Rua Paraná', numero: '100', bairro: 'Centro', cidade: 'Cascavel', uf: 'pr' };

  it('é opcional e, quando vem, precisa ser válida', () => {
    expect(schemaEndereco.safeParse(base).success).toBe(true);
    const ok = schemaEndereco.parse({
      ...base,
      localizacao: { latitude: -24.95, longitude: -53.45, precisao: 'rua', fonte: 'busca' },
    });
    expect(ok.localizacao?.precisao).toBe('rua');
    expect(
      schemaEndereco.safeParse({
        ...base,
        localizacao: { latitude: 120, longitude: 0, precisao: 'rua', fonte: 'busca' },
      }).success,
    ).toBe(false);
  });

  it('só é exata quando chega no número', () => {
    expect(localizacaoExata({ latitude: 0, longitude: 0, precisao: 'numero', fonte: 'mapa' })).toBe(true);
    expect(localizacaoExata({ latitude: 0, longitude: 0, precisao: 'rua', fonte: 'busca' })).toBe(false);
    expect(localizacaoExata(undefined)).toBe(false);
  });
});
