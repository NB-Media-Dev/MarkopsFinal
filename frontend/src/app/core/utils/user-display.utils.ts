import { getApiUrl } from './api-url.utils';

export function getUserInitials(name?: string, fallback = 'D'): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  const last = parts.at(-1);
  return (parts[0][0] + (last ? last[0] : '')).toUpperCase();
}

export function getUserAvatarUrl(avatarUrl?: string): string {
  if (!avatarUrl) return '';
  return getApiUrl(avatarUrl);
}

