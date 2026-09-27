import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastAction {
  label: string; // ex: "Desfazer"
  run: () => void;
}
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

// Feedback efêmero (substitui alert()). Mensagens somem sozinhas após ~3.2s
// (~6s quando têm ação, pra dar tempo de tocar no "Desfazer").
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  private push(kind: ToastKind, message: string, action?: ToastAction) {
    const id = ++this.seq;
    this.toasts.update((list) => [...list, { id, kind, message, action }]);
    setTimeout(() => this.dismiss(id), action ? 6000 : 3200);
  }

  success(message: string, action?: ToastAction) { this.push('success', message, action); }
  error(message: string) { this.push('error', message); }
  info(message: string) { this.push('info', message); }

  // dispara a ação e some na hora
  runAction(t: Toast) {
    this.dismiss(t.id);
    t.action?.run();
  }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
