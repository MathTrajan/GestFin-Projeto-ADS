'use strict';
/**
 * Casos CTU13 a CTU23 do plano de testes.
 * Cobrem RF34, RF35, RF37 e RN05.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { splitInstallments, renumberPlan } = require('../src/shared/installments');

const somar = (valores) => Math.round(valores.reduce((s, v) => s + v, 0) * 100) / 100;

describe('Divisão em parcelas (RN05)', () => {
  test('CTU13 – divisão exata', () => {
    assert.deepEqual(splitInstallments(120, 3), [40, 40, 40]);
  });

  test('CTU14 – resíduo positivo vai para a última parcela', () => {
    assert.deepEqual(splitInstallments(100, 3), [33.33, 33.33, 33.34]);
  });

  test('CTU15 – resíduo negativo também vai para a última parcela', () => {
    const parcelas = splitInstallments(100, 6);
    assert.deepEqual(parcelas, [16.67, 16.67, 16.67, 16.67, 16.67, 16.65]);
    assert.equal(somar(parcelas), 100);
  });

  test('CTU16 – parcela única devolve o próprio valor', () => {
    assert.deepEqual(splitInstallments(99.99, 1), [99.99]);
  });

  test('CTU17 – a soma é sempre exatamente o total', () => {
    // Verificação exaustiva: o erro de centavo só aparece em combinações
    // específicas, e revisão visual não o encontra.
    let combinacoes = 0;
    for (let centavos = 1; centavos <= 200000; centavos += 137) {
      const total = centavos / 100;
      for (let n = 1; n <= 60; n += 7) {
        const parcelas = splitInstallments(total, n);
        assert.equal(parcelas.length, n);
        assert.equal(
          somar(parcelas),
          total,
          `soma divergente para ${total} em ${n}x: ${JSON.stringify(parcelas)}`,
        );
        combinacoes += 1;
      }
    }
    assert.ok(combinacoes > 1000, `esperava mais de mil combinações, testou ${combinacoes}`);
  });

  test('quantidade inválida é normalizada para uma parcela', () => {
    assert.deepEqual(splitInstallments(50, 0), [50]);
    assert.deepEqual(splitInstallments(50, -3), [50]);
  });

  test('valor com mais de duas casas é arredondado', () => {
    assert.deepEqual(splitInstallments(10.005, 1), [10.01]);
  });
});

describe('Renumeração de parcelamento (RF37)', () => {
  /** Monta parcelas consecutivas a partir do deslocamento inicial. */
  const parcelas = (de, ate, status = 'scheduled') =>
    Array.from({ length: ate - de + 1 }, (_, i) => ({ monthOffset: de + i, status }));

  test('CTU18 – renumeração simples renumera e completa a sequência', () => {
    // Cinco parcelas a partir do mês exibido; a deste mês vira a 3 de 10
    const ops = renumberPlan(parcelas(0, 4), 3, 10);
    assert.equal(typeof ops, 'object');
    assert.deepEqual(
      ops.updates.map((u) => u.numero),
      [3, 4, 5, 6, 7],
    );
    assert.deepEqual(ops.remove, []);
    assert.deepEqual(
      ops.create.map((c) => c.numero),
      [8, 9, 10],
    );
  });

  test('CTU19 – reduzir o total remove as parcelas excedentes não pagas', () => {
    const ops = renumberPlan(parcelas(0, 9), 1, 5);
    assert.deepEqual(
      ops.updates.map((u) => u.numero),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(ops.remove, [5, 6, 7, 8, 9]);
    assert.deepEqual(ops.create, []);
  });

  test('CTU20 – parcela PAGA além do novo total impede a renumeração', () => {
    const lista = [...parcelas(0, 4), { monthOffset: 5, status: 'paid' }];
    const resultado = renumberPlan(lista, 1, 5);
    assert.equal(typeof resultado, 'string');
    assert.match(resultado, /paga além do novo total/i);
  });

  test('CTU21 – número resultante menor que 1 impede a renumeração', () => {
    // Existe parcela três meses antes; se a deste mês for a 2, a antiga seria -1
    const resultado = renumberPlan(parcelas(-3, 0), 2, 10);
    assert.equal(typeof resultado, 'string');
    assert.match(resultado, /meses anteriores/i);
  });

  test('CTU22 – total acima de 60 é recusado', () => {
    const resultado = renumberPlan(parcelas(0, 2), 1, 61);
    assert.equal(typeof resultado, 'string');
    assert.match(resultado, /60/);
  });

  test('CTU23 – sem parcela no mês âncora a operação é recusada', () => {
    const resultado = renumberPlan(parcelas(1, 3), 1, 10);
    assert.equal(typeof resultado, 'string');
    assert.match(resultado, /mês exibido/i);
  });

  test('números não inteiros são recusados', () => {
    assert.equal(typeof renumberPlan(parcelas(0, 2), 1.5, 10), 'string');
    assert.equal(typeof renumberPlan(parcelas(0, 2), 1, 10.5), 'string');
  });

  test('número maior que o total é recusado', () => {
    const resultado = renumberPlan(parcelas(0, 2), 11, 10);
    assert.match(resultado, /entre 1 e o total/i);
  });

  test('parcelas anteriores ao mês âncora são renumeradas para trás', () => {
    // Cenário real: financiamento cadastrado errado, com parcelas já lançadas
    // nos meses anteriores. A deste mês é a 14 de 48.
    const ops = renumberPlan(parcelas(-2, 3), 14, 48);
    assert.deepEqual(
      ops.updates.map((u) => u.numero),
      [12, 13, 14, 15, 16, 17],
    );
    assert.equal(ops.create.length, 48 - 17);
    assert.equal(ops.create[0].numero, 18);
    assert.equal(ops.create.at(-1).numero, 48);
  });

  test('nenhum valor de parcela é alterado pela renumeração', () => {
    // A função só decide numeração e existência: não devolve valor algum
    const ops = renumberPlan(parcelas(0, 4), 3, 10);
    const camposDeValor = JSON.stringify(ops).match(/amount|valor|total_amount/i);
    assert.equal(camposDeValor, null);
  });
});
