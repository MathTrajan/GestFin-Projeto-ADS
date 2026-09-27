import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from './shared/ui/toast-host.component';
import { ConfirmHostComponent } from './shared/ui/confirm-host.component';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent, ConfirmHostComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast-host></app-toast-host>
    <app-confirm-host></app-confirm-host>
  `,
})
export class AppComponent {
  constructor() {
    inject(ThemeService).init(); // aplica tema antes de renderizar as telas
  }
}
