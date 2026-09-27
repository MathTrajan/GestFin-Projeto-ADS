import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // botão de confirmação em vermelho (arquivar/excluir)
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

// Diálogo de confirmação global. Uso: if (await confirm.ask({...})) { ... }
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly state = signal<ConfirmState | null>(null);

  ask(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.state.set({ ...opts, resolve });
    });
  }

  answer(ok: boolean) {
    const s = this.state();
    if (s) s.resolve(ok);
    this.state.set(null);
  }
}
