import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { getAuthToken, getApiUrl } from '../utils/api-url.utils';

/**
 * Functional HTTP Interceptor attaching Authorization header, rewriting API URLs to backend port, and enabling HTTP-only cookies.
 * Also handles 401 Unauthorized responses to clear expired sessions.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.accessToken() || getAuthToken();
  const targetUrl = getApiUrl(req.url);

  let authReq = req.clone({
    url: targetUrl,
    withCredentials: true,
  });

  if (token && !req.headers.has('Authorization')) {
    authReq = authReq.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/api/auth/login')) {
        authService.handleUnauthorized();
      }
      return throwError(() => error);
    })
  );
};
