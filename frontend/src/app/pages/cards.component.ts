import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Pencil, Archive, AlertTriangle, Check, CreditCard, CalendarClock, Wallet } from 'lucide-angular';
import { AppShellComponent } from '../layout/app-shell.component';
import { ModalComponent } from '../shared/ui/modal.component';
import { ColorPickerComponent } from '../shared/ui/color-picker.component';
import { MonthService } from '../core/month.service';
import { PaymentMethodsService, PaymentMethod } from '../core/payment-methods.service';
import { ToastService } from '../core/toast.service';
import { ConfirmService } from '../core/confirm.service';
import { formatBRL, formatMonth, parseMonetaryAmount, todayApiDate } from '../shared/format';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { reloadOnReenter } from '../core/reload-on-reenter';
import { swrLoad } from '../core/cache';

const KINDS = [
  { k: 'credit_card', label: 'Crédito' },
  { k: 'pix', label: 'Pix' },
  { k: 'boleto', label: 'Boleto' },
  { k: 'debit', label: 'Débito' },
  { k: 'cash', label: 'Dinheiro' },
];

@Component({
  selector: 'app-cards',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, AppShellComponent, ModalComponent, ColorPickerComponent],
  template: `
    <app-shell>
      <div class="space-y-6 content-in">
        <header class="flex items-start justify-between gap-4">
          <div>
            <h1 class="font-display text-3xl font-extrabold tracking-tight">Cartões & formas</h1>
            <p class="text-inkMuted text-[14px] mt-1.5">O que está em uso este mês.</p>
          </div>
          <button (click)="openCreate()" class="btn-brand flex items-center gap-2 shrink-0">
            <lucide-icon [img]="Plus" [size]="16"></lucide-icon> Nova forma
          </button>
        </header>

        @if (credit().length) {
          <section class="space-y-1">
            <h2 class="text-[12px] font-bold uppercase tracking-wider text-inkMuted px-1">Cartões de crédito</h2>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
              @for (p of credit(); track p.id) {
                <div class="relative rounded-3xl p-5 text-white overflow-hidden min-h-[150px] flex flex-col justify-between"
                     [style.background]="gradient(p)">
                  <div class="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10"></div>
                  <div class="relative z-10 flex items-start justify-between">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <span class="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                        <lucide-icon [img]="CreditCard" [size]="17"></lucide-icon>
                      </span>
                      <div class="min-w-0">
                        <div class="font-display font-bold text-[15px] leading-tight truncate">{{ p.name }}</div>
                        <div class="text-white/65 text-[11.5px] truncate">{{ p.ownerLabel || 'crédito' }}</div>
                      </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      @if (high(p)) {
                        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold" style="background:rgba(251,191,36,0.20);color:#FDE68A">
                          <lucide-icon [img]="AlertTriangle" [size]="12"></lucide-icon> limite alto
                        </span>
                      }
                      <button (click)="openEdit(p)" class="w-8 h-8 rounded-full flex items-center justify-center bg-white/12 text-white/80 hover:bg-white/20" title="editar"><lucide-icon [img]="Pencil" [size]="13"></lucide-icon></button>
                      <button (click)="archive(p)" class="w-8 h-8 rounded-full flex items-center justify-center bg-white/12 text-white/80 hover:bg-white/20" title="arquivar"><lucide-icon [img]="Archive" [size]="13"></lucide-icon></button>
                    </div>
                  </div>
                  <div class="relative z-10">
                    <div class="flex items-end justify-between">
                      <div>
                        <div class="text-white/65 text-[11.5px]">{{ p.usedThisMonth < 0 ? 'Crédito na fatura' : 'Fatura em aberto' }}</div>
                        <div class="font-display tabular text-2xl font-extrabold">{{ brl(openAbs(p)) }}</div>
                        @if (p.invoicePaid > 0) {
                          <div class="text-white/70 text-[11px] mt-0.5 tabular">Gasto {{ brl(p.spentThisMonth) }} · {{ brl(p.invoicePaid) }} pago</div>
                        }
                        @if (futureInstallments(p) > 0) {
                          <div class="text-white/55 text-[11px] mt-0.5 tabular">+ {{ brl(futureInstallments(p)) }} em parcelas futuras</div>
                        }
                      </div>
                      @if (p.limitValue) {
                        <div class="text-right text-white/70 text-[12px]">
                          <div class="text-white/60 text-[11px]">disponível</div>
                          <div class="tabular font-bold text-white text-[15px]">{{ brl(available(p)) }}</div>
                          <div class="text-[11px] mt-0.5">de <span class="tabular">{{ brl(p.limitValue) }}</span></div>
                          @if (p.closingDay) { <div class="text-[11px]">fecha dia {{ p.closingDay }} · vence {{ p.dueDay }}</div> }
                        </div>
                      }
                    </div>
                    @if (p.limitValue) {
                      <div class="mt-2 h-1.5 rounded-full bg-white/20 overflow-hidden">
                        <span class="block h-full bg-white/85" [style.width.%]="pct(p)"></span>
                      </div>
                    }
                    @if (invoice(p); as inv) {
                      <div class="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 bg-white/10">
                        <lucide-icon [img]="CalendarClock" [size]="15" class="shrink-0 text-white/80"></lucide-icon>
                        <span class="text-[12px] text-white/85 flex-1">{{ inv.label }}</span>
                        @if (inv.urgent) { <span class="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style="background:rgba(251,191,36,0.22);color:#FDE68A">vence já</span> }
                      </div>
                    }
                    <button (click)="openPay(p)" class="mt-3 w-full flex items-center justify-center gap-2 rounded-2xl px-3 py-2 bg-white/15 hover:bg-white/25 text-[12.5px] font-bold transition-colors">
                      <lucide-icon [img]="Wallet" [size]="15"></lucide-icon> Pagar fatura
                    </button>
                  </div>
                </div>
              }
            </div>
          </section>
        }

        @if (others().length) {
          <section class="space-y-1">
            <h2 class="text-[12px] font-bold uppercase tracking-wider text-inkMuted px-1">Outras formas</h2>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
              @for (p of others(); track p.id) {
                <div class="card p-5 lift relative">
                  <div class="absolute top-3 right-3 flex gap-1">
                    <button (click)="openEdit(p)" class="w-7 h-7 rounded-full flex items-center justify-center text-inkMuted hover:bg-bg2" title="editar"><lucide-icon [img]="Pencil" [size]="12"></lucide-icon></button>
                    <button (click)="archive(p)" class="w-7 h-7 rounded-full flex items-center justify-center text-inkMuted hover:bg-negTint hover:text-neg" title="arquivar"><lucide-icon [img]="Archive" [size]="12"></lucide-icon></button>
                  </div>
                  <span class="w-9 h-9 rounded-xl flex items-center justify-center" [style.background]="p.color + '1a'" [style.color]="p.color">
                    <lucide-icon [img]="CreditCard" [size]="16"></lucide-icon>
                  </span>
                  <div class="font-bold text-[14px] mt-3 truncate">{{ p.name }}</div>
                  <div class="text-inkMuted text-[12px]">{{ kindLabel(p.kind) }}</div>
                  <div class="font-display tabular text-lg font-extrabold mt-1">{{ brl(p.usedThisMonth) }}</div>
                </div>
              }
            </div>
          </section>
        }

        @if (!loading() && !pms().length) {
          <div class="card p-10 text-center text-inkMuted">Nenhuma forma de pagamento. Crie a primeira.</div>
        }
      </div>
    </app-shell>

    @if (modalOpen()) {
      <app-modal [tag]="editingId() ? 'Editar forma' : 'Nova forma'" [title]="editingId() ? 'Editar pagamento' : 'Nova forma de pagamento'" (close)="modalOpen.set(false)">
        <div>
          <label class="label">Tipo</label>
          <div class="flex flex-wrap gap-2">
            @for (opt of kinds; track opt.k) {
              <button (click)="kind.set(opt.k)" class="px-3.5 py-2 rounded-2xl text-[13px] font-bold border transition-all"
                [style.background]="kind() === opt.k ? 'var(--brand-tint)' : 'var(--surface-2)'"
                [style.color]="kind() === opt.k ? 'var(--brand)' : 'var(--ink-muted)'"
                [style.borderColor]="kind() === opt.k ? 'var(--brand)' : 'var(--line)'">{{ opt.label }}</button>
            }
          </div>
        </div>
        <div>
          <label class="label">Nome</label>
          <input class="input" [ngModel]="name()" (ngModelChange)="name.set($event)" placeholder="Ex: Nubank, Pix Itaú…" />
        </div>
        <div>
          <label class="label">Dono (opcional)</label>
          <input class="input" [ngModel]="ownerLabel()" (ngModelChange)="ownerLabel.set($event)" placeholder="Ex: Ana, Bruno" />
        </div>
        <div>
          <label class="label">Cor</label>
          <app-color-picker [value]="color()" (change)="color.set($event)"></app-color-picker>
        </div>
        @if (kind() === 'credit_card') {
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div class="col-span-2 sm:col-span-1"><label class="label">Limite</label><input type="number" step="0.01" class="input tabular" [ngModel]="limitValue()" (ngModelChange)="limitValue.set($event)" placeholder="0,00" /></div>
            <div><label class="label">Fecha dia</label><input type="number" min="1" max="31" class="input tabular" [ngModel]="closingDay()" (ngModelChange)="closingDay.set($event)" placeholder="1" /></div>
            <div><label class="label">Vence dia</label><input type="number" min="1" max="31" class="input tabular" [ngModel]="dueDay()" (ngModelChange)="dueDay.set($event)" placeholder="10" /></div>
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

    @if (payOpen()) {
      <app-modal [tag]="'Fatura de ' + monthLabel()" [title]="'Pagar fatura · ' + (payCard()?.name ?? '')" (close)="payOpen.set(false)">
        <div class="rounded-2xl bg-bg2 px-4 py-3 text-[13px] space-y-1">
          <div class="flex justify-between"><span class="text-inkMuted">Fatura</span><span class="font-bold first-letter:uppercase">{{ monthLabel() }}</span></div>
          <div class="flex justify-between"><span class="text-inkMuted">Gasto na fatura</span><span class="tabular font-bold">{{ brl(payCard()?.spentThisMonth ?? 0) }}</span></div>
          <div class="flex justify-between"><span class="text-inkMuted">Já pago</span><span class="tabular font-bold">{{ brl(payCard()?.invoicePaid ?? 0) }}</span></div>
          <div class="flex justify-between border-t border-line pt-1 mt-1"><span class="text-inkMuted">Em aberto</span><span class="tabular font-extrabold" style="color:var(--brand)">{{ brl(payCard()?.usedThisMonth ?? 0) }}</span></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label">Valor do pagamento</label><input type="number" step="0.01" class="input tabular" [ngModel]="payAmount()" (ngModelChange)="payAmount.set($event)" placeholder="0,00" /></div>
          <div><label class="label">Data</label><input type="date" class="input" [ngModel]="payDate()" (ngModelChange)="payDate.set($event)" /></div>
        </div>
        <p class="text-[12px] text-inkMuted">O valor abate o “em aberto” da fatura de {{ monthLabel() }} e libera o limite. Não conta como nova despesa.</p>
        <div modal-footer>
          <button (click)="payOpen.set(false)" class="btn-ghost">Cancelar</button>
          <button (click)="confirmPay()" [disabled]="paySubmitting() || !(parseAmount(payAmount()) > 0)" class="btn-brand flex items-center gap-2 disabled:opacity-40">
            <lucide-icon [img]="Check" [size]="16"></lucide-icon> {{ paySubmitting() ? 'Pagando…' : 'Confirmar pagamento' }}
          </button>
        </div>
      </app-modal>
    }
  `,
})
export class CardsComponent {
  readonly Plus = Plus; readonly Pencil = Pencil; readonly Archive = Archive;
  readonly AlertTriangle = AlertTriangle; readonly Check = Check; readonly CreditCard = CreditCard; readonly CalendarClock = CalendarClock; readonly Wallet = Wallet;
  kinds = KINDS;

  private month = inject(MonthService);
  private cdr = inject(ChangeDetectorRef);
  private service = inject(PaymentMethodsService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  pms = signal<PaymentMethod[]>([]);
  loading = signal(true);
  credit = computed(() => this.pms().filter((p) => p.kind === 'credit_card'));
  others = computed(() => this.pms().filter((p) => p.kind !== 'credit_card'));

  modalOpen = signal(false);
  editingId = signal<string | null>(null);
  submitting = signal(false);
  name = signal('');
  kind = signal('credit_card');
  ownerLabel = signal('');
  color = signal('#1E3A8A');
  limitValue = signal<string | number>('');
  closingDay = signal<string | number>('');
  dueDay = signal<string | number>('');

  // pagamento de fatura
  payOpen = signal(false);
  payCard = signal<PaymentMethod | null>(null);
  payAmount = signal<string | number>('');
  payDate = signal(this.todayIso());
  paySubmitting = signal(false);

  constructor() {
    this.reload(this.month.monthIso());
    reloadOnReenter('/cartoes', () => this.reload(this.month.monthIso()));
    // troca de mes: RxJS puro garante o reload mesmo na view reusada (effect nao re-roda)
    this.month.changes$.pipe(takeUntilDestroyed()).subscribe(() => this.reload(this.month.monthIso()));
  }

  private reload(iso: string) {
    swrLoad(this.service.cache, iso, (v) => this.pms.set(v), (b) => this.loading.set(b), () => this.cdr.markForCheck());
  }

  brl(v: number) { return formatBRL(v); }
  monthLabel() { return formatMonth(this.month.month()); }
  parseAmount(v: string | number | null | undefined) { return parseMonetaryAmount(v); }
  openAbs(p: PaymentMethod) { return Math.abs(p.usedThisMonth); }
  private todayIso() { return todayApiDate(); }
  kindLabel(k: string) { return KINDS.find((x) => x.k === k)?.label ?? k; }
  // Limite: usa o total comprometido (inclui parcelas futuras), não só a fatura do mês atual.
  high(p: PaymentMethod) { return !!p.limitValue && p.totalLimitUsed / p.limitValue >= 0.8; }
  pct(p: PaymentMethod) { return p.limitValue ? Math.max(0, Math.min(100, (p.totalLimitUsed / p.limitValue) * 100)) : 0; }
  // Parcelas futuras que comprometem o limite além da fatura atual
  futureInstallments(p: PaymentMethod) { return Math.max(0, p.totalLimitUsed - Math.max(0, p.usedThisMonth)); }
  // Limite disponível: desconta o total comprometido (fatura atual + parcelas futuras)
  available(p: PaymentMethod) { return p.limitValue ? Math.max(0, p.limitValue - p.totalLimitUsed) : 0; }
  gradient(p: PaymentMethod) { return `linear-gradient(135deg, ${p.color}, ${p.color}CC 55%, #0F172A)`; }

  // Status da fatura do MÊS EXIBIDO: fechamento e vencimento são as datas reais daquele
  // mês, não uma contagem a partir de hoje. Olhando setembro, o card fala do 21/09 —
  // antes ele mostrava o valor de setembro com o "vence em X dias" de agosto.
  invoice(p: PaymentMethod): { label: string; urgent: boolean } | null {
    if (!p.dueDay) return null;
    const ref = this.month.month();
    const today = new Date();
    const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const due = new Date(ref.getFullYear(), ref.getMonth(), p.dueDay);
    const days = (dt: Date) => Math.round((dt.getTime() - d0.getTime()) / 86400000);
    const dm = (dt: Date) => `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const dueIn = days(due);
    if (p.closingDay) {
      const closeIn = days(new Date(ref.getFullYear(), ref.getMonth(), p.closingDay));
      if (closeIn >= 0 && closeIn < dueIn) {
        const fecha = closeIn === 0 ? 'Fatura fecha hoje' : `Fatura fecha em ${closeIn} ${closeIn === 1 ? 'dia' : 'dias'}`;
        return { label: `${fecha}, vence ${dm(due)}`, urgent: false };
      }
    }
    if (dueIn < 0) return { label: `Venceu dia ${dm(due)}`, urgent: false };
    const label = dueIn === 0 ? 'Vence hoje' : `Vence em ${dueIn} ${dueIn === 1 ? 'dia' : 'dias'} (${dm(due)})`;
    return { label, urgent: dueIn <= 5 };
  }

  openCreate() {
    this.editingId.set(null);
    this.name.set(''); this.kind.set('credit_card'); this.ownerLabel.set(''); this.color.set('#1E3A8A');
    this.limitValue.set(''); this.closingDay.set(''); this.dueDay.set('');
    this.modalOpen.set(true);
  }
  openEdit(p: PaymentMethod) {
    this.editingId.set(p.id);
    this.name.set(p.name); this.kind.set(p.kind); this.ownerLabel.set(p.ownerLabel ?? ''); this.color.set(p.color);
    this.limitValue.set(p.limitValue ?? ''); this.closingDay.set(p.closingDay ?? ''); this.dueDay.set(p.dueDay ?? '');
    this.modalOpen.set(true);
  }

  async save() {
    if (!this.name()) return;
    this.submitting.set(true);
    const isCredit = this.kind() === 'credit_card';
    const body = {
      name: this.name(), kind: this.kind(), color: this.color(),
      ownerLabel: this.ownerLabel() || null,
      limitValue: isCredit && this.limitValue() ? Number(this.limitValue()) : null,
      closingDay: isCredit && this.closingDay() ? Number(this.closingDay()) : null,
      dueDay: isCredit && this.dueDay() ? Number(this.dueDay()) : null,
    };
    try {
      const id = this.editingId();
      if (id) await this.service.update(id, body); else await this.service.create(body);
      this.modalOpen.set(false);
      this.toast.success(id ? 'Forma atualizada' : 'Forma criada');
      this.reload(this.month.monthIso());
    } catch {
      this.toast.error('Não foi possível salvar');
    } finally { this.submitting.set(false); }
  }

  openPay(p: PaymentMethod) {
    this.payCard.set(p);
    // sugere o valor em aberto (quando positivo) como padrão
    this.payAmount.set(p.usedThisMonth > 0 ? p.usedThisMonth : '');
    this.payDate.set(this.todayIso());
    this.payOpen.set(true);
  }

  async confirmPay() {
    const card = this.payCard();
    const amount = parseMonetaryAmount(this.payAmount());
    if (!card || !(amount > 0)) return;
    this.paySubmitting.set(true);
    try {
      // O campo de data já está no formato da API (AAAA-MM-DD)
      await this.service.payInvoice(card.id, amount, this.payDate(), this.month.monthIso());
      this.payOpen.set(false);
      this.toast.success('Pagamento registrado');
      this.reload(this.month.monthIso());
    } catch {
      this.toast.error('Não foi possível registrar o pagamento');
    } finally { this.paySubmitting.set(false); }
  }

  async archive(p: PaymentMethod) {
    const ok = await this.confirm.ask({
      title: 'Arquivar forma?',
      message: `“${p.name}” some das listas, mas o histórico é mantido.`,
      confirmLabel: 'Arquivar', danger: true,
    });
    if (!ok) return;
    await this.service.archive(p.id);
    this.toast.success('Forma arquivada');
    this.reload(this.month.monthIso());
  }
}
