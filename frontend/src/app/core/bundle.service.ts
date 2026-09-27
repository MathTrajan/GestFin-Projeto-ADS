import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { onInvalidateAll } from './cache';
import { DashboardService, DashboardData } from './dashboard.service';
import { TransactionsService, TransactionRow } from './transactions.service';
import { PaymentMethodsService, PaymentMethod } from './payment-methods.service';
import { CategoriesService, CategorySummary } from './categories.service';

interface BundleResponse {
  anchor: string;
  months: string[];
  data: Record<string, {
    transactions: TransactionRow[];
    dashboard: DashboardData;
    paymentMethods: PaymentMethod[];
    categorySummary: CategorySummary;
  }>;
}

/**
 * Pré-carga em lote: 1 requisição traz 13 meses (mês ±6) e popula os caches das telas
 * (dashboard, lançamentos, cartões, categorias). Trocar de mês dentro da janela = zero rede.
 * Idempotente: não rebusca meses já carregados.
 */
@Injectable({ providedIn: 'root' })
export class BundleService {
  private api = inject(ApiService);
  private dashboard = inject(DashboardService);
  private transactions = inject(TransactionsService);
  private payments = inject(PaymentMethodsService);
  private categories = inject(CategoriesService);

  private loaded = new Set<string>();   // meses iso já hidratados
  private inFlight = new Set<string>(); // âncoras em busca (evita duplicar)

  constructor() {
    // após qualquer escrita os SwrCaches são limpos; zera o controle p/ re-hidratar depois
    onInvalidateAll(() => this.reset());
  }

  // Garante que o mês pedido esteja pré-carregado; se já estiver, no-op.
  async ensureAround(monthIso: string): Promise<void> {
    if (this.loaded.has(monthIso) || this.inFlight.has(monthIso)) return;
    this.inFlight.add(monthIso);
    try {
      const res = await firstValueFrom(
        this.api.get<BundleResponse>(`/api/bundle?month=${encodeURIComponent(monthIso)}`),
      );
      for (const mes of res.months) {
        const d = res.data[mes];
        if (!d) continue;
        // A API e as telas usam o mesmo formato de mês (AAAA-MM-DD), então a
        // chave do cache é o próprio valor devolvido. Enquanto o mês trafegava
        // como instante, era preciso converter aqui para as chaves casarem.
        this.dashboard.cache.hydrate(mes, d.dashboard);
        this.transactions.cache.hydrate(`${mes}||||`, d.transactions);
        this.payments.cache.hydrate(mes, d.paymentMethods);
        this.categories.summaryCache.hydrate(mes, d.categorySummary);
        this.loaded.add(mes);
      }
    } catch {
      /* rede falhou: as telas caem no fetch individual normalmente */
    } finally {
      this.inFlight.delete(monthIso);
    }
  }

  // Invalida o controle local (chamar após escritas, junto de invalidateAllCaches)
  reset(): void {
    this.loaded.clear();
  }
}
