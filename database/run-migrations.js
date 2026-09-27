#!/usr/bin/env node
/**
 * Executor de migrações.
 *
 * Aplica, em ordem numérica, os arquivos .sql de database/migrations que ainda
 * não foram executados neste banco. O controle fica na tabela schema_migrations,
 * criada pelo próprio executor.
 *
 * Cada migração roda dentro de uma transação: ou o arquivo inteiro é aplicado e
 * registrado, ou nada dele permanece. Isso impede o estado intermediário em que
 * metade de uma migração foi aplicada e o registro de controle não reflete isso.
 *
 * Uso:
 *   node database/run-migrations.js            aplica as pendentes
 *   node database/run-migrations.js --status   apenas lista a situação
 *   node database/run-migrations.js --seed     aplica as pendentes e a carga inicial
 */

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SEEDS_DIR = path.join(__dirname, 'seeds');
const BACKEND_DIR = path.join(__dirname, '..', 'backend');

// O driver do banco está instalado no back-end, e este script vive fora dele.
// Resolver a partir do back-end deixa o executor rodar de qualquer diretório.
let Client;
try {
  ({ Client } = createRequire(path.join(BACKEND_DIR, 'package.json'))('pg'));
} catch {
  console.error('ERRO: driver do PostgreSQL não encontrado.');
  console.error('Instale as dependências antes:  cd backend && npm install');
  process.exit(1);
}

const args = process.argv.slice(2);
const somenteStatus = args.includes('--status');
const comSeed = args.includes('--seed');

/** Lê DATABASE_URL do .env do back-end quando não vier do ambiente. */
function conexaoDoArquivoEnv() {
  const arquivo = path.join(BACKEND_DIR, '.env');
  if (!fs.existsSync(arquivo)) return null;

  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) continue;
    const separador = texto.indexOf('=');
    if (separador === -1) continue;
    if (texto.slice(0, separador).trim() !== 'DATABASE_URL') continue;
    return texto.slice(separador + 1).trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

// Sem conexão definida o executor não adivinha: falhar aqui é melhor do que
// aplicar migrações no banco errado.
const databaseUrl = process.env.DATABASE_URL || conexaoDoArquivoEnv();
if (!databaseUrl) {
  console.error('ERRO: conexão com o banco não definida.');
  console.error('Defina DATABASE_URL em backend/.env ou no ambiente. Exemplo:');
  console.error('  DATABASE_URL="postgresql://localhost:5433/capital_ads_dev" node database/run-migrations.js');
  process.exit(1);
}

function listarArquivos(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((nome) => nome.endsWith('.sql'))
    .sort(); // o prefixo numérico garante a ordem correta
}

async function garantirTabelaDeControle(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     VARCHAR(120) PRIMARY KEY,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
    )
  `);
}

async function versoesAplicadas(client) {
  const { rows } = await client.query('SELECT version FROM schema_migrations');
  return new Set(rows.map((r) => r.version));
}

async function aplicar(client, dir, arquivo) {
  const sql = fs.readFileSync(path.join(dir, arquivo), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [arquivo]);
    await client.query('COMMIT');
    console.log(`  aplicada: ${arquivo}`);
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error(`  FALHOU:   ${arquivo}`);
    console.error(`  ${erro.message}`);
    throw erro;
  }
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await garantirTabelaDeControle(client);
    const aplicadas = await versoesAplicadas(client);
    const arquivos = listarArquivos(MIGRATIONS_DIR);
    const pendentes = arquivos.filter((a) => !aplicadas.has(a));

    if (somenteStatus) {
      console.log('\nMigrações:');
      for (const arquivo of arquivos) {
        console.log(`  [${aplicadas.has(arquivo) ? 'x' : ' '}] ${arquivo}`);
      }
      console.log(`\n${aplicadas.size} aplicada(s), ${pendentes.length} pendente(s).\n`);
      return;
    }

    if (pendentes.length === 0) {
      console.log('Nenhuma migração pendente.');
    } else {
      console.log(`Aplicando ${pendentes.length} migração(ões):`);
      for (const arquivo of pendentes) {
        await aplicar(client, MIGRATIONS_DIR, arquivo);
      }
      console.log('Esquema atualizado.');
    }

    if (comSeed) {
      console.log('\nAplicando carga inicial:');
      for (const arquivo of listarArquivos(SEEDS_DIR)) {
        // Os seeds são idempotentes por conta própria e não entram no controle
        // de versões: podem ser reexecutados sem efeito em banco já populado.
        const sql = fs.readFileSync(path.join(SEEDS_DIR, arquivo), 'utf8');
        await client.query(sql);
        console.log(`  executado: ${arquivo}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((erro) => {
  console.error('\nMigração interrompida.');
  console.error(erro.message);
  process.exit(1);
});
