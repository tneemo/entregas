import { describe, expect, it } from 'vitest';
import { semTokens } from './privacidade.ts';

describe('semTokens', () => {
  it('esconde os tokens do rastreio e do convite, na API e no painel', () => {
    expect(semTokens('https://x.dev/r/abc123')).toBe('https://x.dev/r/[token]');
    expect(semTokens('/api/v1/rastreio/abc123/ws')).toBe('/api/v1/rastreio/[token]/ws');
    expect(semTokens('/api/v1/convites/abc123/aceitar')).toBe('/api/v1/convites/[token]/aceitar');
    expect(semTokens('https://x.dev/convite/abc123?x=1')).toBe('https://x.dev/convite/[token]?x=1');
  });

  it('não mexe no resto', () => {
    expect(semTokens('/api/v1/empresas/e1/pedidos/p1')).toBe('/api/v1/empresas/e1/pedidos/p1');
    expect(semTokens('/rastreio')).toBe('/rastreio');
    expect(semTokens('/e/e1/mapa')).toBe('/e/e1/mapa');
  });
});
