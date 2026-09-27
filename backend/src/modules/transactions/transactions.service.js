'use strict';
/**
 * Regras de lançamento.
 *
 * Módulo mais denso do sistema: concentra a alocação da compra na fatura correta
 * (RN02), a datação no vencimento (RN03), o parcelamento (RN05) e o pagamento de
 * fatura (RN04).
 */

const db = require('../../config/database');
const repositorio = require('./transactions.repository');
const categoriasRepo = require('../categories/categories.repository');
const formasRepo = require('../payment-methods/payment-methods.repository');
const recorrencias = require('../recurring/recurring.service');
const { splitInstallments, renumberPlan } = require('../../shared/installments');
const {
  startOfMonth,
  addMonths,
  invoiceMonth,
  dueDateInMonth,
  monthDiff,
  hoje,
} = require('../../shared/dates');
const { NotFoundError, ValidationError, BusinessRuleError } = require('../../shared/errors');

/** Converte a linha do banco no formato consumido pelo front-end. */
function comoLancamento(l) {
  const categoria = l.category_id
    ? {
        id: l.category_id,
        name: l.cat_name,
        icon: l.cat_icon,
        colorFg: l.cat_color_fg,
        colorBg: l.cat_color_bg,
        parentId: l.cat_parent_id,
        monthlyBudget: l.cat_budget,
        parent: l.pai_id
          ? {
              id: l.pai_id,
              name: l.pai_name,
              icon: l.pai_icon,
              colorFg: l.pai_color_fg,
              colorBg: l.pai_color_bg,
              monthlyBudget: l.pai_budget,
            }
          : null,
      }
    : null;

  return {
    id: l.id,
    kind: l.kind,
    description: l.description,
    amount: l.amount,
    status: l.status,
    notes: l.notes,
    transactionDate: l.transaction_date,
    purchaseDate: l.purchase_date,
    referenceMonth: l.reference_month,
    installmentPlanId: l.installment_plan_id,
    installmentNumber: l.installment_number,
    installmentPlan: l.total_installments ? { totalInstallments: l.total_installments } : null,
    paymentMethodId: l.payment_method_id,
    category: categoria,
    paymentMethod: {
      id: l.payment_method_id,
      name: l.met_name,
      kind: l.met_kind,
      color: l.met_color,
    },
    paidBy: l.paid_by_user_id ? { id: l.paid_by_user_id, name: l.pagador_nome } : null,
  };
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

/**
 * Resolve competência e datas de um lançamento, conforme a forma de pagamento.
 *
 * Em cartão de crédito, a data informada é a DATA DA COMPRA: dela saem a fatura
 * (pelo dia de fechamento) e o vencimento (pelo dia de vencimento). Nas demais
 * formas, a data informada já é o vencimento, e a data da compra é opcional.
 */
function resolverDatas(forma, dataInformada, dataDaCompraInformada) {
  const ehCredito = forma.kind === 'credit_card';

  if (!ehCredito) {
    return {
      referenceMonth: startOfMonth(dataInformada),
      transactionDate: dataInformada,
      purchaseDate: dataDaCompraInformada ?? null,
    };
  }

  const referenceMonth = forma.closing_day
    ? invoiceMonth(dataInformada, forma.closing_day)
    : startOfMonth(dataInformada);

  return {
    referenceMonth,
    transactionDate: forma.due_day
      ? dueDateInMonth(referenceMonth, forma.due_day)
      : dataInformada,
    purchaseDate: dataInformada,
  };
}

// --- Consulta ---------------------------------------------------------------

/**
 * Lançamentos do mês.
 *
 * Antes de listar, garante que as recorrências vigentes do mês já existam: é o
 * que faz um mês nunca visitado aparecer completo na primeira visita (UC18).
 */
async function listar(householdId, mes, filtros) {
  const referenceMonth = startOfMonth(mes);
  await recorrencias.materializarMes(householdId, referenceMonth);
  const linhas = await repositorio.listarDoMes(householdId, referenceMonth, filtros);
  return linhas.map(comoLancamento);
}

// --- Criação ----------------------------------------------------------------

async function criar(householdId, userId, dados) {
  await validarReferencias(householdId, dados.categoryId, dados.paymentMethodId);

  const forma = await formasRepo.buscarPorId(dados.paymentMethodId, householdId);
  const pagador = dados.paidByUserId ?? userId;

  if (dados.kind === 'card_payment') {
    return criarPagamentoDeFatura(householdId, userId, pagador, dados, forma);
  }

  if (!dados.categoryId) {
    throw new ValidationError('Categoria é obrigatória para este tipo de lançamento.', 'categoryId');
  }

  const parcelas = Math.max(1, Math.trunc(dados.totalInstallments ?? 1));
  if (parcelas > 1) {
    return criarParcelado(householdId, userId, pagador, dados, forma, parcelas);
  }

  const datas = resolverDatas(forma, dados.transactionDate, dados.purchaseDate);
  const criado = await repositorio.inserir({
    householdId,
    createdByUserId: userId,
    paidByUserId: pagador,
    categoryId: dados.categoryId,
    paymentMethodId: dados.paymentMethodId,
    kind: dados.kind,
    description: dados.description,
    amount: dados.amount,
    status: dados.status ?? 'paid',
    notes: dados.notes ?? null,
    ...datas,
  });

  return comoLancamento(await repositorio.buscarPorId(criado.id, householdId));
}

/**
 * Pagamento de fatura (RN04).
 *
 * Não segue a regra de fechamento das compras: uma fatura é paga DEPOIS de
 * fechar, e rolar o pagamento para o mês seguinte deixaria a fatura atual
 * eternamente em aberto. Quem paga escolhe a fatura, que é a exibida na tela.
 */
async function criarPagamentoDeFatura(householdId, userId, pagador, dados, forma) {
  if (forma.kind !== 'credit_card') {
    throw new BusinessRuleError('Só cartões de crédito possuem fatura a pagar.');
  }

  const mesDaFatura = startOfMonth(dados.referenceMonth ?? dados.transactionDate);

  const criado = await repositorio.inserir({
    householdId,
    createdByUserId: userId,
    paidByUserId: pagador,
    categoryId: null, // pagamento de fatura não tem categoria
    paymentMethodId: dados.paymentMethodId,
    kind: 'card_payment',
    description: dados.description || 'Pagamento de fatura',
    amount: dados.amount,
    transactionDate: dados.transactionDate, // data real do pagamento
    purchaseDate: null,
    referenceMonth: mesDaFatura,
    status: 'paid',
    notes: dados.notes ?? null,
  });

  return comoLancamento(await repositorio.buscarPorId(criado.id, householdId));
}

/**
 * Compra parcelada (UC11).
 *
 * Cria o plano e uma parcela por mês consecutivo, tudo em uma única transação:
 * um plano sem parcelas, ou com parte delas, seria pior do que a falha.
 *
 * Parcelamento em andamento: informando que a parcela deste mês é a N de M, só
 * as parcelas de N em diante são criadas. As anteriores foram pagas antes do uso
 * do sistema e lançá-las distorceria os meses passados. O plano guarda a janela
 * real, com o primeiro mês no passado.
 */
async function criarParcelado(householdId, userId, pagador, dados, forma, parcelas) {
  const parcelaInicial = Math.max(1, Math.trunc(dados.currentInstallment ?? 1));
  if (parcelaInicial > parcelas) {
    throw new BusinessRuleError('A parcela atual não pode ser maior que o total de parcelas.');
  }

  const datas = resolverDatas(forma, dados.transactionDate, dados.purchaseDate);
  const valores = splitInstallments(dados.amount, parcelas);

  const primeiroMes = addMonths(datas.referenceMonth, -(parcelaInicial - 1));
  const ultimoMes = addMonths(datas.referenceMonth, parcelas - parcelaInicial);

  return db.transaction(async (tx) => {
    const plano = await repositorio.criarPlano(
      {
        householdId,
        categoryId: dados.categoryId,
        paymentMethodId: dados.paymentMethodId,
        createdByUserId: userId,
        description: dados.description,
        totalAmount: dados.amount,
        installmentAmount: valores[0],
        totalInstallments: parcelas,
        firstMonth: primeiroMes,
        lastMonth: ultimoMes,
      },
      tx,
    );

    for (let indice = parcelaInicial - 1; indice < parcelas; indice++) {
      const mes = addMonths(datas.referenceMonth, indice - (parcelaInicial - 1));
      const ehAPrimeiraCriada = indice === parcelaInicial - 1;

      await repositorio.inserir(
        {
          householdId,
          createdByUserId: userId,
          paidByUserId: pagador,
          categoryId: dados.categoryId,
          paymentMethodId: dados.paymentMethodId,
          installmentPlanId: plano.id,
          installmentNumber: indice + 1,
          kind: dados.kind,
          description: `${dados.description} (${indice + 1}/${parcelas})`,
          amount: valores[indice],
          transactionDate: ehAPrimeiraCriada
            ? datas.transactionDate
            : forma.due_day
              ? dueDateInMonth(mes, forma.due_day)
              : mes,
          purchaseDate: datas.purchaseDate,
          referenceMonth: mes,
          // Só a parcela do mês recebe a situação informada; as futuras nascem agendadas
          status: ehAPrimeiraCriada ? (dados.status ?? 'paid') : 'scheduled',
          notes: dados.notes ?? null,
        },
        tx,
      );
    }

    return {
      plan: {
        id: plano.id,
        description: plano.description,
        totalAmount: plano.total_amount,
        installmentAmount: plano.installment_amount,
        totalInstallments: plano.total_installments,
        firstMonth: plano.first_month,
        lastMonth: plano.last_month,
      },
    };
  });
}

// --- Alteração --------------------------------------------------------------

async function atualizar(householdId, id, alteracoes) {
  const existente = await repositorio.buscarPorId(id, householdId);
  if (!existente) throw new NotFoundError('Lançamento não encontrado.');
  await validarReferencias(householdId, alteracoes.categoryId, alteracoes.paymentMethodId);

  const dados = {};
  for (const campo of ['kind', 'description', 'amount', 'categoryId', 'paymentMethodId', 'status', 'notes']) {
    if (alteracoes[campo] !== undefined) dados[campo] = alteracoes[campo];
  }

  // Datas seguem a mesma régua da criação: alterar a data de uma compra em cartão
  // recalcula a fatura e o vencimento.
  if (alteracoes.transactionDate !== undefined || alteracoes.purchaseDate !== undefined) {
    const tipo = alteracoes.kind ?? existente.kind;
    const formaId = alteracoes.paymentMethodId ?? existente.payment_method_id;
    const forma = await formasRepo.buscarPorId(formaId, householdId);

    if (tipo === 'card_payment') {
      if (alteracoes.transactionDate !== undefined) {
        dados.transactionDate = alteracoes.transactionDate;
      }
    } else if (alteracoes.transactionDate !== undefined) {
      const datas = resolverDatas(forma, alteracoes.transactionDate, alteracoes.purchaseDate);
      dados.transactionDate = datas.transactionDate;
      dados.referenceMonth = datas.referenceMonth;
      dados.purchaseDate = datas.purchaseDate;
    } else if (alteracoes.purchaseDate !== undefined) {
      dados.purchaseDate = alteracoes.purchaseDate;
    }
  }

  return comoLancamento(await repositorio.atualizar(id, householdId, dados));
}

async function arquivar(householdId, id) {
  const existente = await repositorio.buscarPorId(id, householdId);
  if (!existente) throw new NotFoundError('Lançamento não encontrado.');
  await repositorio.definirArquivamento(id, householdId, true);
}

async function restaurar(householdId, id) {
  const restaurado = await repositorio.definirArquivamento(id, householdId, false);
  if (!restaurado) throw new NotFoundError('Lançamento não encontrado.');
  return comoLancamento(await repositorio.buscarPorId(id, householdId));
}

// --- Renumeração de parcelamento --------------------------------------------

/**
 * Corrige a numeração de um parcelamento a partir do mês exibido (UC12).
 *
 * Toda a decisão sobre o que atualizar, remover e criar vem da função pura
 * renumberPlan, testada sem banco. Aqui só se traduz a decisão em comandos.
 * Nenhum valor de parcela é alterado.
 */
async function renumerarPlano(householdId, planId, mesAncora, novoNumero, novoTotal) {
  const plano = await repositorio.buscarPlano(planId, householdId);
  if (!plano) throw new NotFoundError('Parcelamento não encontrado.');

  const ancora = startOfMonth(mesAncora);
  const parcelas = await repositorio.parcelasDoPlano(planId, householdId);

  const decisao = renumberPlan(
    parcelas.map((p) => ({ monthOffset: monthDiff(p.reference_month, ancora), status: p.status })),
    novoNumero,
    novoTotal,
  );
  if (typeof decisao === 'string') throw new BusinessRuleError(decisao);

  const porDeslocamento = new Map(
    parcelas.map((p) => [monthDiff(p.reference_month, ancora), p]),
  );
  const semSufixo = (texto) => texto.replace(/\s*\(\d+\/\d+\)\s*$/, '');
  const parcelaAncora = porDeslocamento.get(0);

  await db.transaction(async (tx) => {
    for (const alteracao of decisao.updates) {
      const parcela = porDeslocamento.get(alteracao.monthOffset);
      await tx.query(
        'UPDATE transactions SET installment_number = $2, description = $3 WHERE id = $1',
        [
          parcela.id,
          alteracao.numero,
          `${semSufixo(parcela.description)} (${alteracao.numero}/${novoTotal})`,
        ],
      );
    }

    if (decisao.remove.length > 0) {
      const ids = decisao.remove.map((deslocamento) => porDeslocamento.get(deslocamento).id);
      await tx.query('DELETE FROM transactions WHERE id = ANY($1::uuid[])', [ids]);
    }

    for (const nova of decisao.create) {
      const mes = addMonths(ancora, nova.monthOffset);
      await tx.query(
        `INSERT INTO transactions
           (household_id, created_by_user_id, category_id, payment_method_id,
            installment_plan_id, installment_number, kind, description, amount,
            transaction_date, reference_month, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'scheduled')`,
        [
          householdId,
          plano.created_by_user_id,
          plano.category_id,
          plano.payment_method_id,
          plano.id,
          nova.numero,
          parcelaAncora.kind,
          `${semSufixo(plano.description)} (${nova.numero}/${novoTotal})`,
          plano.installment_amount,
          mes,
          mes,
        ],
      );
    }

    // Os tipos são declarados explicitamente porque o mesmo parâmetro alimenta
    // uma coluna inteira e uma conta decimal, e o banco não deduz um tipo único.
    await tx.query(
      `UPDATE installment_plans
          SET total_installments = $2::smallint,
              total_amount = ROUND($3::numeric * $2::numeric, 2),
              first_month = $4::date,
              last_month = $5::date
        WHERE id = $1`,
      [
        plano.id,
        novoTotal,
        plano.installment_amount,
        addMonths(ancora, 1 - novoNumero),
        addMonths(ancora, novoTotal - novoNumero),
      ],
    );
  });

  return repositorio.buscarPlano(planId, householdId);
}

module.exports = {
  listar,
  criar,
  atualizar,
  arquivar,
  restaurar,
  renumerarPlano,
  comoLancamento,
  resolverDatas,
};
