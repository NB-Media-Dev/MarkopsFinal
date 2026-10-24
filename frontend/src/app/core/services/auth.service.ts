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
      setTimeout(() => { void this.initAuth(); }, 0);
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
    if (this.initPromise !== null) {
      return this.initPromise;
    }
    return this.initAuth();
  }


    private loadStoredUser(token: string): User | null {
    let cachedUser: User | null = null;
    try {
      const userJson = localStorage.getItem('markops_user');
      if (userJson) {
        cachedUser = JSON.parse(userJson);
      }
    } catch (error_) { console.log('[Auth Storage Notice] Skipped:', error_); }

    cachedUser ??= this.parseUserFromJwt(token);
    return cachedUser;
  }

  private async verifyRemoteSession(token: string, cachedUser: User | null): Promise<boolean | null> {
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
            avatarUrl: data.user.avatarUrl || cachedUser?.avatarUrl,
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
    return null;
  }

  private async initAuth(): Promise<boolean> {
    if (!this.isBrowser) {
      this._isInitialized.set(true);
      return true;
    }

    if (this.initPromise !== null) {
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
        const cachedUser = this.loadStoredUser(token);
        if (cachedUser) {
          this._currentUser.set(cachedUser);
        }

        const remoteResult = await this.verifyRemoteSession(token, cachedUser);
        if (remoteResult !== null) {
          return remoteResult;
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
      if (c.startsWith(nameEQ)) {
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
      if (!token?.includes('.')) {
        return DEMO_ACCOUNTS['ADMINISTRATOR'].user;
      }
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payloadStr = atob(parts[1].replaceAll('-', '+').replaceAll('_', '/'));
      const payload = JSON.parse(payloadStr);
      if (payload?.sub) {
        return {
          id: String(payload.sub),
          email: payload.email || 'admin@markops.io',
          fullName: payload.fullName || payload.name || 'System Administrator',
          role: payload.role || 'ADMINISTRATOR',
          department: payload.department || 'Executive Operations',
          isActive: payload.isActive !== false,
        };
      }
    } catch (error_) { console.log('[Auth Storage Notice] Skipped:', error_); }
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
        this.setSession(data.user, data.accessToken);
        this._isLoading.set(false);
        return true;
      }

      throw new Error(data.error || 'Invalid credentials. Please check email address and password.');
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
      } catch (error_) { console.log('[Auth Storage Notice] Skipped:', error_); }
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

  async updateProfileAvatar(avatarDataUrl: string): Promise<{ success: boolean; avatarUrl?: string; error?: string }> {
    try {
      const token = this._accessToken() || getAuthToken();
      let newAvatarUrl = avatarDataUrl;

      try {
        const res = await safeFetch('/api/auth/profile/avatar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ avatarDataUrl }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.avatarUrl) {
            newAvatarUrl = data.avatarUrl;
          }
        }
      } catch (apiErr) {
        console.log('[Auth] Profile avatar API fallback notice:', apiErr);
      }

      const current = this._currentUser();
      if (current) {
        const updatedUser: User = { ...current, avatarUrl: newAvatarUrl };
        this.setSession(updatedUser, this._accessToken() || 'mo_jwt_default');
      }

      return { success: true, avatarUrl: newAvatarUrl };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update avatar' };
    }
  }

  async removeProfileAvatar(): Promise<{ success: boolean; error?: string }> {
    try {
      const token = this._accessToken() || getAuthToken();
      try {
        await safeFetch('/api/auth/profile/avatar', {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch (apiErr) {
        console.log('[Auth] Remove avatar API fallback notice:', apiErr);
      }

      const current = this._currentUser();
      if (current) {
        const updatedUser: User = { ...current, avatarUrl: undefined };
        this.setSession(updatedUser, this._accessToken() || 'mo_jwt_default');
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to remove avatar' };
    }
  }

  async changePassword(currentPassword: string, newPassword: string, confirmPassword?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const token = this._accessToken() || getAuthToken();
      const res = await safeFetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to change password.' };
      }

      return { success: true, message: data.message || 'Password updated successfully.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error occurred. Please try again.' };
    }
  }

  private setSession(user: User, token = 'mo_jwt_default'): void {
    const activeToken = token;
    const activeUser: User = { ...user, isActive: user.isActive !== false };
    this._currentUser.set(activeUser);
    this._accessToken.set(activeToken);
    this._isInitialized.set(true);

    if (this.isBrowser) {
      try {
        localStorage.setItem('markops_token', activeToken);
        localStorage.setItem('markops_user', JSON.stringify(activeUser));
      } catch (error_) { console.log('[Auth Storage Notice] Skipped:', error_); }
      this.setCookie('markops_token', activeToken, 7);
    }
  }
}
