'use strict';
/**
 * Leitura e validação das variáveis de ambiente.
 *
 * Carrega o arquivo .env sem depender de biblioteca: o formato é simples o
 * bastante para não justificar uma dependência a mais (RNF18).
 *
 * A validação acontece na partida, e não no primeiro uso. Um servidor que sobe
 * sem segredo de sessão e só falha na primeira requisição de login é pior do que
 * um que se recusa a subir.
 */

const fs = require('fs');
const path = require('path');

/** Lê pares chave=valor de um arquivo .env, sem sobrescrever o ambiente real. */
function carregarArquivoEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return;

  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) continue;

    const separador = texto.indexOf('=');
    if (separador === -1) continue;

    const chave = texto.slice(0, separador).trim();
    let valor = texto.slice(separador + 1).trim();

    // Remove aspas envolventes, se houver
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }

    // Variável já definida no ambiente tem prioridade sobre o arquivo
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

carregarArquivoEnv(path.join(__dirname, '..', '..', '.env'));

const ambiente = process.env.NODE_ENV || 'development';
const producao = ambiente === 'production';

const SEGREDO_DE_DESENVOLVIMENTO = 'segredo-apenas-para-desenvolvimento-local';

if (producao && !process.env.COOKIE_SECRET) {
  throw new Error(
    'COOKIE_SECRET não definido. Em produção o segredo que assina os cookies de ' +
      'sessão é obrigatório: sem ele, qualquer pessoa pode forjar uma sessão.',
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL não definida. Configure a conexão com o banco no arquivo .env ' +
      '(use .env.example como modelo).',
  );
}

if (!producao && !process.env.COOKIE_SECRET) {
  console.warn(
    '[aviso] COOKIE_SECRET ausente: usando segredo de desenvolvimento. ' +
      'Não utilize esta configuração fora da sua máquina.',
  );
}

module.exports = {
  ambiente,
  producao,
  porta: Number(process.env.PORT || 3600),
  databaseUrl: process.env.DATABASE_URL,
  cookieSecret: process.env.COOKIE_SECRET || SEGREDO_DE_DESENVOLVIMENTO,
  origemPermitida: process.env.CORS_ORIGIN || 'http://localhost:4300',
  // Teto de requisições por minuto e por origem. Configurável porque a suíte de
  // testes dispara centenas de requisições do mesmo endereço em segundos, o que
  // o limite de uso real bloquearia corretamente.
  limiteDeRequisicoes: Number(process.env.RATE_LIMIT_POR_MINUTO || 120),
};
