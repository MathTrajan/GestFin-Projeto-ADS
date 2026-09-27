'use strict';
/**
 * Regras de categorias.
 *
 * A hierarquia tem no máximo dois níveis. Esse limite não é expressável em
 * restrição do banco sem gatilho, então é garantido aqui, e o documento de
 * modelagem registra que essa garantia mora na aplicação.
 */

const repositorio = require('./categories.repository');
const { buildCategorySummary } = require('../../shared/month-summary');
const { NotFoundError, ValidationError } = require('../../shared/errors');

/** Converte a linha do banco para o formato consumido pelo front-end. */
const comoCategoria = (c) => ({
  id: c.id,
  parentId: c.parent_id,
  name: c.name,
  icon: c.icon,
  colorBg: c.color_bg,
  colorFg: c.color_fg,
  sortOrder: c.sort_order,
  monthlyBudget: c.monthly_budget,
  archived: c.archived,
});

/** Lista plana das categorias ativas. */
async function listar(householdId) {
  const categorias = await repositorio.listarAtivas(householdId);
  return categorias.map(comoCategoria);
}

/** Árvore de categorias: cada categoria de topo com as suas subordinadas. */
async function listarEmArvore(householdId) {
  const categorias = await repositorio.listarAtivas(householdId);
  const topo = categorias.filter((c) => c.parent_id === null);
  return topo.map((pai) => ({
    ...comoCategoria(pai),
    children: categorias.filter((c) => c.parent_id === pai.id).map(comoCategoria),
  }));
}

/**
 * Valida a categoria de topo escolhida.
 *
 * Recusa três situações: categoria inexistente ou de outra residência, categoria
 * apontando para si mesma, e subcategoria sendo usada como pai, que criaria um
 * terceiro nível.
 */
async function validarCategoriaPai(householdId, parentId, idAtual) {
  if (!parentId) return;
  if (parentId === idAtual) {
    throw new ValidationError('Uma categoria não pode ser subordinada a si mesma.', 'parentId');
  }
  const pai = await repositorio.buscarPorId(parentId, householdId);
  if (!pai) throw new ValidationError('Categoria superior inválida.', 'parentId');
  if (pai.parent_id) {
    throw new ValidationError(
      'Só categorias principais podem ter subcategorias. A hierarquia tem no máximo dois níveis.',
      'parentId',
    );
  }
}

async function criar(householdId, dados) {
  await validarCategoriaPai(householdId, dados.parentId);
  const criada = await repositorio.criar(householdId, dados);
  return comoCategoria(criada);
}

async function atualizar(householdId, id, alteracoes) {
  const existente = await repositorio.buscarPorId(id, householdId);
  if (!existente) throw new NotFoundError('Categoria não encontrada.');

  if (alteracoes.parentId !== undefined) {
    await validarCategoriaPai(householdId, alteracoes.parentId, id);
  }

  const atualizada = await repositorio.atualizar(id, householdId, alteracoes);
  return comoCategoria(atualizada);
}

async function arquivar(householdId, id) {
  const existente = await repositorio.buscarPorId(id, householdId);
  if (!existente) throw new NotFoundError('Categoria não encontrada.');
  const arquivada = await repositorio.arquivar(id, householdId);
  return comoCategoria(arquivada);
}

/**
 * Gasto do mês por categoria de topo (RF16).
 *
 * A agregação usa a função compartilhada, a mesma do painel: as duas telas nunca
 * podem divergir (decisão DA01).
 */
async function resumoDoMes(householdId, referenceMonth) {
  const linhas = await repositorio.despesasDoMes(householdId, referenceMonth);

  const lancamentos = linhas.map((l) => ({
    kind: l.kind,
    amount: l.amount,
    category: {
      id: l.cat_id,
      name: l.cat_name,
      icon: l.cat_icon,
      colorFg: l.cat_color_fg,
      colorBg: l.cat_color_bg,
      monthlyBudget: l.cat_budget,
      parent: l.pai_id
        ? {
            id: l.pai_id,
            name: l.pai_name,
            icon: l.pai_icon,
            colorFg: l.pai_color_fg,
            colorBg: l.pai_color_bg,
            monthlyBudget: l.pai_budget,
          }
        : null,
    },
  }));

  return buildCategorySummary(lancamentos);
}

module.exports = { listar, listarEmArvore, criar, atualizar, arquivar, resumoDoMes, comoCategoria };
