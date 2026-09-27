import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

/**
 * Mantem viva a instancia das telas marcadas com `data: { reuse: true }`.
 * Depois da 1a visita, voltar para a tela e instantaneo e preserva estado/scroll
 * (sem recriar o componente nem re-buscar dados). Use clear() ao deslogar.
 */
@Injectable({ providedIn: 'root' })
export class AppRouteReuseStrategy implements RouteReuseStrategy {
  private handlers = new Map<string, DetachedRouteHandle>();

  private key(route: ActivatedRouteSnapshot): string | null {
    return route.routeConfig?.path ?? null;
  }

  private isReusable(route: ActivatedRouteSnapshot): boolean {
    return !!route.routeConfig && route.data?.['reuse'] === true;
  }

  // detacha (e guarda) so as rotas marcadas para reuso
  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.isReusable(route);
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const k = this.key(route);
    if (!k || !this.isReusable(route)) return;
    if (handle) this.handlers.set(k, handle);
    else this.handlers.delete(k);
  }

  // reanexa se ja temos a tela guardada
  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const k = this.key(route);
    return !!k && this.handlers.has(k);
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const k = this.key(route);
    return (k && this.handlers.get(k)) || null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig;
  }

  // limpa o cache (ex.: ao deslogar) para nao vazar estado entre perfis
  clear(): void {
    this.handlers.clear();
  }
}
