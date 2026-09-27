import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { firstValueFrom } from 'rxjs';

const KEY = 'capital_destravado';

export interface ResultadoDestravamento {
  ok: boolean;
  /** Motivo da recusa, para exibir ao usuário. */
  mensagem?: string;
}

/** Trava de acesso por código da residência, equivalente ao cadeado do celular. */
@Injectable({ providedIn: 'root' })
export class LockService {
  private api = inject(ApiService);
  readonly unlocked = signal<boolean>(
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem(KEY) === '1',
  );
  private _pinSet: boolean | null = null;

  async pinSet(): Promise<boolean> {
    if (this._pinSet === null) {
      try {
        this._pinSet = (
          await firstValueFrom(this.api.get<{ pinSet: boolean }>('/api/auth/status'))
        ).pinSet;
      } catch {
        this._pinSet = false;
      }
    }
    return this._pinSet;
  }

  /**
   * Envia o código à API.
   *
   * Devolve a mensagem do servidor em caso de recusa, e não apenas um booleano:
   * depois de tentativas sucessivas a API responde com o tempo de espera (RF03),
   * e esconder isso do usuário faria a tela parecer travada sem explicação.
   */
  async unlock(pin: string): Promise<ResultadoDestravamento> {
    try {
      await firstValueFrom(this.api.post('/api/auth/unlock', { pin }));
      this.markUnlocked();
      return { ok: true };
    } catch (erro: unknown) {
      const resposta = erro as { status?: number; error?: { erro?: string } };
      return {
        ok: false,
        mensagem: resposta?.error?.erro || 'Código incorreto',
      };
    }
  }

  markUnlocked() {
    this.unlocked.set(true);
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, '1');
  }

  lock() {
    this.unlocked.set(false);
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(KEY);
  }
}
