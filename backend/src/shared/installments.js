'use strict';
/**
 * Divisão e renumeração de compras parceladas.
 *
 * Todas as funções são puras: nenhuma decisão que apaga ou cria parcela depende
 * de banco de dados, o que permite testá-las exaustivamente (RNF21).
 */

const centavos = (valor) => Math.round(valor * 100);
const reais = (cents) => cents / 100;

/**
 * Divide um total em N parcelas (RN05).
 *
 * Todas as parcelas valem o mesmo, exceto a ÚLTIMA, que absorve o resíduo de
 * arredondamento. A soma é sempre exatamente o total.
 *
 * A conta é feita em centavos inteiros. Dividir em ponto flutuante e arredondar
 * depois produz erro acumulado: 100/3 em ponto flutuante três vezes não devolve
 * 100, e o usuário vê uma fatura que não fecha por um centavo.
 *
 * Exemplo: 100,00 em 3x resulta em 33,33 + 33,33 + 33,34.
 */
function splitInstallments(total, quantidade) {
  const n = Math.max(1, Math.trunc(quantidade));
  const totalCents = centavos(total);
  if (n === 1) return [reais(totalCents)];

  const porParcela = Math.round(totalCents / n);
  const ultima = totalCents - porParcela * (n - 1);
  return Array.from({ length: n }, (_, i) => reais(i === n - 1 ? ultima : porParcela));
}

/**
 * Decide as operações de uma renumeração de parcelamento (UC12).
 *
 * A parcela do mês âncora passa a ser `novoNumero` de `novoTotal`, e as demais
 * seguem a sequência mensal. Devolve o que atualizar, remover e criar, ou uma
 * mensagem de erro explicando por que a renumeração é incoerente.
 *
 * @param {{monthOffset: number, status: string}[]} parcelas
 *        Parcelas existentes, com a distância em meses até o mês âncora
 *        (0 = a parcela sendo corrigida).
 * @returns {{updates: object[], remove: number[], create: object[]}|string}
 */
function renumberPlan(parcelas, novoNumero, novoTotal) {
  if (!Number.isInteger(novoNumero) || !Number.isInteger(novoTotal)) {
    return 'Informe números inteiros para a parcela e para o total.';
  }
  if (novoNumero < 1 || novoTotal < 1 || novoNumero > novoTotal) {
    return 'A parcela precisa estar entre 1 e o total de parcelas.';
  }
  if (novoTotal > 60) {
    return 'O total de parcelas não pode passar de 60.';
  }
  if (!parcelas.some((p) => p.monthOffset === 0)) {
    return 'Não há parcela deste parcelamento no mês exibido.';
  }

  const updates = [];
  const remove = [];

  for (const parcela of parcelas) {
    const numero = novoNumero + parcela.monthOffset;

    if (numero < 1) {
      return 'Há parcelas em meses anteriores: a deste mês não pode ter número tão baixo.';
    }
    if (numero > novoTotal) {
      // Descartar parcela PAGA apagaria um pagamento real. A numeração informada
      // é que está errada, e não o histórico.
      if (parcela.status === 'paid') {
        return 'Há parcela paga além do novo total. Confira os números informados.';
      }
      remove.push(parcela.monthOffset);
    } else {
      updates.push({ monthOffset: parcela.monthOffset, numero });
    }
  }

  // Completa a sequência até o novo total, a partir da última parcela mantida
  const maiorMantida = Math.max(...updates.map((u) => u.numero));
  const create = [];
  for (let numero = maiorMantida + 1; numero <= novoTotal; numero++) {
    create.push({ monthOffset: numero - novoNumero, numero });
  }

  return { updates, remove, create };
}

module.exports = { splitInstallments, renumberPlan };
