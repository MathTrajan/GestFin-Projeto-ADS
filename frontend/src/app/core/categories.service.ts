import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';
import { SwrCache, invalidateAllCaches } from './cache';

export interface Category {
  id: string;
  name: string;
  icon: string;
  colorBg: string;
  colorFg: string;
  parentId: string | null;
  monthlyBudget?: number | null;
  children?: Category[];
}

export interface CategorySummary {
  total: number;
  categories: { id: string; name: string; icon: string; colorFg: string; colorBg: string; spent: number; budget: number | null }[];
}

export interface CategoryPayload {
  name: string;
  icon: string;
  colorBg: string;
  colorFg: string;
  parentId?: string | null;
  monthlyBudget?: number | null;
}

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  constructor(private api: ApiService) {}

  tree(): Promise<Category[]> {
    return firstValueFrom(this.api.get<{ categories: Category[] }>('/api/categories')).then((r) => r.categories);
  }
  all(): Promise<Category[]> {
    return firstValueFrom(this.api.get<{ categories: Category[] }>('/api/categories?all=1')).then((r) => r.categories);
  }
  summary(monthIso: string): Promise<CategorySummary> {
    return firstValueFrom(this.api.get<CategorySummary>(`/api/categories/summary?month=${encodeURIComponent(monthIso)}`));
  }
  // caches: summary por mes, tree/all sem chave ('')
  readonly summaryCache = new SwrCache<CategorySummary>((iso) => this.summary(iso));
  readonly treeCache = new SwrCache<Category[]>(() => this.tree());
  readonly allCache = new SwrCache<Category[]>(() => this.all());

  async create(body: CategoryPayload) {
    const r = await firstValueFrom(this.api.post('/api/categories', body));
    invalidateAllCaches();
    return r;
  }
  async update(id: string, body: Partial<CategoryPayload>) {
    const r = await firstValueFrom(this.api.patch(`/api/categories/${id}`, body));
    invalidateAllCaches();
    return r;
  }
  async archive(id: string) {
    const r = await firstValueFrom(this.api.delete(`/api/categories/${id}`));
    invalidateAllCaches();
    return r;
  }
}
