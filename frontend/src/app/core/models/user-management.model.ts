import { UserRole } from './auth.model';

export interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  department: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface CreateUserRequest {
  fullName: string;
  email: string;
  role: UserRole;
  department: string;
  password?: string;
  isActive: boolean;
}

export interface RoleMetadata {
  code: UserRole;
  label: string;
  badgeClass: string;
  permissionsCount: number;
}

export const SYSTEM_ROLES_METADATA: RoleMetadata[] = [
  {
    code: 'ADMINISTRATOR',
    label: 'Administrator',
    badgeClass: 'role-admin',
    permissionsCount: 42,
  },
  /* {
    code: 'MARKETING_MANAGER',
    label: 'Marketing Manager',
    badgeClass: 'role-mktg',
    permissionsCount: 28,
  }, */
  {
    code: 'DIGITAL_MARKETING',
    label: 'Digital Marketing',
    badgeClass: 'role-digital',
    permissionsCount: 22,
  },
  {
    code: 'DESIGNER',
    label: 'Designer',
    badgeClass: 'role-designer',
    permissionsCount: 16,
  },
  {
    code: 'TELECALLER',
    label: 'Telecaller',
    badgeClass: 'role-telecaller',
    permissionsCount: 14,
  },
  {
    code: 'BDM',
    label: 'Business Development Manager',
    badgeClass: 'role-bdm',
    permissionsCount: 8,
  },
];
