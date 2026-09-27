'use strict';
/**
 * Uso do cartão no mês (RF21).
 *
 * Separa o que foi GASTO (compras e investimentos) do que já foi PAGO da fatura,
 * e apura o que ainda ocupa o limite. Fonte única consumida pelo serviço de
 * formas de pagamento e pelo de pré-carga.
 *
 * Todas as funções são puras.
 */

const r2 = (n) => Math.round(n * 100) / 100;

const ZERADO = { spentThisMonth: 0, invoicePaid: 0, usedThisMonth: 0 };

/**
 * Mapa de forma de pagamento para o uso no mês.
 *
 * `usedThisMonth` é compras menos pagamentos, LIMITADO A ZERO (RN07): pagar mais
 * do que se gastou quita a fatura, não gera saldo negativo.
 */
function computeCardUsage(lancamentos) {
  const gasto = new Map();
  const pago = new Map();

  for (const t of lancamentos) {
    if (t.kind === 'card_payment') {
      pago.set(t.paymentMethodId, (pago.get(t.paymentMethodId) ?? 0) + t.amount);
    } else if (t.kind === 'expense' || t.kind === 'investment') {
      gasto.set(t.paymentMethodId, (gasto.get(t.paymentMethodId) ?? 0) + t.amount);
    }
  }

  const ids = new Set([...gasto.keys(), ...pago.keys()]);
  const saida = new Map();
  for (const id of ids) {
    const g = r2(gasto.get(id) ?? 0);
    const p = r2(pago.get(id) ?? 0);
    saida.set(id, {
      spentThisMonth: g,
      invoicePaid: p,
      usedThisMonth: r2(Math.max(0, g - p)),
    });
  }
  return saida;
}

/**
 * Anexa o uso do mês a cada forma de pagamento e calcula o limite total
 * comprometido: o valor em aberto do mês somado às parcelas já agendadas para
 * meses futuros. É o número que responde "quanto do meu limite já tem destino".
 *
 * @param {object[]} formas       formas de pagamento da residência
 * @param {object[]} lancamentos  lançamentos do mês exibido
 * @param {object[]} agendadas    parcelas agendadas de meses posteriores
 */
function withCardUsage(formas, lancamentos, agendadas = []) {
  const uso = computeCardUsage(lancamentos);

  const futuroPorForma = new Map();
  for (const t of agendadas) {
    futuroPorForma.set(t.paymentMethodId, (futuroPorForma.get(t.paymentMethodId) ?? 0) + t.amount);
  }

  return formas.map((forma) => {
    const atual = uso.get(forma.id) ?? ZERADO;
    return {
      ...forma,
      ...atual,
      totalLimitUsed: r2(atual.usedThisMonth + (futuroPorForma.get(forma.id) ?? 0)),
    };
  });
}

module.exports = { computeCardUsage, withCardUsage };
