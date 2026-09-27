import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';
import { SwrCache, invalidateAllCaches } from './cache';

export interface RecurringRule {
  id: string;
  kind: string;
  description: string;
  amount: number;
  dayOfMonth: number;
  status: string;
  active: boolean;
  startMonth: string;
  endMonth: string | null;
  category: { id: string; name: string; icon: string; colorFg: string; parentId: string | null };
  paymentMethod: { id: string; name: string; kind: string; color: string };
}

export interface RecurringPayload {
  kind: string;
  description: string;
  amount: number;
  categoryId: string;
  paymentMethodId: string;
  dayOfMonth: number;
  status?: string;
  startMonth?: string;
  endMonth?: string | null;
}

@Injectable({ providedIn: 'root' })
export class RecurringService {
  constructor(private api: ApiService) {}

  list(): Promise<RecurringRule[]> {
    return firstValueFrom(this.api.get<{ rules: RecurringRule[] }>('/api/recurring')).then((r) => r.rules);
  }
  // cache sem chave ('')
  readonly cache = new SwrCache<RecurringRule[]>(() => this.list());

  async create(body: RecurringPayload) {
    const r = await firstValueFrom(this.api.post('/api/recurring', body));
    invalidateAllCaches();
    return r;
  }
  async update(id: string, body: Partial<RecurringPayload> & { active?: boolean }) {
    const r = await firstValueFrom(this.api.patch(`/api/recurring/${id}`, body));
    invalidateAllCaches();
    return r;
  }
  async remove(id: string) {
    const r = await firstValueFrom(this.api.delete(`/api/recurring/${id}`));
    invalidateAllCaches();
    return r;
  }
}
