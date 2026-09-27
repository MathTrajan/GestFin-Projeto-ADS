'use strict';

const express = require('express');

const servico = require('./transactions.service');
const { rota } = require('../../middleware/error-handler');
const { exigirSessao } = require('../../middleware/auth');
const validar = require('../../middleware/validate');

const router = express.Router();
router.use(exigirSessao);

const TIPOS = ['income', 'expense', 'investment', 'card_payment'];
const SITUACOES = ['paid', 'pending', 'scheduled'];

const ESQUEMA = {
  kind: { tipo: 'opcao', valores: TIPOS, obrigatorio: true },
  description: { tipo: 'texto', obrigatorio: true, max: 160 },
  amount: { tipo: 'numero', positivo: true, obrigatorio: true },
  // Opcional no esquema porque pagamento de fatura não tem categoria.
  // O serviço exige para os demais tipos.
  categoryId: { tipo: 'uuid' },
  paymentMethodId: { tipo: 'uuid', obrigatorio: true },
  transactionDate: { tipo: 'data', obrigatorio: true },
  purchaseDate: { tipo: 'data', aceitaNulo: true },
  status: { tipo: 'opcao', valores: SITUACOES, padrao: 'paid' },
  notes: { tipo: 'texto', max: 500, obrigatorio: false, aceitaNulo: true },
  // Teto de segurança: uma requisição malformada não pode criar milhares de linhas
  totalInstallments: { tipo: 'inteiro', min: 1, max: 60 },
  currentInstallment: { tipo: 'inteiro', min: 1, max: 60 },
  paidByUserId: { tipo: 'uuid' },
  referenceMonth: { tipo: 'data' },
};

const ESQUEMA_EDICAO = Object.fromEntries(
  Object.entries(ESQUEMA)
    .filter(([campo]) => !['totalInstallments', 'currentInstallment'].includes(campo))
    .map(([campo, regra]) => [campo, { ...regra, obrigatorio: false, padrao: undefined }]),
);

// RF28, RF29, RF30
router.get(
  '/',
  validar.consulta({
    month: { tipo: 'data', obrigatorio: true },
    kind: { tipo: 'opcao', valores: TIPOS },
    categoryId: { tipo: 'uuid' },
    paymentMethodId: { tipo: 'uuid' },
    q: { tipo: 'texto', max: 120, obrigatorio: false },
  }),
  rota(async (req, res) => {
    const { month, ...filtros } = req.filtros;
    const transactions = await servico.listar(req.householdId, month, filtros);
    res.json({ transactions });
  }),
);

// RF23 a RF27, RF34 a RF36
router.post(
  '/',
  validar.corpo(ESQUEMA),
  rota(async (req, res) => {
    const resultado = await servico.criar(req.householdId, req.membro.id, req.dados);
    res.status(201).json(resultado.plan ? resultado : { transaction: resultado });
  }),
);

// RF37 — correção de numeração. Declarada ANTES de /:id para que o Express não
// interprete "plans" como um identificador.
router.patch(
  '/plans/:planId/renumber',
  validar.parametros({ planId: { tipo: 'uuid', obrigatorio: true } }),
  validar.corpo({
    month: { tipo: 'data', obrigatorio: true },
    number: { tipo: 'inteiro', min: 1, max: 60, obrigatorio: true },
    total: { tipo: 'inteiro', min: 1, max: 60, obrigatorio: true },
  }),
  rota(async (req, res) => {
    const plan = await servico.renumerarPlano(
      req.householdId,
      req.parametros.planId,
      req.dados.month,
      req.dados.number,
      req.dados.total,
    );
    res.json({ ok: true, plan });
  }),
);

// RF31, RF32
router.patch(
  '/:id',
  validar.parametros({ id: { tipo: 'uuid', obrigatorio: true } }),
  validar.corpo(ESQUEMA_EDICAO),
  rota(async (req, res) => {
    const transaction = await servico.atualizar(req.householdId, req.parametros.id, req.dados);
    res.json({ transaction });
  }),
);

// RF33 — arquiva, preservando o histórico
router.delete(
  '/:id',
  validar.parametros({ id: { tipo: 'uuid', obrigatorio: true } }),
  rota(async (req, res) => {
    await servico.arquivar(req.householdId, req.parametros.id);
    res.json({ ok: true });
  }),
);

// RF33 — desfaz o arquivamento
router.post(
  '/:id/restore',
  validar.parametros({ id: { tipo: 'uuid', obrigatorio: true } }),
  rota(async (req, res) => {
    const transaction = await servico.restaurar(req.householdId, req.parametros.id);
    res.json({ ok: true, transaction });
  }),
);

module.exports = { router };
