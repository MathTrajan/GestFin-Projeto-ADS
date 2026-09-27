import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Pencil, Archive, Check } from 'lucide-angular';
import { AppShellComponent } from '../layout/app-shell.component';
import { ModalComponent } from '../shared/ui/modal.component';
import { ColorPickerComponent } from '../shared/ui/color-picker.component';
import { IconPickerComponent } from '../shared/ui/icon-picker.component';
import { MonthService } from '../core/month.service';
import { CategoriesService, Category, CategorySummary } from '../core/categories.service';
import { ToastService } from '../core/toast.service';
import { ConfirmService } from '../core/confirm.service';
import { formatBRL } from '../shared/format';
import { iconFor } from '../shared/icons';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { reloadOnReenter } from '../core/reload-on-reenter';
import { swrLoad } from '../core/cache';

@Component({
  selector: 'app-categories',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, AppShellComponent, ModalComponent, ColorPickerComponent, IconPickerComponent],
  template: `
    <app-shell>
      <div class="space-y-6 content-in">
        <header class="flex items-start justify-between gap-4">
          <div>
            <h1 class="font-display text-3xl font-extrabold tracking-tight">Categorias</h1>
            <p class="text-inkMuted text-[14px] mt-1.5">
              Total do mês: <span class="font-bold text-ink tabular">{{ brl(summary()?.total ?? 0) }}</span>
              <span class="text-inkFaint mx-2">·</span>{{ allCats().length }} categorias ativas
            </p>
          </div>
          <button (click)="openCreate()" class="btn-brand flex items-center gap-2 shrink-0">
            <lucide-icon [img]="Plus" [size]="16"></lucide-icon> Nova categoria
          </button>
        </header>

        @if (summary()?.categories?.length) {
          <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (c of summary()!.categories; track c.id) {
              <div class="card p-5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" [style.background]="c.colorFg + '1a'" [style.color]="c.colorFg">
                      <lucide-icon [img]="icon(c.icon)" [size]="18"></lucide-icon>
                    </span>
                    <span class="font-bold text-[14px] truncate">{{ c.name }}</span>
                  </div>
                  <span class="font-display tabular font-extrabold" [style.color]="c.colorFg">{{ brl(c.spent) }}</span>
                </div>
                <div class="mt-3 h-1.5 rounded-full bg-bg2 overflow-hidden">
                  <span class="block h-full transition-all" [style.width.%]="c.budget ? budgetPct(c.spent, c.budget) : bar(c.spent)"
                        [style.background]="c.budget ? budgetColor(c.spent, c.budget) : c.colorFg"></span>
                </div>
                @if (c.budget) {
                  <div class="mt-1.5 flex items-center justify-between text-[12px]">
                    <span class="font-bold" [style.color]="budgetColor(c.spent, c.budget)">{{ budgetPct(c.spent, c.budget) }}% do teto</span>
                    <span class="text-inkMuted">de <span class="tabular font-bold text-ink">{{ brl(c.budget) }}</span></span>
                  </div>
                }
              </div>
            }
          </section>
        }

        <section class="card p-5 sm:p-6">
          <h2 class="font-display text-lg font-bold tracking-tight mb-4">Gerenciar categorias</h2>
          <div class="space-y-4">
            @for (parent of parents(); track parent.id) {
              <div class="rounded-2xl border border-line p-4">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" [style.background]="parent.colorFg + '1a'" [style.color]="parent.colorFg">
                      <lucide-icon [img]="icon(parent.icon)" [size]="16"></lucide-icon>
                    </span>
                    <div class="min-w-0">
                      <span class="font-bold text-[14px] truncate block">{{ parent.name }}</span>
                      @if (parent.monthlyBudget) { <span class="text-inkMuted text-[11.5px]">teto {{ brl(parent.monthlyBudget) }}/mês</span> }
                    </div>
                  </div>
                  <div class="flex gap-1 shrink-0">
                    <button (click)="openEdit(parent)" class="w-8 h-8 rounded-full flex items-center justify-center text-inkMuted hover:bg-bg2" title="editar"><lucide-icon [img]="Pencil" [size]="13"></lucide-icon></button>
                    <button (click)="archive(parent)" class="w-8 h-8 rounded-full flex items-center justify-center text-inkMuted hover:bg-negTint hover:text-neg" title="arquivar"><lucide-icon [img]="Archive" [size]="13"></lucide-icon></button>
                  </div>
                </div>
                @if (childrenOf(parent.id).length) {
                  <div class="mt-3 ml-12 space-y-1.5">
                    @for (sub of childrenOf(parent.id); track sub.id) {
                      <div class="flex items-center justify-between gap-3 text-[13px]">
                        <span class="text-inkSoft truncate">{{ sub.name }}</span>
                        <div class="flex gap-1 shrink-0">
                          <button (click)="openEdit(sub)" class="w-7 h-7 rounded-full flex items-center justify-center text-inkMuted hover:bg-bg2" title="editar"><lucide-icon [img]="Pencil" [size]="11"></lucide-icon></button>
                          <button (click)="archive(sub)" class="w-7 h-7 rounded-full flex items-center justify-center text-inkMuted hover:bg-negTint hover:text-neg" title="arquivar"><lucide-icon [img]="Archive" [size]="11"></lucide-icon></button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </section>
      </div>
    </app-shell>

    @if (modalOpen()) {
      <app-modal [tag]="editingId() ? 'Editar categoria' : 'Nova categoria'" [title]="editingId() ? 'Editar categoria' : 'Nova categoria'" (close)="modalOpen.set(false)">
        <div>
          <label class="label">Nome</label>
          <input class="input" [ngModel]="name()" (ngModelChange)="name.set($event)" placeholder="Ex: Alimentação, Lazer…" />
        </div>
        <div>
          <label class="label">Categoria-pai (opcional)</label>
          <select class="select" [ngModel]="parentId()" (ngModelChange)="parentId.set($event)">
            <option value="">nenhuma — é uma categoria principal</option>
            @for (p of parentOptions(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>
        </div>
        <div><label class="label">Ícone</label><app-icon-picker [value]="icon_()" (change)="icon_.set($event)"></app-icon-picker></div>
        <div><label class="label">Cor</label><app-color-picker [value]="colorFg()" (change)="colorFg.set($event)"></app-color-picker></div>
        @if (!parentId()) {
          <div>
            <label class="label">Orçamento mensal (opcional)</label>
            <input type="number" step="0.01" class="input tabular" [ngModel]="monthlyBudget()" (ngModelChange)="monthlyBudget.set($event)" placeholder="ex: 1500,00 — teto de gasto" />
            <p class="text-[12px] text-inkMuted mt-1.5">Mostra uma barra de “gastou X% do teto” no resumo e no dashboard.</p>
          </div>
        }
        <div modal-footer>
          <button (click)="modalOpen.set(false)" class="btn-ghost">Cancelar</button>
          <button (click)="save()" [disabled]="submitting() || !name()" class="btn-brand flex items-center gap-2 disabled:opacity-40">
            <lucide-icon [img]="Check" [size]="16"></lucide-icon> {{ submitting() ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      </app-modal>
    }
  `,
})
export class CategoriesComponent {
  readonly Plus = Plus; readonly Pencil = Pencil; readonly Archive = Archive; readonly Check = Check;

  private month = inject(MonthService);
  private cdr = inject(ChangeDetectorRef);
  private service = inject(CategoriesService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  summary = signal<CategorySummary | null>(null);
  allCats = signal<Category[]>([]);
  parents = signal<Category[]>([]);

  modalOpen = signal(false);
  editingId = signal<string | null>(null);
  submitting = signal(false);
  name = signal('');
  icon_ = signal('target');
  colorFg = signal('#1E3A8A');
  parentId = signal('');
  monthlyBudget = signal<string | number>('');

  constructor() {
    this.loadSummary(this.month.monthIso());
    this.loadAll();
    reloadOnReenter('/categorias', () => { this.loadSummary(this.month.monthIso()); this.loadAll(); });
    // troca de mes: RxJS puro garante o reload mesmo na view reusada (effect nao re-roda)
    this.month.changes$.pipe(takeUntilDestroyed()).subscribe(() => this.loadSummary(this.month.monthIso()));
  }

  private loadSummary(iso: string) {
    swrLoad(this.service.summaryCache, iso, (v) => this.summary.set(v), () => {}, () => this.cdr.markForCheck());
  }
  private loadAll() {
    swrLoad(this.service.allCache, '', (cats) => {
      this.allCats.set(cats);
      this.parents.set(cats.filter((c) => c.parentId === null));
    }, () => {}, () => this.cdr.markForCheck());
  }

  brl(v: number) { return formatBRL(v); }
  icon(k: string) { return iconFor(k); }
  childrenOf(id: string) { return this.allCats().filter((c) => c.parentId === id); }
  parentOptions() { return this.parents().filter((p) => p.id !== this.editingId()); }
  bar(spent: number) { const t = this.summary()?.total ?? 0; return t > 0 ? Math.min(100, (spent / t) * 100) : 0; }
  budgetPct(spent: number, budget: number) { return budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0; }
  // verde até 80%, âmbar até 100%, vermelho se estourou
  budgetColor(spent: number, budget: number) {
    const r = budget > 0 ? spent / budget : 0;
    return r < 0.8 ? 'var(--pos)' : r <= 1 ? 'var(--gold)' : 'var(--neg)';
  }

  openCreate() {
    this.editingId.set(null); this.name.set(''); this.icon_.set('target'); this.colorFg.set('#1E3A8A'); this.parentId.set(''); this.monthlyBudget.set('');
    this.modalOpen.set(true);
  }
  openEdit(c: Category) {
    this.editingId.set(c.id); this.name.set(c.name); this.icon_.set(c.icon); this.colorFg.set(c.colorFg); this.parentId.set(c.parentId ?? ''); this.monthlyBudget.set(c.monthlyBudget ?? '');
    this.modalOpen.set(true);
  }

  async save() {
    if (!this.name()) return;
    this.submitting.set(true);
    const isParent = !this.parentId();
    const body = {
      name: this.name(), icon: this.icon_(), colorFg: this.colorFg(), colorBg: this.colorFg() + '1a',
      parentId: this.parentId() || null,
      monthlyBudget: isParent && this.monthlyBudget() ? Number(this.monthlyBudget()) : null,
    };
    try {
      const id = this.editingId();
      if (id) await this.service.update(id, body); else await this.service.create(body);
      this.modalOpen.set(false);
      this.toast.success(id ? 'Categoria atualizada' : 'Categoria criada');
      this.loadAll();
      this.loadSummary(this.month.monthIso());
    } catch {
      this.toast.error('Não foi possível salvar');
    } finally { this.submitting.set(false); }
  }

  async archive(c: Category) {
    const ok = await this.confirm.ask({
      title: 'Arquivar categoria?',
      message: `“${c.name}” e suas subcategorias serão arquivadas. O histórico é mantido.`,
      confirmLabel: 'Arquivar', danger: true,
    });
    if (!ok) return;
    await this.service.archive(c.id);
    this.toast.success('Categoria arquivada');
    this.loadAll();
    this.loadSummary(this.month.monthIso());
  }
}
