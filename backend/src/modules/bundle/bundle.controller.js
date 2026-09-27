'use strict';

const express = require('express');

const servico = require('./bundle.service');
const { rota } = require('../../middleware/error-handler');
const { exigirSessao } = require('../../middleware/auth');
const validar = require('../../middleware/validate');

const router = express.Router();
router.use(exigirSessao);

// RF63 — treze meses em uma resposta
router.get(
  '/',
  validar.consulta({ month: { tipo: 'data', obrigatorio: true } }),
  rota(async (req, res) => {
    res.json(await servico.montar(req.householdId, req.filtros.month));
  }),
);

module.exports = { router };
