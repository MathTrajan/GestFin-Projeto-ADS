'use strict';
/**
 * Middlewares de autenticação.
 *
 * `exigirDestravamento` cobre o primeiro estágio: o código de acesso da casa foi
 * digitado. Vale para rotas acessíveis antes da escolha do perfil, como a lista
 * de membros, para que nada seja exposto sem o código.
 *
 * `exigirSessao` cobre os dois estágios: identidade e destravamento. É o que
 * protege todas as rotas de dados.
 */

const authService = require('../modules/auth/auth.service');
const presenca = require('../modules/auth/presence.service');
const { UnauthorizedError } = require('../shared/errors');

/**
 * Exige que o código de acesso tenha sido digitado.
 *
 * Quando ainda não há código configurado, libera: é a primeira execução, e
 * exigir um código que não existe deixaria o sistema inacessível.
 */
async function exigirDestravamento(req, _res, next) {
  try {
    const casa = await authService.residencia();
    if (!casa || !casa.pin_hash) return next();

    const token = req.signedCookies[authService.COOKIE_DESTRAVADO];
    if (!authService.destravamentoValido(token, casa.pin_hash)) {
      throw new UnauthorizedError('Acesso bloqueado. Informe o código de acesso.', 'locked');
    }
    return next();
  } catch (erro) {
    return next(erro);
  }
}

/** Exige identidade e destravamento. Preenche req.membro. */
async function exigirSessao(req, _res, next) {
  try {
    // Cookie assinado: seu valor não pode ser forjado sem o segredo do servidor
    const userId = req.signedCookies[authService.COOKIE_SESSAO];
    if (!userId) throw new UnauthorizedError('Sessão não encontrada. Entre com o seu perfil.');

    const membro = await authService.membroPorId(userId);
    if (!membro) throw new UnauthorizedError('Sessão inválida. Entre novamente.');

    if (membro.pin_hash) {
      const token = req.signedCookies[authService.COOKIE_DESTRAVADO];
      if (!authService.destravamentoValido(token, membro.pin_hash)) {
        throw new UnauthorizedError('Acesso bloqueado. Informe o código de acesso.', 'locked');
      }
    }

    // Presença só é registrada após a autenticação completa
    presenca.registrar(membro.id);

    req.membro = membro;
    req.householdId = membro.household_id;
    return next();
  } catch (erro) {
    return next(erro);
  }
}

module.exports = { exigirDestravamento, exigirSessao };
