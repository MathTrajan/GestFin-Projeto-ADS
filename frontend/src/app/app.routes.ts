import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { lockGuard } from './core/lock.guard';

export const routes: Routes = [
  { path: 'unlock', loadComponent: () => import('./pages/unlock.component').then((m) => m.UnlockComponent) },
  { path: '', canActivate: [lockGuard], loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent) },
  { path: 'dashboard', canActivate: [lockGuard, authGuard], data: { reuse: true }, loadComponent: () => import('./pages/dashboard.component').then((m) => m.DashboardComponent) },
  { path: 'lancamentos', canActivate: [lockGuard, authGuard], data: { reuse: true }, loadComponent: () => import('./pages/transactions.component').then((m) => m.TransactionsComponent) },
  { path: 'categorias', canActivate: [lockGuard, authGuard], data: { reuse: true }, loadComponent: () => import('./pages/categories.component').then((m) => m.CategoriesComponent) },
  { path: 'cartoes', canActivate: [lockGuard, authGuard], data: { reuse: true }, loadComponent: () => import('./pages/cards.component').then((m) => m.CardsComponent) },
  { path: '**', redirectTo: '' },
];
