'use strict';

const db = require('../../config/database');

/**
 * Projeção usada por todas as listagens.
 *
 * Traz a categoria e a sua categoria de topo na mesma consulta: as agregações
 * sobem para o topo (RN09), e buscar o pai depois, linha a linha, multiplicaria
 * as idas ao banco.
 */
const SELECT_COMPLETO = `
  SELECT t.id, t.kind, t.description, t.amount, t.status, t.notes,
         t.transaction_date, t.purchase_date, t.reference_month,
         t.installment_plan_id, t.installment_number, t.recurring_rule_id,
         t.category_id, t.payment_method_id, t.paid_by_user_id, t.archived,
         c.name AS cat_name, c.icon AS cat_icon, c.color_fg AS cat_color_fg,
         c.color_bg AS cat_color_bg, c.parent_id AS cat_parent_id,
         c.monthly_budget AS cat_budget,
         p.id AS pai_id, p.name AS pai_name, p.icon AS pai_icon,
         p.color_fg AS pai_color_fg, p.color_bg AS pai_color_bg,
         p.monthly_budget AS pai_budget,
         m.name AS met_name, m.kind AS met_kind, m.color AS met_color,
         u.name AS pagador_nome,
         ip.total_installments
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    JOIN payment_methods m ON m.id = t.payment_method_id
    LEFT JOIN users u ON u.id = t.paid_by_user_id
    LEFT JOIN installment_plans ip ON ip.id = t.installment_plan_id`;

/**
 * Lançamentos do mês, com filtros opcionais e combináveis.
 *
 * Os filtros entram como parâmetros vinculados e são aplicados com a técnica do
 * "parâmetro nulo ignora o filtro", o que evita montar SQL por concatenação.
 */
async function listarDoMes(householdId, referenceMonth, filtros = {}) {
  return db.rows(
    `${SELECT_COMPLETO}
      WHERE t.household_id = $1
        AND t.archived = false
        AND t.reference_month = $2
        AND ($3::text IS NULL OR t.kind = $3)
        AND ($4::uuid IS NULL OR t.category_id = $4)
        AND ($5::uuid IS NULL OR t.payment_method_id = $5)
        AND ($6::text IS NULL OR
             t.description ILIKE '%' || $6 || '%' OR
             t.notes ILIKE '%' || $6 || '%')
      ORDER BY t.transaction_date DESC, t.created_at DESC`,
    [
      householdId,
      referenceMonth,
      filtros.kind ?? null,
      filtros.categoryId ?? null,
      filtros.paymentMethodId ?? null,
      filtros.q ?? null,
    ],
  );
}

/** Lançamentos de um intervalo de meses, para o painel e a pré-carga. */
async function listarDoPeriodo(householdId, primeiroMes, ultimoMes) {
  return db.rows(
    `${SELECT_COMPLETO}
      WHERE t.household_id = $1
        AND t.archived = false
        AND t.reference_month BETWEEN $2 AND $3
      ORDER BY t.transaction_date DESC, t.created_at DESC`,
    [householdId, primeiroMes, ultimoMes],
  );
}

/** Projeção enxuta para as séries do painel, sem os dados de exibição. */
async function resumoDoPeriodo(householdId, primeiroMes, ultimoMes) {
  return db.rows(
    `SELECT kind, amount, reference_month, installment_plan_id
       FROM transactions
      WHERE household_id = $1
        AND archived = false
        AND reference_month BETWEEN $2 AND $3`,
    [householdId, primeiroMes, ultimoMes],
  );
}

async function buscarPorId(id, householdId) {
  return db.row(`${SELECT_COMPLETO} WHERE t.id = $1 AND t.household_id = $2`, [id, householdId]);
}

const COLUNAS_INSERCAO = `household_id, created_by_user_id, paid_by_user_id, category_id,
                          payment_method_id, installment_plan_id, installment_number,
                          kind, description, amount, transaction_date, purchase_date,
                          reference_month, status, notes`;

const valoresDeInsercao = (l) => [
  l.householdId,
  l.createdByUserId,
  l.paidByUserId ?? null,
  l.categoryId ?? null,
  l.paymentMethodId,
  l.installmentPlanId ?? null,
  l.installmentNumber ?? null,
  l.kind,
  l.description,
  l.amount,
  l.transactionDate,
  l.purchaseDate ?? null,
  l.referenceMonth,
  l.status,
  l.notes ?? null,
];

async function inserir(lancamento, executor = db) {
  return executor.row(
    `INSERT INTO transactions (${COLUNAS_INSERCAO})
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    valoresDeInsercao(lancamento),
  );
}

async function atualizar(id, householdId, alteracoes) {
  const COLUNAS = {
    kind: 'kind',
    description: 'description',
    amount: 'amount',
    categoryId: 'category_id',
    paymentMethodId: 'payment_method_id',
    status: 'status',
    notes: 'notes',
    transactionDate: 'transaction_date',
    purchaseDate: 'purchase_date',
    referenceMonth: 'reference_month',
    paidByUserId: 'paid_by_user_id',
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

  await db.query(
    `UPDATE transactions SET ${atribuicoes.join(', ')} WHERE id = $1 AND household_id = $2`,
    valores,
  );
  return buscarPorId(id, householdId);
}

async function definirArquivamento(id, householdId, arquivado) {
  return db.row(
    'UPDATE transactions SET archived = $3 WHERE id = $1 AND household_id = $2 RETURNING id',
    [id, householdId, arquivado],
  );
}

// --- Parcelamentos ----------------------------------------------------------

async function criarPlano(plano, executor) {
  return executor.row(
    `INSERT INTO installment_plans
       (household_id, category_id, payment_method_id, created_by_user_id, description,
        total_amount, installment_amount, total_installments, first_month, last_month)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, description, total_amount, installment_amount, total_installments,
               first_month, last_month`,
    [
      plano.householdId,
      plano.categoryId,
      plano.paymentMethodId,
      plano.createdByUserId,
      plano.description,
      plano.totalAmount,
      plano.installmentAmount,
      plano.totalInstallments,
      plano.firstMonth,
      plano.lastMonth,
    ],
  );
}

async function buscarPlano(planId, householdId) {
  return db.row(
    `SELECT id, description, category_id, payment_method_id, created_by_user_id,
            total_amount, installment_amount, total_installments, first_month, last_month
       FROM installment_plans
      WHERE id = $1 AND household_id = $2`,
    [planId, householdId],
  );
}

async function parcelasDoPlano(planId, householdId) {
  return db.rows(
    `SELECT id, kind, description, amount, status, transaction_date, reference_month,
            installment_number
       FROM transactions
      WHERE installment_plan_id = $1 AND household_id = $2 AND archived = false
      ORDER BY reference_month`,
    [planId, householdId],
  );
}

module.exports = {
  listarDoMes,
  listarDoPeriodo,
  resumoDoPeriodo,
  buscarPorId,
  inserir,
  atualizar,
  definirArquivamento,
  criarPlano,
  buscarPlano,
  parcelasDoPlano,
};
