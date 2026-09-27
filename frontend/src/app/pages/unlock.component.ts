import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { LockService } from '../core/lock.service';
import { APP_VERSION, BUILD_SHA } from '../shared/version';

/**
 * Tela de código de acesso (UC01).
 *
 * O desbloqueio por biometria ficou fora desta entrega e está registrado como
 * evolução futura no Documento de Visão (EF1): ele dependeria de biblioteca
 * criptográfica de terceiros, o que contraria a restrição de dependências
 * mínimas do projeto. O código de acesso sozinho cumpre o controle de acesso.
 */
@Component({
  selector: 'app-unlock',
  standalone: true,
  template: `
    <main class="min-h-dvh flex flex-col items-center justify-center bg-bg px-6">
      <div class="w-full max-w-[320px] card p-7 flex flex-col items-center">
        <svg viewBox="0 0 32 32" class="w-12 h-12 rounded-lg mb-4" aria-hidden="true">
          <rect width="32" height="32" rx="5" fill="#1E3A8A"/>
          <rect x="7"  y="17" width="4" height="8"  rx="1" fill="#93C5FD"/>
          <rect x="14" y="12" width="4" height="13" rx="1" fill="#BFDBFE"/>
          <rect x="21" y="7"  width="4" height="18" rx="1" fill="#FFFFFF"/>
        </svg>
        <h1 class="font-display text-lg font-bold tracking-tight">GestFin</h1>
        <p class="text-inkMuted text-[13px] mt-1 mb-6">Digite o código de acesso</p>

        <div class="flex gap-2.5 mb-1" [class.shake]="error()">
          @for (i of [0,1,2,3]; track i) {
            <span class="w-3 h-3 rounded-sm border transition-colors"
                  [style.background]="pin().length > i ? 'var(--brand)' : 'transparent'"
                  [style.borderColor]="pin().length > i ? 'var(--brand)' : 'var(--line-strong)'"></span>
          }
        </div>
        <div class="h-5 text-[12.5px] font-semibold mb-4" style="color:var(--neg)">{{ mensagem() }}</div>

        <div class="grid grid-cols-3 gap-2 w-full">
          @for (n of [1,2,3,4,5,6,7,8,9]; track n) {
            <button (click)="press(n)" [disabled]="busy()"
                    class="h-14 rounded-md bg-surface2 border border-lineStrong text-xl font-display font-semibold hover:bg-bg2 transition-colors">{{ n }}</button>
          }
          <span></span>
          <button (click)="press(0)" [disabled]="busy()"
                  class="h-14 rounded-md bg-surface2 border border-lineStrong text-xl font-display font-semibold hover:bg-bg2 transition-colors">0</button>
          <button (click)="backspace()" aria-label="Apagar"
                  class="h-14 rounded-md flex items-center justify-center text-xl text-inkMuted hover:bg-bg2 transition-colors">⌫</button>
        </div>
      </div>

      <div class="mt-6 text-[11px] text-inkFaint tabular select-none">GestFin v{{ version }}@if (sha !== 'local') { · {{ sha }} }</div>
    </main>
  `,
  styles: [`.shake{animation:sh .4s} @keyframes sh{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`],
})
export class UnlockComponent {
  readonly version = APP_VERSION;
  readonly sha = BUILD_SHA;
  pin = signal('');
  error = signal(false);
  busy = signal(false);
  // Mensagem de erro: além do código incorreto, o servidor pode responder com
  // bloqueio temporário depois de tentativas sucessivas (RF03).
  mensagem = signal('');

  private lock = inject(LockService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  press(n: number) {
    if (this.busy() || this.pin().length >= 4) return;
    this.error.set(false);
    this.mensagem.set('');
    this.pin.update((p) => p + n);
    if (this.pin().length === 4) this.submit();
  }

  backspace() {
    if (this.busy()) return;
    this.error.set(false);
    this.mensagem.set('');
    this.pin.update((p) => p.slice(0, -1));
  }

  // Permite digitar o código pelo teclado físico, além de tocar nos botões
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      this.press(Number(e.key));
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      this.backspace();
    }
  }

  private async submit() {
    this.busy.set(true);
    const resultado = await this.lock.unlock(this.pin());
    this.busy.set(false);

    if (resultado.ok) {
      const retorno = this.route.snapshot.queryParamMap.get('return') || '/';
      this.router.navigateByUrl(retorno);
      return;
    }

    this.error.set(true);
    this.mensagem.set(resultado.mensagem || 'Código incorreto');
    this.pin.set('');
  }
}
