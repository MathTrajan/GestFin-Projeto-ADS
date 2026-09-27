'use strict';
/**
 * Erros de domínio.
 *
 * Os serviços lançam estes erros sem conhecer códigos HTTP. A tradução para
 * resposta acontece em um único lugar, o tratador de erros do middleware, o que
 * mantém a camada de negócio independente do protocolo (decisão de arquitetura
 * da seção de camadas).
 */

class DomainError extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.name = this.constructor.name;
    this.status = status;
  }
}

/** Entrada malformada ou fora da faixa aceita. */
class ValidationError extends DomainError {
  constructor(mensagem, campo = null) {
    super(mensagem, 400);
    this.campo = campo;
  }
}

/** Regra de negócio violada, como parcela paga além do novo total. */
class BusinessRuleError extends DomainError {
  constructor(mensagem) {
    super(mensagem, 400);
  }
}

/** Sessão ausente, inválida, ou acesso ainda não destravado. */
class UnauthorizedError extends DomainError {
  constructor(mensagem = 'Não autorizado', motivo = null) {
    super(mensagem, 401);
    this.motivo = motivo;
  }
}

/**
 * Registro inexistente OU pertencente a outra residência.
 *
 * Os dois casos devolvem 404 de propósito. Responder 403 para um registro de
 * outra residência confirmaria que ele existe, o que é vazamento de informação
 * (RNF12).
 */
class NotFoundError extends DomainError {
  constructor(mensagem = 'Registro não encontrado') {
    super(mensagem, 404);
  }
}

/** Limite de requisições ou bloqueio por tentativas excedido. */
class RateLimitError extends DomainError {
  constructor(mensagem, segundosDeEspera = null) {
    super(mensagem, 429);
    this.segundosDeEspera = segundosDeEspera;
  }
}

module.exports = {
  DomainError,
  ValidationError,
  BusinessRuleError,
  UnauthorizedError,
  NotFoundError,
  RateLimitError,
};
