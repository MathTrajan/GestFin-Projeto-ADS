'use strict';
/**
 * Painel do mês.
 *
 * O serviço reúne os dados e delega TODA a matemática ao módulo compartilhado de
 * agregações. É essa separação que impede o painel e a tela de lançamentos de
 * divergirem (decisão DA01).
 */

const repositorio = require('../transactions/transactions.repository');
const recorrencias = require('../recurring/recurring.service');
const { comoLancamento } = require('../transactions/transactions.service');
const {
  buildDashboard,
  evolutionPoint,
  installmentLoad,
} = require('../../shared/month-summary');
const { startOfMonth, addMonths, hoje } = require('../../shared/dates');

const MESES_DE_EVOLUCAO = 6;
const MESES_DE_PROJECAO = 5;

/** Indicadores completos de um mês (UC17). */
async function montarPainel(householdId, mes) {
  const referenceMonth = startOfMonth(mes);
  const mesAnterior = addMonths(referenceMonth, -1);

  // A série de evolução é sempre relativa ao mês CORRENTE, e não ao mês exibido:
  // ela responde "como os últimos seis meses se comportaram", pergunta que não
  // muda ao navegar para o passado.
  const fimDaEvolucao = startOfMonth(hoje());
  const inicioDaEvolucao = addMonths(fimDaEvolucao, -(MESES_DE_EVOLUCAO - 1));
  const fimDaProjecao = addMonths(referenceMonth, MESES_DE_PROJECAO);

  await recorrencias.materializar(householdId, [referenceMonth, mesAnterior]);

  // As três leituras são independentes: em paralelo, uma ida ao banco em vez de três
  const [linhasDoPeriodo, linhasDaEvolucao, parcelasFuturas] = await Promise.all([
    repositorio.listarDoPeriodo(householdId, mesAnterior, referenceMonth),
    repositorio.resumoDoPeriodo(householdId, inicioDaEvolucao, fimDaEvolucao),
    repositorio.resumoDoPeriodo(householdId, addMonths(referenceMonth, 1), fimDaProjecao),
  ]);

  const lancamentos = linhasDoPeriodo.map(comoLancamento);
  const doMes = lancamentos.filter((t) => t.referenceMonth === referenceMonth);
  const doMesAnterior = lancamentos.filter((t) => t.referenceMonth === mesAnterior);

  const evolucao = [];
  for (let i = MESES_DE_EVOLUCAO - 1; i >= 0; i--) {
    const mesDaSerie = addMonths(fimDaEvolucao, -i);
    evolucao.push(
      evolutionPoint(
        mesDaSerie.slice(0, 7),
        linhasDaEvolucao.filter((l) => l.reference_month === mesDaSerie),
      ),
    );
  }

  // Comprometimento com parcelas: o mês exibido e os cinco seguintes
  const projecaoDeParcelas = [];
  for (let i = 0; i <= MESES_DE_PROJECAO; i++) {
    const mesDaProjecao = addMonths(referenceMonth, i);
    const origem =
      i === 0
        ? doMes.map((t) => ({ kind: t.kind, amount: t.amount, installmentPlanId: t.installmentPlanId }))
        : parcelasFuturas
            .filter((l) => l.reference_month === mesDaProjecao)
            .map((l) => ({
              kind: l.kind,
              amount: l.amount,
              installmentPlanId: l.installment_plan_id,
            }));

    projecaoDeParcelas.push({
      month: mesDaProjecao.slice(0, 7),
      total: installmentLoad(origem),
    });
  }

  return {
    ...buildDashboard(doMes, doMesAnterior, evolucao),
    installmentOutlook: projecaoDeParcelas,
  };
}

module.exports = { montarPainel };
