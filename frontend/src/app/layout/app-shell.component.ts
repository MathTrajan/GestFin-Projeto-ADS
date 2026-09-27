import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule, LayoutDashboard, ChevronLeft, ChevronRight, LogOut, Receipt, Tags, CreditCard, Moon, Sun, Pencil, Check } from 'lucide-angular';
import { AuthService } from '../core/auth.service';
import { MonthService } from '../core/month.service';
import { BundleService } from '../core/bundle.service';
import { PresenceService } from '../core/presence.service';
import { ThemeService } from '../core/theme.service';
import { ToastService } from '../core/toast.service';
import { formatMonth, formatMonthShort } from '../shared/format';
import { USER_ICON_KEYS, userIconFor } from '../shared/icons';
import { AVATAR_COLORS } from '../shared/colors';
import { UserAvatarComponent } from '../shared/ui/user-avatar.component';
import { ModalComponent } from '../shared/ui/modal.component';
import { APP_VERSION, BUILD_SHA } from '../shared/version';

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, RouterLink, RouterLinkActive, UserAvatarComponent, ModalComponent],
  template: `
    <div class="min-h-dvh bg-bg text-ink flex flex-col">
      <!-- Barra superior escura: identidade, navegação e controles do mês.
           Ocupa a largura toda; não há barra lateral em nenhum tamanho de tela. -->
      <header class="topbar sticky top-0 z-30"
              style="padding-top:env(safe-area-inset-top); padding-left:env(safe-area-inset-left); padding-right:env(safe-area-inset-right)">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <!-- Marca -->
          <a routerLink="/dashboard" class="flex items-center gap-2.5 shrink-0" aria-label="GestFin — início">
            <svg viewBox="0 0 32 32" class="w-7 h-7 rounded" aria-hidden="true">
              <rect width="32" height="32" rx="5" fill="#1E3A8A"/>
              <rect x="7"  y="17" width="4" height="8"  rx="1" fill="#93C5FD"/>
              <rect x="14" y="12" width="4" height="13" rx="1" fill="#BFDBFE"/>
              <rect x="21" y="7"  width="4" height="18" rx="1" fill="#FFFFFF"/>
            </svg>
            <div class="leading-none hidden sm:block">
              <div class="font-display font-bold text-[15px] tracking-tight text-white">GestFin</div>
              <div class="text-[9.5px] uppercase tracking-[0.12em] text-slate-400 mt-0.5">Gestão Financeira</div>
            </div>
          </a>

          <div class="h-6 w-px bg-slate-700 hidden lg:block"></div>

          <!-- Navegação principal (visível a partir de lg; abaixo disso vai para a barra inferior) -->
          <nav class="hidden lg:flex items-center gap-1">
            @for (item of navItems; track item.path) {
              <a [routerLink]="item.path" routerLinkActive="ativo" class="topbar-link">
                <lucide-icon [img]="item.icon" [size]="16"></lucide-icon> {{ item.label }}
              </a>
            }
          </nav>

          <div class="ml-auto flex items-center gap-2 shrink-0">
            <!-- Quem está por aqui -->
            <div class="hidden md:flex items-center gap-1 pr-1">
              @for (u of presence.users(); track u.id) {
                <app-user-avatar [color]="u.avatarColor" [name]="u.name" [initial]="u.avatarInitial"
                                 [icon]="u.avatarIcon" [size]="26" [online]="u.online" shape="squircle"
                                 dotBorder="var(--topbar)"
                                 [attr.title]="u.online ? u.name + ' · online' : u.name + ' · ' + lastSeenLabel(u.lastSeenAt)"></app-user-avatar>
              }
            </div>

            <!-- Seletor de mês -->
            <div class="flex items-center rounded-md border border-slate-700 overflow-hidden">
              <button (click)="month.prev()" aria-label="Mês anterior"
                      class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors">
                <lucide-icon [img]="ChevronLeft" [size]="16"></lucide-icon>
              </button>
              <div class="px-2 sm:px-3 text-center min-w-[80px] sm:min-w-[120px] border-x border-slate-700">
                <span class="font-display text-[12.5px] font-semibold first-letter:uppercase text-slate-100 tabular">
                  <span class="sm:hidden">{{ shortLabel() }}</span><span class="hidden sm:inline">{{ label() }}</span>
                </span>
              </div>
              <button (click)="month.next()" aria-label="Próximo mês"
                      class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors">
                <lucide-icon [img]="ChevronRight" [size]="16"></lucide-icon>
              </button>
            </div>

            <button (click)="theme.toggle()" title="Alternar tema" class="topbar-control w-8 h-8">
              <lucide-icon [img]="theme.theme() === 'dark' ? Sun : Moon" [size]="15"></lucide-icon>
            </button>

            @if (auth.user(); as me) {
              <button (click)="openIconModal()" class="topbar-control h-8 pl-1 pr-2 gap-2" title="Meu perfil">
                <app-user-avatar [color]="me.avatarColor" [name]="me.name" [initial]="me.avatarInitial"
                                 [icon]="me.avatarIcon" [size]="22" shape="squircle"></app-user-avatar>
                <span class="hidden xl:inline text-[12.5px] font-semibold">{{ firstName }}</span>
              </button>
              <button (click)="logout()" title="Sair"
                      class="topbar-control w-8 h-8 hover:!bg-red-500/20 hover:!text-red-300">
                <lucide-icon [img]="LogOut" [size]="15"></lucide-icon>
              </button>
            }
          </div>
        </div>
      </header>

      <!-- Faixa de contexto: saudação à esquerda, versão à direita -->
      <div class="border-b border-line bg-surface">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3">
          <span class="text-[12.5px] text-inkMuted">{{ greeting }},</span>
          <span class="font-display text-[13.5px] font-bold tracking-tight">{{ firstName }}</span>
          <span class="ml-auto text-[10.5px] text-inkFaint tabular select-none">v{{ version }}@if (sha !== 'local') { · {{ sha }} }</span>
        </div>
      </div>

      <!-- swipe horizontal em área livre troca o mês (só faz sentido no touch; no desktop não dispara) -->
      <main class="flex-1 px-4 sm:px-6 pt-5 pb-24 lg:pb-8 max-w-[1400px] w-full mx-auto"
            (touchstart)="onSwipeStart($event)" (touchend)="onSwipeEnd($event)">
        <ng-content></ng-content>
      </main>

      <!-- Navegação inferior (abaixo de lg, onde a barra do topo não comporta os itens) -->
      <nav class="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-lineStrong"
           style="padding-bottom:env(safe-area-inset-bottom); padding-left:env(safe-area-inset-left); padding-right:env(safe-area-inset-right)">
        <div class="flex items-stretch justify-around">
          @for (item of navItems; track item.path) {
            <a [routerLink]="item.path" routerLinkActive #rlam="routerLinkActive"
               class="flex flex-col items-center gap-1 flex-1 py-2 text-[10.5px] font-semibold border-t-2 transition-colors"
               [class.text-inkMuted]="!rlam.isActive"
               [class.border-transparent]="!rlam.isActive"
               [class.text-brand]="rlam.isActive"
               [class.border-brand]="rlam.isActive">
              <lucide-icon [img]="item.icon" [size]="19"></lucide-icon>
              {{ item.label }}
            </a>
          }
        </div>
      </nav>
    </div>

    @if (iconModalOpen()) {
      <app-modal tag="Perfil" title="Seu perfil" (close)="iconModalOpen.set(false)">
        @if (auth.user(); as me) {
          <div class="flex items-center gap-4">
            <app-user-avatar [color]="colorDraft() ?? me.avatarColor" [name]="me.name" [initial]="me.avatarInitial"
                             [icon]="iconDraft()" [size]="52" shape="squircle"></app-user-avatar>
            <div class="min-w-0">
              <div class="font-display text-[15px] font-bold truncate">{{ me.name }}</div>
              <div class="text-[12.5px] text-inkMuted">É assim que você aparece no sistema.</div>
            </div>
          </div>
          <div>
            <div class="label">Ícone</div>
            <div class="grid grid-cols-5 sm:grid-cols-6 gap-2">
              <button type="button" (click)="iconDraft.set(null)" title="Usar minha inicial"
                class="aspect-square rounded-md flex items-center justify-center border font-display font-bold text-[16px] transition-all"
                [style.background]="iconDraft() === null ? 'var(--brand-tint)' : 'var(--surface-2)'"
                [style.color]="iconDraft() === null ? 'var(--brand)' : 'var(--ink-muted)'"
                [style.borderColor]="iconDraft() === null ? 'var(--brand)' : 'var(--line-strong)'">
                {{ me.avatarInitial }}
              </button>
              @for (k of userIconKeys; track k) {
                <button type="button" (click)="iconDraft.set(k)"
                  class="aspect-square rounded-md flex items-center justify-center border transition-all"
                  [style.background]="iconDraft() === k ? 'var(--brand-tint)' : 'var(--surface-2)'"
                  [style.color]="iconDraft() === k ? 'var(--brand)' : 'var(--ink-muted)'"
                  [style.borderColor]="iconDraft() === k ? 'var(--brand)' : 'var(--line-strong)'">
                  <lucide-icon [img]="userIcon(k)" [size]="20"></lucide-icon>
                </button>
              }
            </div>
            <p class="text-[12px] text-inkMuted mt-2">A primeira opção usa a letra do seu nome, como era antes.</p>
          </div>
          <div>
            <div class="label">Cor</div>
            <div class="flex flex-wrap gap-2">
              @for (c of avatarColors; track c) {
                <button type="button" (click)="colorDraft.set(c)" [attr.aria-label]="'Cor ' + c"
                  class="w-9 h-9 rounded-md border-2 transition-transform"
                  [style.background]="c"
                  [style.borderColor]="colorDraft() === c ? 'var(--ink)' : 'transparent'"></button>
              }
            </div>
          </div>

          <!-- Código de acesso da casa (RF04). Age na hora, sem depender do Salvar. -->
          <div class="pt-4 border-t border-line">
            <div class="label">Código de acesso</div>
            <p class="text-[12.5px] text-inkMuted mb-3">
              O código é da casa toda e vale para todos os perfis. Quem abrir o sistema precisa
              dele antes de escolher o perfil.
            </p>
            <div class="flex items-center gap-2">
              <input type="password" inputmode="numeric" maxlength="8" placeholder="4 a 8 dígitos"
                     class="input tabular flex-1"
                     [value]="novoCodigo()"
                     (input)="onCodigoDigitado($event)" />
              <button (click)="salvarCodigo()" [disabled]="!codigoValido() || salvandoCodigo()"
                      class="btn-brand shrink-0 disabled:opacity-40">
                {{ salvandoCodigo() ? 'Salvando…' : 'Definir' }}
              </button>
            </div>
            <p class="text-[12px] text-inkMuted mt-2">
              Ao trocar o código, os outros aparelhos vão pedir o novo na próxima vez.
            </p>
          </div>
        }
        <div modal-footer>
          <button (click)="iconModalOpen.set(false)" class="btn-ghost">Cancelar</button>
          <button (click)="saveIcon()" [disabled]="savingIcon()" class="btn-brand flex items-center gap-2 disabled:opacity-40">
            <lucide-icon [img]="Check" [size]="16"></lucide-icon> {{ savingIcon() ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      </app-modal>
    }
  `,
})
export class AppShellComponent {
  readonly ChevronLeft = ChevronLeft;
  readonly ChevronRight = ChevronRight;
  readonly LogOut = LogOut;
  readonly Moon = Moon;
  readonly Sun = Sun;
  readonly Pencil = Pencil;
  readonly Check = Check;
  theme = inject(ThemeService);
  readonly version = APP_VERSION;
  readonly sha = BUILD_SHA;
  readonly navItems = [
    { path: '/dashboard', label: 'Início', icon: LayoutDashboard },
    { path: '/lancamentos', label: 'Lançamentos', icon: Receipt },
    { path: '/categorias', label: 'Categorias', icon: Tags },
    { path: '/cartoes', label: 'Cartões', icon: CreditCard },
  ];
  readonly userIconKeys = USER_ICON_KEYS;
  readonly avatarColors = AVATAR_COLORS;
  auth = inject(AuthService);
  month = inject(MonthService);
  presence = inject(PresenceService);
  private bundle = inject(BundleService);
  private toast = inject(ToastService);
  private router = inject(Router);

  firstName = '';
  greeting = this.computeGreeting();
  iconModalOpen = signal(false);
  iconDraft = signal<string | null>(null);
  colorDraft = signal<string | null>(null); // null = mantém a cor atual
  savingIcon = signal(false);
  // Código de acesso da casa (RF04)
  novoCodigo = signal('');
  salvandoCodigo = signal(false);
  private swipeX = 0;
  private swipeY = 0;
  private swipeAt = 0;
  private swipeOk = false;

  constructor() {
    const u = this.auth.user();
    this.firstName = u ? u.name.split(' ')[0] : '';
    // pré-carrega a janela de 13 meses ao redor do mês atual e a cada troca de mês
    // (idempotente; só busca quando o mês sai da janela já carregada)
    this.bundle.ensureAround(this.month.monthIso());
    this.month.changes$.pipe(takeUntilDestroyed()).subscribe(() => this.bundle.ensureAround(this.month.monthIso()));
    // quem está online na barra superior (poller único; idempotente entre instâncias do shell)
    this.presence.ensurePolling();
  }

  // ---- swipe horizontal pra trocar o mês (mobile) ----
  onSwipeStart(e: TouchEvent) {
    const t = e.touches[0];
    this.swipeX = t.clientX;
    this.swipeY = t.clientY;
    this.swipeAt = Date.now();
    // ignora gesto iniciado em área com rolagem/gesto próprio (tabelas, gráfico, campos) ou em overlay fixo (modais)
    const el = e.target as HTMLElement;
    this.swipeOk = !el.closest('.overflow-x-auto, canvas, input, textarea, select, .fixed');
  }
  onSwipeEnd(e: TouchEvent) {
    if (!this.swipeOk) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this.swipeX;
    const dy = t.clientY - this.swipeY;
    if (Date.now() - this.swipeAt > 600) return; // lento demais = rolagem/seleção
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return; // curto ou mais vertical que horizontal
    if (dx < 0) this.month.next();
    else this.month.prev();
  }

  firstNameOf(name: string) {
    return name.split(' ')[0];
  }

  userIcon(k: string) {
    return userIconFor(k);
  }

  openIconModal() {
    const me = this.auth.user();
    this.iconDraft.set(me?.avatarIcon ?? null);
    // pré-seleciona a cor atual se ela já for da paleta; cor legada (pastel) fica sem seleção
    this.colorDraft.set(me && AVATAR_COLORS.includes(me.avatarColor) ? me.avatarColor : null);
    this.novoCodigo.set('');
    this.iconModalOpen.set(true);
  }

  // Só dígitos, de 4 a 8, que é o formato aceito pela API
  onCodigoDigitado(evento: Event) {
    const alvo = evento.target as HTMLInputElement;
    const apenasDigitos = alvo.value.replace(/\D/g, '').slice(0, 8);
    alvo.value = apenasDigitos;
    this.novoCodigo.set(apenasDigitos);
  }

  codigoValido() {
    const codigo = this.novoCodigo();
    return codigo.length >= 4 && codigo.length <= 8;
  }

  async salvarCodigo() {
    if (!this.codigoValido()) return;
    this.salvandoCodigo.set(true);
    try {
      await this.auth.definirCodigoDeAcesso(this.novoCodigo());
      this.novoCodigo.set('');
      this.toast.success('Código de acesso atualizado!');
    } catch {
      this.toast.error('Não deu para salvar o código. Tenta de novo?');
    } finally {
      this.salvandoCodigo.set(false);
    }
  }

  async saveIcon() {
    this.savingIcon.set(true);
    try {
      await this.auth.updateAvatar(this.iconDraft(), this.colorDraft() ?? undefined);
      this.presence.refreshNow(); // reflete na lista de presença sem esperar o poll
      this.iconModalOpen.set(false);
      this.toast.success('Avatar atualizado!');
    } catch {
      this.toast.error('Não deu pra salvar o avatar. Tenta de novo?');
    } finally {
      this.savingIcon.set(false);
    }
  }

  // "visto há X" relativo — recalculado a cada poll da presença (30s), precisão suficiente
  lastSeenLabel(iso: string | null) {
    if (!iso) return 'offline';
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (min < 1) return 'visto agora há pouco';
    if (min < 60) return `visto há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `visto há ${h} h`;
    return `visto há ${Math.floor(h / 24)} d`;
  }

  label() {
    return formatMonth(this.month.month());
  }

  shortLabel() {
    return formatMonthShort(this.month.month());
  }

  private computeGreeting(): string {
    const h = new Date().getHours();
    if (h < 6) return 'Boa madrugada';
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/']);
  }
}
