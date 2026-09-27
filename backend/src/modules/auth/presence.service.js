'use strict';
/**
 * Presença dos membros.
 *
 * Guarda em memória o momento da última requisição autenticada de cada membro.
 * Deliberadamente sem banco (decisão DA07): presença é informação efêmera, e
 * zerar ao reiniciar o servidor é o comportamento correto, não um defeito.
 */

const JANELA_ONLINE_MS = 3 * 60_000;

const ultimaAtividade = new Map();

/** Marca atividade. Chamado após a autenticação completa, nunca antes. */
function registrar(userId) {
  ultimaAtividade.set(userId, Date.now());
}

function estaOnline(userId) {
  const em = ultimaAtividade.get(userId);
  return em !== undefined && Date.now() - em < JANELA_ONLINE_MS;
}

/** Momento da última atividade em ISO, ou null se não visto desde a partida. */
function vistoEm(userId) {
  const em = ultimaAtividade.get(userId);
  return em ? new Date(em).toISOString() : null;
}

module.exports = { registrar, estaOnline, vistoEm };
