'use strict';
/**
 * Limite de requisições e bloqueio progressivo por origem.
 *
 * Duas proteções distintas e complementares:
 *
 * 1. limitePorMinuto: teto geral de requisições, contra abuso e varredura.
 *
 * 2. bloqueioProgressivo: contra tentativa exaustiva do código de acesso. O teto
 *    por minuto sozinho não resolve o problema: quem tenta 5 códigos por minuto
 *    percorre os 10.000 códigos de 4 dígitos em pouco mais de um dia. O bloqueio
 *    PERSISTE além do minuto e cresce a cada rodada de falhas.
 *
 * O bloqueio é POR ORIGEM, nunca global: um atacante bloqueia apenas a si mesmo,
 * e jamais os moradores da casa.
 *
 * Estado em memória, por decisão (DA07): o sistema roda em processo único e a
 * contagem deve mesmo zerar ao reiniciar. Com várias instâncias, isto precisaria
 * de armazenamento compartilhado.
 */

const { RateLimitError } = require('../shared/errors');

const MINUTO = 60_000;

/** Teto geral de requisições por origem. */
function limitePorMinuto(maximo = 120) {
  const contagem = new Map();

  return (req, _res, next) => {
    const origem = req.ip || 'desconhecida';
    const agora = Date.now();
    const registro = contagem.get(origem);

    if (!registro || agora > registro.reiniciaEm) {
      contagem.set(origem, { total: 1, reiniciaEm: agora + MINUTO });
      return next();
    }

    registro.total += 1;
    if (registro.total > maximo) {
      const espera = Math.ceil((registro.reiniciaEm - agora) / 1000);
      return next(new RateLimitError('Muitas requisições. Aguarde um instante.', espera));
    }
    return next();
  };
}

const JANELA = 15 * MINUTO; // período em que as falhas são contadas
const LIMIAR = 8; // falhas na janela antes do primeiro bloqueio
const DURACOES = [5, 15, 60].map((m) => m * MINUTO); // escalonamento do bloqueio
const MAXIMO_DE_ORIGENS = 5000; // teto de memória

/** Controle de tentativas de credencial, com bloqueio escalonado por origem. */
class BloqueioProgressivo {
  constructor() {
    this.origens = new Map();
  }

  /** Segundos restantes de bloqueio. Zero significa liberado. */
  esperaRestante(origem) {
    const registro = this.origens.get(origem || 'desconhecida');
    if (!registro) return 0;
    const restante = registro.bloqueadoAte - Date.now();
    return restante > 0 ? Math.ceil(restante / 1000) : 0;
  }

  /** Registra uma tentativa malsucedida e bloqueia ao atingir o limiar. */
  registrarFalha(origem) {
    const chave = origem || 'desconhecida';
    const agora = Date.now();
    this.limpar(agora);

    const registro = this.origens.get(chave) ?? {
      falhas: [],
      bloqueadoAte: 0,
      nivel: 0,
      vistoEm: agora,
    };

    registro.falhas = registro.falhas.filter((t) => agora - t < JANELA);
    registro.falhas.push(agora);
    registro.vistoEm = agora;

    if (registro.falhas.length >= LIMIAR) {
      const duracao = DURACOES[Math.min(registro.nivel, DURACOES.length - 1)];
      registro.bloqueadoAte = agora + duracao;
      registro.nivel += 1;
      registro.falhas = []; // zera para a próxima rodada escalonar
      console.warn(
        `[seguranca] origem ${chave} bloqueada por ${duracao / MINUTO} min ` +
          `(nível ${registro.nivel}): tentativas sucessivas de código de acesso.`,
      );
    }

    this.origens.set(chave, registro);
  }

  /** Acerto limpa todo o histórico da origem, inclusive o escalonamento. */
  registrarSucesso(origem) {
    this.origens.delete(origem || 'desconhecida');
  }

  /** Remove registros antigos, controlando o uso de memória. */
  limpar(agora) {
    for (const [chave, registro] of this.origens) {
      const semFalhaRecente = registro.falhas.length === 0 || agora - registro.vistoEm > JANELA;
      if (registro.bloqueadoAte < agora && semFalhaRecente) this.origens.delete(chave);
    }
    if (this.origens.size > MAXIMO_DE_ORIGENS) {
      // Ainda grande demais: mantém apenas quem está bloqueado agora
      for (const [chave, registro] of this.origens) {
        if (registro.bloqueadoAte < agora) this.origens.delete(chave);
      }
    }
  }
}

module.exports = { limitePorMinuto, BloqueioProgressivo };
