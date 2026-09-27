import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LockService } from './lock.service';

// Exige o codigo de acesso antes de qualquer tela (se houver PIN configurado).
export const lockGuard: CanActivateFn = async (_route, state) => {
  const lock = inject(LockService);
  const router = inject(Router);
  if (lock.unlocked()) return true;
  if (!(await lock.pinSet())) return true; // ainda sem PIN -> libera (bootstrap)
  router.navigate(['/unlock'], { queryParams: { return: state.url } });
  return false;
};
