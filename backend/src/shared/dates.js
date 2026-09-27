'use strict';
/**
 * Datas de competência e regras de calendário do crédito.
 *
 * DECISÃO CENTRAL: todas as datas circulam como texto no formato `AAAA-MM-DD`,
 * nunca como objeto Date.
 *
 * O motivo é concreto. O objeto Date do JavaScript é sempre um INSTANTE, e todo
 * instante depende de fuso horário. `new Date('2026-08-01')` é meia-noite em UTC,
 * que no horário de Brasília é 21h de 31 de julho. Um sistema que grava o mês de
 * competência como instante grava valores diferentes conforme a máquina que roda,
 * e registros criados em um fuso desaparecem das consultas feitas em outro.
 *
 * Um mês de competência não tem hora. Tratá-lo como texto elimina a classe
 * inteira de erros, e não apenas os casos que lembramos de testar. A aritmética
 * usa Date.UTC internamente, onde o fuso é irrelevante por construção.
 *
 * Todas as funções deste módulo são puras.
 */

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Valida e decompõe uma data `AAAA-MM-DD` em suas partes numéricas. */
function partes(data) {
  if (typeof data !== 'string' || !FORMATO_DATA.test(data)) {
    throw new TypeError(`Data inválida: esperado AAAA-MM-DD, recebido ${JSON.stringify(data)}`);
  }
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  const dia = Number(data.slice(8, 10));
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    throw new TypeError(`Data inexistente: ${data}`);
  }
  return { ano, mes, dia };
}

/** Monta `AAAA-MM-DD` a partir das partes, com preenchimento de zeros. */
function montar(ano, mes, dia) {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Data de hoje no formato do sistema. */
function hoje() {
  const agora = new Date();
  return montar(agora.getFullYear(), agora.getMonth() + 1, agora.getDate());
}

/** Primeiro dia do mês da data informada. É o mês de competência (RN01). */
function startOfMonth(data) {
  const { ano, mes } = partes(data);
  return montar(ano, mes, 1);
}

/**
 * Soma (ou subtrai, com n negativo) meses, devolvendo o primeiro dia do mês
 * resultante. A aritmética em UTC trata a virada de ano sem caso especial.
 */
function addMonths(data, n) {
  const { ano, mes } = partes(data);
  const d = new Date(Date.UTC(ano, mes - 1 + n, 1));
  return montar(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** Quantidade de dias do mês da data informada. */
function daysInMonth(data) {
  const { ano, mes } = partes(data);
  // Dia 0 do mês seguinte é o último dia do mês corrente
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Diferença em meses entre duas datas (positiva quando `data` vem depois de `base`). */
function monthDiff(data, base) {
  const a = partes(data);
  const b = partes(base);
  return (a.ano - b.ano) * 12 + (a.mes - b.mes);
}

/**
 * Data de vencimento no mês de referência (RN03).
 *
 * O dia é limitado ao último dia do mês: um cartão que vence dia 31 vence em 28
 * de fevereiro, e não em 3 de março.
 */
function dueDateInMonth(referenceMonth, dueDay) {
  const { ano, mes } = partes(referenceMonth);
  const limite = daysInMonth(referenceMonth);
  const dia = Math.min(Math.max(1, Math.trunc(dueDay)), limite);
  return montar(ano, mes, dia);
}

/**
 * Mês da fatura em que uma compra de cartão de crédito cai (RN02).
 *
 * Regra: compra realizada NO DIA DO FECHAMENTO OU DEPOIS entra na fatura do mês
 * seguinte. A comparação é "maior ou igual", e não "maior": o dia do fechamento
 * já pertence ao próximo ciclo. Trocar um pelo outro é o erro mais provável de
 * implementação, e o caso de teste CTU09 existe exatamente para pegá-lo.
 *
 * Exemplo com fechamento no dia 10: compra em 09/08 cai na fatura de agosto;
 * compra em 10/08 cai na de setembro.
 */
function invoiceMonth(purchaseDate, closingDay) {
  const referencia = startOfMonth(purchaseDate);
  const { dia } = partes(purchaseDate);
  return dia >= closingDay ? addMonths(referencia, 1) : referencia;
}

/** Converte o valor devolvido pelo banco em `AAAA-MM-DD`, aceitando nulo. */
function paraData(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  if (valor instanceof Date) {
    return montar(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate());
  }
  throw new TypeError(`Valor de data não reconhecido: ${valor}`);
}

module.exports = {
  hoje,
  startOfMonth,
  addMonths,
  daysInMonth,
  monthDiff,
  dueDateInMonth,
  invoiceMonth,
  paraData,
  montar,
};
