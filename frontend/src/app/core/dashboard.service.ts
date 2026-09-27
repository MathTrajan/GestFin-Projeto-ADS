import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';
import { SwrCache } from './cache';

export interface DashboardData {
  summary: { income: number; expense: number; investment: number; balance: number; savingsRate: number; toPay?: number; paidOut?: number; installments?: number; installmentsCount?: number };
  previous: { income: number; expense: number; investment: number; balance: number };
  byCategory: { id: string; name: string; color: string; total: number; prevTotal: number; budget: number | null }[];
  byPaymentKind: { name: string; color: string; total: number }[];
  topExpenses: { description: string; category: string; color: string; amount: number; date: string }[];
  installmentItems?: { planId: string | null; description: string; amount: number; number: number | null; of: number | null; method: string | null; status: string; color: string | null }[];
  installmentOutlook?: { month: string; total: number }[];
  evolution: { month: string; income: number; expense: number; investment: number; balance: number }[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private api: ApiService) {}
  // cache por mes; telas usam swrLoad(this.dashboard.cache, iso, ...)
  readonly cache = new SwrCache<DashboardData>((iso) =>
    firstValueFrom(this.api.get<DashboardData>(`/api/dashboard?month=${encodeURIComponent(iso)}`)),
  );
}
