import { createMiddleware } from 'hono/factory';
import type { Papel } from '@entregas/shared';
import type { AppEnv } from '../tipos.ts';
import { vinculoNaEmpresa } from '../dados/usuarios.ts';
import { naoAutenticado, naoEncontrado, proibido } from '../erros.ts';

/**
 * Porta de entrada de toda rota /empresas/:empresaId/*.
 * Confirma que o usuário tem vínculo ativo na empresa (ativa) e, se informado, um dos papéis.
 * Quem não é membro recebe 404, para não revelar que a empresa existe.
 */
export function exigirEmpresa(...papeis: Papel[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const usuario = c.var.usuario;
    if (!usuario) throw naoAutenticado();

    const empresaId = c.req.param('empresaId');
    if (!empresaId) throw naoEncontrado('Empresa não encontrada.');

    const linha = await vinculoNaEmpresa(c.var.db, empresaId, usuario.id);

    if (!linha || linha.vinculo.status !== 'ativo' || linha.statusEmpresa !== 'ativa') {
      throw naoEncontrado('Empresa não encontrada.');
    }
    if (papeis.length > 0 && !papeis.includes(linha.vinculo.papel)) throw proibido();

    c.set('empresa', {
      empresaId,
      usuarioId: usuario.id,
      vinculoId: linha.vinculo.id,
      papel: linha.vinculo.papel,
    });
    await next();
  });
}
