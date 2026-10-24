import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ManagedUser, CreateUserRequest } from '../models/user-management.model';
import { UserRole } from '../models/auth.model';
import { safeFetch } from '../utils/api-url.utils';

function buildCreateUserPayload(req: CreateUserRequest) {
  return {
    email: String(req.email || '').toLowerCase().trim(),
    fullName: String(req.fullName || '').trim(),
    role: req.role,
    department: String(req.department || 'General Operations').trim() || 'General Operations',
    isActive: req.isActive ?? true,
    password: req.password,
    avatarUrl: req.avatarUrl,
    avatarDataUrl: req.avatarDataUrl,
  };
}

function generateSafeId(prefix = 'usr'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return `${prefix}_${crypto.randomUUID().replaceAll('-', '').substring(0, 9)}`;
    } catch {
      // fallback
    }
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

function createLocalFallbackUser(payload: ReturnType<typeof buildCreateUserPayload>): ManagedUser {
  return {
    id: generateSafeId('usr'),
    email: payload.email,
    fullName: payload.fullName,
    role: payload.role,
    department: payload.department,
    isActive: payload.isActive,
    avatarUrl: payload.avatarUrl,
    lastLoginAt: 'Never',
    createdAt: new Date().toISOString().split('T')[0],
  };
}

function parseResponseData(text: string): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function postUserToBackend(payload: ReturnType<typeof buildCreateUserPayload>, fallbackUser: ManagedUser): Promise<ManagedUser> {
  console.log('[UserManagement] Sending POST /api/users payload:', payload);
  const res = await safeFetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log('[UserManagement] POST /api/users response status:', res.status);

  const text = await res.text();
  const data = parseResponseData(text);

  if (!res.ok) {
    const errMsg = data.error || (res.status === 404
      ? 'Backend server API not found (404). Please ensure the backend server is running on port 4000.'
      : `Failed to create user (Status ${res.status})`);
    throw new Error(errMsg);
  }

  return {
    id: String(data.id || fallbackUser.id),
    email: data.email || fallbackUser.email,
    fullName: data.fullName || fallbackUser.fullName,
    role: data.role || fallbackUser.role,
    department: data.department || fallbackUser.department,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : fallbackUser.isActive,
    avatarUrl: data.avatarUrl || fallbackUser.avatarUrl,
    lastLoginAt: data.lastLoginAt || 'Never',
    createdAt: data.createdAt || fallbackUser.createdAt,
  };
}

@Injectable({
  providedIn: 'root',
})
export class UserManagementService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly PRIMARY_ADMIN: ManagedUser = {
    id: '1',
    email: 'admin@markops.io',
    fullName: 'System Administrator',
    role: 'ADMINISTRATOR',
    department: 'Executive Operations',
    isActive: true,
    lastLoginAt: 'Just now',
    createdAt: '2026-01-10',
    avatarUrl: '/uploads/avatars/avatar_1_1791895994639.png',
  };

  private readonly _users = signal<ManagedUser[]>([this.PRIMARY_ADMIN]);

  readonly users = computed(() => this._users());
  readonly activeUsersCount = computed(() => this._users().filter((u) => u.isActive).length);
  readonly totalUsersCount = computed(() => this._users().length);

  constructor() {
    if (this.isBrowser) {
      try {
        localStorage.removeItem('markops_users_db_store');
      } catch (error_) { console.log('[User Storage Notice] Skipped:', error_); }
      setTimeout(() => { void this.loadUsersFromDatabase(); }, 0);
    }
  }

 
  async loadUsersFromDatabase(): Promise<void> {
    try {
      const res = await safeFetch('/api/users');
      if (res.ok) {
        const text = await res.text();
        const trimmed = text?.trim() ?? '';
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          const data = JSON.parse(text);
          if (Array.isArray(data) && data.length > 0) {
            this._users.set(data);
            return;
          }
        }
      }
    } catch (err) {
      console.log('Database user sync check error:', err);
    }
  }


  async createUser(req: CreateUserRequest): Promise<ManagedUser> {
    const payload = buildCreateUserPayload(req);
    let createdUser = createLocalFallbackUser(payload);

    if (this.isBrowser) {
      try {
        createdUser = await postUserToBackend(payload, createdUser);
        this._users.update((list) => [createdUser, ...list.filter((u) => u.id !== createdUser.id)]);
      } catch (err) {
        console.error('Failed to sync newly created user to backend database:', err);
        throw err;
      }
      await this.loadUsersFromDatabase();
    } else {
      this._users.update((list) => [createdUser, ...list]);
    }

    return createdUser;
  }

  async toggleUserStatus(userId: string): Promise<void> {
    this._users.update((list) =>
      list.map((u) => (u.id === userId ? { ...u, isActive: !u.isActive } : u))
    );

    if (this.isBrowser) {
      try {
        await safeFetch(`/api/users/${userId}/status`, { method: 'PATCH' });
        await this.loadUsersFromDatabase();
      } catch (err) {
        console.error('Failed to update user status in backend database:', err);
      }
    }
  }

  updateUserRole(userId: string, newRole: UserRole): void {
    this._users.update((list) =>
      list.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
  }

  async updateUser(userId: string, updatedData: Partial<CreateUserRequest>): Promise<ManagedUser | null> {
    let updatedUser: ManagedUser | null = null;

    this._users.update((list) =>
      list.map((user) => {
        if (user.id === userId) {
          updatedUser = {
            ...user,
            fullName: updatedData.fullName ? String(updatedData.fullName).trim() : user.fullName,
            email: updatedData.email ? String(updatedData.email).toLowerCase().trim() : user.email,
            role: updatedData.role || user.role,
            department: updatedData.department ? String(updatedData.department).trim() : user.department,
            isActive: updatedData.isActive ?? user.isActive,
            avatarUrl: updatedData.avatarUrl ?? user.avatarUrl,
          };
          return updatedUser;
        }
        return user;
      })
    );

    if (this.isBrowser && updatedUser) {
      try {
        await safeFetch(`/api/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(updatedUser as ManagedUser),
            password: updatedData.password,
            avatarDataUrl: updatedData.avatarDataUrl,
          }),
        });
        await this.loadUsersFromDatabase();
      } catch (err) {
        console.error('Failed to sync updated user to backend database:', err);
      }
    }

    return updatedUser;
  }

 
  async deleteUser(userId: string): Promise<void> {
    if (userId === 'usr_admin_01' || userId === '1') {
      alert('System Administrator account is protected and cannot be deleted.');
      return;
    }


    this._users.update((list) => list.filter((u) => u.id !== userId));

 
    if (this.isBrowser) {
      try {
        await safeFetch(`/api/users/${userId}`, { method: 'DELETE' });
        await this.loadUsersFromDatabase();
      } catch (err) {
        console.error('Failed to delete user from backend database:', err);
      }
    }
  }
}

