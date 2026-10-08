import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, ROLE_DEFAULT_ROUTES } from '../services/auth.service';
import { UserRole } from '../models/auth.model';


export const roleGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.ensureInitialized();

  const currentUser = authService.currentUser();
  if (!currentUser) {
    return router.createUrlTree(['/login']);
  }

  const allowedRoles = route.data?.['roles'] as UserRole[] | undefined;


  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }


  if (allowedRoles.includes(currentUser.role)) {
    return true;
  }

  const fallbackRoute = ROLE_DEFAULT_ROUTES[currentUser.role] || '/dashboard';
  return router.createUrlTree([fallbackRoute]);
};
