'use strict';

const express = require('express');

const servico = require('./recurring.service');
const { rota } = require('../../middleware/error-handler');
const { exigirSessao } = require('../../middleware/auth');
const validar = require('../../middleware/validate');

const router = express.Router();
router.use(exigirSessao);

const ESQUEMA = {
  kind: { tipo: 'opcao', valores: ['income', 'expense', 'investment'], obrigatorio: true },
  description: { tipo: 'texto', obrigatorio: true, max: 160 },
  amount: { tipo: 'numero', positivo: true, obrigatorio: true },
  categoryId: { tipo: 'uuid', obrigatorio: true },
  paymentMethodId: { tipo: 'uuid', obrigatorio: true },
  // Limitado a 28 para que a regra valha em todos os meses, inclusive fevereiro
  dayOfMonth: { tipo: 'inteiro', min: 1, max: 28, obrigatorio: true },
  status: { tipo: 'opcao', valores: ['paid', 'pending', 'scheduled'], padrao: 'pending' },
  startMonth: { tipo: 'data' },
  endMonth: { tipo: 'data', aceitaNulo: true },
};

const ESQUEMA_EDICAO = {
  ...Object.fromEntries(
    Object.entries(ESQUEMA).map(([campo, regra]) => [
      campo,
      { ...regra, obrigatorio: false, padrao: undefined },
    ]),
  ),
  active: { tipo: 'booleano' },
};

// RF38
router.get(
  '/',
  rota(async (req, res) => {
    res.json({ rules: await servico.listar(req.householdId) });
  }),
);

router.post(
  '/',
  validar.corpo(ESQUEMA),
  rota(async (req, res) => {
    const rule = await servico.criar(req.householdId, req.membro.id, req.dados);
    res.status(201).json({ rule });
  }),
);

// RF40 — edição e suspensão
router.patch(
  '/:id',
  validar.parametros({ id: { tipo: 'uuid', obrigatorio: true } }),
  validar.corpo(ESQUEMA_EDICAO),
  rota(async (req, res) => {
    const rule = await servico.atualizar(req.householdId, req.parametros.id, req.dados);
    res.json({ rule });
  }),
);

// RF41 — exclusão preservando os lançamentos gerados
router.delete(
  '/:id',
  validar.parametros({ id: { tipo: 'uuid', obrigatorio: true } }),
  rota(async (req, res) => {
    await servico.excluir(req.householdId, req.parametros.id);
    res.json({ ok: true });
  }),
);

module.exports = { router };
