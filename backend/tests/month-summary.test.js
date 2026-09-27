'use strict';
/**
 * Casos CTU24 a CTU34 do plano de testes.
 * Cobrem RF53, RF54, RF56, RF57, RF58, RF60, RN06, RN07 e RN09.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDashboard,
  buildCategorySummary,
  evolutionPoint,
  installmentLoad,
} = require('../src/shared/month-summary');

// --- Construtores de cenário ------------------------------------------------

const CARTAO = { id: 'cartao-1', kind: 'credit_card', name: 'Cartão' };
const PIX = { id: 'pix-1', kind: 'pix', name: 'Pix' };

const CAT_MORADIA = {
  id: 'cat-moradia',
  name: 'Moradia',
  icon: 'home',
  colorFg: '#993556',
  colorBg: '#FBEAF0',
  monthlyBudget: null,
  parent: null,
};

const CAT_MERCADO = {
  id: 'cat-mercado',
  name: 'Mercado',
  icon: 'home',
  colorFg: '#993556',
  colorBg: '#FBEAF0',
  monthlyBudget: null,
  parent: CAT_MORADIA,
};

const CAT_TRANSPORTE = {
  id: 'cat-transporte',
  name: 'Transporte',
  icon: 'car',
  colorFg: '#0C447C',
  colorBg: '#E6F1FB',
  monthlyBudget: 500,
  parent: null,
};

let sequencia = 0;
function lancamento(atributos) {
  sequencia += 1;
  return {
    id: `tx-${sequencia}`,
    kind: 'expense',
    description: `Lançamento ${sequencia}`,
    amount: 100,
    status: 'paid',
    transactionDate: '2026-08-10',
    paymentMethodId: PIX.id,
    paymentMethod: PIX,
    category: CAT_MORADIA,
    installmentPlanId: null,
    installmentNumber: null,
    installmentPlan: null,
    ...atributos,
  };
}

/** Aplica a forma de pagamento mantendo id e objeto coerentes entre si. */
const naForma = (forma) => ({ paymentMethodId: forma.id, paymentMethod: forma });

// --- Testes -----------------------------------------------------------------

describe('Indicadores do mês (RF53)', () => {
  test('CTU24 – saldo é entradas menos saídas', () => {
    const lancamentos = [
      lancamento({ kind: 'income', amount: 5000 }),
      lancamento({ kind: 'expense', amount: 3200 }),
    ];
    const painel = buildDashboard(lancamentos, [], []);
    assert.equal(painel.summary.income, 5000);
    assert.equal(painel.summary.expense, 3200);
    assert.equal(painel.summary.balance, 1800);
  });

  test('CTU25 – taxa de poupança é o saldo sobre as entradas', () => {
    const painel = buildDashboard(
      [lancamento({ kind: 'income', amount: 5000 }), lancamento({ kind: 'expense', amount: 3200 })],
      [],
      [],
    );
    assert.equal(painel.summary.savingsRate, 0.36);
  });

  test('CTU26 – sem entradas a taxa de poupança é zero, sem divisão por zero', () => {
    const painel = buildDashboard([lancamento({ kind: 'expense', amount: 500 })], [], []);
    assert.equal(painel.summary.savingsRate, 0);
    assert.ok(Number.isFinite(painel.summary.savingsRate));
  });

  test('mês sem movimento devolve indicadores zerados', () => {
    const painel = buildDashboard([], [], []);
    assert.equal(painel.summary.income, 0);
    assert.equal(painel.summary.balance, 0);
    assert.equal(painel.summary.toPay, 0);
    assert.deepEqual(painel.byCategory, []);
    assert.deepEqual(painel.topExpenses, []);
  });
});

describe('A pagar e pago no mês (RF54, RN07)', () => {
  test('CTU27 – a pagar soma pendências avulsas e faturas em aberto', () => {
    const lancamentos = [
      lancamento({ status: 'pending', amount: 300, ...naForma(PIX) }),
      lancamento({ amount: 1000, ...naForma(CARTAO) }),
      lancamento({ kind: 'card_payment', amount: 400, category: null, ...naForma(CARTAO) }),
    ];
    const painel = buildDashboard(lancamentos, [], []);
    // 300 de pendência avulsa + (1000 de compras − 400 já pagos) = 900
    assert.equal(painel.summary.toPay, 900);
  });

  test('CTU28 – fatura paga além do gasto não gera valor negativo', () => {
    const lancamentos = [
      lancamento({ amount: 500, ...naForma(CARTAO) }),
      lancamento({ kind: 'card_payment', amount: 700, category: null, ...naForma(CARTAO) }),
    ];
    const painel = buildDashboard(lancamentos, [], []);
    assert.equal(painel.summary.toPay, 0);
  });

  test('cartão adiantado não abate a dívida de outro cartão', () => {
    const outroCartao = { id: 'cartao-2', kind: 'credit_card', name: 'Cartão 2' };
    const lancamentos = [
      // Cartão 1: pago a mais
      lancamento({ amount: 200, ...naForma(CARTAO) }),
      lancamento({ kind: 'card_payment', amount: 900, category: null, ...naForma(CARTAO) }),
      // Cartão 2: fatura em aberto
      lancamento({ amount: 600, ...naForma(outroCartao) }),
    ];
    const painel = buildDashboard(lancamentos, [], []);
    // Só o cartão 2 entra: o saldo credor do cartão 1 é limitado a zero
    assert.equal(painel.summary.toPay, 600);
  });

  test('CTU29 – pago soma quitações avulsas e pagamentos de fatura', () => {
    const lancamentos = [
      lancamento({ status: 'paid', amount: 800, ...naForma(PIX) }),
      lancamento({ kind: 'card_payment', amount: 400, category: null, ...naForma(CARTAO) }),
    ];
    const painel = buildDashboard(lancamentos, [], []);
    assert.equal(painel.summary.paidOut, 1200);
  });

  test('investimento não pago também conta como a pagar', () => {
    const painel = buildDashboard(
      [lancamento({ kind: 'investment', status: 'pending', amount: 250, ...naForma(PIX) })],
      [],
      [],
    );
    assert.equal(painel.summary.toPay, 250);
  });
});

describe('Agregação por categoria (RF56, RN09)', () => {
  test('CTU30 – gasto em subcategoria sobe para a categoria de topo', () => {
    const lancamentos = [
      lancamento({ amount: 300, category: CAT_MERCADO }),
      lancamento({ amount: 200, category: CAT_MORADIA }),
    ];
    const painel = buildDashboard(lancamentos, [], []);
    assert.equal(painel.byCategory.length, 1);
    assert.equal(painel.byCategory[0].name, 'Moradia');
    assert.equal(painel.byCategory[0].total, 500);
  });

  test('o teto da categoria de topo acompanha a agregação', () => {
    const painel = buildDashboard([lancamento({ amount: 420, category: CAT_TRANSPORTE })], [], []);
    assert.equal(painel.byCategory[0].budget, 500);
    assert.equal(painel.byCategory[0].total, 420);
  });

  test('comparativo com o mês anterior por categoria', () => {
    const painel = buildDashboard(
      [lancamento({ amount: 300, category: CAT_MORADIA })],
      [lancamento({ amount: 250, category: CAT_MERCADO })],
      [],
    );
    assert.equal(painel.byCategory[0].total, 300);
    assert.equal(painel.byCategory[0].prevTotal, 250);
  });

  test('resumo de categorias considera apenas despesas', () => {
    const resumo = buildCategorySummary([
      lancamento({ kind: 'expense', amount: 300, category: CAT_MORADIA }),
      lancamento({ kind: 'income', amount: 5000, category: CAT_MORADIA }),
      lancamento({ kind: 'investment', amount: 800, category: CAT_MORADIA }),
    ]);
    assert.equal(resumo.total, 300);
    assert.equal(resumo.categories.length, 1);
  });
});

describe('Régua única de situação (RN06)', () => {
  test('CTU31 – despesa agendada conta no mês em que cai', () => {
    const painel = buildDashboard(
      [lancamento({ status: 'scheduled', amount: 450, ...naForma(PIX) })],
      [],
      [],
    );
    // Entra no total de saídas do mês, independentemente da situação
    assert.equal(painel.summary.expense, 450);
    // E também no que ainda falta pagar, por não estar quitada
    assert.equal(painel.summary.toPay, 450);
  });
});

describe('Parcelas do mês (RF60)', () => {
  const comPlano = (numero, total) => ({
    installmentPlanId: 'plano-1',
    installmentNumber: numero,
    installmentPlan: { totalInstallments: total },
  });

  test('CTU32 – pagamento de fatura não é contado como parcela', () => {
    const lancamentos = [
      lancamento({ amount: 100, ...naForma(CARTAO), ...comPlano(3, 12) }),
      lancamento({ kind: 'card_payment', amount: 900, category: null, ...naForma(CARTAO) }),
    ];
    const painel = buildDashboard(lancamentos, [], []);
    assert.equal(painel.summary.installmentsCount, 1);
    assert.equal(painel.summary.installments, 100);
    assert.equal(painel.installmentItems.length, 1);
  });

  test('a numeração real da parcela é preservada', () => {
    const painel = buildDashboard(
      [lancamento({ amount: 250, ...naForma(CARTAO), ...comPlano(14, 48) })],
      [],
      [],
    );
    assert.equal(painel.installmentItems[0].number, 14);
    assert.equal(painel.installmentItems[0].of, 48);
  });

  test('installmentLoad soma apenas parcelas', () => {
    const lancamentos = [
      lancamento({ amount: 100, ...comPlano(1, 3) }),
      lancamento({ amount: 200, ...comPlano(2, 3) }),
      lancamento({ amount: 999 }),
    ];
    assert.equal(installmentLoad(lancamentos), 300);
  });
});

describe('Maiores gastos e distribuição (RF57, RF58)', () => {
  test('CTU33 – devolve as cinco maiores despesas, ordenadas', () => {
    const valores = [10, 90, 50, 200, 30, 70, 120, 45, 300, 25];
    const painel = buildDashboard(
      valores.map((v) => lancamento({ amount: v })),
      [],
      [],
    );
    assert.equal(painel.topExpenses.length, 5);
    assert.deepEqual(
      painel.topExpenses.map((t) => t.amount),
      [300, 200, 120, 90, 70],
    );
  });

  test('CTU34 – distribuição por forma de pagamento agrupa por tipo', () => {
    const boleto = { id: 'boleto-1', kind: 'boleto', name: 'Boleto' };
    const painel = buildDashboard(
      [
        lancamento({ amount: 500, ...naForma(CARTAO) }),
        lancamento({ amount: 300, ...naForma(PIX) }),
        lancamento({ amount: 200, ...naForma(boleto) }),
      ],
      [],
      [],
    );
    assert.deepEqual(
      painel.byPaymentKind.map((p) => [p.name, p.total]),
      [
        ['Crédito', 500],
        ['Pix', 300],
        ['Boleto', 200],
      ],
    );
    const total = painel.byPaymentKind.reduce((s, p) => s + p.total, 0);
    assert.equal(total, 1000);
  });
});

describe('Série de evolução (RF59)', () => {
  test('cada ponto traz entradas, saídas, investimentos e saldo', () => {
    const ponto = evolutionPoint('2026-08', [
      lancamento({ kind: 'income', amount: 5000 }),
      lancamento({ kind: 'expense', amount: 3000 }),
      lancamento({ kind: 'investment', amount: 800 }),
    ]);
    assert.deepEqual(ponto, {
      month: '2026-08',
      income: 5000,
      expense: 3000,
      investment: 800,
      balance: 2000,
    });
  });
});

describe('Precisão monetária (RNF07)', () => {
  test('somas com centavos não acumulam erro de ponto flutuante', () => {
    // 0,1 + 0,2 em ponto flutuante é 0,30000000000000004
    const painel = buildDashboard(
      [lancamento({ amount: 0.1 }), lancamento({ amount: 0.2 })],
      [],
      [],
    );
    assert.equal(painel.summary.expense, 0.3);
  });

  test('parcelas de 33,33 e 33,34 somam exatamente 100', () => {
    const painel = buildDashboard(
      [33.33, 33.33, 33.34].map((v) => lancamento({ amount: v })),
      [],
      [],
    );
    assert.equal(painel.summary.expense, 100);
  });
});
