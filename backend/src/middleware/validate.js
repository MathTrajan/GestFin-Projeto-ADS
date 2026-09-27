'use strict';
/**
 * Validação declarativa de entrada (RNF11).
 *
 * Cada rota descreve o formato esperado, e o middleware garante que a camada de
 * serviço só receba dados já verificados quanto a tipo, formato e faixa.
 *
 * Campos desconhecidos são DESCARTADOS, e não apenas ignorados: o corpo que
 * chega ao serviço contém exatamente o que foi declarado. Isso fecha a porta
 * para poluição de parâmetros, em que um campo a mais no JSON acabaria gravado
 * por descuido de um `INSERT` genérico.
 *
 * Escrito à mão em vez de biblioteca: são poucas dezenas de linhas, e a
 * restrição de dependências mínimas é do próprio projeto (RNF18).
 */

const { ValidationError } = require('../shared/errors');

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_COR = /^#[0-9A-Fa-f]{6}$/;

/** Converte a entrada para o tipo declarado, ou lança erro explicando o campo. */
const conversores = {
  texto(valor, campo, regra) {
    if (typeof valor !== 'string') throw new ValidationError(`${campo}: texto esperado`, campo);
    const limpo = valor.trim();
    if (regra.obrigatorio !== false && limpo === '') {
      throw new ValidationError(`${campo}: não pode ficar em branco`, campo);
    }
    if (regra.max && limpo.length > regra.max) {
      throw new ValidationError(`${campo}: no máximo ${regra.max} caracteres`, campo);
    }
    return limpo;
  },

  numero(valor, campo, regra) {
    const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new ValidationError(`${campo}: número esperado`, campo);
    }
    if (regra.positivo && n <= 0) {
      throw new ValidationError(`${campo}: informe um valor maior que zero`, campo);
    }
    if (regra.min !== undefined && n < regra.min) {
      throw new ValidationError(`${campo}: mínimo de ${regra.min}`, campo);
    }
    if (regra.max !== undefined && n > regra.max) {
      throw new ValidationError(`${campo}: máximo de ${regra.max}`, campo);
    }
    return n;
  },

  inteiro(valor, campo, regra) {
    const n = conversores.numero(valor, campo, regra);
    if (!Number.isInteger(n)) {
      throw new ValidationError(`${campo}: informe um número inteiro`, campo);
    }
    return n;
  },

  booleano(valor, campo) {
    if (typeof valor === 'boolean') return valor;
    if (valor === 'true') return true;
    if (valor === 'false') return false;
    throw new ValidationError(`${campo}: verdadeiro ou falso esperado`, campo);
  },

  data(valor, campo) {
    if (typeof valor !== 'string' || !FORMATO_DATA.test(valor)) {
      throw new ValidationError(`${campo}: data no formato AAAA-MM-DD esperada`, campo);
    }
    const [ano, mes, dia] = valor.split('-').map(Number);
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCFullYear() !== ano || d.getUTCMonth() + 1 !== mes || d.getUTCDate() !== dia) {
      throw new ValidationError(`${campo}: data inexistente no calendário`, campo);
    }
    return valor;
  },

  uuid(valor, campo) {
    if (typeof valor !== 'string' || !FORMATO_UUID.test(valor)) {
      throw new ValidationError(`${campo}: identificador inválido`, campo);
    }
    return valor;
  },

  cor(valor, campo) {
    if (typeof valor !== 'string' || !FORMATO_COR.test(valor)) {
      throw new ValidationError(`${campo}: cor no formato #RRGGBB esperada`, campo);
    }
    return valor;
  },

  opcao(valor, campo, regra) {
    if (!regra.valores.includes(valor)) {
      throw new ValidationError(
        `${campo}: valor inválido (aceita ${regra.valores.join(', ')})`,
        campo,
      );
    }
    return valor;
  },
};

/**
 * Aplica um esquema a um objeto, devolvendo apenas os campos declarados.
 *
 * @param {object} entrada  corpo, consulta ou parâmetros da requisição
 * @param {object} esquema  mapa de campo para regra
 */
function aplicar(entrada, esquema) {
  const saida = {};

  for (const [campo, regra] of Object.entries(esquema)) {
    const valor = entrada ? entrada[campo] : undefined;
    const ausente = valor === undefined || valor === '';

    if (ausente) {
      if (regra.obrigatorio) {
        throw new ValidationError(`${campo}: campo obrigatório`, campo);
      }
      if (regra.padrao !== undefined) saida[campo] = regra.padrao;
      continue;
    }

    // Nulo explícito limpa o campo, quando a regra permite
    if (valor === null) {
      if (regra.obrigatorio) {
        throw new ValidationError(`${campo}: campo obrigatório`, campo);
      }
      if (regra.aceitaNulo) saida[campo] = null;
      continue;
    }

    const conversor = conversores[regra.tipo];
    if (!conversor) throw new Error(`Tipo de validação desconhecido: ${regra.tipo}`);
    saida[campo] = conversor(valor, campo, regra);
  }

  return saida;
}

/** Middleware que valida o corpo da requisição. */
const corpo = (esquema) => (req, _res, next) => {
  try {
    req.dados = aplicar(req.body, esquema);
    next();
  } catch (erro) {
    next(erro);
  }
};

/** Middleware que valida os parâmetros de consulta. */
const consulta = (esquema) => (req, _res, next) => {
  try {
    req.filtros = aplicar(req.query, esquema);
    next();
  } catch (erro) {
    next(erro);
  }
};

/** Middleware que valida os parâmetros de rota. */
const parametros = (esquema) => (req, _res, next) => {
  try {
    req.parametros = aplicar(req.params, esquema);
    next();
  } catch (erro) {
    next(erro);
  }
};

module.exports = { corpo, consulta, parametros, aplicar };
