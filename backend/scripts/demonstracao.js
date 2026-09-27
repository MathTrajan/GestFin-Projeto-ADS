/**
 * Demonstração das regras de negócio contra a API em execução.
 *
 * Exercita, em sequência, a regra de fechamento de fatura, o parcelamento com
 * resíduo de centavos, a geração automática de recorrências e os indicadores do
 * painel, imprimindo os resultados. Serve como evidência de funcionamento e como
 * roteiro de conferência manual.
 *
 * Uso, com a API no ar e o banco populado pela carga inicial:
 *   npm start                      (em outro terminal)
 *   node scripts/demonstracao.js
 */

const { Cliente } = require('../tests/integracao/cliente');
const c = new Cliente('http://localhost:3600');
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

(async () => {
  const perfis = await c.get('/api/users');
  const membro = perfis.dados.users[0];
  await c.post('/api/auth/login', { userId: membro.id });
  console.log(`Entrou como ${membro.name} (${membro.householdName})\n`);

  const cats = await c.get('/api/categories');
  const moradia = cats.dados.categories.find((x) => x.name === 'Moradia e casa');
  const formas = await c.get('/api/payment-methods?month=2026-08-01');
  const pix = formas.dados.paymentMethods.find((f) => f.kind === 'pix');

  const cartao = (await c.post('/api/payment-methods', {
    name: 'Cartão Exemplo', kind: 'credit_card', color: '#993556',
    limitValue: 5000, closingDay: 10, dueDay: 20,
  })).dados.paymentMethod;
  console.log(`Cartão criado: fecha dia ${cartao.closingDay}, vence dia ${cartao.dueDay}\n`);

  // Compra ANTES do fechamento
  const antes = (await c.post('/api/transactions', {
    kind: 'expense', description: 'Compra dia 9', amount: 300,
    categoryId: moradia.id, paymentMethodId: cartao.id, transactionDate: '2026-08-09',
  })).dados.transaction;

  // Compra NO dia do fechamento
  const noDia = (await c.post('/api/transactions', {
    kind: 'expense', description: 'Compra dia 10', amount: 400,
    categoryId: moradia.id, paymentMethodId: cartao.id, transactionDate: '2026-08-10',
  })).dados.transaction;

  console.log('REGRA DE FECHAMENTO (cartão fecha dia 10)');
  console.log(`  compra em 09/08 -> fatura de ${antes.referenceMonth}, vence ${antes.transactionDate}`);
  console.log(`  compra em 10/08 -> fatura de ${noDia.referenceMonth}, vence ${noDia.transactionDate}\n`);

  // Parcelamento com resíduo
  const plano = (await c.post('/api/transactions', {
    kind: 'expense', description: 'Notebook', amount: 100,
    categoryId: moradia.id, paymentMethodId: cartao.id,
    transactionDate: '2026-08-05', totalInstallments: 3,
  })).dados.plan;

  const parcelas = (await c.get('/api/transactions?month=2026-08-01')).dados.transactions
    .filter((t) => t.installmentPlanId === plano.id);
  console.log('PARCELAMENTO de R$ 100,00 em 3x');
  for (let m of ['2026-08-01','2026-09-01','2026-10-01']) {
    const lista = (await c.get(`/api/transactions?month=${m}`)).dados.transactions
      .filter((t) => t.installmentPlanId === plano.id);
    for (const p of lista) console.log(`  ${m}: ${p.description} = ${brl(p.amount)} (${p.status})`);
  }

  // Recorrência
  await c.post('/api/recurring', {
    kind: 'expense', description: 'Assinatura de streaming', amount: 39.9,
    categoryId: moradia.id, paymentMethodId: pix.id, dayOfMonth: 5,
    startMonth: '2026-08-01',
  });
  const set = (await c.get('/api/transactions?month=2026-09-01')).dados.transactions
    .filter((t) => t.notes === 'Recorrente');
  console.log(`\nRECORRÊNCIA: ${set.length} lançamento gerado automaticamente em setembro`);
  console.log(`  ${set[0].description} = ${brl(set[0].amount)} em ${set[0].transactionDate}\n`);

  // Conta pendente + pagamento parcial de fatura
  await c.post('/api/transactions', {
    kind: 'expense', description: 'Conta de luz', amount: 220,
    categoryId: moradia.id, paymentMethodId: pix.id,
    transactionDate: '2026-08-25', status: 'pending',
  });
  await c.post('/api/transactions', {
    kind: 'card_payment', description: 'Pagamento parcial da fatura', amount: 200,
    paymentMethodId: cartao.id, transactionDate: '2026-08-20', referenceMonth: '2026-08-01',
  });

  const p = (await c.get('/api/dashboard?month=2026-08-01')).dados;
  console.log('PAINEL DE AGOSTO/2026');
  console.log(`  Saídas ........... ${brl(p.summary.expense)}`);
  console.log(`  A pagar .......... ${brl(p.summary.toPay)}`);
  console.log(`  Pago ............. ${brl(p.summary.paidOut)}`);
  console.log(`  Parcelas do mês .. ${brl(p.summary.installments)} em ${p.summary.installmentsCount}`);
  console.log(`  Projeção .........`, p.installmentOutlook.map(o => `${o.month}: ${brl(o.total)}`).join('  '));

  const cf = (await c.get('/api/payment-methods?month=2026-08-01')).dados.paymentMethods
    .find(f => f.id === cartao.id);
  console.log(`\nCARTÃO`);
  console.log(`  Gasto no mês ......... ${brl(cf.spentThisMonth)}`);
  console.log(`  Pago da fatura ....... ${brl(cf.invoicePaid)}`);
  console.log(`  Em aberto ............ ${brl(cf.usedThisMonth)}`);
  console.log(`  Limite comprometido .. ${brl(cf.totalLimitUsed)}`);
})();
