import { describe, expect, it } from 'vitest';
import { acoesPermitidas, podeExecutar, statusFinal, STATUS_PEDIDO, TRANSICOES } from './pedidos.ts';
import { formatarReais, lerReais } from './dinheiro.ts';
import { schemaCriarPedido } from './schemas.ts';

describe('ciclo do pedido', () => {
  it('motoboy aceita ou recusa; a central não aceita por ele', () => {
    expect(acoesPermitidas('atribuido', 'motoboy')).toEqual(['aceitar', 'recusar', 'iniciar_coleta']);
    expect(podeExecutar('aceitar', 'atribuido', 'central')).toBe(false);
  });

  it('central atribui, reatribui e cancela antes da coleta', () => {
    expect(acoesPermitidas('pendente', 'central')).toEqual(['atribuir', 'cancelar']);
    expect(podeExecutar('atribuir', 'coletando', 'central')).toBe(true);
    expect(podeExecutar('cancelar', 'em_rota', 'central')).toBe(false);
  });

  it('motoboy nunca atribui nem cancela', () => {
    for (const status of STATUS_PEDIDO) {
      expect(podeExecutar('atribuir', status, 'motoboy')).toBe(false);
      expect(podeExecutar('cancelar', status, 'motoboy')).toBe(false);
    }
  });

  it('status finais não têm saída', () => {
    for (const status of STATUS_PEDIDO.filter(statusFinal)) {
      expect(acoesPermitidas(status, 'central')).toEqual([]);
      expect(acoesPermitidas(status, 'motoboy')).toEqual([]);
    }
  });

  it('todo status não final tem ao menos uma saída para a central', () => {
    for (const status of STATUS_PEDIDO.filter((s) => !statusFinal(s))) {
      expect(acoesPermitidas(status, 'central').length).toBeGreaterThan(0);
    }
  });

  it('entregar exige código; falhar e cancelar exigem motivo', () => {
    expect(TRANSICOES.entregar.exige).toBe('codigo');
    expect(TRANSICOES.falhar.exige).toBe('motivo');
    expect(TRANSICOES.cancelar.exige).toBe('motivo');
  });
});

describe('dinheiro', () => {
  it('lê valores digitados em reais', () => {
    expect(lerReais('12,50')).toBe(1250);
    expect(lerReais('R$ 1.234,5')).toBe(123450);
    expect(lerReais('40')).toBe(4000);
    expect(lerReais('')).toBe(0);
    expect(lerReais('12,345')).toBeNull();
    expect(lerReais('abc')).toBeNull();
  });

  it('formata em reais', () => {
    expect(formatarReais(123450).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
  });
});

describe('schemaCriarPedido', () => {
  const base = {
    coleta: {
      endereco: { logradouro: 'Rua Paraná', numero: '100', bairro: 'Centro', cidade: 'Cascavel', uf: 'pr' },
    },
    entrega: {
      nome: 'Ana',
      telefone: '(45) 99999-1111',
      endereco: { cep: '85810-000', logradouro: 'Av. Brasil', numero: '2000', bairro: 'Centro', cidade: 'Cascavel', uf: 'PR' },
    },
    formaPagamento: 'dinheiro',
    valorACobrarCentavos: 4500,
  };

  it('aceita pedido em dinheiro com troco', () => {
    const r = schemaCriarPedido.parse({ ...base, trocoParaCentavos: 5000 });
    expect(r.coleta.endereco.uf).toBe('PR');
    expect(r.entrega.endereco.cep).toBe('85810000');
    expect(r.taxaEntregaCentavos).toBe(0);
  });

  it('recusa troco menor que o valor e troco fora do dinheiro', () => {
    const menor = schemaCriarPedido.safeParse({ ...base, trocoParaCentavos: 2000 });
    expect(menor.error?.issues[0]?.path).toEqual(['trocoParaCentavos']);
    const pix = schemaCriarPedido.safeParse({ ...base, formaPagamento: 'pix', trocoParaCentavos: 5000 });
    expect(pix.error?.issues[0]?.message).toBe('Troco só vale para pagamento em dinheiro.');
  });

  it('pedido já pago não cobra nada; os demais precisam de valor', () => {
    expect(schemaCriarPedido.safeParse({ ...base, formaPagamento: 'pago' }).success).toBe(false);
    expect(schemaCriarPedido.safeParse({ ...base, formaPagamento: 'pago', valorACobrarCentavos: 0 }).success).toBe(true);
    expect(schemaCriarPedido.safeParse({ ...base, formaPagamento: 'pix', valorACobrarCentavos: 0 }).success).toBe(false);
  });
});
