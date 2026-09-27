'use strict';
/**
 * Tradução de erro para resposta HTTP.
 *
 * Único ponto do sistema que conhece códigos de status. Os serviços lançam erros
 * de domínio e não sabem nada de HTTP.
 *
 * Erro inesperado nunca vaza detalhe para o cliente: a mensagem interna vai para
 * o log do servidor, e o cliente recebe um texto genérico. Rastro de pilha em
 * resposta de erro é material de reconhecimento para quem procura falhas.
 */

const { DomainError } = require('../shared/errors');
const { producao } = require('../config/env');

/** Rota inexistente. Registrado depois de todas as rotas válidas. */
function naoEncontrado(req, res) {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.path}` });
}

/** Tratador final. O Express identifica pelos quatro parâmetros. */
// eslint-disable-next-line no-unused-vars
function tratadorDeErros(erro, req, res, _next) {
  if (erro instanceof DomainError) {
    if (erro.segundosDeEspera) res.setHeader('Retry-After', String(erro.segundosDeEspera));
    const corpo = { erro: erro.message };
    if (erro.campo) corpo.campo = erro.campo;
    if (erro.motivo) corpo.motivo = erro.motivo;
    return res.status(erro.status).json(corpo);
  }

  // Violações de restrição do banco que escaparam da camada de serviço.
  // Chegar aqui indica falta de validação antes, então o caso é registrado.
  if (erro.code === '23505') {
    console.warn(`[banco] violação de unicidade em ${req.method} ${req.path}: ${erro.detail}`);
    return res.status(409).json({ erro: 'Registro já existente.' });
  }
  if (erro.code === '23503') {
    console.warn(`[banco] violação de chave estrangeira em ${req.method} ${req.path}`);
    return res.status(400).json({ erro: 'Referência informada não existe.' });
  }
  if (erro.code === '23514') {
    console.warn(`[banco] violação de restrição em ${req.method} ${req.path}: ${erro.constraint}`);
    return res.status(400).json({ erro: 'Dados fora das regras do sistema.' });
  }
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'Corpo da requisição não é um JSON válido.' });
  }

  console.error(`[erro] ${req.method} ${req.path}:`, erro);
  const corpo = { erro: 'Erro interno do servidor.' };
  if (!producao) corpo.detalhe = erro.message;
  return res.status(500).json(corpo);
}

/**
 * Envolve um manipulador assíncrono para que exceções cheguem ao tratador.
 *
 * Sem isso, uma promessa rejeitada dentro de rota assíncrona derruba o processo
 * em vez de virar resposta de erro.
 */
const rota = (manipulador) => (req, res, next) =>
  Promise.resolve(manipulador(req, res, next)).catch(next);

module.exports = { tratadorDeErros, naoEncontrado, rota };
