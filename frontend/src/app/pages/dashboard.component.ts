import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Pencil, Check } from 'lucide-angular';
import { AppShellComponent } from '../layout/app-shell.component';
import { EvolutionChartComponent } from '../charts/evolution-chart.component';
import { InstallmentOutlookChartComponent } from '../charts/installment-outlook-chart.component';
import { ModalComponent } from '../shared/ui/modal.component';
import { MonthService } from '../core/month.service';
import { DashboardService, DashboardData } from '../core/dashboard.service';
import { TransactionsService } from '../core/transactions.service';
import { ToastService } from '../core/toast.service';
import { formatBRL, addMonths, startOfMonth, toApiDate } from '../shared/format';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { reloadOnReenter } from '../core/reload-on-reenter';
import { swrLoad } from '../core/cache';

type InstallmentItem = NonNullable<DashboardData['installmentItems']>[number];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppShellComponent, EvolutionChartComponent, InstallmentOutlookChartComponent, ModalComponent, RouterLink, FormsModule, LucideAngularModule],
  template: `
    <app-shell>
      <div class="space-y-4 sm:space-y-6">
        <!-- TOPO — saldo em destaque, com a composição do mês dentro do próprio
             cartão: o espaço que sobrava embaixo virou informação. -->
        <section class="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-stretch">
          <div class="card-hero p-5 sm:p-7 flex flex-col">
            <div class="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div class="rotulo !text-blue-300/80">Saldo do mês</div>
                <div class="font-display tabular text-white text-[clamp(30px,6vw,50px)] font-bold tracking-[-0.03em] leading-none mt-2">
                  {{ loading() ? '—' : brl(data()?.summary?.balance ?? 0) }}
                </div>
              </div>
              @if (!loading() && (data()?.summary?.income ?? 0) > 0) {
                <div class="text-right shrink-0">
                  <div class="rotulo !text-blue-300/80">Poupança</div>
                  <div class="font-display tabular text-white text-2xl font-bold leading-none mt-2">{{ pct(data()!.summary.savingsRate) }}</div>
                </div>
              }
            </div>

            <!-- Saldo dos últimos meses: a tendência que o número sozinho não conta -->
            @if (saldoSparkline(); as sp) {
              <div class="relative z-10 mt-6">
                <div class="rotulo !text-blue-300/60 mb-2">Saldo · últimos 6 meses</div>
                <svg [attr.viewBox]="'0 0 ' + sp.largura + ' ' + sp.altura" preserveAspectRatio="none"
                     class="w-full h-[46px] overflow-visible" aria-hidden="true">
                  <defs>
                    <linearGradient id="spFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stop-color="#60A5FA" stop-opacity="0.38"/>
                      <stop offset="1" stop-color="#60A5FA" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                  <line x1="0" [attr.y1]="sp.zero" [attr.x2]="sp.largura" [attr.y2]="sp.zero"
                        stroke="rgba(148,163,184,0.35)" stroke-width="1" stroke-dasharray="3 3"
                        vector-effect="non-scaling-stroke"/>
                  <path [attr.d]="sp.area" fill="url(#spFill)"/>
                  <path [attr.d]="sp.linha" fill="none" stroke="#93C5FD" stroke-width="2"
                        stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                  <circle [attr.cx]="sp.ultimoX" [attr.cy]="sp.ultimoY" r="3.5" fill="#FFFFFF"/>
                </svg>
              </div>
            }

            <!-- Proporção entradas × saídas: uma leitura do mês sem precisar comparar números -->
            @if (!loading() && (data()?.summary?.income ?? 0) > 0) {
              <div class="relative z-10 mt-auto pt-6">
                <div class="flex h-2 rounded-sm overflow-hidden bg-white/10">
                  <div class="h-full transition-all duration-500" [style.width.%]="mixSaida()" style="background:#F87171"></div>
                  <div class="h-full transition-all duration-500" [style.width.%]="mixInvestido()" style="background:#38BDF8"></div>
                  <div class="h-full flex-1 transition-all duration-500" style="background:#4ADE80"></div>
                </div>
                <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 text-[11.5px] text-slate-300">
                  <span class="inline-flex items-center gap-1.5"><i class="w-2 h-2 rounded-sm" style="background:#F87171"></i>Saiu {{ brl(data()!.summary.expense) }}</span>
                  <span class="inline-flex items-center gap-1.5"><i class="w-2 h-2 rounded-sm" style="background:#38BDF8"></i>Investido {{ brl(data()!.summary.investment) }}</span>
                  <span class="inline-flex items-center gap-1.5"><i class="w-2 h-2 rounded-sm" style="background:#4ADE80"></i>Sobrou {{ brl(data()!.summary.balance) }}</span>
                  <span class="ml-auto text-slate-400">de {{ brl(data()!.summary.income) }} que entraram</span>
                </div>
              </div>
            }
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4 sm:gap-5">
            <div class="card kpi p-4 lift" style="--kpi-cor:var(--pos)">
              <div class="flex items-center justify-between gap-2">
                <div class="rotulo">Entradas</div>
                @if (trendIncome(); as t) { <span class="text-[10.5px] font-bold px-1.5 py-0.5 rounded-sm" [style.color]="t.color" [style.background]="t.tint">{{ t.label }}</span> }
              </div>
              <div class="font-display tabular text-[21px] font-bold mt-1.5" style="color:var(--pos)">{{ brl(data()?.summary?.income ?? 0) }}</div>
            </div>
            <div class="card kpi p-4 lift" style="--kpi-cor:var(--neg)">
              <div class="flex items-center justify-between gap-2">
                <div class="rotulo">Saídas</div>
                @if (trendExpense(); as t) { <span class="text-[10.5px] font-bold px-1.5 py-0.5 rounded-sm" [style.color]="t.color" [style.background]="t.tint">{{ t.label }}</span> }
              </div>
              <div class="font-display tabular text-[21px] font-bold mt-1.5" style="color:var(--neg)">{{ brl(data()?.summary?.expense ?? 0) }}</div>
            </div>
            <div class="card kpi p-4 lift" style="--kpi-cor:var(--invest)">
              <div class="flex items-center justify-between gap-2">
                <div class="rotulo">Investido</div>
                @if (trendInvestment(); as t) { <span class="text-[10.5px] font-bold px-1.5 py-0.5 rounded-sm" [style.color]="t.color" [style.background]="t.tint">{{ t.label }}</span> }
              </div>
              <div class="font-display tabular text-[21px] font-bold mt-1.5" style="color:var(--invest)">{{ brl(data()?.summary?.investment ?? 0) }}</div>
            </div>
          </div>
        </section>

        <!-- A PAGAR / PAGO (contas avulsas + faturas de cartão, como no filtro "A pagar") -->
        <section class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          <a routerLink="/lancamentos" class="card kpi p-4 block lift" style="--kpi-cor:var(--gold)">
            <div class="rotulo">A pagar no mês</div>
            <div class="font-display tabular text-[21px] font-bold mt-1.5" style="color:var(--gold)">{{ brl(data()?.summary?.toPay ?? 0) }}</div>
            <div class="text-[11.5px] text-inkMuted mt-1">contas pendentes + faturas em aberto</div>
          </a>
          <div class="card kpi p-4" style="--kpi-cor:var(--pos)">
            <div class="rotulo">Pago no mês</div>
            <div class="font-display tabular text-[21px] font-bold mt-1.5" style="color:var(--pos)">{{ brl(data()?.summary?.paidOut ?? 0) }}</div>
            <div class="text-[11.5px] text-inkMuted mt-1">contas pagas + faturas quitadas</div>
          </div>
        </section>

        <!-- PARCELAMENTOS — a lista do mês exibido + quanto já está comprometido nos próximos.
             Sempre visível: o estado vazio explica o que entra aqui (só compras em Nx). -->
        <section class="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
            <div class="card p-5 sm:p-6 lg:col-span-3">
              <div class="bloco-titulo">
                <h2 class="font-display">Parcelamentos do mês</h2>
                <div class="text-right shrink-0">
                  <span class="font-display tabular text-[15px] font-bold" style="color:var(--invest)">{{ brl(data()?.summary?.installments ?? 0) }}</span>
                  <span class="text-[11.5px] text-inkMuted ml-1.5">em {{ installmentItems().length }} {{ installmentItems().length === 1 ? 'parcela' : 'parcelas' }}</span>
                </div>
              </div>
              @if (installmentItems().length === 0) {
                <div class="text-[13.5px] text-inkMuted py-8 text-center max-w-md mx-auto">
                  Nenhuma parcela cai neste mês.
                  <div class="text-[12px] text-inkFaint mt-2">Aparecem aqui as compras lançadas como <b>parceladas em Nx</b> — com a numeração real (ex.: 13/48). Recorrências (contas que repetem todo mês) não entram.</div>
                </div>
              } @else {
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-10">
                  @for (p of visibleInstallments(); track p.description + p.amount) {
                    <div class="flex items-center gap-2.5 py-1.5 border-b border-line last:border-0">
                      <span class="grid place-items-center h-6 min-w-[42px] px-1.5 rounded-sm text-[10.5px] font-bold tabular shrink-0"
                            [style.color]="p.color || 'var(--ink-muted)'" [style.background]="(p.color || '#888') + '1f'">
                        {{ p.number && p.of ? p.number + '/' + p.of : '—' }}
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="text-[13px] font-semibold truncate leading-tight">{{ p.description }}</div>
                        <div class="text-[11px] text-inkMuted truncate leading-tight">{{ p.method || 'cartão' }}</div>
                      </div>
                      <span class="font-display tabular text-[13px] font-bold shrink-0">{{ brl(p.amount) }}</span>
                      @if (p.planId) {
                        <button (click)="openRenumber(p)" title="Corrigir numeração"
                                class="w-7 h-7 rounded-full flex items-center justify-center text-inkMuted hover:bg-bg2 hover:text-ink shrink-0">
                          <lucide-icon [img]="Pencil" [size]="13"></lucide-icon>
                        </button>
                      }
                    </div>
                  }
                </div>
                @if (hiddenInstallments().count > 0) {
                  <button (click)="showAllInstallments.set(!showAllInstallments())"
                          class="mt-3 w-full py-2 rounded-md bg-bg2 text-[12.5px] font-bold text-inkSoft hover:text-ink transition-colors">
                    @if (showAllInstallments()) {
                      Mostrar menos
                    } @else {
                      Mostrar mais {{ hiddenInstallments().count }} {{ hiddenInstallments().count === 1 ? 'parcela' : 'parcelas' }} · {{ brl(hiddenInstallments().total) }}
                    }
                  </button>
                }
              }
            </div>
            <div class="card p-5 sm:p-6 lg:col-span-2">
              <div class="bloco-titulo">
                <h2 class="font-display">Parcelas nos próximos meses</h2>
                <span class="text-[11px] text-inkFaint shrink-0">6 meses</span>
              </div>
              @if (hasOutlook()) {
                <app-installment-outlook-chart [data]="outlook()"></app-installment-outlook-chart>
              } @else {
                <div class="text-[13.5px] text-inkMuted py-10 text-center">Nada comprometido nos próximos 6 meses.</div>
              }
            </div>
          </section>

        <!-- GASTOS POR CATEGORIA (barras ranqueadas) + FORMAS (barra segmentada) -->
        <section class="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
          <div class="card p-5 sm:p-6 lg:col-span-3">
            <div class="bloco-titulo">
              <h2 class="font-display">Gastos por categoria</h2>
              @if (overBudget() > 0) {
                <span class="text-[11px] font-bold px-2 py-1 rounded-sm shrink-0" style="color:var(--neg);background:var(--neg-tint)">
                  {{ overBudget() }} acima do teto
                </span>
              }
            </div>
            @if (expenseCats().length === 0) {
              <div class="text-[13.5px] text-inkMuted py-10 text-center">Sem despesas neste mês.</div>
            } @else {
              <div class="space-y-3.5">
                @for (c of visibleCats(); track c.id) {
                  <div>
                    <div class="flex items-center gap-3 mb-1.5">
                      <div class="flex items-center gap-2.5 min-w-0 flex-1">
                        <span class="w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-1" [style.background]="c.color" [style.--tw-ring-color]="c.tint"></span>
                        <span class="text-[13.5px] sm:text-[14px] font-semibold truncate">{{ c.name }}</span>
                        <!-- alerta de orçamento: âmbar chegando no teto (≥75%), vermelho estourado -->
                        @if (c.budgetPct !== null && c.budgetPct >= 75) {
                          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                                [style.color]="c.over ? 'var(--neg)' : 'var(--gold)'"
                                [style.background]="c.over ? 'var(--neg-tint)' : 'rgba(224,164,59,0.15)'">
                            {{ c.budgetPct }}% do teto
                          </span>
                        }
                      </div>
                      <!-- colunas fixas: valores e % alinham verticalmente em todas as linhas -->
                      <span class="font-display tabular text-[13.5px] sm:text-[14px] font-extrabold w-[92px] text-right shrink-0">{{ brl(c.total) }}</span>
                      <span class="text-[11.5px] font-semibold text-inkMuted tabular w-9 text-right shrink-0">{{ c.pct }}%</span>
                    </div>
                    <div class="barra">
                      <span [style.width.%]="c.bar" [style.background]="c.color"></span>
                    </div>
                  </div>
                }
              </div>
              @if (hiddenCats().count > 0) {
                <button (click)="showAllCats.set(!showAllCats())"
                        class="mt-4 w-full py-2 rounded-md bg-bg2 text-[12.5px] font-bold text-inkSoft hover:text-ink transition-colors">
                  @if (showAllCats()) {
                    Mostrar menos
                  } @else {
                    Mostrar mais {{ hiddenCats().count }} {{ hiddenCats().count === 1 ? 'categoria' : 'categorias' }} · {{ brl(hiddenCats().total) }}
                  }
                </button>
              }
            }
          </div>

          <div class="card p-5 sm:p-6 lg:col-span-2">
            <div class="bloco-titulo"><h2 class="font-display">Formas de pagamento</h2></div>
            @if (pays().length === 0) {
              <div class="text-[13.5px] text-inkMuted py-10 text-center">Sem despesas neste mês.</div>
            } @else {
              <!-- barra segmentada (proporção de cada forma) -->
              <div class="flex h-3 rounded-sm overflow-hidden gap-0.5 mb-5">
                @for (p of pays(); track p.name) {
                  <div class="h-full" [style.width.%]="p.pct" [style.background]="p.color" [title]="p.name + ' · ' + p.pct + '%'"></div>
                }
              </div>
              <div class="space-y-3">
                @for (p of pays(); track p.name) {
                  <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2.5 min-w-0 flex-1">
                      <span class="w-3 h-3 rounded-md shrink-0" [style.background]="p.color"></span>
                      <span class="text-[13.5px] font-medium truncate">{{ p.name }}</span>
                    </div>
                    <!-- mesmas colunas do card de categorias: tudo alinha entre os dois -->
                    <span class="font-display tabular text-[13.5px] font-bold w-[92px] text-right shrink-0">{{ brl(p.total) }}</span>
                    <span class="text-[11.5px] font-semibold text-inkMuted tabular w-9 text-right shrink-0">{{ p.pct }}%</span>
                  </div>
                }
              </div>
            }
          </div>
        </section>

        <!-- TOP GASTOS + EVOLUÇÃO -->
        <section class="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
          <div class="card p-5 sm:p-6 lg:col-span-2">
            <div class="bloco-titulo"><h2 class="font-display">Top gastos do mês</h2></div>
            @if ((data()?.topExpenses?.length ?? 0) === 0) {
              <div class="text-[13.5px] text-inkMuted py-8 text-center">Sem despesas neste mês.</div>
            } @else {
              <ul class="space-y-3.5">
                @for (t of data()?.topExpenses ?? []; track t.description + t.date; let i = $index) {
                  <li class="flex items-center gap-3">
                    <span class="grid place-items-center w-7 h-7 rounded-full text-[12px] font-bold shrink-0 tabular" [style.color]="t.color" [style.background]="t.color + '1f'">{{ i + 1 }}</span>
                    <div class="min-w-0 flex-1">
                      <div class="text-[13.5px] font-semibold truncate">{{ t.description }}</div>
                      <div class="text-[11.5px] text-inkMuted truncate">{{ t.category }}</div>
                    </div>
                    <span class="font-display tabular text-[13.5px] font-bold shrink-0">{{ brl(t.amount) }}</span>
                  </li>
                }
              </ul>
            }
          </div>
          <div class="card p-5 sm:p-6 lg:col-span-3">
            <div class="bloco-titulo"><h2 class="font-display">Evolução · últimos 6 meses</h2></div>
            <app-evolution-chart [data]="data()?.evolution ?? []"></app-evolution-chart>
          </div>
        </section>
      </div>

      <!-- corrigir numeração de um parcelamento ("está 2/48, quero 1/40") -->
      @if (renumberItem(); as item) {
        <app-modal tag="Parcelamento" title="Corrigir numeração" (close)="renumberItem.set(null)">
          <div>
            <div class="text-[14px] font-bold">{{ baseName(item.description) }}</div>
            <div class="text-[12.5px] text-inkMuted mt-0.5">{{ item.method || 'cartão' }} · {{ brl(item.amount) }}/parcela · hoje marcada como {{ item.number }}/{{ item.of }}</div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[11px] font-bold uppercase tracking-wider text-inkMuted">A parcela deste mês é a nº</label>
              <input type="number" min="1" max="60" class="input tabular mt-1.5" [ngModel]="numDraft()" (ngModelChange)="numDraft.set($event)" />
            </div>
            <div>
              <label class="text-[11px] font-bold uppercase tracking-wider text-inkMuted">De um total de</label>
              <input type="number" min="1" max="60" class="input tabular mt-1.5" [ngModel]="totalDraft()" (ngModelChange)="totalDraft.set($event)" />
            </div>
          </div>
          <p class="text-[12px] text-inkMuted">
            Todas as parcelas são renumeradas em sequência a partir deste mês. Parcelas futuras que passarem do novo total são removidas; se faltar até o total, são criadas. Nenhum valor muda.
          </p>
          <div modal-footer>
            <button (click)="renumberItem.set(null)" class="btn-ghost">Cancelar</button>
            <button (click)="saveRenumber()" [disabled]="savingRenumber() || !renumberValid()" class="btn-brand flex items-center gap-2 disabled:opacity-40">
              <lucide-icon [img]="Check" [size]="16"></lucide-icon> {{ savingRenumber() ? 'Salvando…' : 'Salvar' }}
            </button>
          </div>
        </app-modal>
      }
    </app-shell>
  `,
})
export class DashboardComponent implements OnInit {
  readonly Pencil = Pencil;
  readonly Check = Check;
  data = signal<DashboardData | null>(null);
  loading = signal(true);
  // renumeração de parcelamento (modal)
  renumberItem = signal<InstallmentItem | null>(null);
  numDraft = signal(1);
  totalDraft = signal(1);
  savingRenumber = signal(false);
  // categorias que estouraram o orçamento do mês
  overBudget = computed(() => (this.data()?.byCategory ?? []).filter((c) => c.budget != null && c.total > (c.budget as number)).length);

  // Composição do que entrou, para a barra do cartão de saldo: saiu, investido e
  // o que sobrou. As duas primeiras fatias têm largura calculada; a terceira ocupa
  // o resto, o que garante a barra sempre fechando em 100% mesmo com arredondamento.
  // Limitadas a 100 no conjunto: num mês em que se gastou mais do que entrou, a
  // soma passaria de 100% e a fatia verde sumiria (é o comportamento certo).
  private mix(valor: number) {
    const entrou = this.data()?.summary?.income ?? 0;
    if (entrou <= 0) return 0;
    return Math.max(0, Math.min(100, (valor / entrou) * 100));
  }
  mixSaida = computed(() => this.mix(this.data()?.summary?.expense ?? 0));
  mixInvestido = computed(() => this.mix(this.data()?.summary?.investment ?? 0));

  // Miniatura do saldo dos últimos meses, desenhada à mão em SVG.
  // Não usa a biblioteca de gráficos de propósito: são poucos pontos sem eixo
  // nem interação, e carregar o ECharts aqui custaria mais do que o desenho.
  // A escala inclui o zero, senão um mês negativo apareceria acima de um positivo.
  saldoSparkline = computed(() => {
    const pontos = (this.data()?.evolution ?? []).map((e) => e.balance);
    if (pontos.length < 2) return null;

    const L = 240, A = 46;
    const maximo = Math.max(...pontos, 0);
    const minimo = Math.min(...pontos, 0);
    const amplitude = maximo - minimo || 1;

    const x = (i: number) => (i / (pontos.length - 1)) * L;
    const y = (v: number) => A - ((v - minimo) / amplitude) * A;

    const linha = pontos.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

    return {
      largura: L,
      altura: A,
      linha,
      area: `${linha} L${L},${A} L0,${A} Z`,
      zero: y(0).toFixed(1),
      ultimoX: x(pontos.length - 1).toFixed(1),
      ultimoY: y(pontos[pontos.length - 1]).toFixed(1),
    };
  });

  // categorias de despesa ranqueadas: pct do total + largura da barra (relativa ao maior) + tom claro
  expenseCats = computed(() => {
    const cats = (this.data()?.byCategory ?? []).filter((c) => c.total > 0).slice().sort((a, b) => b.total - a.total);
    const total = cats.reduce((s, c) => s + c.total, 0);
    const max = Math.max(1, ...cats.map((c) => c.total));
    return cats.map((c) => ({
      ...c,
      pct: total ? Math.round((c.total / total) * 100) : 0,
      bar: Math.max(4, Math.round((c.total / max) * 100)),
      tint: (c.color || '#888') + '26',
      over: c.budget != null && c.total > (c.budget as number),
      // % consumido do teto (null = categoria sem orçamento definido)
      budgetPct: c.budget != null && (c.budget as number) > 0 ? Math.round((c.total / (c.budget as number)) * 100) : null,
    }));
  });

  // parcelas do mês, uma a uma (a API já manda ordenado por valor desc)
  installmentItems = computed(() => this.data()?.installmentItems ?? []);
  // com muitas parcelas (jul/2026 tem 17), colapsa nas 6 maiores + toggle
  showAllInstallments = signal(false);
  visibleInstallments = computed(() =>
    this.showAllInstallments() ? this.installmentItems() : this.installmentItems().slice(0, 6));
  hiddenInstallments = computed(() => {
    const hidden = this.installmentItems().slice(6);
    return { count: hidden.length, total: hidden.reduce((s, p) => s + p.amount, 0) };
  });
  // comprometimento com parcelas: mês exibido + 5 seguintes
  outlook = computed(() => this.data()?.installmentOutlook ?? []);
  hasOutlook = computed(() => this.outlook().some((p) => p.total > 0));

  // categorias: colapsa nas 8 maiores (jul/2026 tem 12) + toggle
  showAllCats = signal(false);
  visibleCats = computed(() => (this.showAllCats() ? this.expenseCats() : this.expenseCats().slice(0, 8)));
  hiddenCats = computed(() => {
    const hidden = this.expenseCats().slice(8);
    return { count: hidden.length, total: hidden.reduce((s, c) => s + c.total, 0) };
  });

  // formas de pagamento com proporção (para a barra segmentada e a legenda)
  pays = computed(() => {
    const ps = (this.data()?.byPaymentKind ?? []).filter((p) => p.total > 0).slice().sort((a, b) => b.total - a.total);
    const total = ps.reduce((s, p) => s + p.total, 0);
    return ps.map((p) => ({ ...p, pct: total ? Math.round((p.total / total) * 100) : 0 }));
  });

  private month = inject(MonthService);
  private cdr = inject(ChangeDetectorRef);
  private dashboard = inject(DashboardService);
  private transactions = inject(TransactionsService);
  private toast = inject(ToastService);

  constructor() {
    // carga inicial: chamada direta (NÃO em effect — swrLoad escreve signals e dispararia NG0600)
    this.load(this.month.monthIso());
    reloadOnReenter('/dashboard', () => this.load(this.month.monthIso()));
    // troca de mes: RxJS puro garante o reload mesmo na view reusada (effect nao re-roda)
    this.month.changes$.pipe(takeUntilDestroyed()).subscribe(() => this.load(this.month.monthIso()));
  }
  ngOnInit() {}

  private load(iso: string) {
    this.showAllInstallments.set(false); // cada mês começa colapsado nas 6 maiores
    this.showAllCats.set(false);
    swrLoad(this.dashboard.cache, iso, (v) => this.data.set(v), (b) => this.loading.set(b), () => this.cdr.markForCheck())
      .then(() => this.prefetchNeighbors());
  }
  // Pre-busca mes anterior/proximo em background -> navegar com as setas vira instantaneo (vem do cache).
  private prefetchNeighbors() {
    const base = this.month.month();
    for (const delta of [-1, 1]) {
      const mes = toApiDate(startOfMonth(addMonths(base, delta)));
      if (!this.dashboard.cache.isFresh(mes)) this.dashboard.cache.refresh(mes).catch(() => {});
    }
  }

  brl(v: number) { return formatBRL(v); }
  pct(rate: number) { return Math.round(rate * 100) + '%'; }
  // "Financiamento do carro (14/48)" → sem o sufixo (o modal mostra a numeração à parte)
  baseName(desc: string) { return desc.replace(/\s*\(\d+\/\d+\)\s*$/, ''); }

  // ---- renumeração de parcelamento ----
  openRenumber(item: InstallmentItem) {
    this.numDraft.set(item.number ?? 1);
    this.totalDraft.set(item.of ?? 1);
    this.renumberItem.set(item);
  }

  renumberValid() {
    const n = Number(this.numDraft()), t = Number(this.totalDraft());
    return Number.isInteger(n) && Number.isInteger(t) && n >= 1 && t >= n && t <= 60;
  }

  async saveRenumber() {
    const item = this.renumberItem();
    if (!item?.planId || !this.renumberValid()) return;
    this.savingRenumber.set(true);
    try {
      await this.transactions.renumberPlan(item.planId, this.month.monthIso(), Number(this.numDraft()), Number(this.totalDraft()));
      this.renumberItem.set(null);
      this.toast.success(`Numeração corrigida: ${this.numDraft()}/${this.totalDraft()}`);
      this.load(this.month.monthIso());
    } catch (e: unknown) {
      const msg = (e as { error?: { message?: string } })?.error?.message;
      this.toast.error(msg || 'Não foi possível renumerar');
    } finally {
      this.savingRenumber.set(false);
    }
  }

  private trend(cur: number, prev: number, goodWhenUp: boolean) {
    if (!prev) return null;
    const diff = ((cur - prev) / Math.abs(prev)) * 100;
    if (Math.abs(diff) < 1) return null;
    const up = diff > 0;
    const good = up === goodWhenUp;
    return {
      label: (up ? '↑' : '↓') + ' ' + Math.abs(Math.round(diff)) + '%',
      color: good ? 'var(--pos)' : 'var(--neg)',
      tint: good ? 'rgba(15,166,120,0.12)' : 'rgba(238,91,71,0.12)',
    };
  }

  trendIncome() { const d = this.data(); return d ? this.trend(d.summary.income, d.previous.income, true) : null; }
  trendExpense() { const d = this.data(); return d ? this.trend(d.summary.expense, d.previous.expense, false) : null; }
  trendInvestment() { const d = this.data(); return d ? this.trend(d.summary.investment, d.previous.investment, true) : null; }
}
