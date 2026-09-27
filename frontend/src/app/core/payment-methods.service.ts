import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';
import { SwrCache, invalidateAllCaches } from './cache';

export interface PaymentMethod {
  id: string;
  name: string;
  kind: string;
  ownerLabel: string | null;
  color: string;
  limitValue: number | null;
  closingDay: number | null;
  dueDay: number | null;
  spentThisMonth: number;  // gasto (compras) na fatura do mês
  invoicePaid: number;     // pago antecipado na fatura
  usedThisMonth: number;   // em aberto = gasto - pago (fatura corrente)
  totalLimitUsed: number;  // limite comprometido = usedThisMonth + parcelas futuras agendadas
}

export interface PaymentMethodPayload {
  name: string;
  kind: string;
  ownerLabel?: string | null;
  color: string;
  limitValue?: number | null;
  closingDay?: number | null;
  dueDay?: number | null;
}

@Injectable({ providedIn: 'root' })
export class PaymentMethodsService {
  constructor(private api: ApiService) {}

  list(monthIso: string): Promise<PaymentMethod[]> {
    return firstValueFrom(
      this.api.get<{ paymentMethods: PaymentMethod[] }>(`/api/payment-methods?month=${encodeURIComponent(monthIso)}`),
    ).then((r) => r.paymentMethods);
  }
  // cache por mes
  readonly cache = new SwrCache<PaymentMethod[]>((iso) => this.list(iso));

  async create(body: PaymentMethodPayload) {
    const r = await firstValueFrom(this.api.post('/api/payment-methods', body));
    invalidateAllCaches();
    return r;
  }
  async update(id: string, body: Partial<PaymentMethodPayload>) {
    const r = await firstValueFrom(this.api.patch(`/api/payment-methods/${id}`, body));
    invalidateAllCaches();
    return r;
  }
  async archive(id: string) {
    const r = await firstValueFrom(this.api.delete(`/api/payment-methods/${id}`));
    invalidateAllCaches();
    return r;
  }

  // Pagamento de fatura: lança um card_payment que abate o "em aberto" do cartão na fatura
  // do mês informado (o mês exibido na tela) — pagamento não segue a regra de fechamento de compra.
  async payInvoice(cardId: string, amount: number, dateIso: string, referenceMonthIso: string) {
    const r = await firstValueFrom(
      this.api.post('/api/transactions', {
        kind: 'card_payment',
        description: 'Pagamento de fatura',
        amount,
        paymentMethodId: cardId,
        transactionDate: dateIso,
        status: 'paid',
        referenceMonth: referenceMonthIso,
      }),
    );
    invalidateAllCaches();
    return r;
  }
}
