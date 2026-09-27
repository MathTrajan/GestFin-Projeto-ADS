'use strict';
/**
 * Pré-carga de vários meses em uma única resposta (decisão DA08).
 *
 * Navegar entre meses é a ação mais frequente da interface, e cada troca
 * disparava quatro requisições. Aqui uma leitura grande alimenta, de uma vez, os
 * quatro conjuntos que as telas consomem, para treze meses.
 *
 * Todo o cálculo reaproveita as MESMAS funções do painel e da tela de cartões:
 * um segundo caminho de cálculo é exatamente o que produziu a divergência de
 * indicadores no sistema de origem (decisão DA01).
 */

const transacoesRepo = require('../transactions/transactions.repository');
const formasRepo = require('../payment-methods/payment-methods.repository');
const recorrencias = require('../recurring/recurring.service');
const { comoLancamento } = require('../transactions/transactions.service');
const { comoForma } = require('../payment-methods/payment-methods.service');
const {
  buildDashboard,
  buildCategorySummary,
  evolutionPoint,
  installmentLoad,
} = require('../../shared/month-summary');
const { withCardUsage } = require('../../shared/card-usage');
const { startOfMonth, addMonths, hoje } = require('../../shared/dates');

const MESES_PARA_TRAS = 6;
const MESES_PARA_FRENTE = 6;
const MESES_DE_EVOLUCAO = 6;
const MESES_DE_PROJECAO = 5;

/** Formato enxuto do lançamento: o completo, repetido em treze meses, incharia a resposta. */
const enxuto = (t) => ({
  id: t.id,
  kind: t.kind,
  description: t.description,
  amount: t.amount,
  transactionDate: t.transactionDate,
  purchaseDate: t.purchaseDate,
  status: t.status,
  notes: t.notes,
  category: t.category
    ? {
        id: t.category.id,
        name: t.category.name,
        icon: t.category.icon,
        colorFg: t.category.colorFg,
        colorBg: t.category.colorBg,
        parentId: t.category.parentId,
      }
    : null,
  paymentMethod: t.paymentMethod,
  paidBy: t.paidBy,
});

async function montar(householdId, mesAncora) {
  const ancora = startOfMonth(mesAncora);

  const meses = [];
  for (let i = -MESES_PARA_TRAS; i <= MESES_PARA_FRENTE; i++) {
    meses.push(addMonths(ancora, i));
  }

  // A evolução é sempre relativa ao mês corrente, como no painel
  const fimDaEvolucao = startOfMonth(hoje());
  const inicioDaEvolucao = addMonths(fimDaEvolucao, -(MESES_DE_EVOLUCAO - 1));

  // Materializa de uma vez as recorrências de todos os meses envolvidos
  const mesesParaMaterializar = new Set(meses);
  for (let i = 0; i < MESES_DE_EVOLUCAO; i++) {
    mesesParaMaterializar.add(addMonths(fimDaEvolucao, -i));
  }
  await recorrencias.materializar(householdId, [...mesesParaMaterializar]);

  // A janela cobre o intervalo pedido, a evolução e o mês anterior ao primeiro,
  // necessário para o comparativo do mês mais antigo da janela.
  const primeiroDaJanela = addMonths(
    meses[0] < inicioDaEvolucao ? meses[0] : inicioDaEvolucao,
    -1,
  );
  const ultimoDaJanela = meses[meses.length - 1] > fimDaEvolucao ? meses[meses.length - 1] : fimDaEvolucao;

  const [linhas, formas] = await Promise.all([
    transacoesRepo.listarDoPeriodo(householdId, primeiroDaJanela, ultimoDaJanela),
    formasRepo.listarAtivas(householdId),
  ]);

  const lancamentos = linhas.map(comoLancamento);

  const porMes = new Map();
  for (const lancamento of lancamentos) {
    if (!porMes.has(lancamento.referenceMonth)) porMes.set(lancamento.referenceMonth, []);
    porMes.get(lancamento.referenceMonth).push(lancamento);
  }
  const doMes = (mes) => porMes.get(mes) ?? [];

  const evolucao = [];
  for (let i = MESES_DE_EVOLUCAO - 1; i >= 0; i--) {
    const mes = addMonths(fimDaEvolucao, -i);
    evolucao.push(evolutionPoint(mes.slice(0, 7), doMes(mes)));
  }

  const formasBase = formas.map(comoForma);
  const dados = {};

  for (const mes of meses) {
    const lancamentosDoMes = doMes(mes);
    const lancamentosDoMesAnterior = doMes(addMonths(mes, -1));

    const agendadasFuturas = lancamentos
      .filter(
        (t) =>
          (t.kind === 'expense' || t.kind === 'investment') &&
          t.status === 'scheduled' &&
          t.referenceMonth > mes,
      )
      .map((t) => ({ paymentMethodId: t.paymentMethodId, amount: t.amount }));

    const projecao = [];
    for (let i = 0; i <= MESES_DE_PROJECAO; i++) {
      const mesProjetado = addMonths(mes, i);
      projecao.push({
        month: mesProjetado.slice(0, 7),
        total: installmentLoad(doMes(mesProjetado)),
      });
    }

    dados[mes] = {
      transactions: lancamentosDoMes.map(enxuto),
      dashboard: {
        ...buildDashboard(lancamentosDoMes, lancamentosDoMesAnterior, evolucao),
        installmentOutlook: projecao,
      },
      paymentMethods: withCardUsage(
        formasBase,
        lancamentosDoMes.map((t) => ({
          paymentMethodId: t.paymentMethodId,
          kind: t.kind,
          amount: t.amount,
        })),
        agendadasFuturas,
      ),
      categorySummary: buildCategorySummary(lancamentosDoMes),
    };
  }

  return { anchor: ancora, months: meses, data: dados };
}

module.exports = { montar };
