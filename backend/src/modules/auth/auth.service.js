'use strict';
/**
 * Regras de acesso ao sistema.
 *
 * O controle é feito em DOIS ESTÁGIOS EM SÉRIE (decisão DA06):
 *
 *   1. Código de acesso da residência, guardado em cookie de sessão do navegador.
 *      Protege contra quem pega o aparelho desbloqueado.
 *   2. Escolha do perfil, guardada em cookie persistente. Identifica quem lançou
 *      e quem pagou cada conta.
 *
 * Não há senha individual. Os moradores compartilham os mesmos dados e confiam
 * uns nos outros (premissa P3): o modelo protege a casa de fora, não um morador
 * do outro. A limitação é consciente e está registrada no documento de visão
 * como evolução futura.
 */

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const repositorio = require('./auth.repository');
const { UnauthorizedError, ValidationError } = require('../../shared/errors');

const COOKIE_SESSAO = 'gestfin_sessao';
const COOKIE_DESTRAVADO = 'gestfin_destravado';
const CUSTO_BCRYPT = 10;

/**
 * Cache curto de identidade.
 *
 * Sem ele, toda requisição autenticada faria uma consulta ao banco só para
 * resolver o cookie, somando latência fixa antes de qualquer trabalho útil.
 * Membros mudam raramente, e uma alteração invalida o cache na hora.
 */
const TEMPO_DE_CACHE_MS = 60_000;
const cacheDeMembros = new Map();

function invalidarCache() {
  cacheDeMembros.clear();
}

async function membroPorId(id) {
  const emCache = cacheDeMembros.get(id);
  if (emCache && Date.now() - emCache.em < TEMPO_DE_CACHE_MS) return emCache.membro;

  const membro = await repositorio.buscarMembroPorId(id);
  if (membro) cacheDeMembros.set(id, { membro, em: Date.now() });
  else cacheDeMembros.delete(id);
  return membro;
}

// --- Código de acesso -------------------------------------------------------

async function residencia() {
  return repositorio.buscarResidencia();
}

/** Informa se a residência já tem código configurado, sem revelar o código. */
async function situacaoDoAcesso() {
  const casa = await residencia();
  return { pinSet: Boolean(casa && casa.pin_hash) };
}

/**
 * Confere o código de acesso.
 *
 * Devolve o resumo armazenado quando o código confere, ou null. O resumo é usado
 * para derivar o token de destravamento, o que faz sessões antigas caírem
 * automaticamente quando o código muda.
 */
async function verificarCodigo(codigo) {
  const casa = await residencia();
  if (!casa || !casa.pin_hash) return null;
  const confere = await bcrypt.compare(codigo, casa.pin_hash);
  return confere ? casa.pin_hash : null;
}

async function definirCodigo(householdId, codigo) {
  if (!/^\d{4,8}$/.test(codigo)) {
    throw new ValidationError('O código de acesso deve ter de 4 a 8 dígitos numéricos.', 'pin');
  }
  const pinHash = await bcrypt.hash(codigo, CUSTO_BCRYPT);
  await repositorio.atualizarCodigoDeAcesso(householdId, pinHash);
  invalidarCache(); // o resumo do código viaja junto do membro em cache
  return pinHash;
}

/**
 * Token que prova que o código foi digitado.
 *
 * Derivado do resumo do código: quando o código muda, o token muda junto e as
 * sessões destravadas em outros aparelhos deixam de valer.
 */
function tokenDeDestravamento(pinHash) {
  return crypto.createHash('sha256').update(`gestfin-destravado:${pinHash}`).digest('hex');
}

function destravamentoValido(tokenRecebido, pinHash) {
  if (!tokenRecebido || !pinHash) return false;
  const esperado = tokenDeDestravamento(pinHash);
  // Comparação de tempo constante: comparar com === vaza informação pelo tempo
  // de resposta, permitindo descobrir o token caractere a caractere.
  const a = Buffer.from(tokenRecebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- Cookies ----------------------------------------------------------------

function opcoesDeCookie(producao) {
  return {
    httpOnly: true, // não legível por script na página (RNF08)
    signed: true, // não forjável sem o segredo do servidor
    sameSite: 'lax', // não acompanha requisição vinda de outro site
    secure: producao, // só trafega em HTTPS quando em produção
    path: '/',
  };
}

module.exports = {
  COOKIE_SESSAO,
  COOKIE_DESTRAVADO,
  opcoesDeCookie,
  residencia,
  situacaoDoAcesso,
  verificarCodigo,
  definirCodigo,
  tokenDeDestravamento,
  destravamentoValido,
  membroPorId,
  invalidarCache,
};
