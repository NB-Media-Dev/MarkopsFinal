import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NotificationService, NotificationItem } from '../../core/services/notification.service';

export type DateFilterType = 'ALL' | 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'CUSTOM';
export type StatusFilterType = 'ALL' | 'UNREAD' | 'TASKS' | 'REDESIGN' | 'APPROVED' | 'LEADS';

export interface NotificationDateGroup {
  label: string;
  icon: string;
  count: number;
  items: NotificationItem[];
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit {
  readonly notifService = inject(NotificationService);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  readonly selectedDateFilter = signal<DateFilterType>('ALL');
  readonly customDate = signal<string>('');
  readonly selectedStatusFilter = signal<StatusFilterType>('ALL');
  readonly searchQuery = signal<string>('');

  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigateByUrl('/dashboard');
    }
  }

  ngOnInit() {
    this.notifService.loadNotifications();
  }

  setDateFilter(filter: DateFilterType): void {
    this.selectedDateFilter.set(filter);
    if (filter !== 'CUSTOM') {
      this.customDate.set('');
    }
  }

  onCustomDateChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.customDate.set(val);
    if (val) {
      this.selectedDateFilter.set('CUSTOM');
    }
  }

  setStatusFilter(filter: StatusFilterType): void {
    this.selectedStatusFilter.set(filter);
  }

  onSearchChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery.set(val);
  }

  clearFilters(): void {
    this.selectedDateFilter.set('ALL');
    this.customDate.set('');
    this.selectedStatusFilter.set('ALL');
    this.searchQuery.set('');
  }

  readonly stats = computed(() => {
    const all = this.notifService.notifications();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const unread = all.filter((n) => !n.isRead).length;
    const today = all.filter((n) => new Date(n.createdAt).getTime() >= startOfToday).length;

    const tasks = all.filter((n) => {
      const text = `${n.title} ${n.message}`.toLowerCase();
      return text.includes('assigned') || text.includes('started') || (text.includes('task') && !text.includes('approved') && !text.includes('redesign'));
    }).length;

    const redesigns = all.filter((n) => {
      const text = `${n.title} ${n.message}`.toLowerCase();
      return text.includes('redesign') || text.includes('revision') || n.type === 'WARNING';
    }).length;

    const approved = all.filter((n) => {
      const text = `${n.title} ${n.message}`.toLowerCase();
      return text.includes('approved') || text.includes('completed') || n.type === 'SUCCESS';
    }).length;

    const leads = all.filter((n) => {
      const text = `${n.title} ${n.message}`.toLowerCase();
      return text.includes('lead') || text.includes('telecall') || text.includes('interest') || text.includes('qualif') || text.includes('target');
    }).length;

    return {
      total: all.length,
      unread,
      today,
      tasks,
      redesigns,
      approved,
      leads,
    };
  });

  readonly filteredNotifications = computed<NotificationItem[]>(() => {
    let list = this.notifService.notifications();
    const dateFilter = this.selectedDateFilter();
    const custom = this.customDate();
    const status = this.selectedStatusFilter();
    const q = this.searchQuery().trim().toLowerCase();

    if (status === 'UNREAD') {
      list = list.filter((n) => !n.isRead);
    } else if (status === 'TASKS') {
      list = list.filter((n) => {
        const text = `${n.title} ${n.message}`.toLowerCase();
        return text.includes('assigned') || text.includes('started') || (text.includes('task') && !text.includes('approved') && !text.includes('redesign'));
      });
    } else if (status === 'REDESIGN') {
      list = list.filter((n) => {
        const text = `${n.title} ${n.message}`.toLowerCase();
        return text.includes('redesign') || text.includes('revision') || n.type === 'WARNING';
      });
    } else if (status === 'APPROVED') {
      list = list.filter((n) => {
        const text = `${n.title} ${n.message}`.toLowerCase();
        return text.includes('approved') || text.includes('completed') || n.type === 'SUCCESS';
      });
    } else if (status === 'LEADS') {
      list = list.filter((n) => {
        const text = `${n.title} ${n.message}`.toLowerCase();
        return text.includes('lead') || text.includes('telecall') || text.includes('interest') || text.includes('qualif') || text.includes('target');
      });
    }

  
    if (q) {
      list = list.filter((n) =>
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.message && n.message.toLowerCase().includes(q))
      );
    }

   
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfWeek = startOfToday - 7 * 86400000;
    const startOfMonth = startOfToday - 30 * 86400000;

    if (dateFilter === 'TODAY') {
      list = list.filter((n) => new Date(n.createdAt).getTime() >= startOfToday);
    } else if (dateFilter === 'YESTERDAY') {
      list = list.filter((n) => {
        const t = new Date(n.createdAt).getTime();
        return t >= startOfYesterday && t < startOfToday;
      });
    } else if (dateFilter === 'WEEK') {
      list = list.filter((n) => new Date(n.createdAt).getTime() >= startOfWeek);
    } else if (dateFilter === 'MONTH') {
      list = list.filter((n) => new Date(n.createdAt).getTime() >= startOfMonth);
    } else if (dateFilter === 'CUSTOM' && custom) {
      list = list.filter((n) => {
        const itemDateStr = new Date(n.createdAt).toISOString().split('T')[0];
        return itemDateStr === custom;
      });
    }

    return list;
  });


  readonly groupedNotifications = computed<NotificationDateGroup[]>(() => {
    const list = this.filteredNotifications();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfWeek = startOfToday - 7 * 86400000;

    const todayItems: NotificationItem[] = [];
    const yesterdayItems: NotificationItem[] = [];
    const weekItems: NotificationItem[] = [];
    const earlierItems: NotificationItem[] = [];

    list.forEach((n) => {
      const t = new Date(n.createdAt).getTime();
      if (t >= startOfToday) {
        todayItems.push(n);
      } else if (t >= startOfYesterday) {
        yesterdayItems.push(n);
      } else if (t >= startOfWeek) {
        weekItems.push(n);
      } else {
        earlierItems.push(n);
      }
    });

    const groups: NotificationDateGroup[] = [];
    if (todayItems.length > 0) {
      groups.push({ label: 'Today', icon: 'today', count: todayItems.length, items: todayItems });
    }
    if (yesterdayItems.length > 0) {
      groups.push({ label: 'Yesterday', icon: 'history', count: yesterdayItems.length, items: yesterdayItems });
    }
    if (weekItems.length > 0) {
      groups.push({ label: 'This Week', icon: 'date_range', count: weekItems.length, items: weekItems });
    }
    if (earlierItems.length > 0) {
      groups.push({ label: 'Earlier', icon: 'calendar_month', count: earlierItems.length, items: earlierItems });
    }

    return groups;
  });

  cleanTitle(title: string): string {
    if (!title) return '';
    return title
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2300}-\u{23FF}\u{2B50}\u{200D}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getNotificationIcon(item: NotificationItem): string {
    const t = `${item.title || ''} ${item.message || ''}`.toLowerCase();
    if (item.type === 'SUCCESS' || t.includes('approved') || t.includes('complet')) return 'check_circle';
    if (item.type === 'WARNING' || t.includes('redesign') || t.includes('revision')) return 'draw';
    if (t.includes('started') || t.includes('progress')) return 'pending_actions';
    if (t.includes('assigned') || t.includes('task')) return 'assignment';
    if (item.type === 'ALERT' || t.includes('deficit') || t.includes('target')) return 'notification_important';
    return 'notifications';
  }

  getNotificationTypeClass(item: NotificationItem): string {
    const t = `${item.title || ''} ${item.message || ''}`.toLowerCase();
    if (item.type === 'SUCCESS' || t.includes('approved') || t.includes('complet')) return 'type-success';
    if (item.type === 'WARNING' || t.includes('redesign') || t.includes('revision')) return 'type-warning';
    if (item.type === 'ALERT' || t.includes('deficit') || t.includes('target')) return 'type-alert';
    return 'type-info';
  }

  formatNotificationTime(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24 && date.getDate() === now.getDate()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' • ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  }

  onNotificationClick(item: NotificationItem): void {
    this.notifService.handleNotificationClick(item);
  }

  toggleRead(event: MouseEvent, item: NotificationItem): void {
    event.stopPropagation();
    if (!item.isRead) {
      this.notifService.markAsRead(item.id);
    }
  }
}
