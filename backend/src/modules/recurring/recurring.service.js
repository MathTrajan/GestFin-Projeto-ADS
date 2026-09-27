'use strict';
/**
 * Contas recorrentes e sua materialização.
 *
 * A regra descreve a cobrança; os lançamentos são criados sob demanda, quando o
 * mês é consultado (UC18). Isso evita ter de gerar meses futuros indefinidamente
 * e faz um mês nunca visitado nascer completo na primeira visita.
 */

const repositorio = require('./recurring.repository');
const categoriasRepo = require('../categories/categories.repository');
const formasRepo = require('../payment-methods/payment-methods.repository');
const { startOfMonth, addMonths, daysInMonth, dueDateInMonth, montar } = require('../../shared/dates');
const { NotFoundError, ValidationError } = require('../../shared/errors');

const comoRegra = (r) => ({
  id: r.id,
  kind: r.kind,
  description: r.description,
  amount: r.amount,
  dayOfMonth: r.day_of_month,
  status: r.status,
  active: r.active,
  startMonth: r.start_month,
  endMonth: r.end_month,
  categoryId: r.category_id,
  paymentMethodId: r.payment_method_id,
  category: r.category_name
    ? { id: r.category_id, name: r.category_name, icon: r.category_icon, colorFg: r.category_color }
    : null,
  paymentMethod: r.method_name
    ? { id: r.payment_method_id, name: r.method_name, kind: r.method_kind, color: r.method_color }
    : null,
});

/**
 * Mês da fatura e data do lançamento de uma cobrança que ocorre no mês `mesDaCobranca`.
 *
 * Em cartão de crédito, a cobrança segue a mesma regra das compras: caindo no dia
 * do fechamento ou depois, entra na fatura do mês seguinte (RN02). Como o dia da
 * regra é limitado a 28, a decisão é estável em todos os meses do ano.
 */
function resolverFatura(mesDaCobranca, diaDoMes, cartao) {
  const diaEfetivo = Math.min(diaDoMes, daysInMonth(mesDaCobranca));
  const fechamento = cartao ? cartao.closingDay : null;

  const mesDaFatura =
    fechamento && diaEfetivo >= fechamento ? addMonths(mesDaCobranca, 1) : startOfMonth(mesDaCobranca);

  const vencimento = cartao ? cartao.dueDay : null;
  const [ano, mes] = mesDaCobranca.split('-').map(Number);
  const dataDoLancamento = vencimento
    ? dueDateInMonth(mesDaFatura, vencimento)
    : montar(ano, mes, diaEfetivo);

  return { mesDaFatura, dataDoLancamento };
}

/**
 * Garante os lançamentos das regras vigentes para os meses informados.
 *
 * Uma única passagem cobre vários meses, com três idas ao banco no total, em vez
 * de duas por mês.
 */
async function materializar(householdId, meses) {
  if (meses.length === 0) return 0;

  const ordenados = [...meses].sort();
  const primeiro = ordenados[0];
  const ultimo = ordenados[ordenados.length - 1];
  // A cobrança do mês anterior ao primeiro alvo pode rolar para dentro da janela
  const anteriorAoPrimeiro = addMonths(primeiro, -1);

  const regras = await repositorio.vigentesNoPeriodo(householdId, anteriorAoPrimeiro, ultimo);
  if (regras.length === 0) return 0;

  const existentes = await repositorio.jaMaterializados(householdId, ordenados);
  const jaFeitos = new Set(existentes.map((e) => `${e.recurring_rule_id}|${e.reference_month}`));

  // Meses candidatos a gerar cobrança: cada alvo e o mês imediatamente anterior
  const candidatos = new Set();
  for (const mes of ordenados) {
    candidatos.add(mes);
    candidatos.add(addMonths(mes, -1));
  }
  const alvos = new Set(ordenados);

  const aInserir = [];
  for (const mesDaCobranca of candidatos) {
    for (const regra of regras) {
      if (mesDaCobranca < regra.start_month) continue;
      if (regra.end_month && mesDaCobranca > regra.end_month) continue;

      const cartao =
        regra.method_kind === 'credit_card'
          ? { closingDay: regra.closing_day, dueDay: regra.due_day }
          : null;

      const { mesDaFatura, dataDoLancamento } = resolverFatura(
        mesDaCobranca,
        regra.day_of_month,
        cartao,
      );

      if (!alvos.has(mesDaFatura)) continue; // fatura cai fora da janela pedida

      const chave = `${regra.id}|${mesDaFatura}`;
      if (jaFeitos.has(chave)) continue;
      jaFeitos.add(chave); // evita duplicar dentro do próprio lote

      aInserir.push({
        householdId,
        createdByUserId: regra.created_by_user_id,
        categoryId: regra.category_id,
        paymentMethodId: regra.payment_method_id,
        recurringRuleId: regra.id,
        kind: regra.kind,
        description: regra.description,
        amount: regra.amount,
        transactionDate: dataDoLancamento,
        referenceMonth: mesDaFatura,
      });
    }
  }

  return repositorio.inserirGerados(aInserir);
}

/** Materializa um único mês. Atalho usado pelas telas de mês. */
const materializarMes = (householdId, mes) => materializar(householdId, [mes]);

async function listar(householdId) {
  const regras = await repositorio.listar(householdId);
  return regras.map(comoRegra);
}

/** Categoria e forma precisam pertencer à residência de quem chamou (RNF12). */
async function validarReferencias(householdId, categoryId, paymentMethodId) {
  if (categoryId) {
    const categoria = await categoriasRepo.buscarPorId(categoryId, householdId);
    if (!categoria) throw new ValidationError('Categoria inválida.', 'categoryId');
  }
  if (paymentMethodId) {
    const forma = await formasRepo.buscarPorId(paymentMethodId, householdId);
    if (!forma) throw new ValidationError('Forma de pagamento inválida.', 'paymentMethodId');
  }
}

async function criar(householdId, userId, dados) {
  await validarReferencias(householdId, dados.categoryId, dados.paymentMethodId);

  const criada = await repositorio.criar(householdId, userId, {
    ...dados,
    startMonth: startOfMonth(dados.startMonth ?? new Date().toISOString().slice(0, 10)),
    endMonth: dados.endMonth ? startOfMonth(dados.endMonth) : null,
  });
  return comoRegra(criada);
}

async function atualizar(householdId, id, alteracoes) {
  const existente = await repositorio.buscarPorId(id, householdId);
  if (!existente) throw new NotFoundError('Regra não encontrada.');
  await validarReferencias(householdId, alteracoes.categoryId, alteracoes.paymentMethodId);

  const dados = { ...alteracoes };
  if (dados.startMonth !== undefined) dados.startMonth = startOfMonth(dados.startMonth);
  if (dados.endMonth !== undefined) {
    dados.endMonth = dados.endMonth ? startOfMonth(dados.endMonth) : null;
  }

  return comoRegra(await repositorio.atualizar(id, householdId, dados));
}

async function excluir(householdId, id) {
  const existente = await repositorio.buscarPorId(id, householdId);
  if (!existente) throw new NotFoundError('Regra não encontrada.');
  await repositorio.excluir(id, householdId);
}

module.exports = {
  materializar,
  materializarMes,
  resolverFatura,
  listar,
  criar,
  atualizar,
  excluir,
};
