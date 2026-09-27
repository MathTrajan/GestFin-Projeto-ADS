import { Injectable, signal, computed } from '@angular/core';
import { Subject } from 'rxjs';
import { startOfMonth, addMonths, toApiDate } from '../shared/format';

const KEY = 'capital_mes_selecionado';

/**
 * Mês exibido, compartilhado por todas as telas.
 *
 * `month()` é um Date, usado para exibição e para os cálculos de navegação.
 * `monthIso()` é o mesmo mês no formato da API (AAAA-MM-DD, sempre no dia 01) e
 * é o que vai nas requisições e nas chaves de cache.
 *
 * A conversão usa os componentes LOCAIS da data, nunca toISOString(): em fusos a
 * oeste de Greenwich, o dia 1º às 00h local é o dia anterior em UTC, e o mês
 * pedido à API viria errado.
 */
@Injectable({ providedIn: 'root' })
export class MonthService {
  private readonly _month = signal<Date>(this.initial());
  readonly month = this._month.asReadonly();
  readonly monthIso = computed(() => toApiDate(this._month()));

  // Emite a cada troca de mês. RxJS puro: a assinatura roda sempre, independente
  // do change detection da view. Necessário porque as telas reusadas pela
  // RouteReuseStrategy são OnPush e seus effects não re-executam ao mudar o mês.
  private readonly _changes = new Subject<void>();
  readonly changes$ = this._changes.asObservable();

  private initial(): Date {
    const guardado = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (guardado) {
      const [ano, mes] = guardado.split('-').map(Number);
      if (ano && mes) return new Date(ano, mes - 1, 1);
    }
    return startOfMonth(new Date());
  }

  set(d: Date) {
    const primeiroDia = startOfMonth(d);
    this._month.set(primeiroDia);
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, toApiDate(primeiroDia));
    this._changes.next();
  }

  next() { this.set(addMonths(this._month(), 1)); }
  prev() { this.set(addMonths(this._month(), -1)); }
  today() { this.set(new Date()); }
}
