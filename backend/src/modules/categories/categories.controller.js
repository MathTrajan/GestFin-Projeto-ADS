'use strict';

const express = require('express');

const servico = require('./categories.service');
const { rota } = require('../../middleware/error-handler');
const { exigirSessao } = require('../../middleware/auth');
const validar = require('../../middleware/validate');
const { startOfMonth } = require('../../shared/dates');

const router = express.Router();
router.use(exigirSessao);

const ESQUEMA = {
  name: { tipo: 'texto', obrigatorio: true, max: 60 },
  icon: { tipo: 'texto', max: 40, padrao: 'tag' },
  colorBg: { tipo: 'cor', padrao: '#EEEDFE' },
  colorFg: { tipo: 'cor', padrao: '#6D28D9' },
  parentId: { tipo: 'uuid', aceitaNulo: true },
  sortOrder: { tipo: 'inteiro', min: 0 },
  monthlyBudget: { tipo: 'numero', positivo: true, aceitaNulo: true },
};

/** Na edição nenhum campo é obrigatório: altera-se apenas o que foi enviado. */
const ESQUEMA_EDICAO = Object.fromEntries(
  Object.entries(ESQUEMA).map(([campo, regra]) => [
    campo,
    { ...regra, obrigatorio: false, padrao: undefined },
  ]),
);

// RF11, RF12 — categorias da residência.
//
// Sem parâmetro devolve a ÁRVORE (categorias de topo com as suas subordinadas),
// que é o formato usado pelos seletores de lançamento. Com `all=1` devolve a
// lista plana, usada pela tela de gerenciamento de categorias.
router.get(
  '/',
  validar.consulta({ all: { tipo: 'texto', obrigatorio: false } }),
  rota(async (req, res) => {
    const listaPlana = req.filtros.all === '1';
    const categories = listaPlana
      ? await servico.listar(req.householdId)
      : await servico.listarEmArvore(req.householdId);
    res.json({ categories });
  }),
);

// RF16 — gasto do mês por categoria
router.get(
  '/summary',
  validar.consulta({ month: { tipo: 'data', obrigatorio: true } }),
  rota(async (req, res) => {
    res.json(await servico.resumoDoMes(req.householdId, startOfMonth(req.filtros.month)));
  }),
);

router.post(
  '/',
  validar.corpo(ESQUEMA),
  rota(async (req, res) => {
    res.status(201).json({ category: await servico.criar(req.householdId, req.dados) });
  }),
);

// RF13, RF14 — edição, inclusive do teto mensal
router.patch(
  '/:id',
  validar.parametros({ id: { tipo: 'uuid', obrigatorio: true } }),
  validar.corpo(ESQUEMA_EDICAO),
  rota(async (req, res) => {
    const category = await servico.atualizar(req.householdId, req.parametros.id, req.dados);
    res.json({ category });
  }),
);

// RF15 — arquiva, preservando o histórico
router.delete(
  '/:id',
  validar.parametros({ id: { tipo: 'uuid', obrigatorio: true } }),
  rota(async (req, res) => {
    const category = await servico.arquivar(req.householdId, req.parametros.id);
    res.json({ ok: true, category });
  }),
);

module.exports = { router };
