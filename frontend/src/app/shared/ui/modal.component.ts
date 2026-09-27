import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { LucideAngularModule, X } from 'lucide-angular';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="fixed inset-0 z-40 backdrop-blur-sm overlay-in" style="background:var(--overlay)" (click)="close.emit()"></div>
    <div class="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] max-w-full bg-surface border-l border-line shadow-2xl flex flex-col slide-in-right"
         style="padding-top:env(safe-area-inset-top); padding-bottom:env(safe-area-inset-bottom); padding-right:env(safe-area-inset-right)">
      <div class="shrink-0 px-5 sm:px-6 py-5 border-b border-line flex items-start justify-between">
        <div>
          <span class="tag">{{ tag }}</span>
          <h2 class="font-display text-xl sm:text-2xl font-extrabold tracking-tight mt-2">{{ title }}</h2>
        </div>
        <button (click)="close.emit()" class="w-10 h-10 rounded-full flex items-center justify-center text-inkMuted hover:bg-bg2 transition-colors shrink-0">
          <lucide-icon [img]="X" [size]="18"></lucide-icon>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
        <ng-content></ng-content>
      </div>
      <div class="shrink-0 px-5 sm:px-6 py-4 border-t border-line flex items-center justify-end gap-2 bg-surface">
        <ng-content select="[modal-footer]"></ng-content>
      </div>
    </div>
  `,
})
export class ModalComponent {
  @Input() tag = '';
  @Input() title = '';
  @Output() close = new EventEmitter<void>();
  readonly X = X;

  @HostListener('document:keydown.escape')
  onEsc() {
    this.close.emit();
  }
}
