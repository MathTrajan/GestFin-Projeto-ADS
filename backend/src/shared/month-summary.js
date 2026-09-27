'use strict';
/**
 * Agregações mensais.
 *
 * FONTE ÚNICA de todas as fórmulas do painel, consumidas pelos serviços de
 * painel, de categorias e de pré-carga (decisão DA01). No sistema de origem
 * essas contas estavam duplicadas em três serviços "mantidos em sincronia
 * manualmente"; a sincronia falhou e um deles passou a exibir indicadores
 * zerados em produção.
 *
 * RÉGUA ÚNICA DE SITUAÇÃO (RN06): as funções recebem TODOS os lançamentos não
 * arquivados do mês, independentemente da situação. Uma parcela agendada é gasto
 * do mês em que cai. A situação só distingue pago de não pago nos indicadores de
 * a pagar e pago.
 *
 * Todas as funções são puras.
 */

const ROTULO_FORMA = {
  credit_card: 'Crédito',
  pix: 'Pix',
  boleto: 'Boleto',
  debit: 'Débito',
  cash: 'Dinheiro',
};

const COR_FORMA = {
  Crédito: '#1E3A8A',
  Pix: '#0F766E',
  Boleto: '#B45309',
  Débito: '#0369A1',
  Dinheiro: '#15803D',
};

/** Arredonda para duas casas decimais (RNF07). */
const r2 = (n) => Math.round(n * 100) / 100;

const somarPorTipo = (lancamentos, tipo) =>
  lancamentos.filter((t) => t.kind === tipo).reduce((s, t) => s + t.amount, 0);

/** Categoria de topo de um lançamento: toda agregação sobe para ela (RN09). */
const categoriaTopo = (t) => (t.category && t.category.parent) || t.category;

/**
 * Soma das parcelas que caem no mês. Pagamento de fatura nunca é parcela: quitar
 * a fatura não é um novo gasto, é a liquidação de gastos já contabilizados.
 */
function installmentLoad(lancamentos) {
  return r2(
    lancamentos
      .filter((t) => t.kind !== 'card_payment' && t.installmentPlanId)
      .reduce((s, t) => s + t.amount, 0),
  );
}

/** Um ponto da série de evolução, com o mês no formato AAAA-MM. */
function evolutionPoint(mes, lancamentos) {
  const income = somarPorTipo(lancamentos, 'income');
  const expense = somarPorTipo(lancamentos, 'expense');
  const investment = somarPorTipo(lancamentos, 'investment');
  return {
    month: mes,
    income: r2(income),
    expense: r2(expense),
    investment: r2(investment),
    balance: r2(income - expense),
  };
}

/**
 * Payload completo do painel de um mês.
 *
 * A pagar (RF54) = saídas avulsas não pagas + fatura em aberto de cada cartão.
 * A fatura em aberto de um cartão é compras menos pagamentos, LIMITADA A ZERO
 * (RN07): quem pagou mais do que gastou não tem crédito a receber, tem fatura
 * quitada. Sem esse limite, um cartão adiantado subtrairia da dívida de outro.
 *
 * Pago = saídas avulsas quitadas + pagamentos de fatura.
 */
function buildDashboard(lancamentos, lancamentosMesAnterior, evolucao) {
  const income = somarPorTipo(lancamentos, 'income');
  const expense = somarPorTipo(lancamentos, 'expense');
  const investment = somarPorTipo(lancamentos, 'investment');
  const balance = income - expense;
  // Quanto sobrou em relação ao que entrou, com guarda contra divisão por zero
  const savingsRate = income > 0 ? balance / income : 0;

  const despesas = lancamentos.filter((t) => t.kind === 'expense');
  const ehCredito = (t) => t.paymentMethod.kind === 'credit_card';
  const saidas = lancamentos.filter((t) => t.kind === 'expense' || t.kind === 'investment');

  const pendenteAvulso = saidas
    .filter((t) => !ehCredito(t) && t.status !== 'paid')
    .reduce((s, t) => s + t.amount, 0);
  const pagoAvulso = saidas
    .filter((t) => !ehCredito(t) && t.status === 'paid')
    .reduce((s, t) => s + t.amount, 0);
  const pagamentosDeFatura = lancamentos
    .filter((t) => t.kind === 'card_payment')
    .reduce((s, t) => s + t.amount, 0);

  // Saldo da fatura de cada cartão, somando compras e abatendo pagamentos
  const faturaPorCartao = new Map();
  for (const t of lancamentos) {
    if (!ehCredito(t)) continue;
    let delta = 0;
    if (t.kind === 'card_payment') delta = -t.amount;
    else if (t.kind === 'expense' || t.kind === 'investment') delta = t.amount;
    if (delta !== 0) {
      faturaPorCartao.set(t.paymentMethodId, (faturaPorCartao.get(t.paymentMethodId) ?? 0) + delta);
    }
  }
  const faturasEmAberto = [...faturaPorCartao.values()].reduce((s, v) => s + Math.max(0, v), 0);

  const toPay = r2(pendenteAvulso + faturasEmAberto);
  const paidOut = r2(pagoAvulso + pagamentosDeFatura);

  // Parcelas que caem neste mês, uma a uma
  const parcelas = lancamentos.filter((t) => t.kind !== 'card_payment' && t.installmentPlanId);
  const installmentItems = parcelas
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .map((t) => ({
      planId: t.installmentPlanId ?? null,
      description: t.description,
      amount: r2(t.amount),
      number: t.installmentNumber ?? null,
      of: t.installmentPlan ? t.installmentPlan.totalInstallments : null,
      method: t.paymentMethod ? t.paymentMethod.name : null,
      status: t.status,
      color: categoriaTopo(t) ? categoriaTopo(t).colorFg : null,
    }));

  // Total gasto por categoria de topo no mês anterior, para o comparativo
  const anteriorPorCategoria = {};
  for (const t of lancamentosMesAnterior.filter((x) => x.kind === 'expense')) {
    const topo = categoriaTopo(t);
    anteriorPorCategoria[topo.id] = (anteriorPorCategoria[topo.id] ?? 0) + t.amount;
  }

  const porCategoria = {};
  for (const t of despesas) {
    const topo = categoriaTopo(t);
    if (!porCategoria[topo.id]) {
      porCategoria[topo.id] = {
        id: topo.id,
        name: topo.name,
        color: topo.colorFg,
        total: 0,
        prevTotal: anteriorPorCategoria[topo.id] ?? 0,
        budget: topo.monthlyBudget ?? null,
      };
    }
    porCategoria[topo.id].total += t.amount;
  }

  const porFormaDePagamento = {};
  for (const t of despesas) {
    const rotulo = ROTULO_FORMA[t.paymentMethod.kind] ?? t.paymentMethod.kind;
    if (!porFormaDePagamento[rotulo]) {
      porFormaDePagamento[rotulo] = {
        name: rotulo,
        color: COR_FORMA[rotulo] ?? '#1A1A1A',
        total: 0,
      };
    }
    porFormaDePagamento[rotulo].total += t.amount;
  }

  const topExpenses = despesas
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((t) => {
      const topo = categoriaTopo(t);
      return {
        description: t.description,
        category: topo.name,
        color: topo.colorFg,
        amount: r2(t.amount),
        date: t.transactionDate,
      };
    });

  const anteriorEntradas = somarPorTipo(lancamentosMesAnterior, 'income');
  const anteriorSaidas = somarPorTipo(lancamentosMesAnterior, 'expense');

  return {
    summary: {
      income: r2(income),
      expense: r2(expense),
      investment: r2(investment),
      balance: r2(balance),
      savingsRate,
      toPay,
      paidOut,
      installments: installmentLoad(lancamentos),
      installmentsCount: parcelas.length,
    },
    previous: {
      income: r2(anteriorEntradas),
      expense: r2(anteriorSaidas),
      investment: r2(somarPorTipo(lancamentosMesAnterior, 'investment')),
      balance: r2(anteriorEntradas - anteriorSaidas),
    },
    byCategory: Object.values(porCategoria)
      .map((c) => ({ ...c, total: r2(c.total), prevTotal: r2(c.prevTotal) }))
      .sort((a, b) => b.total - a.total),
    byPaymentKind: Object.values(porFormaDePagamento)
      .map((p) => ({ ...p, total: r2(p.total) }))
      .sort((a, b) => b.total - a.total),
    topExpenses,
    installmentItems,
    evolution: evolucao,
  };
}

/** Gasto por categoria de topo. Só despesas entram na conta (RF16). */
function buildCategorySummary(lancamentos) {
  const porTopo = new Map();
  for (const t of lancamentos) {
    if (t.kind !== 'expense') continue;
    const topo = categoriaTopo(t);
    const atual = porTopo.get(topo.id) ?? {
      id: topo.id,
      name: topo.name,
      icon: topo.icon,
      colorFg: topo.colorFg,
      colorBg: topo.colorBg,
      spent: 0,
      budget: topo.monthlyBudget ?? null,
    };
    atual.spent += t.amount;
    porTopo.set(topo.id, atual);
  }
  const categories = [...porTopo.values()]
    .map((c) => ({ ...c, spent: r2(c.spent) }))
    .sort((a, b) => b.spent - a.spent);
  return { total: r2(categories.reduce((s, c) => s + c.spent, 0)), categories };
}

module.exports = {
  installmentLoad,
  evolutionPoint,
  buildDashboard,
  buildCategorySummary,
};
