'use strict';

const db = require('../../config/database');

const CAMPOS = `id, household_id, name, kind, owner_label, color,
                limit_value, closing_day, due_day, archived`;

async function listarAtivas(householdId) {
  return db.rows(
    `SELECT ${CAMPOS} FROM payment_methods
      WHERE household_id = $1 AND archived = false
      ORDER BY created_at`,
    [householdId],
  );
}

async function buscarPorId(id, householdId) {
  return db.row(`SELECT ${CAMPOS} FROM payment_methods WHERE id = $1 AND household_id = $2`, [
    id,
    householdId,
  ]);
}

async function criar(householdId, dados) {
  return db.row(
    `INSERT INTO payment_methods
       (household_id, name, kind, owner_label, color, limit_value, closing_day, due_day)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${CAMPOS}`,
    [
      householdId,
      dados.name,
      dados.kind,
      dados.ownerLabel ?? null,
      dados.color,
      dados.limitValue ?? null,
      dados.closingDay ?? null,
      dados.dueDay ?? null,
    ],
  );
}

async function atualizar(id, householdId, alteracoes) {
  const COLUNAS = {
    name: 'name',
    kind: 'kind',
    ownerLabel: 'owner_label',
    color: 'color',
    limitValue: 'limit_value',
    closingDay: 'closing_day',
    dueDay: 'due_day',
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
    `UPDATE payment_methods SET ${atribuicoes.join(', ')}
      WHERE id = $1 AND household_id = $2
      RETURNING ${CAMPOS}`,
    valores,
  );
}

async function arquivar(id, householdId) {
  return db.row(
    `UPDATE payment_methods SET archived = true
      WHERE id = $1 AND household_id = $2
      RETURNING ${CAMPOS}`,
    [id, householdId],
  );
}

/** Movimentação do mês que afeta o uso do cartão. */
async function movimentacaoDoMes(householdId, referenceMonth) {
  return db.rows(
    `SELECT payment_method_id, kind, amount
       FROM transactions
      WHERE household_id = $1
        AND archived = false
        AND reference_month = $2
        AND kind IN ('expense', 'investment', 'card_payment')`,
    [householdId, referenceMonth],
  );
}

/**
 * Parcelas agendadas de meses posteriores ao exibido.
 *
 * É o que transforma o "em aberto do mês" no "limite comprometido": no crédito
 * brasileiro, a parcela de dezembro já ocupa limite hoje.
 */
async function agendadasFuturas(householdId, referenceMonth) {
  return db.rows(
    `SELECT payment_method_id, amount
       FROM transactions
      WHERE household_id = $1
        AND archived = false
        AND status = 'scheduled'
        AND kind IN ('expense', 'investment')
        AND reference_month > $2`,
    [householdId, referenceMonth],
  );
}

module.exports = {
  listarAtivas,
  buscarPorId,
  criar,
  atualizar,
  arquivar,
  movimentacaoDoMes,
  agendadasFuturas,
};
