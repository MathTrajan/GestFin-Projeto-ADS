import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideAngularModule, CheckCircle2, AlertTriangle, Info, X } from 'lucide-angular';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <div class="fixed z-[60] inset-x-0 px-4 flex flex-col items-center gap-2 pointer-events-none"
         style="bottom:calc(1rem + env(safe-area-inset-bottom))">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast-in pointer-events-auto w-full max-w-[420px] bg-surface border border-line shadow-card rounded-2xl px-4 py-3 flex items-center gap-3">
          <span class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                [style.background]="tint(t.kind)" [style.color]="fg(t.kind)">
            <lucide-icon [img]="icon(t.kind)" [size]="17"></lucide-icon>
          </span>
          <span class="text-[13.5px] font-semibold flex-1">{{ t.message }}</span>
          @if (t.action; as a) {
            <button (click)="toast.runAction(t)"
                    class="text-[12.5px] font-extrabold uppercase tracking-wide text-brand hover:opacity-80 shrink-0 px-1">
              {{ a.label }}
            </button>
          }
          <button (click)="toast.dismiss(t.id)" class="text-inkMuted hover:text-ink shrink-0">
            <lucide-icon [img]="X" [size]="15"></lucide-icon>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  toast = inject(ToastService);
  readonly X = X;
  icon(k: string) { return k === 'success' ? CheckCircle2 : k === 'error' ? AlertTriangle : Info; }
  fg(k: string) { return k === 'success' ? 'var(--pos)' : k === 'error' ? 'var(--neg)' : 'var(--invest)'; }
  tint(k: string) { return k === 'success' ? 'var(--pos-tint)' : k === 'error' ? 'var(--neg-tint)' : 'var(--invest-tint)'; }
}
