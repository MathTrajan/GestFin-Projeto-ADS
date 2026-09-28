'use strict';
/**
 * Testes de integração da API.
 *
 * Casos CTI01 a CTI32 do plano de testes. Executam contra um banco DEDICADO,
 * recriado a cada execução: rodar contra o banco de desenvolvimento apagaria
 * dados de verdade.
 *
 * Pré-requisito:
 *   createdb -h localhost -p 5433 gestfin_test
 *   (as migrações são aplicadas por database/run-migrations.js)
 *
 * Execução:
 *   npm run test:integration
 */

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://localhost:5433/gestfin_test';
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECRET = 'segredo-de-teste';
// A suíte dispara centenas de requisições do mesmo endereço em poucos segundos.
// O teto de uso real (120/min) as bloquearia, mascarando o que se quer testar.
// O bloqueio progressivo do código de acesso continua ativo e é verificado no CTI05.
process.env.RATE_LIMIT_POR_MINUTO = '100000';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../../src/server');
const db = require('../../src/config/database');
const { Cliente } = require('./cliente');

let servidor;
let cliente;
let contexto = {};

/** Limpa a movimentação, preservando a estrutura criada pela carga inicial. */
async function limparMovimentacao() {
  await db.query('DELETE FROM transactions');
  await db.query('DELETE FROM installment_plans');
  await db.query('DELETE FROM recurring_rules');
  await db.query("DELETE FROM payment_methods WHERE kind = 'credit_card'");
  await db.query('UPDATE households SET pin_hash = NULL');
}

before(async () => {
  await new Promise((resolve) => {
    servidor = app.listen(0, resolve);
  });
  cliente = new Cliente(`http://127.0.0.1:${servidor.address().port}`);
});

after(async () => {
  await new Promise((resolve) => servidor.close(resolve));
  await db.encerrar();
});

beforeEach(async () => {
  await limparMovimentacao();

  // Sem código de acesso configurado, o sistema segue direto para a escolha de
  // perfil. É o cenário de primeira execução (CTS01).
  cliente.cookies.clear();
  const perfis = await cliente.get('/api/users');
  const membro = perfis.dados.users[0];
  await cliente.post('/api/auth/login', { userId: membro.id });

  const categorias = await cliente.get('/api/categories?all=1');
  const formas = await cliente.get('/api/payment-methods?month=2026-08-01');

  const cartao = await cliente.post('/api/payment-methods', {
    name: 'Cartão de teste',
    kind: 'credit_card',
    color: '#993556',
    limitValue: 5000,
    closingDay: 10,
    dueDay: 20,
  });

  contexto = {
    membro,
    categoria: categorias.dados.categories.find((c) => c.parentId === null),
    subcategoria: categorias.dados.categories.find((c) => c.parentId !== null),
    pix: formas.dados.paymentMethods.find((f) => f.kind === 'pix'),
    cartao: cartao.dados.paymentMethod,
  };
});

// ---------------------------------------------------------------------------

describe('Acesso e sessão', () => {
  test('CTI01 – rota protegida sem sessão devolve 401', async () => {
    const anonimo = cliente.anonimo();
    const resposta = await anonimo.get('/api/dashboard?month=2026-08-01');
    assert.equal(resposta.status, 401);
    assert.equal(resposta.dados.summary, undefined);
  });

  test('CTI03, CTI04 – destravar com código correto e incorreto', async () => {
    await cliente.post('/api/auth/set-pin', { pin: '4721' });

    const anonimo = cliente.anonimo();
    const errado = await anonimo.post('/api/auth/unlock', { pin: '1111' });
    assert.equal(errado.status, 401);
    assert.match(errado.dados.erro, /incorreto/i);

    const certo = await anonimo.post('/api/auth/unlock', { pin: '4721' });
    assert.equal(certo.status, 200);
    assert.ok(anonimo.cookies.has('gestfin_destravado'));
  });

  test('CTI02 – lista de perfis exige o acesso destravado', async () => {
    await cliente.post('/api/auth/set-pin', { pin: '4721' });

    const anonimo = cliente.anonimo();
    const bloqueado = await anonimo.get('/api/users');
    assert.equal(bloqueado.status, 401);

    await anonimo.post('/api/auth/unlock', { pin: '4721' });
    const liberado = await anonimo.get('/api/users');
    assert.equal(liberado.status, 200);
    assert.ok(liberado.dados.users.length >= 2);
  });

  test('CTI05 – tentativas sucessivas bloqueiam a origem', async () => {
    await cliente.post('/api/auth/set-pin', { pin: '4721' });
    const anonimo = cliente.anonimo();

    let bloqueou = false;
    for (let tentativa = 1; tentativa <= 10; tentativa++) {
      const resposta = await anonimo.post('/api/auth/unlock', { pin: '0000' });
      if (resposta.status === 429) {
        bloqueou = true;
        assert.ok(resposta.headers.get('retry-after'));
        assert.match(resposta.dados.erro, /aguarde/i);
        break;
      }
    }
    assert.ok(bloqueou, 'a origem deveria ter sido bloqueada antes da décima tentativa');
  });

  test('sair encerra a sessão', async () => {
    const antes = await cliente.get('/api/auth/me');
    assert.equal(antes.status, 200);

    await cliente.post('/api/auth/logout');
    const depois = await cliente.get('/api/auth/me');
    assert.equal(depois.status, 401);
  });
});

describe('Validação e segurança', () => {
  test('CTI07 – campo desconhecido é descartado', async () => {
    const resposta = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Mercado',
      amount: 250,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-15',
      campoInventado: 'valor malicioso',
      archived: true,
    });
    assert.equal(resposta.status, 201);
    // O campo extra não chega ao banco: o lançamento continua visível
    const lista = await cliente.get('/api/transactions?month=2026-08-01');
    assert.equal(lista.dados.transactions.length, 1);
  });

  test('CTI08 – valor negativo é recusado', async () => {
    const resposta = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Valor inválido',
      amount: -50,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-15',
    });
    assert.equal(resposta.status, 400);
    assert.equal(resposta.dados.campo, 'amount');
  });

  test('CTI09 – tentativa de injeção de SQL é tratada como texto', async () => {
    await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Mercado',
      amount: 100,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-15',
    });

    const ataque = encodeURIComponent("'; DROP TABLE transactions; --");
    const resposta = await cliente.get(`/api/transactions?month=2026-08-01&q=${ataque}`);
    assert.equal(resposta.status, 200);
    assert.equal(resposta.dados.transactions.length, 0); // nada casa com o texto

    // A tabela continua de pé
    const conferencia = await cliente.get('/api/transactions?month=2026-08-01');
    assert.equal(conferencia.status, 200);
    assert.equal(conferencia.dados.transactions.length, 1);
  });

  test('CTI06 – identificador de outra residência devolve 404', async () => {
    const outraResidencia = await db.row(
      "INSERT INTO households (name) VALUES ('Outra casa') RETURNING id",
    );
    const outraCategoria = await db.row(
      `INSERT INTO categories (household_id, name, icon, color_bg, color_fg)
       VALUES ($1, 'Categoria alheia', 'tag', '#EEEDFE', '#534AB7') RETURNING id`,
      [outraResidencia.id],
    );

    const resposta = await cliente.patch(`/api/categories/${outraCategoria.id}`, {
      name: 'Tentativa',
    });
    assert.equal(resposta.status, 404);

    await db.query('DELETE FROM categories WHERE household_id = $1', [outraResidencia.id]);
    await db.query('DELETE FROM households WHERE id = $1', [outraResidencia.id]);
  });

  test('data em formato inválido é recusada', async () => {
    const resposta = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Data errada',
      amount: 100,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      transactionDate: '15/08/2026',
    });
    assert.equal(resposta.status, 400);
    assert.equal(resposta.dados.campo, 'transactionDate');
  });
});

describe('Lançamentos e regra de fatura', () => {
  test('CTI10 – despesa em Pix usa a data informada como competência', async () => {
    const resposta = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Mercado',
      amount: 250,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-15',
    });
    assert.equal(resposta.status, 201);
    assert.equal(resposta.dados.transaction.referenceMonth, '2026-08-01');
    assert.equal(resposta.dados.transaction.transactionDate, '2026-08-15');
  });

  test('CTI11 – compra em cartão após o fechamento cai na fatura seguinte', async () => {
    // Cartão fecha dia 10 e vence dia 20; compra em 15 de agosto
    const resposta = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Compra no cartão',
      amount: 300,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-15',
    });
    assert.equal(resposta.status, 201);

    const t = resposta.dados.transaction;
    assert.equal(t.referenceMonth, '2026-09-01', 'deveria cair na fatura de setembro');
    assert.equal(t.transactionDate, '2026-09-20', 'deveria vencer no dia 20 de setembro');
    assert.equal(t.purchaseDate, '2026-08-15', 'a data da compra deveria ser preservada');
  });

  test('compra em cartão antes do fechamento fica na fatura do mês', async () => {
    const resposta = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Compra antes do fechamento',
      amount: 300,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-09',
    });
    assert.equal(resposta.dados.transaction.referenceMonth, '2026-08-01');
    assert.equal(resposta.dados.transaction.transactionDate, '2026-08-20');
  });

  test('CTI14 – despesa sem categoria é recusada', async () => {
    const resposta = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Sem categoria',
      amount: 100,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-15',
    });
    assert.equal(resposta.status, 400);
    assert.match(resposta.dados.erro, /categoria/i);
  });

  test('CTI21, CTI22 – arquivar remove da lista e restaurar devolve', async () => {
    const criada = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Para arquivar',
      amount: 100,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-15',
    });
    const id = criada.dados.transaction.id;

    await cliente.delete(`/api/transactions/${id}`);
    const semArquivada = await cliente.get('/api/transactions?month=2026-08-01');
    assert.equal(semArquivada.dados.transactions.length, 0);

    const restaurada = await cliente.post(`/api/transactions/${id}/restore`);
    assert.equal(restaurada.status, 200);
    assert.equal(restaurada.dados.transaction.amount, 100);

    const comRestaurada = await cliente.get('/api/transactions?month=2026-08-01');
    assert.equal(comRestaurada.dados.transactions.length, 1);
  });

  test('CTI23 – editar a data de compra em cartão recalcula a fatura', async () => {
    const criada = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Compra a corrigir',
      amount: 200,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-05', // antes do fechamento
    });
    assert.equal(criada.dados.transaction.referenceMonth, '2026-08-01');

    const editada = await cliente.patch(`/api/transactions/${criada.dados.transaction.id}`, {
      transactionDate: '2026-08-25', // depois do fechamento
    });
    assert.equal(editada.dados.transaction.referenceMonth, '2026-09-01');
    assert.equal(editada.dados.transaction.transactionDate, '2026-09-20');
  });

  test('marcar como pago e desfazer', async () => {
    const criada = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Conta pendente',
      amount: 180,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-15',
      status: 'pending',
    });
    const id = criada.dados.transaction.id;

    const paga = await cliente.patch(`/api/transactions/${id}`, { status: 'paid' });
    assert.equal(paga.dados.transaction.status, 'paid');

    const revertida = await cliente.patch(`/api/transactions/${id}`, { status: 'pending' });
    assert.equal(revertida.dados.transaction.status, 'pending');
  });

  test('filtros e busca por texto', async () => {
    await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'SUPERMERCADO do bairro',
      amount: 250,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-15',
    });
    await cliente.post('/api/transactions', {
      kind: 'income',
      description: 'Salário',
      amount: 5000,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-05',
    });

    const somenteSaidas = await cliente.get('/api/transactions?month=2026-08-01&kind=expense');
    assert.equal(somenteSaidas.dados.transactions.length, 1);

    // CTS16: busca em minúsculas encontra a descrição em maiúsculas
    const busca = await cliente.get('/api/transactions?month=2026-08-01&q=supermercado');
    assert.equal(busca.dados.transactions.length, 1);
    assert.equal(busca.dados.transactions[0].description, 'SUPERMERCADO do bairro');
  });
});

describe('Parcelamento', () => {
  test('CTI12 – compra parcelada cria plano e parcelas que somam o total', async () => {
    const resposta = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Compra parcelada',
      amount: 100,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-05',
      totalInstallments: 3,
    });
    assert.equal(resposta.status, 201);
    assert.ok(resposta.dados.plan, 'deveria devolver o plano criado');

    const parcelas = await db.rows(
      'SELECT amount, installment_number, reference_month, status FROM transactions WHERE installment_plan_id = $1 ORDER BY installment_number',
      [resposta.dados.plan.id],
    );
    assert.equal(parcelas.length, 3);
    assert.deepEqual(
      parcelas.map((p) => p.amount),
      [33.33, 33.33, 33.34],
    );
    const soma = parcelas.reduce((s, p) => s + p.amount, 0);
    assert.equal(Math.round(soma * 100) / 100, 100);

    // Uma parcela por mês consecutivo
    assert.deepEqual(
      parcelas.map((p) => p.reference_month),
      ['2026-08-01', '2026-09-01', '2026-10-01'],
    );
    // Só a primeira nasce com a situação informada
    assert.deepEqual(
      parcelas.map((p) => p.status),
      ['paid', 'scheduled', 'scheduled'],
    );
  });

  test('CTI13 – parcelamento em andamento cria apenas as parcelas restantes', async () => {
    const resposta = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Financiamento',
      amount: 4800,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-05',
      totalInstallments: 48,
      currentInstallment: 14,
    });
    assert.equal(resposta.status, 201);

    const parcelas = await db.rows(
      'SELECT installment_number FROM transactions WHERE installment_plan_id = $1 ORDER BY installment_number',
      [resposta.dados.plan.id],
    );
    assert.equal(parcelas.length, 35, 'da 14 à 48 são 35 parcelas');
    assert.equal(parcelas[0].installment_number, 14);
    assert.equal(parcelas.at(-1).installment_number, 48);

    // O plano registra a janela real, com o primeiro mês no passado
    assert.equal(resposta.dados.plan.firstMonth, '2025-07-01');
    assert.equal(resposta.dados.plan.lastMonth, '2029-06-01');
  });

  test('parcela atual maior que o total é recusada', async () => {
    const resposta = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Numeração impossível',
      amount: 1200,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-05',
      totalInstallments: 12,
      currentInstallment: 20,
    });
    assert.equal(resposta.status, 400);
  });

  test('renumeração corrige a sequência sem alterar valores', async () => {
    const criada = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'A renumerar',
      amount: 500,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-05',
      totalInstallments: 5,
    });
    const planId = criada.dados.plan.id;

    const resposta = await cliente.patch(`/api/transactions/plans/${planId}/renumber`, {
      month: '2026-08-01',
      number: 3,
      total: 10,
    });
    assert.equal(resposta.status, 200);

    const parcelas = await db.rows(
      'SELECT installment_number, amount, description FROM transactions WHERE installment_plan_id = $1 ORDER BY installment_number',
      [planId],
    );
    assert.equal(parcelas.length, 8, 'da 3 à 10 são 8 parcelas');
    assert.equal(parcelas[0].installment_number, 3);
    assert.equal(parcelas.at(-1).installment_number, 10);
    assert.match(parcelas[0].description, /\(3\/10\)$/);
    // Nenhum valor mudou
    assert.equal(parcelas[0].amount, 100);
  });

  test('renumeração é recusada quando há parcela paga além do novo total', async () => {
    const criada = await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Com parcela paga',
      amount: 500,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-05',
      totalInstallments: 5,
    });
    const planId = criada.dados.plan.id;

    // Marca a última parcela como paga
    await db.query(
      "UPDATE transactions SET status = 'paid' WHERE installment_plan_id = $1 AND installment_number = 5",
      [planId],
    );

    const resposta = await cliente.patch(`/api/transactions/plans/${planId}/renumber`, {
      month: '2026-08-01',
      number: 1,
      total: 3,
    });
    assert.equal(resposta.status, 400);
    assert.match(resposta.dados.erro, /paga além do novo total/i);
  });
});

describe('Pagamento de fatura', () => {
  test('CTI15 – pagamento de fatura é registrado sem categoria', async () => {
    const resposta = await cliente.post('/api/transactions', {
      kind: 'card_payment',
      description: 'Pagamento da fatura',
      amount: 900,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-20',
      referenceMonth: '2026-08-01',
    });
    assert.equal(resposta.status, 201);
    assert.equal(resposta.dados.transaction.category, null);
    assert.equal(resposta.dados.transaction.status, 'paid');
    assert.equal(resposta.dados.transaction.referenceMonth, '2026-08-01');
  });

  test('CTI16 – pagamento de fatura em forma que não é cartão é recusado', async () => {
    const resposta = await cliente.post('/api/transactions', {
      kind: 'card_payment',
      description: 'Fatura no Pix',
      amount: 500,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-20',
    });
    assert.equal(resposta.status, 400);
    assert.match(resposta.dados.erro, /cartões de crédito/i);
  });

  test('o pagamento abate o valor em aberto do cartão', async () => {
    await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Compra',
      amount: 1000,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-05',
    });

    const antes = await cliente.get('/api/payment-methods?month=2026-08-01');
    const cartaoAntes = antes.dados.paymentMethods.find((f) => f.id === contexto.cartao.id);
    assert.equal(cartaoAntes.usedThisMonth, 1000);

    await cliente.post('/api/transactions', {
      kind: 'card_payment',
      description: 'Pagamento',
      amount: 400,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-20',
      referenceMonth: '2026-08-01',
    });

    const depois = await cliente.get('/api/payment-methods?month=2026-08-01');
    const cartaoDepois = depois.dados.paymentMethods.find((f) => f.id === contexto.cartao.id);
    assert.equal(cartaoDepois.spentThisMonth, 1000);
    assert.equal(cartaoDepois.invoicePaid, 400);
    assert.equal(cartaoDepois.usedThisMonth, 600);
  });

  test('CTU37 na API – limite comprometido inclui parcelas futuras', async () => {
    await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Parcelada',
      amount: 1200,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-05',
      totalInstallments: 12,
    });

    const resposta = await cliente.get('/api/payment-methods?month=2026-08-01');
    const cartao = resposta.dados.paymentMethods.find((f) => f.id === contexto.cartao.id);
    assert.equal(cartao.usedThisMonth, 100, 'só a parcela do mês ocupa a fatura atual');
    assert.equal(cartao.totalLimitUsed, 1200, 'o limite comprometido soma as 12 parcelas');
  });
});

describe('Recorrência', () => {
  async function criarRegra(extras = {}) {
    return cliente.post('/api/recurring', {
      kind: 'expense',
      description: 'Assinatura mensal',
      amount: 39.9,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      dayOfMonth: 5,
      startMonth: '2026-08-01',
      ...extras,
    });
  }

  test('CTI17 – consultar o mesmo mês várias vezes não duplica lançamentos', async () => {
    await criarRegra();

    for (let i = 0; i < 5; i++) {
      await cliente.get('/api/transactions?month=2026-08-01');
    }

    const lista = await cliente.get('/api/transactions?month=2026-08-01');
    const gerados = lista.dados.transactions.filter((t) => t.notes === 'Recorrente');
    assert.equal(gerados.length, 1);
  });

  test('CTI18 – consultas simultâneas não duplicam lançamentos', async () => {
    await criarRegra();

    const respostas = await Promise.all(
      Array.from({ length: 10 }, () => cliente.get('/api/transactions?month=2026-09-01')),
    );
    for (const resposta of respostas) {
      assert.equal(resposta.status, 200, 'nenhuma requisição deveria falhar');
    }

    const total = await db.row(
      "SELECT count(*)::int AS n FROM transactions WHERE reference_month = '2026-09-01' AND recurring_rule_id IS NOT NULL",
    );
    assert.equal(total.n, 1);
  });

  test('CTI19 – recorrência em cartão respeita o fechamento', async () => {
    // Cobrança no dia 25, cartão fecha dia 10: entra na fatura do mês seguinte
    await criarRegra({ paymentMethodId: contexto.cartao.id, dayOfMonth: 25 });

    await cliente.get('/api/transactions?month=2026-09-01');
    const gerado = await db.row(
      "SELECT reference_month, transaction_date FROM transactions WHERE reference_month = '2026-09-01' AND recurring_rule_id IS NOT NULL",
    );
    assert.ok(gerado, 'a cobrança de agosto deveria rolar para a fatura de setembro');
    assert.equal(gerado.transaction_date, '2026-09-20');
  });

  test('CTI20 – excluir a regra preserva os lançamentos gerados', async () => {
    const regra = await criarRegra();
    await cliente.get('/api/transactions?month=2026-08-01');

    const excluir = await cliente.delete(`/api/recurring/${regra.dados.rule.id}`);
    assert.equal(excluir.status, 200);

    const lista = await cliente.get('/api/transactions?month=2026-08-01');
    const preservados = lista.dados.transactions.filter((t) => t.description === 'Assinatura mensal');
    assert.equal(preservados.length, 1);
  });

  test('regra desativada deixa de gerar lançamentos', async () => {
    const regra = await criarRegra();
    await cliente.patch(`/api/recurring/${regra.dados.rule.id}`, { active: false });

    await cliente.get('/api/transactions?month=2026-10-01');
    const total = await db.row(
      "SELECT count(*)::int AS n FROM transactions WHERE reference_month = '2026-10-01'",
    );
    assert.equal(total.n, 0);
  });
});

describe('Categorias', () => {
  test('CTI24 – arquivar categoria de topo arquiva as subordinadas', async () => {
    const resposta = await cliente.delete(`/api/categories/${contexto.categoria.id}`);
    assert.equal(resposta.status, 200);

    const restantes = await cliente.get('/api/categories?all=1');
    const filhas = restantes.dados.categories.filter((c) => c.parentId === contexto.categoria.id);
    assert.equal(filhas.length, 0);
  });

  test('CTI25 – subcategoria não pode ter subcategoria', async () => {
    const resposta = await cliente.post('/api/categories', {
      name: 'Terceiro nível',
      parentId: contexto.subcategoria.id,
    });
    assert.equal(resposta.status, 400);
    assert.match(resposta.dados.erro, /dois níveis/i);
  });

  test('CTI26 – categoria não pode ser pai de si mesma', async () => {
    const resposta = await cliente.patch(`/api/categories/${contexto.categoria.id}`, {
      parentId: contexto.categoria.id,
    });
    assert.equal(resposta.status, 400);
  });

  test('teto mensal pode ser definido e removido', async () => {
    const comTeto = await cliente.patch(`/api/categories/${contexto.categoria.id}`, {
      monthlyBudget: 500,
    });
    assert.equal(comTeto.dados.category.monthlyBudget, 500);

    const semTeto = await cliente.patch(`/api/categories/${contexto.categoria.id}`, {
      monthlyBudget: null,
    });
    assert.equal(semTeto.dados.category.monthlyBudget, null);
  });
});

describe('Formas de pagamento', () => {
  test('CTI27 – atributos de crédito são descartados em forma que não é cartão', async () => {
    const resposta = await cliente.post('/api/payment-methods', {
      name: 'Pix com fechamento',
      kind: 'pix',
      color: '#0F6E56',
      limitValue: 1000,
      closingDay: 10,
      dueDay: 20,
    });
    assert.equal(resposta.status, 201);
    assert.equal(resposta.dados.paymentMethod.limitValue, null);
    assert.equal(resposta.dados.paymentMethod.closingDay, null);
    assert.equal(resposta.dados.paymentMethod.dueDay, null);
  });
});

describe('Painel', () => {
  test('CTI28 – mês sem movimento devolve indicadores zerados', async () => {
    const resposta = await cliente.get('/api/dashboard?month=2026-08-01');
    assert.equal(resposta.status, 200);
    assert.equal(resposta.dados.summary.income, 0);
    assert.equal(resposta.dados.summary.balance, 0);
    assert.equal(resposta.dados.summary.toPay, 0);
    assert.deepEqual(resposta.dados.byCategory, []);
  });

  test('CTI29 – painel e lista de lançamentos apresentam o mesmo total', async () => {
    const valores = [250.55, 100.1, 79.35];
    for (const valor of valores) {
      await cliente.post('/api/transactions', {
        kind: 'expense',
        description: `Despesa de ${valor}`,
        amount: valor,
        categoryId: contexto.categoria.id,
        paymentMethodId: contexto.pix.id,
        transactionDate: '2026-08-15',
      });
    }

    const painel = await cliente.get('/api/dashboard?month=2026-08-01');
    const lista = await cliente.get('/api/transactions?month=2026-08-01');

    const somaDaLista =
      Math.round(lista.dados.transactions.reduce((s, t) => s + t.amount, 0) * 100) / 100;

    assert.equal(painel.dados.summary.expense, somaDaLista);
    assert.equal(painel.dados.summary.expense, 430);
  });

  test('a pagar soma pendências e fatura em aberto', async () => {
    await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Conta pendente',
      amount: 300,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-15',
      status: 'pending',
    });
    await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Compra no cartão',
      amount: 1000,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-05',
    });
    await cliente.post('/api/transactions', {
      kind: 'card_payment',
      description: 'Pagamento parcial',
      amount: 400,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-20',
      referenceMonth: '2026-08-01',
    });

    const painel = await cliente.get('/api/dashboard?month=2026-08-01');
    assert.equal(painel.dados.summary.toPay, 900);
    assert.equal(painel.dados.summary.paidOut, 400);
  });

  test('projeção mostra o comprometimento dos meses seguintes', async () => {
    await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Parcelada em 6x',
      amount: 600,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.cartao.id,
      transactionDate: '2026-08-05',
      totalInstallments: 6,
    });

    const painel = await cliente.get('/api/dashboard?month=2026-08-01');
    const projecao = painel.dados.installmentOutlook;
    assert.equal(projecao.length, 6);
    for (const mes of projecao) {
      assert.equal(mes.total, 100, `mês ${mes.month} deveria ter 100 comprometidos`);
    }
  });
});

describe('Pré-carga de meses', () => {
  test('CTI30 – devolve treze meses com os quatro conjuntos de dados', async () => {
    const resposta = await cliente.get('/api/bundle?month=2026-08-01');
    assert.equal(resposta.status, 200);
    assert.equal(resposta.dados.months.length, 13);
    assert.equal(resposta.dados.months[0], '2026-02-01');
    assert.equal(resposta.dados.months.at(-1), '2027-02-01');

    const agosto = resposta.dados.data['2026-08-01'];
    assert.ok(agosto.transactions);
    assert.ok(agosto.dashboard);
    assert.ok(agosto.paymentMethods);
    assert.ok(agosto.categorySummary);
  });

  test('a pré-carga e o painel concordam sobre o mesmo mês', async () => {
    await cliente.post('/api/transactions', {
      kind: 'expense',
      description: 'Despesa para conferência',
      amount: 456.78,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      transactionDate: '2026-08-15',
    });

    const [pacote, painel] = await Promise.all([
      cliente.get('/api/bundle?month=2026-08-01'),
      cliente.get('/api/dashboard?month=2026-08-01'),
    ]);

    assert.deepEqual(
      pacote.dados.data['2026-08-01'].dashboard.summary,
      painel.dados.summary,
      'os dois caminhos de cálculo precisam produzir o mesmo resultado',
    );
  });
});

describe('Restrições garantidas pelo banco', () => {
  test('CTI31 – competência com dia diferente de 1 é recusada pelo banco', async () => {
    await assert.rejects(
      () =>
        db.query(
          `INSERT INTO transactions
             (household_id, created_by_user_id, category_id, payment_method_id,
              kind, description, amount, transaction_date, reference_month, status)
           VALUES ((SELECT id FROM households LIMIT 1), $1, $2, $3,
                   'expense', 'Competência inválida', 100, '2026-08-15', '2026-08-15', 'paid')`,
          [contexto.membro.id, contexto.categoria.id, contexto.pix.id],
        ),
      /violates check constraint/i,
    );
  });

  test('CTI32 – duas recorrências no mesmo mês são recusadas pelo banco', async () => {
    const regra = await cliente.post('/api/recurring', {
      kind: 'expense',
      description: 'Regra para o teste de unicidade',
      amount: 50,
      categoryId: contexto.categoria.id,
      paymentMethodId: contexto.pix.id,
      dayOfMonth: 5,
      startMonth: '2026-08-01',
    });

    const inserir = () =>
      db.query(
        `INSERT INTO transactions
           (household_id, created_by_user_id, category_id, payment_method_id, recurring_rule_id,
            kind, description, amount, transaction_date, reference_month, status)
         VALUES ((SELECT id FROM households LIMIT 1), $1, $2, $3, $4,
                 'expense', 'Duplicata', 50, '2026-08-05', '2026-08-01', 'pending')`,
        [contexto.membro.id, contexto.categoria.id, contexto.pix.id, regra.dados.rule.id],
      );

    await inserir();
    await assert.rejects(inserir, /duplicate key value/i);
  });
});

describe('Contrato de categorias com a interface', () => {
  test('sem parâmetro devolve a árvore, usada nos seletores', async () => {
    const resposta = await cliente.get('/api/categories');
    assert.equal(resposta.status, 200);
    const topo = resposta.dados.categories[0];
    assert.ok(Array.isArray(topo.children), 'cada categoria de topo traz as subordinadas');
    assert.ok(topo.children.length > 0);
  });

  test('com all=1 devolve a lista plana, usada no gerenciamento', async () => {
    const resposta = await cliente.get('/api/categories?all=1');
    assert.equal(resposta.status, 200);
    assert.equal(resposta.dados.categories[0].children, undefined);
    // A lista plana inclui subcategorias, que a árvore aninha
    assert.ok(resposta.dados.categories.some((c) => c.parentId !== null));
  });
});
