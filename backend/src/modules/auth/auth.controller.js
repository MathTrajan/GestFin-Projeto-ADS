'use strict';
/**
 * Rotas de acesso.
 *
 * O controlador traduz HTTP em chamada de serviço e monta a resposta. Nenhuma
 * decisão de negócio acontece aqui.
 */

const express = require('express');

const servico = require('./auth.service');
const usuariosRepo = require('../users/users.repository');
const presenca = require('./presence.service');
const { rota } = require('../../middleware/error-handler');
const { exigirSessao, exigirDestravamento } = require('../../middleware/auth');
const validar = require('../../middleware/validate');
const { BloqueioProgressivo } = require('../../middleware/rate-limit');
const { UnauthorizedError, RateLimitError } = require('../../shared/errors');
const { producao } = require('../../config/env');

const router = express.Router();
const bloqueio = new BloqueioProgressivo();

/** Formato do membro devolvido ao front-end. */
const comoSessao = (m) => ({
  id: m.id,
  name: m.name,
  avatarColor: m.avatar_color,
  avatarInitial: m.avatar_initial,
  avatarIcon: m.avatar_icon,
  householdName: m.household_name,
});

// RF01 — informa se há código configurado, sem exigir autenticação
router.get(
  '/status',
  rota(async (_req, res) => {
    res.json(await servico.situacaoDoAcesso());
  }),
);

// RF02, RF03 — destrava o acesso com o código da residência
router.post(
  '/unlock',
  validar.corpo({ pin: { tipo: 'texto', obrigatorio: true, max: 8 } }),
  rota(async (req, res) => {
    const espera = bloqueio.esperaRestante(req.ip);
    if (espera > 0) {
      const minutos = Math.ceil(espera / 60);
      throw new RateLimitError(
        `Muitas tentativas. Aguarde ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`,
        espera,
      );
    }

    const pinHash = await servico.verificarCodigo(req.dados.pin);
    if (!pinHash) {
      bloqueio.registrarFalha(req.ip);
      // Mensagem genérica: não informa quantos dígitos coincidem
      throw new UnauthorizedError('Código de acesso incorreto.');
    }

    bloqueio.registrarSucesso(req.ip);
    // Cookie de sessão do navegador (sem validade): fechar o navegador re-trava
    res.cookie(
      servico.COOKIE_DESTRAVADO,
      servico.tokenDeDestravamento(pinHash),
      servico.opcoesDeCookie(producao),
    );
    res.json({ ok: true });
  }),
);

// RF04 — define ou altera o código da residência
router.post(
  '/set-pin',
  exigirSessao,
  validar.corpo({ pin: { tipo: 'texto', obrigatorio: true, max: 8 } }),
  rota(async (req, res) => {
    const pinHash = await servico.definirCodigo(req.householdId, req.dados.pin);
    // Renova o destravamento de quem acabou de definir, para não se desconectar
    res.cookie(
      servico.COOKIE_DESTRAVADO,
      servico.tokenDeDestravamento(pinHash),
      servico.opcoesDeCookie(producao),
    );
    res.json({ ok: true });
  }),
);

// RF06 — entra com um perfil, após o acesso destravado
router.post(
  '/login',
  exigirDestravamento,
  validar.corpo({ userId: { tipo: 'uuid', obrigatorio: true } }),
  rota(async (req, res) => {
    const membro = await usuariosRepo.buscarPorId(req.dados.userId);
    if (!membro) throw new UnauthorizedError('Perfil não encontrado.');

    res.cookie(servico.COOKIE_SESSAO, membro.id, {
      ...servico.opcoesDeCookie(producao),
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true, user: comoSessao(membro) });
  }),
);

// RF07 — encerra a sessão e volta ao estado travado
router.post(
  '/logout',
  rota(async (_req, res) => {
    res.clearCookie(servico.COOKIE_SESSAO, { path: '/' });
    res.clearCookie(servico.COOKIE_DESTRAVADO, { path: '/' });
    res.json({ ok: true });
  }),
);

// RF08 — quem está autenticado
router.get(
  '/me',
  exigirSessao,
  rota(async (req, res) => {
    res.json({ user: comoSessao(req.membro) });
  }),
);

module.exports = { router, comoSessao, presenca };
