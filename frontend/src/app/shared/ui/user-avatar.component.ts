import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { resolveTone } from '../colors';
import { userIconFor } from '../icons';

// Avatar de usuário: círculo (ou squircle) com o ícone escolhido ou a inicial.
// Sempre passa pelo resolveTone — a cor salva no banco é pastel (#FBEAF0…) e
// texto branco direto sobre ela fica ilegível (bug antigo da sidebar/header).
@Component({
  selector: 'app-user-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <span class="relative inline-flex items-center justify-center text-white font-display font-extrabold select-none shrink-0"
          [class.rounded-full]="shape === 'circle'"
          [class.rounded-md]="shape === 'squircle'"
          [style.width.px]="size" [style.height.px]="size"
          [style.background]="background"
          [style.boxShadow]="glow ? glowShadow : null"
          [style.opacity]="online === false && dimOffline ? 0.45 : 1"
          [style.fontSize.px]="fontSize">
      @if (iconImg) {
        <lucide-icon [img]="iconImg" [size]="iconSize" [strokeWidth]="2.4"></lucide-icon>
      } @else {
        {{ initial }}
      }
      @if (online === true) {
        <span class="absolute rounded-full"
              [style.width.px]="dotSize" [style.height.px]="dotSize"
              style="right:-1px; bottom:-1px; background:var(--pos)"
              [style.border]="'2px solid ' + dotBorder"></span>
      }
    </span>
  `,
})
export class UserAvatarComponent {
  @Input() color?: string;
  @Input() name = '';
  @Input() initial = '';
  @Input() icon: string | null | undefined;
  @Input() size = 28;
  @Input() shape: 'circle' | 'squircle' = 'circle';
  // null = sem indicador de presença; true mostra a bolinha, false esmaece (se dimOffline)
  @Input() online: boolean | null = null;
  @Input() dimOffline = true;
  @Input() dotBorder = 'var(--bg2)';
  @Input() glow = false;

  private get tone() { return resolveTone(this.color, this.name || this.initial); }
  // Cor chapada: o gradiente do sistema de origem não combina com o visual reto daqui.
  get background() { return this.tone; }
  get glowShadow() { return `0 2px 6px rgba(15, 23, 42, 0.2)`; }
  get iconImg() { return userIconFor(this.icon); }
  get iconSize() { return Math.round(this.size * 0.52); }
  get fontSize() { return Math.round(this.size * 0.42); }
  get dotSize() { return Math.max(9, Math.round(this.size * 0.34)); }
}
