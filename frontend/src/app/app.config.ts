import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { RouteReuseStrategy } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { NgxEchartsModule } from 'ngx-echarts';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AppRouteReuseStrategy } from './core/route-reuse.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    // sem preload agressivo: cada tela carrega sob demanda (e fica em cache via RouteReuseStrategy)
    provideRouter(routes),
    // mantem as telas vivas apos a 1a visita (navegacao instantanea + estado preservado)
    { provide: RouteReuseStrategy, useExisting: AppRouteReuseStrategy },
    provideHttpClient(withInterceptors([authInterceptor])),
    importProvidersFrom(
      // build enxuto do echarts (pie/bar/line) em vez do pacote inteiro
      NgxEchartsModule.forRoot({ echarts: () => import('./shared/echarts').then((m) => m.default) }),
    ),
  ],
};
