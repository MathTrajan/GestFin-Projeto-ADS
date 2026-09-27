'use strict';
/**
 * Casos CTU35 a CTU38 do plano de testes. Cobrem RF21 e RN07.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { computeCardUsage, withCardUsage } = require('../src/shared/card-usage');

const CARTAO = { id: 'cartao-1', name: 'Cartão', kind: 'credit_card' };
const OUTRO = { id: 'cartao-2', name: 'Outro cartão', kind: 'credit_card' };

const mov = (paymentMethodId, kind, amount) => ({ paymentMethodId, kind, amount });

describe('Uso do cartão no mês (RF21)', () => {
  test('CTU35 – valor em aberto é o gasto menos o pago', () => {
    const uso = computeCardUsage([
      mov(CARTAO.id, 'expense', 1200),
      mov(CARTAO.id, 'card_payment', 500),
    ]);
    assert.deepEqual(uso.get(CARTAO.id), {
      spentThisMonth: 1200,
      invoicePaid: 500,
      usedThisMonth: 700,
    });
  });

  test('CTU36 – cartão sem movimentação fica zerado', () => {
    const formas = withCardUsage([CARTAO], []);
    assert.equal(formas[0].spentThisMonth, 0);
    assert.equal(formas[0].invoicePaid, 0);
    assert.equal(formas[0].usedThisMonth, 0);
    assert.equal(formas[0].totalLimitUsed, 0);
  });

  test('CTU37 – limite comprometido soma as parcelas futuras agendadas', () => {
    const formas = withCardUsage(
      [CARTAO],
      [mov(CARTAO.id, 'expense', 1200), mov(CARTAO.id, 'card_payment', 500)],
      [mov(CARTAO.id, 'expense', 1500), mov(CARTAO.id, 'expense', 900)],
    );
    assert.equal(formas[0].usedThisMonth, 700);
    assert.equal(formas[0].totalLimitUsed, 3100);
  });

  test('CTU38 – investimento no cartão conta como gasto', () => {
    const uso = computeCardUsage([mov(CARTAO.id, 'investment', 800)]);
    assert.equal(uso.get(CARTAO.id).spentThisMonth, 800);
    assert.equal(uso.get(CARTAO.id).usedThisMonth, 800);
  });

  test('fatura paga a mais não gera valor em aberto negativo (RN07)', () => {
    const uso = computeCardUsage([
      mov(CARTAO.id, 'expense', 500),
      mov(CARTAO.id, 'card_payment', 700),
    ]);
    assert.equal(uso.get(CARTAO.id).usedThisMonth, 0);
    assert.equal(uso.get(CARTAO.id).invoicePaid, 700);
  });

  test('entradas não afetam o uso do cartão', () => {
    const uso = computeCardUsage([
      mov(CARTAO.id, 'income', 5000),
      mov(CARTAO.id, 'expense', 100),
    ]);
    assert.equal(uso.get(CARTAO.id).spentThisMonth, 100);
  });

  test('cada cartão é apurado isoladamente', () => {
    const formas = withCardUsage(
      [CARTAO, OUTRO],
      [
        mov(CARTAO.id, 'expense', 1000),
        mov(CARTAO.id, 'card_payment', 1000),
        mov(OUTRO.id, 'expense', 600),
      ],
    );
    const porId = Object.fromEntries(formas.map((f) => [f.id, f]));
    assert.equal(porId[CARTAO.id].usedThisMonth, 0);
    assert.equal(porId[OUTRO.id].usedThisMonth, 600);
  });

  test('valores com centavos são arredondados em duas casas', () => {
    const uso = computeCardUsage([
      mov(CARTAO.id, 'expense', 0.1),
      mov(CARTAO.id, 'expense', 0.2),
    ]);
    assert.equal(uso.get(CARTAO.id).spentThisMonth, 0.3);
  });
});
