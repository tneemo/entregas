import { describe, expect, it } from 'vitest';
import {
  formatarCnpj,
  formatarTelefone,
  interpretarLogin,
  normalizarTelefone,
  validarCnpj,
  validarCpf,
} from './validacao.ts';
import { podeConvidar } from './papeis.ts';
import { schemaCriarEmpresa } from './schemas.ts';

describe('validarCpf', () => {
  it('aceita CPF válido com e sem máscara', () => {
    expect(validarCpf('529.982.247-25')).toBe(true);
    expect(validarCpf('52998224725')).toBe(true);
  });

  it('rejeita dígito verificador errado, tamanho errado e repetidos', () => {
    expect(validarCpf('529.982.247-24')).toBe(false);
    expect(validarCpf('5299822472')).toBe(false);
    expect(validarCpf('111.111.111-11')).toBe(false);
  });
});

describe('validarCnpj', () => {
  it('aceita CNPJ numérico', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('aceita CNPJ alfanumérico (exemplo da Receita Federal)', () => {
    expect(validarCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(validarCnpj('12abc34501de35')).toBe(true);
  });

  it('rejeita DV errado, letra no DV e repetidos', () => {
    expect(validarCnpj('11.222.333/0001-82')).toBe(false);
    expect(validarCnpj('12ABC34501DE3A')).toBe(false);
    expect(validarCnpj('00000000000000')).toBe(false);
  });

  it('formata', () => {
    expect(formatarCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });
});

describe('normalizarTelefone', () => {
  it('normaliza celular de Cascavel (DDD 45) para E.164', () => {
    expect(normalizarTelefone('(45) 99999-8888')).toBe('+5545999998888');
    expect(normalizarTelefone('+55 45 99999-8888')).toBe('+5545999998888');
    expect(normalizarTelefone('5545999998888')).toBe('+5545999998888');
  });

  it('aceita fixo e rejeita inválidos', () => {
    expect(normalizarTelefone('45 3222-1111')).toBe('+554532221111');
    expect(normalizarTelefone('45 8999-8888')).toBeNull(); // 8 dígitos começando com 8
    expect(normalizarTelefone('10 99999-8888')).toBeNull(); // DDD inexistente
    expect(normalizarTelefone('99999-8888')).toBeNull(); // sem DDD
  });

  it('formata', () => {
    expect(formatarTelefone('+5545999998888')).toBe('(45) 99999-8888');
  });
});

describe('interpretarLogin', () => {
  it('reconhece e-mail', () => {
    expect(interpretarLogin(' Joao@Exemplo.com ')).toEqual({ tipo: 'email', email: 'joao@exemplo.com' });
  });

  it('reconhece CPF e telefone', () => {
    expect(interpretarLogin('529.982.247-25').cpf).toBe('52998224725');
    expect(interpretarLogin('(45) 99999-8888').telefone).toBe('+5545999998888');
  });
});

describe('podeConvidar', () => {
  it('admin convida qualquer papel; despachante só motoboy; motoboy ninguém', () => {
    expect(podeConvidar('admin', 'admin')).toBe(true);
    expect(podeConvidar('despachante', 'motoboy')).toBe(true);
    expect(podeConvidar('despachante', 'despachante')).toBe(false);
    expect(podeConvidar('motoboy', 'motoboy')).toBe(false);
  });
});

describe('schemaCriarEmpresa', () => {
  it('normaliza CNPJ, telefone e e-mail', () => {
    const r = schemaCriarEmpresa.parse({
      tipo: 'loja',
      razaoSocial: 'Pizzaria Oeste Ltda',
      nomeFantasia: 'Pizzaria Oeste',
      cnpj: '11.222.333/0001-81',
      cidadeId: 'c1',
      telefone: '(45) 3222-1111',
      email: 'Contato@PizzariaOeste.com.br',
    });
    expect(r.cnpj).toBe('11222333000181');
    expect(r.telefone).toBe('+554532221111');
    expect(r.email).toBe('contato@pizzariaoeste.com.br');
  });

  it('devolve mensagem em português para CNPJ inválido', () => {
    const r = schemaCriarEmpresa.safeParse({
      tipo: 'loja',
      razaoSocial: 'Loja X Ltda',
      nomeFantasia: 'Loja X',
      cnpj: '123',
      cidadeId: 'c1',
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('CNPJ inválido.');
  });
});
