// Conversão de linhas do banco para os formatos públicos da API.
// Nada aqui pode expor senha_hash, CPF completo ou hashes de token.

import type { EmpresaResposta, UsuarioResposta } from '@entregas/shared';
import type { cidades, empresas } from '../db/schema.ts';
import type { Usuario } from '../tipos.ts';

export function usuarioResposta(u: Usuario): UsuarioResposta {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    telefone: u.telefone,
    temCpf: Boolean(u.cpf),
    superAdmin: u.superAdmin,
  };
}

export function empresaResposta(
  e: typeof empresas.$inferSelect,
  cidade: Pick<typeof cidades.$inferSelect, 'id' | 'nome' | 'uf'>,
): EmpresaResposta {
  return {
    id: e.id,
    tipo: e.tipo,
    razaoSocial: e.razaoSocial,
    nomeFantasia: e.nomeFantasia,
    cnpj: e.cnpj,
    telefone: e.telefone,
    email: e.email,
    status: e.status,
    cidade: { id: cidade.id, nome: cidade.nome, uf: cidade.uf },
    criadoEm: e.criadoEm.toISOString(),
  };
}
