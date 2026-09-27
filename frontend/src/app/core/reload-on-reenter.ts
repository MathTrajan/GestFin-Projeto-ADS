import { inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Recarrega os dados toda vez que a rota é reaberta.
 * Necessário porque o RouteReuseStrategy mantém a tela viva (não recria nem roda
 * ngOnInit de novo), então sem isto a tela mostraria dados defasados ao voltar.
 * Chamar no construtor da página (contexto de injeção).
 */
export function reloadOnReenter(matchPath: string, reload: () => void): void {
  const router = inject(Router);
  router.events
    .pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntilDestroyed(),
    )
    .subscribe((e) => {
      const url = e.urlAfterRedirects.split('?')[0];
      if (url === matchPath || url.startsWith(matchPath + '/')) reload();
    });
}
