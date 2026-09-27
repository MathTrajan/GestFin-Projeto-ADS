import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { ConfirmService } from '../../core/confirm.service';

@Component({
  selector: 'app-confirm-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (confirm.state(); as s) {
      <div class="fixed inset-0 z-[70] backdrop-blur-sm overlay-in flex items-center justify-center px-5"
           style="background:var(--overlay)"
           (click)="confirm.answer(false)">
        <div class="w-full max-w-[400px] bg-surface border border-line rounded-3xl shadow-2xl p-6 pop-in" (click)="$event.stopPropagation()">
          <h2 class="font-display text-xl font-extrabold tracking-tight">{{ s.title }}</h2>
          @if (s.message) { <p class="text-[14px] text-inkSoft mt-2 leading-relaxed">{{ s.message }}</p> }
          <div class="flex items-center justify-end gap-2 mt-6">
            <button (click)="confirm.answer(false)"
                    class="px-4 py-2.5 rounded-2xl text-[14px] font-semibold text-inkSoft hover:bg-bg2 transition-colors">
              {{ s.cancelLabel || 'Cancelar' }}
            </button>
            <button (click)="confirm.answer(true)"
                    class="px-4 py-2.5 rounded-2xl text-[14px] font-bold text-white transition-transform active:scale-95"
                    [style.background]="s.danger ? 'var(--neg)' : 'var(--brand)'">
              {{ s.confirmLabel || 'Confirmar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmHostComponent {
  confirm = inject(ConfirmService);

  @HostListener('document:keydown.escape')
  onEsc() { if (this.confirm.state()) this.confirm.answer(false); }
}
