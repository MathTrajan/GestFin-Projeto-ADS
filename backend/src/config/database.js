'use strict';
/**
 * Conexão com o PostgreSQL.
 *
 * DUAS CONVERSÕES DE TIPO SÃO CONFIGURADAS AQUI, e ambas existem para proteger a
 * correção do dado financeiro:
 *
 * 1. DATE devolvido como TEXTO. Por padrão o driver converte uma coluna DATE em
 *    objeto Date do JavaScript, interpretado no fuso da máquina. A competência
 *    "2026-08-01" viraria 31 de julho às 21h no horário de Brasília, e o mês do
 *    lançamento mudaria conforme onde o servidor roda. Mantendo texto, o valor
 *    que sai do banco é exatamente o que entrou.
 *
 * 2. NUMERIC devolvido como NÚMERO. O driver devolve NUMERIC como texto, para
 *    não perder precisão em valores muito grandes. Nos limites deste sistema
 *    (até 14 dígitos, com 2 decimais) a conversão é segura, e é ela que permite
 *    somar valores sem espalhar conversões por toda a aplicação.
 */

const { Pool, types } = require('pg');
const { databaseUrl, producao } = require('./env');

// OID 1082 = DATE
types.setTypeParser(1082, (valor) => valor);
// OID 1700 = NUMERIC
types.setTypeParser(1700, (valor) => (valor === null ? null : Number(valor)));

const pool = new Pool({
  connectionString: databaseUrl,
  max: producao ? 10 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (erro) => {
  console.error('[banco] erro em conexão ociosa:', erro.message);
});

/**
 * Executa uma consulta com parâmetros vinculados.
 *
 * Todo valor vindo do usuário passa por aqui como parâmetro ($1, $2, ...), nunca
 * concatenado na cadeia SQL. É a garantia contra injeção de SQL (RNF13).
 */
async function query(sql, parametros = []) {
  return pool.query(sql, parametros);
}

/** Executa a consulta e devolve apenas as linhas. */
async function rows(sql, parametros = []) {
  const resultado = await pool.query(sql, parametros);
  return resultado.rows;
}

/** Executa a consulta e devolve a primeira linha, ou null. */
async function row(sql, parametros = []) {
  const resultado = await pool.query(sql, parametros);
  return resultado.rows[0] ?? null;
}

/**
 * Executa uma função dentro de uma transação, com confirmação automática ao
 * final e desfazimento em caso de erro.
 *
 * A função recebe um cliente dedicado: todas as consultas do bloco precisam usá-lo
 * para participar da mesma transação. Usar o pool dentro do bloco pegaria outra
 * conexão, e a operação deixaria de ser atômica.
 */
async function transaction(callback) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await callback({
      query: (sql, parametros = []) => cliente.query(sql, parametros),
      rows: async (sql, parametros = []) => (await cliente.query(sql, parametros)).rows,
      row: async (sql, parametros = []) => (await cliente.query(sql, parametros)).rows[0] ?? null,
    });
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

/** Verifica se o banco responde. Usado na rota de saúde e na partida. */
async function verificarConexao() {
  const resultado = await pool.query('SELECT 1 AS ok');
  return resultado.rows[0].ok === 1;
}

async function encerrar() {
  await pool.end();
}

module.exports = { query, rows, row, transaction, verificarConexao, encerrar, pool };
