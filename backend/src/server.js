'use strict';
/**
 * Composição e partida da API.
 *
 * Este arquivo só monta a aplicação: registra middlewares, liga as rotas e sobe
 * o servidor. Nenhuma regra de negócio mora aqui.
 */

const express = require('express');
const cookieParser = require('cookie-parser');

const {
  porta,
  ambiente,
  producao,
  cookieSecret,
  origemPermitida,
  limiteDeRequisicoes,
} = require('./config/env');
const db = require('./config/database');
const { limitePorMinuto } = require('./middleware/rate-limit');
const { tratadorDeErros, naoEncontrado, rota } = require('./middleware/error-handler');

const auth = require('./modules/auth/auth.controller');
const users = require('./modules/users/users.controller');
const categories = require('./modules/categories/categories.controller');
const paymentMethods = require('./modules/payment-methods/payment-methods.controller');
const transactions = require('./modules/transactions/transactions.controller');
const recurring = require('./modules/recurring/recurring.controller');
const dashboard = require('./modules/dashboard/dashboard.controller');
const bundle = require('./modules/bundle/bundle.controller');

const app = express();

// Atrás de proxy, o endereço de origem real vem no cabeçalho encaminhado.
// Sem isto, o limite de requisições contaria todo mundo como o mesmo cliente.
app.set('trust proxy', 1);

app.disable('x-powered-by'); // não anunciar a tecnologia do servidor

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(cookieSecret));

// Cabeçalhos de segurança escritos à mão: são poucos e conhecidos, e uma
// dependência a mais só para defini-los contraria a restrição de dependências
// mínimas (RNF18).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// Em desenvolvimento a interface roda em outra porta, então precisa de CORS.
// Em produção as duas são servidas da mesma origem e o cabeçalho é dispensável.
if (!producao) {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', origemPermitida);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
}

app.use('/api', limitePorMinuto(limiteDeRequisicoes));

// Estado do serviço e do banco
app.get(
  '/api/health',
  rota(async (_req, res) => {
    const banco = await db.verificarConexao().catch(() => false);
    res.status(banco ? 200 : 503).json({ status: banco ? 'ok' : 'sem banco', ambiente });
  }),
);

app.use('/api/auth', auth.router);
app.use('/api/users', users.router);
app.use('/api/categories', categories.router);
app.use('/api/payment-methods', paymentMethods.router);
app.use('/api/transactions', transactions.router);
app.use('/api/recurring', recurring.router);
app.use('/api/dashboard', dashboard.router);
app.use('/api/bundle', bundle.router);

app.use(naoEncontrado);
app.use(tratadorDeErros);

/** Sobe o servidor após confirmar que o banco responde. */
async function iniciar() {
  try {
    await db.verificarConexao();
  } catch (erro) {
    console.error('Não foi possível conectar ao banco de dados.');
    console.error(`  ${erro.message}`);
    console.error('  Confira DATABASE_URL no arquivo .env e se o PostgreSQL está em execução.');
    process.exit(1);
  }

  const servidor = app.listen(porta, () => {
    console.log(`GestFin API em http://localhost:${porta} (ambiente: ${ambiente})`);
  });

  // Encerramento ordenado: para de aceitar conexões e fecha o pool antes de sair
  const encerrar = async (sinal) => {
    console.log(`\n${sinal} recebido: encerrando.`);
    servidor.close(async () => {
      await db.encerrar();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
}

if (require.main === module) iniciar();

module.exports = { app, iniciar };
