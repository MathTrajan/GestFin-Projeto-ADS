'use strict';

const repositorio = require('./payment-methods.repository');
const { withCardUsage } = require('../../shared/card-usage');
const { NotFoundError } = require('../../shared/errors');

const comoForma = (f) => ({
  id: f.id,
  name: f.name,
  kind: f.kind,
  ownerLabel: f.owner_label,
  color: f.color,
  limitValue: f.limit_value,
  closingDay: f.closing_day,
  dueDay: f.due_day,
  archived: f.archived,
});

/**
 * Descarta os atributos de crédito quando a forma não é cartão.
 *
 * O banco também recusa a combinação, por restrição. A limpeza aqui evita que
 * uma troca de tipo (de cartão para Pix, por exemplo) falhe por causa de valores
 * antigos que o usuário nem vê mais na tela.
 */
function normalizarCredito(dados, tipoAtual) {
  const tipo = dados.kind ?? tipoAtual;
  if (tipo === 'credit_card') return dados;
  return { ...dados, limitValue: null, closingDay: null, dueDay: null };
}

/** Formas ativas com o uso do mês e o limite comprometido (RF21). */
async function listarComUso(householdId, referenceMonth) {
  // As três leituras são independentes entre si: executá-las em paralelo evita
  // somar três idas ao banco em série (RNF15).
  const [formas, movimentacao, agendadas] = await Promise.all([
    repositorio.listarAtivas(householdId),
    repositorio.movimentacaoDoMes(householdId, referenceMonth),
    repositorio.agendadasFuturas(householdId, referenceMonth),
  ]);

  const comUso = withCardUsage(
    formas.map(comoForma),
    movimentacao.map((m) => ({
      paymentMethodId: m.payment_method_id,
      kind: m.kind,
      amount: m.amount,
    })),
    agendadas.map((a) => ({ paymentMethodId: a.payment_method_id, amount: a.amount })),
  );

  return comUso;
}

async function criar(householdId, dados) {
  const criada = await repositorio.criar(householdId, normalizarCredito(dados, dados.kind));
  return comoForma(criada);
}

async function atualizar(householdId, id, alteracoes) {
  const existente = await repositorio.buscarPorId(id, householdId);
  if (!existente) throw new NotFoundError('Forma de pagamento não encontrada.');

  const dados = normalizarCredito(alteracoes, existente.kind);
  const atualizada = await repositorio.atualizar(id, householdId, dados);
  return comoForma(atualizada);
}

async function arquivar(householdId, id) {
  const existente = await repositorio.buscarPorId(id, householdId);
  if (!existente) throw new NotFoundError('Forma de pagamento não encontrada.');
  return comoForma(await repositorio.arquivar(id, householdId));
}

module.exports = { listarComUso, criar, atualizar, arquivar, comoForma };
