import { Component, EventEmitter, Input, Output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ICON_KEYS, iconFor } from '../icons';

@Component({
  selector: 'app-icon-picker',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="flex flex-wrap gap-2">
      @for (k of keys; track k) {
        <button type="button" (click)="change.emit(k)"
          class="w-10 h-10 rounded-xl flex items-center justify-center border transition-all"
          [style.background]="value === k ? 'var(--brand-tint)' : 'var(--surface-2)'"
          [style.color]="value === k ? 'var(--brand)' : 'var(--ink-muted)'"
          [style.borderColor]="value === k ? 'var(--brand)' : 'var(--line)'">
          <lucide-icon [img]="icon(k)" [size]="18"></lucide-icon>
        </button>
      }
    </div>
  `,
})
export class IconPickerComponent {
  @Input() value = '';
  @Output() change = new EventEmitter<string>();
  keys = ICON_KEYS;
  icon(k: string) { return iconFor(k); }
}
