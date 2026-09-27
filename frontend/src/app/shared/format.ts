// Aceita ponto e vírgula como separador decimal (ex: "137,48" ou "137.48").
// Heurística: se a última vírgula vem depois do último ponto → formato brasileiro.
export function parseMonetaryAmount(v: string | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).trim().replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastPeriod = s.lastIndexOf('.');
  if (lastComma > lastPeriod) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(s.replace(/,/g, '')) || 0;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(value);
}
export function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
}
// Versão curta pro header mobile ("jul 2026") — o nome completo não cabe em telas pequenas.
export function formatMonthShort(date: Date): string {
  const m = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '');
  return `${m} ${date.getFullYear()}`;
}
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
export function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}
export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// --- Datas trocadas com a API ---------------------------------------------
//
// A API trabalha com datas em texto puro, no formato AAAA-MM-DD, e nunca com
// instantes. O motivo é o mesmo dos dois lados: um instante depende de fuso
// horário, e "1º de agosto" não tem hora. Usar toISOString() aqui reintroduziria
// exatamente o problema, porque ele converte para UTC e pode recuar um dia.

/** Converte um Date do navegador em AAAA-MM-DD, pelos componentes locais. */
export function toApiDate(date: Date): string {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Converte AAAA-MM-DD vindo da API em Date local, para exibição e cálculo. */
export function fromApiDate(texto: string | null | undefined): Date | null {
  if (!texto) return null;
  const [ano, mes, dia] = texto.slice(0, 10).split('-').map(Number);
  if (!ano || !mes || !dia) return null;
  // Meio-dia evita que qualquer ajuste de horário de verão mude o dia exibido
  return new Date(ano, mes - 1, dia, 12);
}

/** Exibe AAAA-MM-DD como DD/MM/AAAA. */
export function formatApiDate(texto: string | null | undefined): string {
  const data = fromApiDate(texto);
  return data ? new Intl.DateTimeFormat('pt-BR').format(data) : '';
}

/** Data de hoje no formato da API. */
export function todayApiDate(): string {
  return toApiDate(new Date());
}
