import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AppRouteReuseStrategy } from './route-reuse.strategy';
import { LockService } from './lock.service';
import { firstValueFrom } from 'rxjs';

export interface SessionUser {
  id: string; name: string; avatarColor: string; avatarInitial: string;
  avatarIcon: string | null; householdName: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<SessionUser | null>(null);
  private routeReuse = inject(AppRouteReuseStrategy);
  private lock = inject(LockService);
  constructor(private api: ApiService) {}

  async me(): Promise<SessionUser | null> {
    try {
      const res = await firstValueFrom(this.api.get<{ user: SessionUser }>('/api/auth/me'));
      this.user.set(res.user);
      return res.user;
    } catch {
      this.user.set(null);
      return null;
    }
  }

  async login(userId: string): Promise<void> {
    const res = await firstValueFrom(this.api.post<{ user: SessionUser }>('/api/auth/login', { userId }));
    this.user.set(res.user);
  }

  // Ícone (null = voltar pra inicial) e cor do avatar (undefined = manter a atual).
  async updateAvatar(icon: string | null, color?: string): Promise<void> {
    const res = await firstValueFrom(
      this.api.patch<{ user: SessionUser }>('/api/users/me/avatar', { icon, ...(color ? { color } : {}) }),
    );
    this.user.set(res.user);
  }

  /**
   * Define ou altera o código de acesso da residência (RF04).
   *
   * A API renova o destravamento deste aparelho na mesma resposta, para que quem
   * acabou de trocar o código não seja desconectado. Os demais aparelhos passam
   * a exigir o código novo.
   */
  async definirCodigoDeAcesso(codigo: string): Promise<void> {
    await firstValueFrom(this.api.post('/api/auth/set-pin', { pin: codigo }));
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.api.post('/api/auth/logout', {}));
    this.user.set(null);
    this.routeReuse.clear(); // descarta telas em cache p/ nao vazar estado entre perfis
    this.lock.lock(); // re-trava: proximo acesso pede o codigo
  }
}
