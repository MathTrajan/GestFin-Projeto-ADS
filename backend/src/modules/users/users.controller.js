'use strict';
/**
 * Perfis e presença.
 *
 * A lista de perfis fica atrás do destravamento (não da sessão), porque é ela
 * que a tela de entrada consulta antes de existir sessão. A presença exige
 * sessão completa: quem está online só interessa a quem já entrou.
 */

const express = require('express');

const repositorio = require('./users.repository');
const authService = require('../auth/auth.service');
const presenca = require('../auth/presence.service');
const { rota } = require('../../middleware/error-handler');
const { exigirSessao, exigirDestravamento } = require('../../middleware/auth');
const validar = require('../../middleware/validate');

const router = express.Router();

const ICONES_PERMITIDOS = [
  'user', 'heart', 'star', 'smile', 'coffee', 'music', 'camera', 'book',
  'cat', 'dog', 'flower', 'sun', 'moon', 'rocket', 'crown', 'gamepad',
];

// Precisa ser IDÊNTICA a AVATAR_COLORS em frontend/src/app/shared/colors.ts:
// o seletor oferece exatamente estas, e qualquer outra é recusada com 400.
const CORES_PERMITIDAS = [
  '#1E3A8A', '#0369A1', '#0F766E', '#15803D',
  '#B45309', '#B91C1C', '#BE185D', '#6D28D9',
];

const comoPerfil = (m) => ({
  id: m.id,
  name: m.name,
  avatarColor: m.avatar_color,
  avatarInitial: m.avatar_initial,
  avatarIcon: m.avatar_icon,
  householdName: m.household_name,
});

// RF05 — perfis disponíveis para entrada
router.get(
  '/',
  exigirDestravamento,
  rota(async (_req, res) => {
    const membros = await repositorio.listar();
    res.json({ users: membros.map(comoPerfil) });
  }),
);

// RF10 — quem está online, e quando cada um foi visto
router.get(
  '/online',
  exigirSessao,
  rota(async (_req, res) => {
    const membros = await repositorio.listar();
    res.json({
      users: membros.map((m) => ({
        ...comoPerfil(m),
        online: presenca.estaOnline(m.id),
        lastSeenAt: presenca.vistoEm(m.id),
      })),
    });
  }),
);

// RF09 — personalização do próprio avatar
router.patch(
  '/me/avatar',
  exigirSessao,
  validar.corpo({
    icon: { tipo: 'opcao', valores: ICONES_PERMITIDOS, aceitaNulo: true },
    color: { tipo: 'opcao', valores: CORES_PERMITIDAS },
  }),
  rota(async (req, res) => {
    const icone = req.dados.icon === undefined ? null : req.dados.icon;
    await repositorio.atualizarAvatar(req.membro.id, { icone, cor: req.dados.color });

    // O membro vive no cache de identidade: sem invalidar, a mudança só
    // apareceria depois de um minuto.
    authService.invalidarCache();

    const atualizado = await repositorio.buscarPorId(req.membro.id);
    res.json({ ok: true, user: comoPerfil(atualizado) });
  }),
);

module.exports = { router };
