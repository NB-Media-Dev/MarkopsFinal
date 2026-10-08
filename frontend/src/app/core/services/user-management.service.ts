import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ManagedUser, CreateUserRequest } from '../models/user-management.model';
import { UserRole } from '../models/auth.model';
import { safeFetch } from '../utils/api-url.utils';

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
  };

  private readonly _users = signal<ManagedUser[]>([this.PRIMARY_ADMIN]);

  readonly users = computed(() => this._users());
  readonly activeUsersCount = computed(() => this._users().filter((u) => u.isActive).length);
  readonly totalUsersCount = computed(() => this._users().length);

  constructor() {
    if (this.isBrowser) {
      try {
        localStorage.removeItem('markops_users_db_store');
      } catch {}
      this.loadUsersFromDatabase();
    }
  }

 
  async loadUsersFromDatabase(): Promise<void> {
    try {
      const res = await safeFetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this._users.set(data);
          return;
        }
      }
    } catch (err) {
      console.log('Database user sync check error:', err);
    }
  }


  async createUser(req: CreateUserRequest): Promise<ManagedUser> {
    const payload = {
      email: req.email.toLowerCase().trim(),
      fullName: req.fullName.trim(),
      role: req.role,
      department: req.department.trim() || 'General Operations',
      isActive: req.isActive !== undefined ? req.isActive : true,
      password: req.password,
    };

    let createdUser: ManagedUser = {
      id: `usr_${Math.random().toString(36).substring(2, 11)}`,
      email: payload.email,
      fullName: payload.fullName,
      role: payload.role,
      department: payload.department,
      isActive: payload.isActive,
      lastLoginAt: 'Never',
      createdAt: new Date().toISOString().split('T')[0],
    };

    if (this.isBrowser) {
      try {
        const res = await safeFetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          createdUser = {
            id: String(data.id || createdUser.id),
            email: data.email || createdUser.email,
            fullName: data.fullName || createdUser.fullName,
            role: data.role || createdUser.role,
            department: data.department || createdUser.department,
            isActive: data.isActive !== undefined ? Boolean(data.isActive) : createdUser.isActive,
            lastLoginAt: data.lastLoginAt || 'Never',
            createdAt: data.createdAt || createdUser.createdAt,
          };
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to create user (Status ${res.status})`);
        }
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
            fullName: updatedData.fullName ? updatedData.fullName.trim() : user.fullName,
            email: updatedData.email ? updatedData.email.toLowerCase().trim() : user.email,
            role: updatedData.role || user.role,
            department: updatedData.department ? updatedData.department.trim() : user.department,
            isActive: updatedData.isActive !== undefined ? updatedData.isActive : user.isActive,
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
          body: JSON.stringify({ ...(updatedUser as ManagedUser), password: updatedData.password }),
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

