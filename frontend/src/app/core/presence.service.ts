import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export interface PresenceUser {
  id: string;
  name: string;
  avatarColor: string;
  avatarInitial: string;
  avatarIcon: string | null;
  online: boolean;
  lastSeenAt: string | null; // null = não visto desde o último boot da API
}

// Presença do casal (poll leve em /users/online): quem está com o app aberto agora
// e quando o outro foi visto por último.
// Um ÚNICO poller pro app inteiro: o shell é instanciado por tela e reusado
// pelo route-reuse — cada instância chama ensurePolling(), mas só o 1º cria o timer.
// Só consulta com a aba visível: aba em segundo plano deixa de contar como online
// e não mantém a machine do fly acordada.
@Injectable({ providedIn: 'root' })
export class PresenceService {
  readonly users = signal<PresenceUser[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;
  private listening = false;

  constructor(private api: ApiService) {}

  ensurePolling() {
    if (!this.listening) {
      this.listening = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.timer) this.refresh();
      });
    }
    if (this.timer) return;
    this.refresh();
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.refresh();
    }, 30_000);
  }

  // Atualização imediata fora do ciclo de 30s (ex.: acabou de trocar o ícone).
  refreshNow() {
    void this.refresh();
  }

  private async refresh() {
    try {
      const res = await firstValueFrom(this.api.get<{ users: PresenceUser[] }>('/api/users/online'));
      this.users.set(res.users);
    } catch (e: unknown) {
      // sessão caiu (logout/re-lock): para o poll — o próximo login recria o shell e religa.
      // Erro de rede transitório mantém o último valor e continua tentando.
      const status = (e as { status?: number })?.status;
      if (status === 401 || status === 403) {
        this.users.set([]);
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
      }
    }
  }
}
