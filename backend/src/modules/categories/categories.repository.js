'use strict';

const db = require('../../config/database');

const CAMPOS = `id, household_id, parent_id, name, icon, color_bg, color_fg,
                sort_order, monthly_budget, archived`;

/** Categorias ativas da residência, pais e filhas, em ordem de exibição. */
async function listarAtivas(householdId) {
  return db.rows(
    `SELECT ${CAMPOS} FROM categories
      WHERE household_id = $1 AND archived = false
      ORDER BY parent_id NULLS FIRST, sort_order, name`,
    [householdId],
  );
}

async function buscarPorId(id, householdId) {
  return db.row(`SELECT ${CAMPOS} FROM categories WHERE id = $1 AND household_id = $2`, [
    id,
    householdId,
  ]);
}

async function criar(householdId, dados) {
  return db.row(
    `INSERT INTO categories
       (household_id, parent_id, name, icon, color_bg, color_fg, sort_order, monthly_budget)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${CAMPOS}`,
    [
      householdId,
      dados.parentId ?? null,
      dados.name,
      dados.icon,
      dados.colorBg,
      dados.colorFg,
      dados.sortOrder ?? 0,
      dados.monthlyBudget ?? null,
    ],
  );
}

/**
 * Atualiza apenas os campos informados.
 *
 * COALESCE não serve aqui: ele impediria limpar um campo, e o teto de gasto
 * precisa poder voltar a "sem teto". A montagem dinâmica usa somente nomes de
 * coluna de uma lista fixa, nunca texto vindo do usuário.
 */
async function atualizar(id, householdId, alteracoes) {
  const COLUNAS = {
    name: 'name',
    icon: 'icon',
    colorBg: 'color_bg',
    colorFg: 'color_fg',
    sortOrder: 'sort_order',
    monthlyBudget: 'monthly_budget',
    parentId: 'parent_id',
  };

  const atribuicoes = [];
  const valores = [id, householdId];

  for (const [campo, coluna] of Object.entries(COLUNAS)) {
    if (alteracoes[campo] !== undefined) {
      valores.push(alteracoes[campo]);
      atribuicoes.push(`${coluna} = $${valores.length}`);
    }
  }
  if (atribuicoes.length === 0) return buscarPorId(id, householdId);

  return db.row(
    `UPDATE categories SET ${atribuicoes.join(', ')}
      WHERE id = $1 AND household_id = $2
      RETURNING ${CAMPOS}`,
    valores,
  );
}

/** Arquiva a categoria e, sendo de topo, também as subordinadas (RF15). */
async function arquivar(id, householdId) {
  return db.transaction(async (tx) => {
    await tx.query(
      'UPDATE categories SET archived = true WHERE parent_id = $1 AND household_id = $2',
      [id, householdId],
    );
    return tx.row(
      `UPDATE categories SET archived = true
        WHERE id = $1 AND household_id = $2
        RETURNING ${CAMPOS}`,
      [id, householdId],
    );
  });
}

/** Despesas do mês com a categoria e a categoria de topo, para o resumo. */
async function despesasDoMes(householdId, referenceMonth) {
  return db.rows(
    `SELECT t.kind, t.amount,
            c.id  AS cat_id,  c.name  AS cat_name,  c.icon  AS cat_icon,
            c.color_fg AS cat_color_fg, c.color_bg AS cat_color_bg,
            c.monthly_budget AS cat_budget,
            p.id  AS pai_id,  p.name  AS pai_name,  p.icon  AS pai_icon,
            p.color_fg AS pai_color_fg, p.color_bg AS pai_color_bg,
            p.monthly_budget AS pai_budget
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
      WHERE t.household_id = $1
        AND t.archived = false
        AND t.kind = 'expense'
        AND t.reference_month = $2`,
    [householdId, referenceMonth],
  );
}

module.exports = {
  listarAtivas,
  buscarPorId,
  criar,
  atualizar,
  arquivar,
  despesasDoMes,
};
