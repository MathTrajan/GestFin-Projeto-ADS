import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule, ArrowRight, ShieldCheck, Wallet, TrendingUp, CreditCard } from 'lucide-angular';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { firstValueFrom } from 'rxjs';
import { UserAvatarComponent } from '../shared/ui/user-avatar.component';
import { APP_VERSION, BUILD_SHA } from '../shared/version';

interface Profile { id: string; name: string; avatarColor: string; avatarInitial: string; avatarIcon: string | null; }

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [LucideAngularModule, UserAvatarComponent],
  template: `
    <main class="min-h-dvh grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <!-- Painel de apresentação: azul-escuro chapado, com grade técnica de fundo -->
      <section class="relative hidden lg:flex flex-col justify-between p-12 xl:p-16 overflow-hidden card-hero rounded-none">
        <div class="relative z-10 fade-up">
          <div class="flex items-center gap-3">
            <svg viewBox="0 0 32 32" class="w-10 h-10 rounded" aria-hidden="true">
              <rect width="32" height="32" rx="5" fill="#1D4ED8"/>
              <rect x="7"  y="17" width="4" height="8"  rx="1" fill="#93C5FD"/>
              <rect x="14" y="12" width="4" height="13" rx="1" fill="#BFDBFE"/>
              <rect x="21" y="7"  width="4" height="18" rx="1" fill="#FFFFFF"/>
            </svg>
            <div>
              <div class="font-display font-bold text-xl tracking-tight text-white">GestFin</div>
              <div class="text-[10.5px] uppercase tracking-[0.14em] text-slate-400 mt-0.5">Gestão Financeira Residencial</div>
            </div>
          </div>
        </div>

        <div class="relative z-10 max-w-2xl">
          <h1 class="font-display text-white text-[clamp(30px,3.2vw,44px)] leading-[1.12] font-bold tracking-[-0.025em] fade-up" style="animation-delay: 80ms">
            Receitas, despesas e parcelas
            <br />
            <span class="text-blue-300">da casa toda, mês a mês.</span>
          </h1>
          <p class="mt-5 text-slate-300 text-[15px] leading-relaxed max-w-lg fade-up" style="animation-delay: 140ms">
            Cada lançamento entra uma vez e aparece no painel, na fatura do cartão e no
            comparativo do mês anterior. Sem planilha paralela.
          </p>

          <!-- Amostra do painel: mesmos indicadores da tela inicial -->
          <div class="mt-9 grid grid-cols-3 gap-3 max-w-xl fade-up" style="animation-delay: 200ms">
            <div class="border border-slate-700 bg-slate-900/50 rounded-lg p-4">
              <div class="text-[10px] uppercase tracking-[0.09em] text-slate-400 font-semibold">Receitas</div>
              <div class="font-display tabular text-white text-[19px] font-bold mt-1.5">8.400,00</div>
            </div>
            <div class="border border-slate-700 bg-slate-900/50 rounded-lg p-4">
              <div class="text-[10px] uppercase tracking-[0.09em] text-slate-400 font-semibold">Despesas</div>
              <div class="font-display tabular text-white text-[19px] font-bold mt-1.5">5.120,00</div>
            </div>
            <div class="border border-blue-500/40 bg-blue-500/10 rounded-lg p-4">
              <div class="text-[10px] uppercase tracking-[0.09em] text-blue-300 font-semibold">Saldo</div>
              <div class="font-display tabular text-white text-[19px] font-bold mt-1.5">3.280,00</div>
            </div>
          </div>

          <div class="mt-8 flex flex-wrap gap-x-7 gap-y-3 fade-up" style="animation-delay: 260ms">
            <span class="inline-flex items-center gap-2 text-slate-300 text-[13px]">
              <span class="text-blue-400"><lucide-icon [img]="Wallet" [size]="15"></lucide-icon></span>
              Saldo do mês fechado
            </span>
            <span class="inline-flex items-center gap-2 text-slate-300 text-[13px]">
              <span class="text-blue-400"><lucide-icon [img]="CreditCard" [size]="15"></lucide-icon></span>
              Fatura e limite comprometido
            </span>
            <span class="inline-flex items-center gap-2 text-slate-300 text-[13px]">
              <span class="text-blue-400"><lucide-icon [img]="TrendingUp" [size]="15"></lucide-icon></span>
              Evolução de 6 meses
            </span>
          </div>
        </div>

        <div class="relative z-10 flex items-center gap-2 text-slate-400 text-[12.5px] fade-up" style="animation-delay: 320ms">
          <span class="text-blue-400"><lucide-icon [img]="ShieldCheck" [size]="15"></lucide-icon></span>
          Dados privados, guardados localmente
        </div>
      </section>

      <!-- Escolha de perfil -->
      <section class="relative flex items-center justify-center p-6 sm:p-10 bg-surface">
        <div class="w-full max-w-sm">
          <div class="mb-7 fade-up">
            <span class="tag">Acesso</span>
            <h2 class="font-display text-2xl font-bold tracking-tight mt-3">Quem está entrando?</h2>
            <p class="text-inkMuted text-[13.5px] mt-1.5">Selecione o seu perfil para abrir o painel.</p>
          </div>

          <div class="space-y-2">
            @for (u of users(); track u.id; let i = $index) {
              <button (click)="login(u.id)" [disabled]="loading() !== null"
                class="w-full card lift p-3.5 flex items-center gap-3.5 text-left disabled:opacity-60 fade-up"
                [style.animation-delay.ms]="60 + i * 50">
                <app-user-avatar [color]="u.avatarColor" [name]="u.name" [initial]="u.avatarInitial"
                                 [icon]="u.avatarIcon" [size]="42" shape="squircle"></app-user-avatar>
                <div class="flex-1 min-w-0">
                  <div class="font-display text-[15px] font-bold tracking-tight">{{ u.name }}</div>
                  <div class="text-[12.5px] text-inkMuted">{{ loading() === u.id ? 'Entrando…' : 'Acessar o painel' }}</div>
                </div>
                <span class="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
                      [class.bg-brand]="loading() === u.id"
                      [class.text-white]="loading() === u.id"
                      [class.bg-bg2]="loading() !== u.id"
                      [class.text-inkMuted]="loading() !== u.id">
                  <lucide-icon [img]="ArrowRight" [size]="16"></lucide-icon>
                </span>
              </button>
            }
          </div>

          <div class="mt-8 pt-5 border-t border-line text-center">
            <div class="text-[11px] text-inkFaint tabular select-none">GestFin v{{ version }}@if (sha !== 'local') { · {{ sha }} }</div>
          </div>
        </div>
      </section>
    </main>
  `,
})
export class LoginComponent implements OnInit {
  readonly ArrowRight = ArrowRight;
  readonly ShieldCheck = ShieldCheck;
  readonly Wallet = Wallet;
  readonly TrendingUp = TrendingUp;
  readonly CreditCard = CreditCard;

  readonly version = APP_VERSION;
  readonly sha = BUILD_SHA;
  users = signal<Profile[]>([]);
  loading = signal<string | null>(null);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  async ngOnInit() {
    const res = await firstValueFrom(this.api.get<{ users: Profile[] }>('/api/users'));
    this.users.set(res.users);
  }

  async login(userId: string) {
    this.loading.set(userId);
    await this.auth.login(userId);
    this.router.navigate(['/dashboard']);
  }
}
