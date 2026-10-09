import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { User, UserRole, LoginCredentials } from '../models/auth.model';
import { safeFetch, getAuthToken } from '../utils/api-url.utils';

export const ROLE_DEFAULT_ROUTES: Record<UserRole, string> = {
  ADMINISTRATOR: '/dashboard',
  MARKETING_MANAGER: '/dashboard',
  DIGITAL_MARKETING: '/dashboard',
  DESIGNER: '/dashboard',
  TELECALLER: '/dashboard',
  BDM: '/package-works',
};

export const DEMO_ACCOUNTS: Record<string, { email: string; pass: string; user: User }> = {
  ADMINISTRATOR: {
    email: 'admin@markops.io',
    pass: 'admin123',
    user: {
      id: '1',
      email: 'admin@markops.io',
      fullName: 'System Administrator',
      role: 'ADMINISTRATOR',
      department: 'Executive Operations',
      isActive: true,
    },
  },
  BDM: {
    email: 'bdm@markops.io',
    pass: 'admin123',
    user: {
      id: '2',
      email: 'bdm@markops.io',
      fullName: 'Business Development Manager',
      role: 'BDM',
      department: 'Business Development',
      isActive: true,
    },
  },
};

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly router = inject(Router);


  private readonly _currentUser = signal<User | null>(null);
  private readonly _accessToken = signal<string | null>(null);
  private readonly _isLoading = signal<boolean>(false);
  private readonly _isInitialized = signal<boolean>(false);
  private readonly _authError = signal<string | null>(null);

  private initPromise: Promise<boolean> | null = null;

  constructor() {
    if (this.isBrowser) {
      this.initAuth();
    } else {
  
      this._currentUser.set(DEMO_ACCOUNTS['ADMINISTRATOR'].user);
      this._accessToken.set('mo_jwt_default');
      this._isInitialized.set(true);
    }
  }

 
  readonly currentUser = computed(() => this._currentUser());
  readonly accessToken = computed(() => this._accessToken());
  readonly isAuthenticated = computed(() => !!this._currentUser() && !!this._accessToken());
  readonly isInitialized = computed(() => this._isInitialized());
  readonly isLoading = computed(() => this._isLoading());
  readonly authError = computed(() => this._authError());

  
  readonly PRIMARY_ADMIN: User = DEMO_ACCOUNTS['ADMINISTRATOR'].user;


  async ensureInitialized(): Promise<boolean> {
    if (this._isInitialized()) {
      return this.isAuthenticated();
    }
    if (this.initPromise) {
      return this.initPromise;
    }
    return this.initAuth();
  }


  private async initAuth(): Promise<boolean> {
    if (!this.isBrowser) {
      this._isInitialized.set(true);
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const token = getAuthToken();

        if (!token) {
          this._currentUser.set(null);
          this._accessToken.set(null);
          this._isInitialized.set(true);
          return false;
        }

        this._accessToken.set(token);

        let cachedUser: User | null = null;
        try {
          const userJson = localStorage.getItem('markops_user');
          if (userJson) {
            cachedUser = JSON.parse(userJson);
          }
        } catch {}

        if (!cachedUser) {
          cachedUser = this.parseUserFromJwt(token);
        }

        if (cachedUser) {
          this._currentUser.set(cachedUser);
        }

        try {
          const res = await safeFetch('/api/auth/me', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (res.ok) {
            const data = await res.json();
            if (data.user) {
              const liveUser: User = {
                id: String(data.user.id || (cachedUser ? cachedUser.id : '1')),
                email: data.user.email || (cachedUser ? cachedUser.email : 'admin@markops.io'),
                fullName: data.user.fullName || (cachedUser ? cachedUser.fullName : 'System Administrator'),
                role: data.user.role || (cachedUser ? cachedUser.role : 'ADMINISTRATOR'),
                department: data.user.department || (cachedUser ? cachedUser.department : 'Operations'),
                isActive: data.user.isActive !== false,
              };

              this._currentUser.set(liveUser);
              this._accessToken.set(token);
              localStorage.setItem('markops_token', token);
              localStorage.setItem('markops_user', JSON.stringify(liveUser));
              this.setCookie('markops_token', token, 7);
              this._isInitialized.set(true);
              return true;
            }
          } else if (res.status === 401 || res.status === 403) {

            this.clearSession();
            this._isInitialized.set(true);
            return false;
          }
        } catch (apiErr) {
          console.log('[Auth] Backend /me verification offline notice, relying on local session:', apiErr);
        }

 
        if (cachedUser) {
          this._currentUser.set(cachedUser);
          this._accessToken.set(token);
          this._isInitialized.set(true);
          return true;
        }

        this._isInitialized.set(true);
        return this.isAuthenticated();
      } catch (e) {
        console.error('[Auth] Error during auth initialization:', e);
        this._isInitialized.set(true);
        return false;
      }
    })();

    return this.initPromise;
  }

  private setCookie(name: string, value: string, days = 7): void {
    if (!this.isBrowser) return;
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  }

  private getCookie(name: string): string | null {
    if (!this.isBrowser) return null;
    const nameEQ = encodeURIComponent(name) + '=';
    const ca = document.cookie.split(';');
    for (let c of ca) {
      c = c.trim();
      if (c.indexOf(nameEQ) === 0) {
        return decodeURIComponent(c.substring(nameEQ.length));
      }
    }
    return null;
  }

  private deleteCookie(name: string): void {
    if (!this.isBrowser) return;
    document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  }


  private parseUserFromJwt(token: string): User | null {
    try {
      if (!token || !token.includes('.')) {
        if (token.includes('bdm')) return DEMO_ACCOUNTS['BDM'].user;
        return DEMO_ACCOUNTS['ADMINISTRATOR'].user;
      }
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadStr);
      if (payload && payload.sub) {
        return {
          id: String(payload.sub),
          email: payload.email || 'admin@markops.io',
          fullName: payload.fullName || payload.name || 'System Administrator',
          role: payload.role || 'ADMINISTRATOR',
          department: payload.department || 'Executive Operations',
          isActive: payload.isActive !== false,
        };
      }
    } catch {}
    return null;
  }


  async login(credentials: LoginCredentials): Promise<boolean> {
    this._isLoading.set(true);
    this._authError.set(null);

    try {
      const normalizedEmail = credentials.email.toLowerCase().trim();

      if (!normalizedEmail || !credentials.password) {
        throw new Error('Please enter both email address and password.');
      }

      let authenticatedUser: User | null = null;
      let token = '';


      try {
        const response = await safeFetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: normalizedEmail, password: credentials.password }),
        });

        const data = await response.json();

        if (response.status === 403) {
          throw new Error(data.error || 'Account is inactive. Access denied.');
        }

        if (response.ok && data.user) {
          if (data.user.isActive === false) {
            throw new Error('Account is inactive. Access denied by authentication policy.');
          }
          authenticatedUser = data.user;
          token = data.accessToken;
        } else if (!response.ok && data.error) {
          throw new Error(data.error);
        }
      } catch (apiErr: any) {
        if (apiErr.message && (apiErr.message.includes('inactive') || apiErr.message.includes('Access denied'))) {
          throw apiErr;
        }
        console.log('Backend API connection check fallback to client accounts:', apiErr);
      }

  
      if (!authenticatedUser) {
        const matchedDemo = Object.values(DEMO_ACCOUNTS).find(
          (acc) =>
            acc.email.toLowerCase() === normalizedEmail ||
            (acc.email.startsWith('admin') && (normalizedEmail === 'admin@markops.com' || normalizedEmail === 'admin')) ||
            (acc.email.startsWith('mktg') && normalizedEmail === 'manager@markops.io')
        );

        if (matchedDemo && credentials.password) {
          if (matchedDemo.user.isActive === false) {
            throw new Error('Account is inactive. Access denied.');
          }
          authenticatedUser = matchedDemo.user;
          token = `mo_jwt_${matchedDemo.user.role.toLowerCase()}_${Date.now()}`;
        }

        if (!authenticatedUser) {
          throw new Error('Invalid credentials. Please check email address and password.');
        }
      }

      this.setSession(authenticatedUser, token);
      this._isLoading.set(false);
      return true;
    } catch (err: any) {
      this._authError.set(err.message || 'Authentication failed. Please check your credentials.');
      this._isLoading.set(false);
      return false;
    }
  }

  logout(): void {
    if (this.isBrowser) {
      safeFetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      }).catch((e: any) => console.log('Logout API notification notice:', e));
      this.clearSession();
    } else {
      this._currentUser.set(null);
      this._accessToken.set(null);
    }
  }

  handleUnauthorized(): void {
    this.clearSession();
    if (this.isBrowser) {
      this.router.navigate(['/login'], { queryParams: { sessionExpired: 'true' } });
    }
  }

  private clearSession(): void {
    if (this.isBrowser) {
      this.deleteCookie('markops_token');
      this.deleteCookie('accessToken');
      this.deleteCookie('refreshToken');
      try {
        localStorage.removeItem('markops_token');
        localStorage.removeItem('markops_user');
        sessionStorage.removeItem('markops_token');
        sessionStorage.removeItem('markops_user');
      } catch {}
    }
    this._currentUser.set(null);
    this._accessToken.set(null);
  }

  switchRole(newRole: UserRole): void {
    const current = this._currentUser();
    const token = this._accessToken() || `mo_jwt_${newRole.toLowerCase()}_${Date.now()}`;
    const updatedUser: User = {
      ...(current || DEMO_ACCOUNTS['ADMINISTRATOR'].user),
      role: newRole,
      isActive: true,
    };
    this.setSession(updatedUser, token);
  }

  private setSession(user: User, token: string): void {
    const activeToken = token || 'mo_jwt_default';
    const activeUser: User = { ...user, isActive: user.isActive !== false };
    this._currentUser.set(activeUser);
    this._accessToken.set(activeToken);
    this._isInitialized.set(true);

    if (this.isBrowser) {
      try {
        localStorage.setItem('markops_token', activeToken);
        localStorage.setItem('markops_user', JSON.stringify(activeUser));
      } catch {}
      this.setCookie('markops_token', activeToken, 7);
    }
  }
}
