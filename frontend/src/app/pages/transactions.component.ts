import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Check, Trash2, Pencil, Search, X, Repeat, Receipt, CreditCard, Undo2 } from 'lucide-angular';
import { AppShellComponent } from '../layout/app-shell.component';
import { ModalComponent } from '../shared/ui/modal.component';
import { MonthService } from '../core/month.service';
import { TransactionsService, TransactionRow } from '../core/transactions.service';
import { CategoriesService, Category } from '../core/categories.service';
import { PaymentMethodsService, PaymentMethod } from '../core/payment-methods.service';
import { RecurringService, RecurringRule } from '../core/recurring.service';
import { ToastService } from '../core/toast.service';
import { ConfirmService } from '../core/confirm.service';
import {
  formatBRL, addMonths, startOfMonth, formatMonth, parseMonetaryAmount,
  toApiDate, todayApiDate, fromApiDate,
} from '../shared/format';
import { iconFor } from '../shared/icons';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { reloadOnReenter } from '../core/reload-on-reenter';
import { swrLoad } from '../core/cache';

const FILTERS = [
  { k: '', label: 'Todos' }, { k: 'income', label: 'Entradas' }, { k: 'expense', label: 'Saídas' }, { k: 'investment', label: 'Investimentos' },
];

@Component({
  selector: 'app-transactions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, AppShellComponent, ModalComponent],
  template: `
    <app-shell>
      <div class="space-y-6 content-in">
        <header class="flex items-start justify-between gap-4">
          <div>
            <h1 class="font-display text-3xl font-extrabold tracking-tight">Lançamentos</h1>
            <p class="text-inkMuted text-[14px] mt-1.5">
              Entradas <span class="font-bold tabular" style="color:var(--pos)">{{ brl(totalIncome()) }}</span>
              <span class="text-inkFaint mx-2">·</span>
              Saídas <span class="font-bold tabular" style="color:var(--neg)">{{ brl(totalExpense()) }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button (click)="openRecurring()" class="btn-ghost flex items-center gap-2" title="Lançamentos recorrentes">
              <lucide-icon [img]="Repeat" [size]="16"></lucide-icon> <span class="hidden sm:inline">Recorrentes</span>
            </button>
            <button (click)="openCreate()" class="btn-brand flex items-center gap-2">
              <lucide-icon [img]="Plus" [size]="16"></lucide-icon> <span class="hidden sm:inline">Novo lançamento</span>
            </button>
          </div>
        </header>

        <!-- busca + filtros -->
        <div class="space-y-3">
          <div class="relative">
            <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-inkMuted"><lucide-icon [img]="Search" [size]="17"></lucide-icon></span>
            <input class="input pl-11 pr-10" placeholder="Buscar por descrição ou observação…"
                   [ngModel]="searchRaw()" (ngModelChange)="onSearch($event)" />
            @if (searchRaw()) {
              <button (click)="onSearch('')" class="absolute right-3 top-1/2 -translate-y-1/2 text-inkMuted hover:text-ink"><lucide-icon [img]="X" [size]="16"></lucide-icon></button>
            }
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            @for (f of filters; track f.k) {
              <button (click)="setFilter(f.k)" class="px-3 py-1.5 rounded-md text-[12.5px] font-semibold border transition-colors"
                [style.background]="filter() === f.k ? 'var(--brand-tint)' : 'var(--surface-2)'"
                [style.color]="filter() === f.k ? 'var(--brand)' : 'var(--ink-muted)'"
                [style.borderColor]="filter() === f.k ? 'var(--brand)' : 'var(--line)'">{{ f.label }}</button>
            }
            <button (click)="toggleStatusView('pay')" class="px-3 py-1.5 rounded-md text-[12.5px] font-semibold border transition-colors"
              [style.background]="statusView() === 'pay' ? 'var(--brand-tint)' : 'var(--surface-2)'"
              [style.color]="statusView() === 'pay' ? 'var(--brand)' : 'var(--ink-muted)'"
              [style.borderColor]="statusView() === 'pay' ? 'var(--brand)' : 'var(--line)'">A pagar</button>
            <button (click)="toggleStatusView('paid')" class="px-3 py-1.5 rounded-md text-[12.5px] font-semibold border transition-colors"
              [style.background]="statusView() === 'paid' ? 'var(--brand-tint)' : 'var(--surface-2)'"
              [style.color]="statusView() === 'paid' ? 'var(--brand)' : 'var(--ink-muted)'"
              [style.borderColor]="statusView() === 'paid' ? 'var(--brand)' : 'var(--line)'">Pago</button>
            <select class="select w-auto py-2 text-[13px]" [ngModel]="filterCategory()" (ngModelChange)="filterCategory.set($event)">
              <option value="">Toda categoria</option>
              @for (c of categoryOptions(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select>
            <select class="select w-auto py-2 text-[13px]" [ngModel]="filterPayment()" (ngModelChange)="filterPayment.set($event)">
              <option value="">Toda forma</option>
              @for (p of pms(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
            </select>
            @if (hasActiveFilter()) {
              <button (click)="clearFilters()" class="text-[12.5px] font-semibold text-inkMuted hover:text-ink underline">limpar</button>
            }
          </div>
        </div>

        @if (statusView() === 'paid') {
          <p class="text-[13.5px] font-semibold">
            {{ paidRows().length }} pagamento{{ paidRows().length === 1 ? '' : 's' }} no mês ·
            <span class="tabular" style="color:var(--pos)">{{ brl(paidTotal()) }}</span> pago
          </p>
        }
        @if (pendingOnly()) {
          <p class="text-[13.5px] font-semibold">
            {{ pendingCount() }} pendente{{ pendingCount() === 1 ? '' : 's' }} no mês ·
            <span class="tabular" style="color:var(--neg)">{{ brl(pendingTotal()) }}</span> a pagar
          </p>
          @if (openInvoices().length) {
            <div class="card divide-y divide-line">
              @for (p of openInvoices(); track p.id) {
                <div class="flex items-center gap-3 p-4">
                  <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" [style.background]="p.color + '1a'" [style.color]="p.color">
                    <lucide-icon [img]="CreditCard" [size]="17"></lucide-icon>
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="font-bold text-[14px] truncate">Fatura {{ p.name }}</div>
                    <div class="text-inkMuted text-[12px] truncate">{{ invoiceSub(p) }}</div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="font-display tabular font-extrabold" style="color:var(--neg)">−{{ brl(p.usedThisMonth) }}</div>
                    <div class="text-[11px] text-inkMuted">fatura</div>
                  </div>
                  <button (click)="payInvoiceQuick(p)" class="w-8 h-8 rounded-full flex items-center justify-center text-inkMuted hover:bg-posTint hover:text-pos shrink-0" title="pagar fatura"><lucide-icon [img]="Check" [size]="14"></lucide-icon></button>
                </div>
              }
            </div>
          }
        }

        <div class="card divide-y divide-line">
          @if (loading() && !rows().length) {
            @for (s of [1,2,3,4,5]; track s) {
              <div class="flex items-center gap-3 p-4">
                <span class="skeleton w-10 h-10 rounded-xl shrink-0"></span>
                <div class="flex-1 space-y-2"><span class="skeleton block h-3.5 w-1/3"></span><span class="skeleton block h-3 w-1/2"></span></div>
                <span class="skeleton h-4 w-20"></span>
              </div>
            }
          } @else {
            @for (t of visibleRows(); track t.id) {
              <div class="flex items-center gap-2.5 sm:gap-3 p-3 sm:p-4 group">
                <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" [style.background]="rowColor(t) + '1a'" [style.color]="rowColor(t)">
                  <lucide-icon [img]="icon(rowIcon(t))" [size]="17"></lucide-icon>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-[14px] truncate flex items-center gap-1.5">
                    {{ t.description }}
                    @if (t.notes === 'Recorrente') { <lucide-icon [img]="Repeat" [size]="12" class="text-inkFaint shrink-0"></lucide-icon> }
                  </div>
                  <div class="text-inkMuted text-[12px] truncate">{{ subLabel(t) }}</div>
                </div>
                <div class="text-right shrink-0">
                  <div class="font-display tabular font-extrabold" [style.color]="amountColor(t.kind)">{{ sign(t.kind) }}{{ brl(t.amount) }}</div>
                  @if (t.status !== 'paid') { <div class="text-[11px] text-inkMuted">{{ statusLabel(t.status) }}</div> }
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  @if (t.kind !== 'card_payment') {
                    @if (t.status !== 'paid') {
                      <button (click)="markPaid(t)" class="w-8 h-8 rounded-full flex items-center justify-center text-inkMuted hover:bg-posTint hover:text-pos" title="marcar como pago"><lucide-icon [img]="Check" [size]="14"></lucide-icon></button>
                    } @else {
                      <button (click)="markUnpaid(t)" class="w-8 h-8 rounded-full flex items-center justify-center text-inkMuted hover:bg-bg2 hover:text-ink" title="desmarcar (voltar para a pagar)"><lucide-icon [img]="Undo2" [size]="14"></lucide-icon></button>
                    }
                  }
                  @if (t.kind !== 'card_payment') {
                    <button (click)="openEdit(t)" class="w-8 h-8 rounded-full flex items-center justify-center text-inkMuted hover:bg-bg2 hover:text-ink" title="editar"><lucide-icon [img]="Pencil" [size]="14"></lucide-icon></button>
                  }
                  <button (click)="remove(t)" class="w-8 h-8 rounded-full flex items-center justify-center text-inkMuted hover:bg-negTint hover:text-neg" title="excluir"><lucide-icon [img]="Trash2" [size]="14"></lucide-icon></button>
                </div>
              </div>
            }
            @if (!visibleRows().length && !(pendingOnly() && openInvoices().length)) {
              <div class="p-12 text-center">
                <span class="w-14 h-14 rounded-2xl bg-bg2 flex items-center justify-center mx-auto text-inkMuted mb-3"><lucide-icon [img]="Receipt" [size]="24"></lucide-icon></span>
                <div class="font-display font-bold text-[15px]">{{ pendingOnly() ? 'Nenhuma conta pendente' : statusView() === 'paid' ? 'Nenhum pagamento ainda' : (hasActiveFilter() || searchRaw() ? 'Nada encontrado' : 'Nenhum lançamento neste mês') }}</div>
                <p class="text-inkMuted text-[13px] mt-1">{{ pendingOnly() ? 'Tudo pago neste mês ✓' : statusView() === 'paid' ? 'Pague uma conta (✓) ou uma fatura e ela aparece aqui.' : (hasActiveFilter() || searchRaw() ? 'Tente outro filtro ou busca.' : 'Adicione sua primeira entrada ou saída.') }}</p>
                @if (!hasActiveFilter() && !searchRaw()) {
                  <button (click)="openCreate()" class="btn-brand inline-flex items-center gap-2 mt-4"><lucide-icon [img]="Plus" [size]="16"></lucide-icon> Novo lançamento</button>
                }
              </div>
            }
          }
        </div>
      </div>
    </app-shell>

    @if (modalOpen()) {
      <app-modal [tag]="editingId() ? 'Editar' : 'Novo lançamento'" [title]="editingId() ? 'Editar lançamento' : 'Novo lançamento'" (close)="modalOpen.set(false)">
        <div>
          <label class="label">Tipo</label>
          <div class="flex flex-wrap gap-2">
            @for (opt of kindOptions; track opt.k) {
              <button (click)="kind.set(opt.k)" class="px-3 py-1.5 rounded-md text-[12.5px] font-semibold border transition-colors"
                [style.background]="kind() === opt.k ? 'var(--brand-tint)' : 'var(--surface-2)'"
                [style.color]="kind() === opt.k ? 'var(--brand)' : 'var(--ink-muted)'"
                [style.borderColor]="kind() === opt.k ? 'var(--brand)' : 'var(--line)'">{{ opt.label }}</button>
            }
          </div>
        </div>
        <div><label class="label">Descrição</label><input class="input" [ngModel]="description()" (ngModelChange)="description.set($event)" placeholder="Ex: Mercado, Salário…" /></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label">Valor</label><input type="number" step="0.01" class="input tabular" [ngModel]="amount()" (ngModelChange)="amount.set($event)" placeholder="0,00" /></div>
          <div>
            <label class="label">{{ isCredit() ? 'Data da compra' : 'Vencimento' }}</label>
            <input type="date" class="input" [ngModel]="date()" (ngModelChange)="date.set($event)" />
          </div>
        </div>
        @if (isCredit() && venceHint(); as v) {
          <p class="text-[12px] font-semibold" style="color:var(--gold)">{{ v }}</p>
        }
        @if (!isCredit()) {
          <div><label class="label">Data da compra <span class="font-normal text-inkFaint">(opcional)</span></label><input type="date" class="input" [ngModel]="purchaseDate()" (ngModelChange)="purchaseDate.set($event)" /></div>
        }
        <div>
          <label class="label">Categoria</label>
          <select class="select" [ngModel]="categoryId()" (ngModelChange)="categoryId.set($event)">
            <option value="">selecione…</option>
            @for (g of cats(); track g.id) {
              <optgroup [label]="g.name">
                @for (s of g.children ?? []; track s.id) { <option [value]="s.id">{{ s.name }}</option> }
              </optgroup>
            }
          </select>
        </div>
        <div>
          <label class="label">Forma de pagamento</label>
          <select class="select" [ngModel]="paymentMethodId()" (ngModelChange)="onPaymentChange($event)">
            <option value="">selecione…</option>
            @for (p of pms(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>
          @if (invoiceHint(); as h) {
            <p class="text-[12px] font-semibold mt-1.5" style="color:var(--gold)">{{ h }}</p>
          }
        </div>
        @if (isCredit() && kind() === 'expense' && !editingId() && !repeat()) {
          <div class="grid grid-cols-2 gap-4">
            <div><label class="label">Parcelas</label><input type="number" min="1" max="36" class="input tabular" [ngModel]="installments()" (ngModelChange)="installments.set($event)" placeholder="1" /></div>
            @if (+installments() > 1) {
              <div><label class="label">Parcela atual</label><input type="number" min="1" [max]="installments()" class="input tabular" [ngModel]="currentInstallment()" (ngModelChange)="currentInstallment.set($event)" placeholder="1" /></div>
            }
          </div>
          @if (+installments() > 1) {
            <div>
              <label class="label">O valor digitado é</label>
              <div class="flex flex-wrap gap-2">
                @for (opt of amountModeOptions; track opt.k) {
                  <button (click)="amountMode.set(opt.k)" class="px-3 py-1.5 rounded-md text-[12.5px] font-semibold border transition-colors"
                    [style.background]="amountMode() === opt.k ? 'var(--brand-tint)' : 'var(--surface-2)'"
                    [style.color]="amountMode() === opt.k ? 'var(--brand)' : 'var(--ink-muted)'"
                    [style.borderColor]="amountMode() === opt.k ? 'var(--brand)' : 'var(--line)'">{{ opt.label }}</button>
                }
              </div>
            </div>
          }
          @if (installmentHint(); as h) {
            <p class="text-[12px] font-semibold mt-1.5" style="color:var(--gold)">{{ h }}</p>
          }
        }
        @if (!editingId() && !repeat() && !isCredit()) {
          <div>
            <label class="label">Situação</label>
            <div class="flex flex-wrap gap-2">
              @for (opt of statusOptions(); track opt.k) {
                <button (click)="status.set(opt.k)" class="px-3 py-1.5 rounded-md text-[12.5px] font-semibold border transition-colors"
                  [style.background]="status() === opt.k ? 'var(--brand-tint)' : 'var(--surface-2)'"
                  [style.color]="status() === opt.k ? 'var(--brand)' : 'var(--ink-muted)'"
                  [style.borderColor]="status() === opt.k ? 'var(--brand)' : 'var(--line)'">{{ opt.label }}</button>
              }
            </div>
          </div>
        }
        <div><label class="label">Observação (opcional)</label><input class="input" [ngModel]="notes()" (ngModelChange)="notes.set($event)" /></div>
        @if (!editingId()) {
          <label class="flex items-center gap-2.5 cursor-pointer select-none py-1">
            <input type="checkbox" class="w-4 h-4 accent-brand" [ngModel]="repeat()" (ngModelChange)="repeat.set($event)" />
            <span class="text-[13.5px] font-semibold flex items-center gap-1.5"><lucide-icon [img]="Repeat" [size]="14"></lucide-icon> Repetir todo mês (no dia {{ repeatDay() }})</span>
          </label>
        }
        <div modal-footer>
          <button (click)="modalOpen.set(false)" class="btn-ghost">Cancelar</button>
          <button (click)="save()" [disabled]="submitting() || !canSave()" class="btn-brand flex items-center gap-2 disabled:opacity-40">
            <lucide-icon [img]="Check" [size]="16"></lucide-icon> {{ submitting() ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      </app-modal>
    }

    @if (recurringOpen()) {
      <app-modal tag="Recorrentes" title="Lançamentos recorrentes" (close)="recurringOpen.set(false)">
        @if (!rules().length) {
          <div class="py-8 text-center text-inkMuted text-[13.5px]">
            Nenhuma recorrência ainda.<br />Marque “Repetir todo mês” ao criar um lançamento.
          </div>
        } @else {
          <ul class="space-y-2.5">
            @for (r of rules(); track r.id) {
              <li class="flex items-center gap-3 p-3 rounded-2xl border border-line">
                <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" [style.background]="r.category.colorFg + '1a'" [style.color]="r.category.colorFg">
                  <lucide-icon [img]="icon(r.category.icon)" [size]="16"></lucide-icon>
                </span>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-[13.5px] truncate">{{ r.description }}</div>
                  <div class="text-inkMuted text-[12px]">Todo dia {{ r.dayOfMonth }} · {{ r.category.name }}</div>
                </div>
                <div class="font-display tabular font-extrabold text-[13.5px]" [style.color]="amountColor(r.kind)">{{ brl(r.amount) }}</div>
                <button (click)="removeRule(r)" class="w-8 h-8 rounded-full flex items-center justify-center text-inkMuted hover:bg-negTint hover:text-neg shrink-0" title="excluir recorrência"><lucide-icon [img]="Trash2" [size]="14"></lucide-icon></button>
              </li>
            }
          </ul>
        }
        <div modal-footer>
          <button (click)="recurringOpen.set(false)" class="btn-ghost">Fechar</button>
        </div>
      </app-modal>
    }
  `,
})
export class TransactionsComponent {
  readonly Plus = Plus; readonly Check = Check; readonly Trash2 = Trash2; readonly Pencil = Pencil;
  readonly Search = Search; readonly X = X; readonly Repeat = Repeat; readonly Receipt = Receipt;
  readonly CreditCard = CreditCard; readonly Undo2 = Undo2;
  filters = FILTERS;
  kindOptions = [{ k: 'expense', label: 'Saída' }, { k: 'income', label: 'Entrada' }, { k: 'investment', label: 'Investimento' }];
  amountModeOptions: { k: 'total' | 'parcela'; label: string }[] = [
    { k: 'total', label: 'Total da compra' },
    { k: 'parcela', label: 'Valor da parcela' },
  ];

  private month = inject(MonthService);
  private cdr = inject(ChangeDetectorRef);
  private service = inject(TransactionsService);
  private categoriesService = inject(CategoriesService);
  private paymentService = inject(PaymentMethodsService);
  private recurringService = inject(RecurringService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  rows = signal<TransactionRow[]>([]);
  loading = signal(true);
  filter = signal('');
  filterCategory = signal('');
  filterPayment = signal('');
  searchRaw = signal('');   // o que o usuário digita (imediato)
  search = signal('');      // valor aplicado ao filtro

  // Filtro 100% local: o mês inteiro já está em memória (bundle pré-carrega 13 meses).
  // Trocar tipo/categoria/forma/busca só recorta a lista carregada — zero rede.
  filteredRows = computed(() => {
    const kind = this.filter();
    const cat = this.filterCategory();
    const pm = this.filterPayment();
    const q = this.search().toLowerCase();
    return this.rows().filter((t) =>
      (!kind || t.kind === kind) &&
      (!cat || t.category?.id === cat) &&
      (!pm || t.paymentMethod.id === pm) &&
      (!q || t.description.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q)));
  });

  totalIncome = computed(() => this.filteredRows().filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0));
  totalExpense = computed(() => this.filteredRows().filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0));
  categoryOptions = computed(() => this.cats().flatMap((g) => g.children ?? []));
  hasActiveFilter = computed(() => !!this.filter() || !!this.filterCategory() || !!this.filterPayment() || !!this.statusView());

  // Visões de status: '' (tudo) | 'pay' (a pagar) | 'paid' (pago) — corte no cliente, sem nova request.
  // Compras de cartão ficam fora das duas visões — elas vivem dentro da fatura (evita contar 2x).
  // Mesma régua dos KPIs do dashboard (toPay/paidOut) — manter em sincronia com a API.
  statusView = signal<'' | 'pay' | 'paid'>('');
  pendingOnly = computed(() => this.statusView() === 'pay');
  // A pagar = saídas avulsas não pagas (pendente OU agendada, não-cartão).
  // Entradas pendentes (ex.: salário) são "a receber" — ficam fora da visão A pagar.
  pendingRows = computed(() => this.filteredRows().filter((t) =>
    t.status !== 'paid' && t.kind !== 'income' && t.paymentMethod.kind !== 'credit_card'));
  // Pago = avulsas pagas (não-cartão, saídas) + pagamentos de fatura — mesma régua do KPI "Pago no mês"
  paidRows = computed(() => this.filteredRows().filter((t) =>
    t.kind === 'card_payment' || (t.status === 'paid' && t.kind !== 'income' && t.paymentMethod.kind !== 'credit_card')));
  paidTotal = computed(() => this.paidRows().reduce((s, t) => s + t.amount, 0));
  visibleRows = computed(() =>
    this.statusView() === 'pay' ? this.pendingRows() : this.statusView() === 'paid' ? this.paidRows() : this.filteredRows());
  openInvoices = computed(() => this.pms().filter((p) => p.kind === 'credit_card' && p.usedThisMonth > 0.005));
  pendingCount = computed(() => this.pendingRows().length + this.openInvoices().length);
  pendingTotal = computed(() =>
    this.pendingRows().reduce((s, t) => s + t.amount, 0) +
    this.openInvoices().reduce((s, p) => s + p.usedThisMonth, 0));

  toggleStatusView(v: 'pay' | 'paid') { this.statusView.set(this.statusView() === v ? '' : v); }

  modalOpen = signal(false);
  recurringOpen = signal(false);
  submitting = signal(false);
  cats = signal<Category[]>([]);
  pms = signal<PaymentMethod[]>([]);
  rules = signal<RecurringRule[]>([]);
  editingId = signal<string | null>(null);
  kind = signal('expense'); description = signal(''); amount = signal<string | number>('');
  date = signal(this.todayIso()); categoryId = signal(''); paymentMethodId = signal('');
  purchaseDate = signal<string>(''); // data da compra (opcional, só não-cartão) — vazio = usa o vencimento
  installments = signal<string | number>(''); currentInstallment = signal<string | number>(''); notes = signal('');
  amountMode = signal<'total' | 'parcela'>('total');
  isCredit = signal(false);
  repeat = signal(false);
  // Situação do novo lançamento: 'pending' (a pagar/receber) é o padrão — o ✓ da lista marca pago depois.
  status = signal<'pending' | 'paid'>('pending');
  // Rótulos por tipo: entrada = "A receber/Recebido"; saída/investimento = "A pagar/Pago".
  statusOptions = computed<{ k: 'pending' | 'paid'; label: string }[]>(() =>
    this.kind() === 'income'
      ? [{ k: 'pending', label: 'A receber' }, { k: 'paid', label: 'Recebido' }]
      : [{ k: 'pending', label: 'A pagar' }, { k: 'paid', label: 'Pago' }]);
  repeatDay = computed(() => Math.min(28, new Date(this.date() + 'T12:00:00').getDate() || 1));
  // Resumo do parcelamento: interpreta o valor digitado conforme o modo (total da compra ou valor da parcela).
  installmentHint = computed(() => {
    const total = Math.floor(+this.installments());
    if (!(total > 1)) return null;
    const cur = Math.floor(+this.currentInstallment()) || 1;
    if (cur > total) return 'Parcela atual maior que o total de parcelas';
    const v = parseMonetaryAmount(this.amount());
    const isParcela = this.amountMode() === 'parcela';
    if (!(v > 0)) return isParcela ? 'Digite o valor de UMA parcela no campo Valor' : null;
    const grandTotal = isParcela ? Math.round(v * total * 100) / 100 : v;
    const per = isParcela ? v : Math.round((v / total) * 100) / 100;
    const range = cur > 1 ? ` · lança só as parcelas ${cur} a ${total}` : '';
    return `${total}x de ${formatBRL(per)} = ${formatBRL(grandTotal)} no total${range}`;
  });

  // Aviso de fechamento: compra no dia do fechamento ou depois entra na fatura do mês seguinte.
  invoiceHint = computed(() => {
    const pm = this.pms().find((p) => p.id === this.paymentMethodId());
    if (!pm || pm.kind !== 'credit_card' || !pm.closingDay) return null;
    const d = new Date(this.date() + 'T12:00:00');
    if (isNaN(d.getTime()) || d.getDate() < pm.closingDay) return null;
    return `Após o fechamento (dia ${pm.closingDay}) → entra na fatura de ${formatMonth(addMonths(d, 1))}`;
  });

  // Data exata de vencimento derivada do cartão (dia da compra → mês da fatura → dia de vencimento).
  // Mostrada no modal pra deixar claro "quando vence" a compra de cartão.
  venceHint = computed(() => {
    const pm = this.pms().find((p) => p.id === this.paymentMethodId());
    if (!pm || pm.kind !== 'credit_card' || !pm.dueDay) return null;
    const d = fromApiDate(this.date());
    if (!d) return null;
    const due = this.dueDateFor(pm.closingDay ?? null, pm.dueDay, d);
    return `Vence em ${this.fmtDate(due)}`;
  });

  // Mês da fatura (mesma regra do back invoiceMonth): compra no dia do fechamento ou depois → mês seguinte.
  private invoiceRefFor(closingDay: number | null, d: Date): Date {
    return closingDay && d.getDate() >= closingDay ? addMonths(startOfMonth(d), 1) : startOfMonth(d);
  }
  // Data de vencimento (dueDateInMonth do back): dia de vencimento no mês da fatura, limitado ao fim do mês.
  private dueDateFor(closingDay: number | null, dueDay: number, d: Date): Date {
    const ref = this.invoiceRefFor(closingDay, d);
    const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
    return new Date(ref.getFullYear(), ref.getMonth(), Math.min(Math.max(1, dueDay), lastDay));
  }
  private fmtDate(d: Date) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d); }

  constructor() {
    // recarrega só quando muda o MÊS — filtros e busca são recortes locais (filteredRows)
    // allowSignalWrites pois o reload (swrLoad) escreve os signals de estado
    effect(() => {
      this.reload(this.month.monthIso());
    }, { allowSignalWrites: true });
    // garante selects de filtro/modal carregados
    this.ensureRefs();
    reloadOnReenter('/lancamentos', () => this.reload(this.currentKey()));
    // troca de mes: RxJS puro garante o reload mesmo na view reusada (effect nao re-roda)
    this.month.changes$.pipe(takeUntilDestroyed()).subscribe(() => this.reload(this.currentKey()));
  }

  private currentKey() {
    return this.month.monthIso();
  }
  private reload(iso: string) {
    // chave "iso||||" = mês sem filtros — a MESMA que o bundle hidrata (13 meses pré-carregados)
    swrLoad(this.service.cache, `${iso}||||`, (v) => this.rows.set(v), (b) => this.loading.set(b), () => this.cdr.markForCheck())
      .then(() => this.prefetchNeighbors());
    // faturas em aberto acompanham o mês exibido (usadas no filtro "A pagar")
    swrLoad(this.paymentService.cache, iso, (v) => this.pms.set(v), () => {}, () => this.cdr.markForCheck());
  }
  // Pre-busca mes anterior/proximo em background -> navegar com as setas vira instantaneo (vem do cache).
  private prefetchNeighbors() {
    const base = this.month.month();
    for (const delta of [-1, 1]) {
      const key = `${toApiDate(startOfMonth(addMonths(base, delta)))}||||`;
      if (!this.service.cache.isFresh(key)) this.service.cache.refresh(key).catch(() => {});
    }
  }
  private async ensureRefs() {
    if (!this.cats().length) this.cats.set(await this.categoriesService.tree());
    if (!this.pms().length) this.pms.set(await this.paymentService.list(this.month.monthIso()));
  }
  private todayIso() { return todayApiDate(); }

  brl(v: number) { return formatBRL(v); }
  icon(k: string) { return iconFor(k); }
  setFilter(k: string) { this.filter.set(k); }
  clearFilters() { this.filter.set(''); this.filterCategory.set(''); this.filterPayment.set(''); this.statusView.set(''); this.onSearch(''); }
  sign(kind: string) { return kind === 'income' ? '+' : kind === 'expense' ? '−' : ''; }
  amountColor(kind: string) {
    if (kind === 'income') return 'var(--pos)';
    if (kind === 'expense') return 'var(--neg)';
    if (kind === 'card_payment') return 'var(--ink-muted)';
    return 'var(--invest)';
  }
  // Visual da linha: pagamento de fatura não tem categoria → cai no fallback (cor do cartão + ícone carteira).
  rowColor(t: TransactionRow) { return t.category?.colorFg ?? t.paymentMethod.color; }
  rowIcon(t: TransactionRow) { return t.category?.icon ?? 'wallet'; }
  subLabel(t: TransactionRow) {
    return [t.category?.name, t.paymentMethod.name, this.dateText(t)].filter(Boolean).join(' · ');
  }
  // Texto de data: quando há data de compra diferente do vencimento, mostra "compra X · vence Y".
  dateText(t: TransactionRow) {
    const vence = this.dayLabel(t.transactionDate);
    const hasPurchase = !!t.purchaseDate && t.purchaseDate.slice(0, 10) !== t.transactionDate.slice(0, 10);
    return hasPurchase ? `compra ${this.dayLabel(t.purchaseDate!)} · vence ${vence}` : vence;
  }
  statusLabel(s: string) { return s === 'pending' ? 'pendente' : s === 'scheduled' ? 'agendado' : s; }
  // fromApiDate, e não new Date(iso): a data vem como AAAA-MM-DD, que o
  // construtor de Date interpreta em UTC. Em Brasília isso exibiria o dia anterior.
  dayLabel(iso: string) {
    const d = fromApiDate(iso);
    return d ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d) : '';
  }
  canSave() {
    const cur = Math.floor(+this.currentInstallment()) || 1;
    const total = Math.floor(+this.installments()) || 1;
    return !!this.description() && parseMonetaryAmount(this.amount()) > 0 && !!this.categoryId() && !!this.paymentMethodId() && cur <= total;
  }

  onSearch(v: string) {
    // aplica na hora: o filtro é local (sem rede), não precisa de debounce
    this.searchRaw.set(v);
    this.search.set(v.trim());
  }

  onPaymentChange(id: string) {
    this.paymentMethodId.set(id);
    this.isCredit.set(this.pms().find((p) => p.id === id)?.kind === 'credit_card');
  }

  async openCreate() {
    this.editingId.set(null);
    this.kind.set('expense'); this.description.set(''); this.amount.set(''); this.date.set(this.todayIso());
    this.categoryId.set(''); this.paymentMethodId.set(''); this.installments.set(''); this.currentInstallment.set(''); this.amountMode.set('total'); this.notes.set(''); this.isCredit.set(false); this.repeat.set(false); this.status.set('pending'); this.purchaseDate.set('');
    await this.ensureRefs();
    this.modalOpen.set(true);
  }

  async openEdit(t: TransactionRow) {
    this.editingId.set(t.id);
    const isCred = t.paymentMethod.kind === 'credit_card';
    this.kind.set(t.kind); this.description.set(t.description); this.amount.set(t.amount);
    // Cartão: o campo principal é a data da COMPRA (deriva o vencimento) — usa purchaseDate, com
    // fallback pra transactionDate em linhas antigas (sem compra guardada). Não-cartão: é o vencimento.
    this.date.set((isCred ? (t.purchaseDate ?? t.transactionDate) : t.transactionDate).slice(0, 10));
    this.purchaseDate.set(t.purchaseDate ? t.purchaseDate.slice(0, 10) : '');
    this.categoryId.set(t.category?.id ?? '');
    this.paymentMethodId.set(t.paymentMethod.id); this.notes.set(t.notes && t.notes !== 'Recorrente' ? t.notes : '');
    this.isCredit.set(isCred); this.repeat.set(false); this.installments.set(''); this.currentInstallment.set('');
    await this.ensureRefs();
    this.modalOpen.set(true);
  }

  async save() {
    if (!this.canSave()) return;
    this.submitting.set(true);
    // Os campos de data já vêm no formato da API (AAAA-MM-DD), que é o mesmo
    // do input type="date": não há conversão a fazer.
    const iso = this.date();
    // Data da compra: só faz sentido mandar para não-cartão (no cartão a compra É o campo principal
    // e a API deriva o vencimento). Vazio → null (limpa/omite a compra).
    const purchaseIso = this.purchaseDate() || null;
    try {
      const parsedAmount = parseMonetaryAmount(this.amount());
      if (this.editingId()) {
        await this.service.update(this.editingId()!, {
          kind: this.kind(), description: this.description(), amount: parsedAmount,
          categoryId: this.categoryId(), paymentMethodId: this.paymentMethodId(),
          transactionDate: iso, notes: this.notes() || null,
          ...(this.isCredit() ? {} : { purchaseDate: purchaseIso }),
        });
        this.toast.success('Lançamento atualizado');
      } else if (this.repeat()) {
        await this.recurringService.create({
          kind: this.kind(), description: this.description(), amount: parsedAmount,
          categoryId: this.categoryId(), paymentMethodId: this.paymentMethodId(),
          dayOfMonth: this.repeatDay(), status: 'pending', startMonth: iso,
        });
        this.toast.success('Recorrência criada');
      } else {
        const inst = this.isCredit() && this.kind() === 'expense' && +this.installments() > 1 ? Number(this.installments()) : 1;
        const cur = inst > 1 && +this.currentInstallment() > 1 ? Math.floor(Number(this.currentInstallment())) : 1;
        // Modo "valor da parcela": o total da compra é parcela × N (a API sempre recebe o total)
        const amountToSend = inst > 1 && this.amountMode() === 'parcela' ? Math.round(parsedAmount * inst * 100) / 100 : parsedAmount;
        await this.service.create({
          kind: this.kind(), description: this.description(), amount: amountToSend,
          categoryId: this.categoryId(), paymentMethodId: this.paymentMethodId(),
          transactionDate: iso, status: this.isCredit() ? 'paid' : this.status(), totalInstallments: inst,
          ...(cur > 1 ? { currentInstallment: cur } : {}),
          ...(this.isCredit() ? {} : { purchaseDate: purchaseIso }),
          notes: this.notes() || null,
        });
        this.toast.success(inst > 1 ? (cur > 1 ? `Lançamento criado (parcelas ${cur} a ${inst} de ${inst}x)` : `Lançamento criado em ${inst}x (total ${this.brl(amountToSend)})`) : 'Lançamento criado');
      }
      this.modalOpen.set(false);
      this.reload(this.currentKey());
    } catch {
      this.toast.error('Não foi possível salvar');
    } finally { this.submitting.set(false); }
  }

  invoiceSub(p: PaymentMethod) {
    const parts = [p.dueDay ? `vence dia ${p.dueDay}` : '', `gasto ${this.brl(p.spentThisMonth)}`, p.invoicePaid > 0 ? `${this.brl(p.invoicePaid)} já pago` : ''];
    return parts.filter(Boolean).join(' · ');
  }

  // Pagamento de fatura em 1 toque: lança card_payment do valor em aberto (mesmo fluxo da tela Cartões)
  async payInvoiceQuick(p: PaymentMethod) {
    const ok = await this.confirm.ask({
      title: `Pagar fatura ${p.name}?`,
      message: `Registrar pagamento de ${this.brl(p.usedThisMonth)} com data de hoje. Para valor parcial, use a tela Cartões.`,
      confirmLabel: 'Pagar',
    });
    if (!ok) return;
    try {
      await this.paymentService.payInvoice(p.id, p.usedThisMonth, this.todayIso(), this.month.monthIso());
      this.toast.success(`Fatura ${p.name} paga ✓`);
      this.reload(this.currentKey());
    } catch {
      this.toast.error('Não foi possível registrar o pagamento');
    }
  }

  // Um toque: pendente/agendado vira pago (o PATCH da API já aceita status)
  async markPaid(t: TransactionRow) {
    try {
      await this.service.update(t.id, { status: 'paid' });
      this.toast.success(`"${t.description}" pago ✓`);
      this.reload(this.currentKey());
    } catch {
      this.toast.error('Não foi possível marcar como pago');
    }
  }

  // Desfaz o pago: volta para "a pagar" (pendente). Conserta lançamento marcado pago por engano.
  async markUnpaid(t: TransactionRow) {
    try {
      await this.service.update(t.id, { status: 'pending' });
      this.toast.success(`"${t.description}" voltou para a pagar`);
      this.reload(this.currentKey());
    } catch {
      this.toast.error('Não foi possível desmarcar');
    }
  }

  // Exclui direto, sem diálogo — o toast oferece "Desfazer" por ~6s (archived é reversível)
  async remove(t: TransactionRow) {
    try {
      await this.service.archive(t.id);
    } catch {
      this.toast.error('Não foi possível excluir');
      return;
    }
    this.reload(this.currentKey());
    this.toast.success(`“${t.description}” excluído`, {
      label: 'Desfazer',
      run: async () => {
        try {
          await this.service.restore(t.id);
          this.reload(this.currentKey());
        } catch {
          this.toast.error('Não foi possível desfazer');
        }
      },
    });
  }

  async openRecurring() {
    this.recurringOpen.set(true);
    this.rules.set(await this.recurringService.list());
  }

  async removeRule(r: RecurringRule) {
    const ok = await this.confirm.ask({
      title: 'Excluir recorrência?',
      message: `“${r.description}” deixará de ser lançado nos próximos meses. Os lançamentos já criados permanecem.`,
      confirmLabel: 'Excluir', danger: true,
    });
    if (!ok) return;
    await this.recurringService.remove(r.id);
    this.rules.set(await this.recurringService.list());
    this.toast.success('Recorrência removida');
    this.reload(this.currentKey());
  }
}
