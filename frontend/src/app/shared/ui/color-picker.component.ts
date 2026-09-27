import { Component, EventEmitter, Input, Output } from '@angular/core';

const PALETTE = ['#1E3A8A', '#0369A1', '#0F766E', '#15803D', '#4D7C0F', '#B45309', '#B91C1C', '#BE185D'];

@Component({
  selector: 'app-color-picker',
  standalone: true,
  template: `
    <div class="flex flex-wrap gap-2">
      @for (c of palette; track c) {
        <button type="button" (click)="change.emit(c)" [attr.aria-label]="c"
          class="w-9 h-9 rounded-md border-2 transition-transform hover:scale-110"
          [style.background]="c" [style.borderColor]="value === c ? 'var(--ink)' : 'transparent'"></button>
      }
    </div>
  `,
})
export class ColorPickerComponent {
  @Input() value = '';
  @Output() change = new EventEmitter<string>();
  palette = PALETTE;
}
