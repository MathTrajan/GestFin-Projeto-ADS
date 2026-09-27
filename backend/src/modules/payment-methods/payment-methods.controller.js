'use strict';

const express = require('express');

const servico = require('./payment-methods.service');
const { rota } = require('../../middleware/error-handler');
const { exigirSessao } = require('../../middleware/auth');
const validar = require('../../middleware/validate');
const { startOfMonth } = require('../../shared/dates');

const router = express.Router();
router.use(exigirSessao);

const TIPOS = ['credit_card', 'pix', 'boleto', 'debit', 'cash'];

const ESQUEMA = {
  name: { tipo: 'texto', obrigatorio: true, max: 60 },
  kind: { tipo: 'opcao', valores: TIPOS, obrigatorio: true },
  ownerLabel: { tipo: 'texto', max: 40, obrigatorio: false, aceitaNulo: true },
  color: { tipo: 'cor', padrao: '#1E3A8A' },
  limitValue: { tipo: 'numero', positivo: true, aceitaNulo: true },
  closingDay: { tipo: 'inteiro', min: 1, max: 31, aceitaNulo: true },
  dueDay: { tipo: 'inteiro', min: 1, max: 31, aceitaNulo: true },
};

const ESQUEMA_EDICAO = Object.fromEntries(
  Object.entries(ESQUEMA).map(([campo, regra]) => [
    campo,
    { ...regra, obrigatorio: false, padrao: undefined },
  ]),
);

// RF21 — formas com uso do mês e limite comprometido
router.get(
  '/',
  validar.consulta({ month: { tipo: 'data', obrigatorio: true } }),
  rota(async (req, res) => {
    const paymentMethods = await servico.listarComUso(
      req.householdId,
      startOfMonth(req.filtros.month),
    );
    res.json({ paymentMethods });
  }),
);

// RF17, RF18
router.post(
  '/',
  validar.corpo(ESQUEMA),
  rota(async (req, res) => {
    res.status(201).json({ paymentMethod: await servico.criar(req.householdId, req.dados) });
  }),
);

// RF19
router.patch(
  '/:id',
  validar.parametros({ id: { tipo: 'uuid', obrigatorio: true } }),
  validar.corpo(ESQUEMA_EDICAO),
  rota(async (req, res) => {
    const paymentMethod = await servico.atualizar(req.householdId, req.parametros.id, req.dados);
    res.json({ paymentMethod });
  }),
);

// RF20
router.delete(
  '/:id',
  validar.parametros({ id: { tipo: 'uuid', obrigatorio: true } }),
  rota(async (req, res) => {
    const paymentMethod = await servico.arquivar(req.householdId, req.parametros.id);
    res.json({ ok: true, paymentMethod });
  }),
);

module.exports = { router };
