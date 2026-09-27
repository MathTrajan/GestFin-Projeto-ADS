'use strict';
/**
 * Casos CTU01 a CTU12 do plano de testes.
 * Cobrem RF26, RF27, RN01, RN02, RN03 e RNF06.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  startOfMonth,
  addMonths,
  daysInMonth,
  monthDiff,
  dueDateInMonth,
  invoiceMonth,
  paraData,
} = require('../src/shared/dates');

describe('Mês de competência', () => {
  test('CTU01 – primeiro dia do mês', () => {
    assert.equal(startOfMonth('2026-08-15'), '2026-08-01');
    assert.equal(startOfMonth('2026-08-01'), '2026-08-01');
    assert.equal(startOfMonth('2026-12-31'), '2026-12-01');
  });

  test('CTU02 – somar meses atravessando a virada de ano', () => {
    assert.equal(addMonths('2026-11-01', 3), '2027-02-01');
    assert.equal(addMonths('2026-12-01', 1), '2027-01-01');
  });

  test('CTU03 – subtrair meses atravessando a virada de ano', () => {
    assert.equal(addMonths('2027-02-01', -3), '2026-11-01');
    assert.equal(addMonths('2026-01-01', -1), '2025-12-01');
  });

  test('somar zero mês devolve o próprio mês', () => {
    assert.equal(addMonths('2026-08-01', 0), '2026-08-01');
  });

  test('diferença em meses entre competências', () => {
    assert.equal(monthDiff('2026-08-01', '2026-08-01'), 0);
    assert.equal(monthDiff('2027-02-01', '2026-11-01'), 3);
    assert.equal(monthDiff('2026-11-01', '2027-02-01'), -3);
  });
});

describe('Dias do mês', () => {
  test('CTU04 – fevereiro de ano comum tem 28 dias', () => {
    assert.equal(daysInMonth('2027-02-01'), 28);
  });

  test('CTU05 – fevereiro de ano bissexto tem 29 dias', () => {
    assert.equal(daysInMonth('2028-02-01'), 29);
  });

  test('meses de 30 e 31 dias', () => {
    assert.equal(daysInMonth('2026-04-10'), 30);
    assert.equal(daysInMonth('2026-08-10'), 31);
  });
});

describe('Data de vencimento da fatura (RN03)', () => {
  test('CTU06 – dia de vencimento que existe no mês', () => {
    assert.equal(dueDateInMonth('2026-08-01', 20), '2026-08-20');
  });

  test('CTU07 – dia de vencimento que não existe no mês usa o último dia', () => {
    assert.equal(dueDateInMonth('2027-02-01', 31), '2027-02-28');
    assert.equal(dueDateInMonth('2028-02-01', 31), '2028-02-29');
    assert.equal(dueDateInMonth('2026-04-01', 31), '2026-04-30');
  });

  test('dia fora da faixa é limitado', () => {
    assert.equal(dueDateInMonth('2026-08-01', 0), '2026-08-01');
    assert.equal(dueDateInMonth('2026-08-01', 99), '2026-08-31');
  });
});

describe('Fatura em que a compra cai (RN02)', () => {
  // A fronteira exata da regra. O erro mais provável de implementação é usar
  // "maior que" no lugar de "maior ou igual", e é isto que o CTU09 detecta.
  test('CTU08 – compra ANTES do fechamento cai na fatura do mês corrente', () => {
    assert.equal(invoiceMonth('2026-08-09', 10), '2026-08-01');
  });

  test('CTU09 – compra EXATAMENTE no dia do fechamento cai na fatura seguinte', () => {
    assert.equal(invoiceMonth('2026-08-10', 10), '2026-09-01');
  });

  test('CTU10 – compra DEPOIS do fechamento cai na fatura seguinte', () => {
    assert.equal(invoiceMonth('2026-08-15', 10), '2026-09-01');
  });

  test('CTU11 – compra em dezembro após o fechamento cai em janeiro do ano seguinte', () => {
    assert.equal(invoiceMonth('2026-12-20', 10), '2027-01-01');
  });

  test('primeiro dia do mês com fechamento no dia 1 já rola para o mês seguinte', () => {
    assert.equal(invoiceMonth('2026-08-01', 1), '2026-09-01');
  });
});

describe('CTU12 – independência de fuso horário (RNF06)', () => {
  // O sistema de origem gravava a competência como instante, e o valor mudava
  // conforme o fuso da máquina. Aqui a data é texto, então o fuso do processo
  // não pode influenciar o resultado.
  const fusos = ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo', 'America/Anchorage'];

  test('as regras produzem o mesmo resultado em qualquer fuso', () => {
    const original = process.env.TZ;
    const resultados = fusos.map((tz) => {
      process.env.TZ = tz;
      return {
        competencia: startOfMonth('2026-08-01'),
        fatura: invoiceMonth('2026-08-10', 10),
        vencimento: dueDateInMonth('2026-08-01', 20),
        somaDeMeses: addMonths('2026-12-01', 2),
      };
    });
    process.env.TZ = original;

    for (const resultado of resultados) {
      assert.deepEqual(resultado, resultados[0]);
    }
    assert.equal(resultados[0].competencia, '2026-08-01');
    assert.equal(resultados[0].fatura, '2026-09-01');
  });
});

describe('Conversão de datas vindas do banco', () => {
  test('aceita texto, objeto de data e nulo', () => {
    assert.equal(paraData('2026-08-01'), '2026-08-01');
    assert.equal(paraData('2026-08-01T00:00:00.000Z'), '2026-08-01');
    assert.equal(paraData(new Date(Date.UTC(2026, 7, 1))), '2026-08-01');
    assert.equal(paraData(null), null);
    assert.equal(paraData(undefined), null);
  });
});

describe('Entradas inválidas são recusadas', () => {
  test('formato incorreto lança erro', () => {
    assert.throws(() => startOfMonth('01/08/2026'), TypeError);
    assert.throws(() => startOfMonth('2026-8-1'), TypeError);
    assert.throws(() => startOfMonth(''), TypeError);
    assert.throws(() => startOfMonth(null), TypeError);
    assert.throws(() => startOfMonth(new Date()), TypeError);
  });

  test('mês ou dia fora da faixa lança erro', () => {
    assert.throws(() => startOfMonth('2026-13-01'), TypeError);
    assert.throws(() => startOfMonth('2026-08-32'), TypeError);
  });
});
