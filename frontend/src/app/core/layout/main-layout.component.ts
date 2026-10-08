import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/auth.model';
import { SYSTEM_ROLES_METADATA } from '../models/user-management.model';

export interface NavMenuItem {
  label: string;
  route: string;
  icon: string;
  badge?: string;
  badgeType?: string;
}

export const ROLE_SIDEBAR_MENU: Record<string, NavMenuItem[]> = {
  ADMINISTRATOR: [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Targets', route: '/targets', icon: 'track_changes' },
    { label: 'Tasks', route: '/tasks', icon: 'task_alt' },
    { label: 'Designers', route: '/designers', icon: 'palette' },
    { label: 'Campaigns', route: '/campaigns', icon: 'campaign' },
    { label: 'Ads', route: '/ads', icon: 'ads_click' },
    { label: 'Leads', route: '/leads', icon: 'contacts' },
    { label: 'Telecalling', route: '/telecalling', icon: 'phone_in_talk' },
    { label: 'Transactions', route: '/transactions', icon: 'receipt_long' },
    { label: 'Reports', route: '/reports', icon: 'bar_chart' },
    { label: 'Users & Roles', route: '/users-roles', icon: 'manage_accounts', badge: 'Admin', badgeType: 'primary' },
    { label: 'Audit Logs', route: '/audit-logs', icon: 'history' },
    { label: 'Downloads', route: '/downloads', icon: 'download' },
    { label: 'Notifications', route: '/notifications', icon: 'notifications' },
  ],
  /* MARKETING_MANAGER: [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Targets', route: '/targets', icon: 'track_changes' },
    { label: 'Campaigns', route: '/campaigns', icon: 'campaign' },
    { label: 'Tasks', route: '/tasks', icon: 'task_alt' },
    { label: 'Leads', route: '/leads', icon: 'contacts' },
    { label: 'Reports', route: '/reports', icon: 'bar_chart' },
    { label: 'Performance', route: '/performance', icon: 'trending_up' },
    { label: 'Downloads', route: '/downloads', icon: 'download' },
  ], */
  DIGITAL_MARKETING: [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Package Works', route: '/package-works', icon: 'inventory_2' },
    { label: 'Leads', route: '/leads', icon: 'contacts' },
    { label: 'Campaigns', route: '/campaigns', icon: 'campaign' },
    { label: 'Ads', route: '/ads', icon: 'ads_click' },
    { label: 'Ad Metrics', route: '/ad-metrics', icon: 'query_stats' },
    { label: 'Lead Source', route: '/lead-source', icon: 'share' },
  ],
  DESIGNER: [
    { label: 'Own Tasks', route: '/designer-tasks', icon: 'task_alt' },
    { label: 'Submissions', route: '/submissions', icon: 'upload_file' },
    { label: 'Revisions', route: '/revisions', icon: 'edit_note' },
    { label: 'Comments', route: '/comments', icon: 'chat' },
    { label: 'Files', route: '/files', icon: 'folder' },
    { label: 'Achievements', route: '/achievements', icon: 'emoji_events', badge: 'Rewards', badgeType: 'warning' },
  ],
  TELECALLER: [
    { label: 'Assigned Leads', route: '/assigned-leads', icon: 'assignment_ind' },
    { label: 'Calls', route: '/calls', icon: 'phone_in_talk' },
    { label: 'Follow-ups', route: '/follow-ups', icon: 'event_repeat' },
    { label: 'Qualification', route: '/qualification', icon: 'verified' },
    { label: 'Outcomes', route: '/outcomes', icon: 'done_all' },
  ],
  BDM: [
    { label: 'Package Works', route: '/package-works', icon: 'inventory_2' },
    { label: 'Tasks', route: '/tasks', icon: 'task_alt' },
    { label: 'Analysis', route: '/performance', icon: 'analytics' },
    { label: 'Audit Logs', route: '/audit-logs', icon: 'history' },
    { label: 'Notifications', route: '/notifications', icon: 'notifications' },
  ],
};

import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  readonly authService = inject(AuthService);
  readonly notifService = inject(NotificationService);
  private readonly router = inject(Router);

  readonly isNotificationFlyoutOpen = signal<boolean>(false);

  readonly activeRole = computed<UserRole>(() => {
    return this.authService.currentUser()?.role || 'ADMINISTRATOR';
  });

  readonly roleDisplayLabel = computed<string>(() => {
    const role = this.activeRole();
    const meta = SYSTEM_ROLES_METADATA.find((r) => r.code === role);
    return meta ? meta.label : role;
  });

  readonly menuItems = computed<NavMenuItem[]>(() => {
    const role = this.activeRole();
    return ROLE_SIDEBAR_MENU[role] || ROLE_SIDEBAR_MENU['ADMINISTRATOR'] || [];
  });

  readonly userInitials = computed<string>(() => {
    const user = this.authService.currentUser();
    if (!user?.fullName) return 'SA';
    const parts = user.fullName.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (user.fullName.slice(0, 2) || 'SA').toUpperCase();
  });

  readonly roleAction = computed<{ link: string; label: string; icon: string } | null>(() => {
    const role = this.activeRole();
    switch (role) {
      case 'ADMINISTRATOR':
        return { link: '/users-roles', label: 'Manage Users', icon: 'person_add' };
      case 'DIGITAL_MARKETING':
        return { link: '/leads', label: 'Leads', icon: 'group_add' };
      case 'DESIGNER':
        return { link: '/package-works', label: 'Package Works', icon: 'draw' };
      case 'BDM':
        return { link: '/package-works', label: 'Create Task', icon: 'add_task' };
      case 'TELECALLER':
        return { link: '/telecalling', label: 'Start Calling', icon: 'call' };
      default:
        return null;
    }
  });

  readonly searchQuery = signal<string>('');

  onSearch(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.searchQuery.set(query);
  }

  toggleNotificationFlyout(): void {
    this.isNotificationFlyoutOpen.update((val) => !val);
  }

  closeNotificationFlyout(): void {
    this.isNotificationFlyoutOpen.set(false);
  }

  readonly notifFlyoutFilter = signal<'ALL' | 'UNREAD' | 'TODAY'>('ALL');

  readonly flyoutNotifications = computed(() => {
    let list = this.notifService.notifications();
    const user = this.authService.currentUser();
    const role = user?.role;
    const uId = String(user?.id || '').toLowerCase().trim();
    const uName = String(user?.fullName || '').toLowerCase().trim();
    const uEmail = String(user?.email || '').toLowerCase().trim();

    if (role === 'TELECALLER' || uName.includes('raj') || uId.includes('raj')) {
      list = list.filter((n) => {
        const titleLower = (n.title || '').toLowerCase();
     
        if (
          titleLower.includes('task approved') ||
          titleLower.includes('design uploaded') ||
          titleLower.includes('redesign') ||
          titleLower.includes('submission') ||
          titleLower.includes('creative design')
        ) {
          return false;
        }
        const nUid = String(n.userId || '').toLowerCase().trim();
        if (!nUid) return false;
        if (nUid === uId || nUid === uName || nUid === uEmail) return true;
        if ((uName.includes('raj') || uId.includes('raj')) && (nUid.includes('raj') || nUid === '6')) return true;
        if (n.targetRoute === '/telecalling' || titleLower.includes('lead')) return true;
        return false;
      });
    }

    const f = this.notifFlyoutFilter();
    if (f === 'UNREAD') {
      return list.filter((n) => !n.isRead);
    }
    if (f === 'TODAY') {
      const startOfToday = new Date().setHours(0, 0, 0, 0);
      return list.filter((n) => new Date(n.createdAt).getTime() >= startOfToday);
    }
    return list;
  });

  cleanTitle(title: string | undefined | null): string {
    if (!title) return '';
    return title
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2300}-\u{23FF}\u{2B50}\u{200D}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  setFlyoutFilter(f: 'ALL' | 'UNREAD' | 'TODAY'): void {
    this.notifFlyoutFilter.set(f);
  }

  onNotificationClick(item: any): void {
    this.closeNotificationFlyout();
    this.notifService.handleNotificationClick(item);
  }

  onToastClick(toast: any): void {
    this.notifService.handleNotificationClick(toast);
  }

  onToastClose(event: Event): void {
    event.stopPropagation();
    this.notifService.closeToast();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
