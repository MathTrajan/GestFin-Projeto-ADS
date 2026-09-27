'use strict';

const express = require('express');

const servico = require('./dashboard.service');
const { rota } = require('../../middleware/error-handler');
const { exigirSessao } = require('../../middleware/auth');
const validar = require('../../middleware/validate');

const router = express.Router();
router.use(exigirSessao);

// RF53 a RF60
router.get(
  '/',
  validar.consulta({ month: { tipo: 'data', obrigatorio: true } }),
  rota(async (req, res) => {
    res.json(await servico.montarPainel(req.householdId, req.filtros.month));
  }),
);

module.exports = { router };
