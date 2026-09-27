'use strict';

const db = require('../../config/database');

const CAMPOS = `r.id, r.household_id, r.created_by_user_id, r.category_id, r.payment_method_id,
                r.kind, r.description, r.amount, r.day_of_month, r.status, r.active,
                r.start_month, r.end_month`;

/** Regras da residência, com categoria e forma, para a tela de recorrentes. */
async function listar(householdId) {
  return db.rows(
    `SELECT ${CAMPOS},
            c.name AS category_name, c.icon AS category_icon, c.color_fg AS category_color,
            m.name AS method_name, m.kind AS method_kind, m.color AS method_color
       FROM recurring_rules r
       JOIN categories c ON c.id = r.category_id
       JOIN payment_methods m ON m.id = r.payment_method_id
      WHERE r.household_id = $1
      ORDER BY r.active DESC, r.day_of_month`,
    [householdId],
  );
}

async function buscarPorId(id, householdId) {
  return db.row(`SELECT ${CAMPOS} FROM recurring_rules r WHERE r.id = $1 AND r.household_id = $2`, [
    id,
    householdId,
  ]);
}

/**
 * Regras vigentes que podem gerar lançamento em algum dos meses informados.
 *
 * A janela começa um mês antes do primeiro alvo porque a cobrança do mês
 * anterior pode rolar para dentro da janela, quando cai depois do fechamento do
 * cartão.
 */
async function vigentesNoPeriodo(householdId, primeiroMes, ultimoMes) {
  return db.rows(
    `SELECT r.id, r.created_by_user_id, r.category_id, r.payment_method_id,
            r.kind, r.description, r.amount, r.day_of_month, r.status,
            r.start_month, r.end_month,
            m.kind AS method_kind, m.closing_day, m.due_day
       FROM recurring_rules r
       JOIN payment_methods m ON m.id = r.payment_method_id
      WHERE r.household_id = $1
        AND r.active = true
        AND r.start_month <= $3
        AND (r.end_month IS NULL OR r.end_month >= $2)`,
    [householdId, primeiroMes, ultimoMes],
  );
}

/** Pares de regra e mês já materializados, para não repetir o trabalho. */
async function jaMaterializados(householdId, meses) {
  if (meses.length === 0) return [];
  return db.rows(
    `SELECT recurring_rule_id, reference_month
       FROM transactions
      WHERE household_id = $1
        AND recurring_rule_id IS NOT NULL
        AND reference_month = ANY($2::date[])`,
    [householdId, meses],
  );
}

/**
 * Insere os lançamentos gerados, ignorando os que já existirem.
 *
 * ON CONFLICT DO NOTHING é o que torna a materialização idempotente (RN08).
 * Verificar antes e inserir depois não bastaria: duas requisições simultâneas
 * passariam pela verificação antes de qualquer uma inserir. A garantia precisa
 * estar no banco.
 */
async function inserirGerados(linhas) {
  if (linhas.length === 0) return 0;

  const valores = [];
  const marcadores = linhas.map((linha, i) => {
    const base = i * 10;
    valores.push(
      linha.householdId,
      linha.createdByUserId,
      linha.categoryId,
      linha.paymentMethodId,
      linha.recurringRuleId,
      linha.kind,
      linha.description,
      linha.amount,
      linha.transactionDate,
      linha.referenceMonth,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5},
             $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10},
             (SELECT status FROM recurring_rules WHERE id = $${base + 5}), 'Recorrente')`;
  });

  const resultado = await db.query(
    `INSERT INTO transactions
       (household_id, created_by_user_id, category_id, payment_method_id, recurring_rule_id,
        kind, description, amount, transaction_date, reference_month, status, notes)
     VALUES ${marcadores.join(', ')}
     ON CONFLICT (recurring_rule_id, reference_month) DO NOTHING`,
    valores,
  );
  return resultado.rowCount;
}

async function criar(householdId, userId, dados) {
  return db.row(
    `INSERT INTO recurring_rules
       (household_id, created_by_user_id, category_id, payment_method_id,
        kind, description, amount, day_of_month, status, start_month, end_month)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${CAMPOS.replace(/r\./g, '')}`,
    [
      householdId,
      userId,
      dados.categoryId,
      dados.paymentMethodId,
      dados.kind,
      dados.description,
      dados.amount,
      dados.dayOfMonth,
      dados.status ?? 'pending',
      dados.startMonth,
      dados.endMonth ?? null,
    ],
  );
}

async function atualizar(id, householdId, alteracoes) {
  const COLUNAS = {
    kind: 'kind',
    description: 'description',
    amount: 'amount',
    categoryId: 'category_id',
    paymentMethodId: 'payment_method_id',
    dayOfMonth: 'day_of_month',
    status: 'status',
    active: 'active',
    startMonth: 'start_month',
    endMonth: 'end_month',
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
    `UPDATE recurring_rules SET ${atribuicoes.join(', ')}
      WHERE id = $1 AND household_id = $2
      RETURNING ${CAMPOS.replace(/r\./g, '')}`,
    valores,
  );
}

/**
 * Exclui a regra preservando os lançamentos já gerados (RF41).
 *
 * Os lançamentos são desvinculados antes: apagar o histórico financeiro porque a
 * regra deixou de existir seria perda de dado real.
 */
async function excluir(id, householdId) {
  return db.transaction(async (tx) => {
    await tx.query(
      'UPDATE transactions SET recurring_rule_id = NULL WHERE recurring_rule_id = $1 AND household_id = $2',
      [id, householdId],
    );
    await tx.query('DELETE FROM recurring_rules WHERE id = $1 AND household_id = $2', [
      id,
      householdId,
    ]);
  });
}

module.exports = {
  listar,
  buscarPorId,
  vigentesNoPeriodo,
  jaMaterializados,
  inserirGerados,
  criar,
  atualizar,
  excluir,
};
