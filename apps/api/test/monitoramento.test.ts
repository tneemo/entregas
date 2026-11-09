import { describe, expect, it } from 'vitest';
import { limparEvento } from '../src/monitoramento.ts';

describe('monitoramento: o que vai para o Sentry (LGPD)', () => {
  it('tira corpo, cookies, Authorization, IP e usuário do evento', () => {
    const evento = limparEvento({
      transaction: 'GET /api/v1/rastreio/segredo',
      user: { ip_address: '200.1.2.3' },
      request: {
        url: 'https://x.dev/api/v1/convites/segredo?a=1',
        data: { cpf: '12345678909', senha: 'x' },
        cookies: { sessao: 'abc' },
        query_string: 'a=1',
        headers: { authorization: 'Bearer abc', cookie: 'sessao=abc', 'content-type': 'application/json' },
      },
      breadcrumbs: [{ data: { url: 'https://x.dev/r/segredo' } }],
    });

    expect(evento.transaction).toBe('GET /api/v1/rastreio/[token]');
    expect(evento.user).toBeUndefined();
    expect(evento.request?.url).toBe('https://x.dev/api/v1/convites/[token]?a=1');
    expect(evento.request?.data).toBeUndefined();
    expect(evento.request?.cookies).toBeUndefined();
    expect(evento.request?.query_string).toBeUndefined();
    expect(evento.request?.headers).toEqual({ 'content-type': 'application/json' });
    expect(evento.breadcrumbs?.[0]?.data?.url).toBe('https://x.dev/r/[token]');
  });
});
