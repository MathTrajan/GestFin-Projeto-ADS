import { Injectable, signal } from '@angular/core';

const KEY = 'capital_tema';
type Theme = 'light' | 'dark';

// Alterna tema claro/escuro. Respeita escolha salva; senão segue o sistema.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('light');

  init() {
    const saved = (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null) as Theme | null;
    const prefersDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(saved ?? (prefersDark ? 'dark' : 'light'));
  }

  toggle() {
    this.apply(this.theme() === 'dark' ? 'light' : 'dark');
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, this.theme());
  }

  private apply(t: Theme) {
    this.theme.set(t);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', t === 'dark');
    }
  }
}
