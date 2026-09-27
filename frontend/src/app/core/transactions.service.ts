import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';
import { SwrCache, invalidateAllCaches } from './cache';

export interface TransactionRow {
  id: string;
  kind: string;
  description: string;
  amount: number;
  transactionDate: string; // data que vence (vencimento)
  purchaseDate: string | null; // data da compra (opcional)
  status: string;
  notes: string | null;
  category: { id: string; name: string; icon: string; colorFg: string; colorBg: string; parentId: string | null } | null;
  paymentMethod: { id: string; name: string; kind: string; color: string };
  paidBy?: { id: string; name: string } | null;
}

export interface TransactionPayload {
  kind: string;
  description: string;
  amount: number;
  categoryId?: string; // ausente para card_payment
  paymentMethodId: string;
  transactionDate: string; // cartão: data da compra; demais: data que vence
  purchaseDate?: string | null; // não-cartão: data da compra (opcional)
  status?: string;
  notes?: string | null;
  totalInstallments?: number;
  currentInstallment?: number; // parcelamento em andamento: parcela que cai na fatura da data informada
}

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  constructor(private api: ApiService) {}

  list(monthIso: string, f: { kind?: string; categoryId?: string; paymentMethodId?: string; q?: string } = {}): Promise<TransactionRow[]> {
    const q = new URLSearchParams({ month: monthIso });
    if (f.kind) q.set('kind', f.kind);
    if (f.categoryId) q.set('categoryId', f.categoryId);
    if (f.paymentMethodId) q.set('paymentMethodId', f.paymentMethodId);
    if (f.q) q.set('q', f.q);
    return firstValueFrom(
      this.api.get<{ transactions: TransactionRow[] }>(`/api/transactions?${q.toString()}`),
    ).then((r) => r.transactions);
  }
  // cache por chave "iso|kind|categoryId|paymentMethodId|q"
  readonly cache = new SwrCache<TransactionRow[]>((key) => {
    const [iso, kind, categoryId, paymentMethodId, q] = key.split('|');
    return this.list(iso, { kind: kind || undefined, categoryId: categoryId || undefined, paymentMethodId: paymentMethodId || undefined, q: q || undefined });
  });

  async create(body: TransactionPayload) {
    const r = await firstValueFrom(this.api.post('/api/transactions', body));
    invalidateAllCaches();
    return r;
  }
  async update(id: string, body: Partial<TransactionPayload>) {
    const r = await firstValueFrom(this.api.patch(`/api/transactions/${id}`, body));
    invalidateAllCaches();
    return r;
  }
  async archive(id: string) {
    const r = await firstValueFrom(this.api.delete(`/api/transactions/${id}`));
    invalidateAllCaches();
    return r;
  }
  // desfaz o arquivamento (ação "Desfazer" do toast)
  async restore(id: string) {
    const r = await firstValueFrom(this.api.post(`/api/transactions/${id}/restore`, {}));
    invalidateAllCaches();
    return r;
  }
  // renumera um plano a partir do mês exibido ("está 2/48, quero 1/40")
  async renumberPlan(planId: string, monthIso: string, number: number, total: number) {
    const r = await firstValueFrom(this.api.patch(`/api/transactions/plans/${planId}/renumber`, { month: monthIso, number, total }));
    invalidateAllCaches();
    return r;
  }
}
