export type UserRole =
  | 'ADMINISTRATOR'
  | 'MARKETING_MANAGER'
  | 'DIGITAL_MARKETING'
  | 'DESIGNER'
  | 'TELECALLER'
  | 'BDM';

export interface UserPermission {
  id: string;
  name: string;
  code: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string;
  department?: string;
  isActive: boolean;
  lastLoginAt?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: User;
  permissions: string[];
  expiresIn: number;
}
