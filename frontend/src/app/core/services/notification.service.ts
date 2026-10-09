import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth.service';
import { TaskManagementService } from './task-management.service';
import { LeadTelecallingService } from './lead-telecalling.service';
import { PackageService } from './package.service';
import { Task } from '../models/task.model';
import { FIXED_PACKAGES } from '../models/package.model';
import { safeFetch, getBackendBaseUrl } from '../utils/api-url.utils';

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
  isRead: boolean;
  createdAt: string;
  targetRoute?: string;
  link?: string;
}

export function cleanNotificationText(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/\.trim\(\)/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2300}-\u{23FF}\u{2B50}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeNotification(item: NotificationItem): NotificationItem {
  return {
    ...item,
    title: cleanNotificationText(item.title),
    message: cleanNotificationText(item.message),
  };
}

export const TELECALLING_PACKAGE_TARGET_ROUTE =
  '/package-works?package=CAREERMATE&workspace=CURRENT-AFFAIR-PACKAGE&dept=TELECALLING&tab=TELECALLER_MEMBERS';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly taskService = inject(TaskManagementService);
  private readonly leadService = inject(LeadTelecallingService);
  private readonly packageService = inject(PackageService);
  private socket: Socket | null = null;

  readonly notifications = signal<NotificationItem[]>([]);
  readonly activeToast = signal<NotificationItem | null>(null);
  readonly unreadCount = computed(() => this.notifications().filter((n) => !n.isRead).length);

  constructor() {
    if (this.isBrowser) {
      void this.initializeNotifications();
    }
  }

  private async initializeNotifications(): Promise<void> {
    try {
      if (!(await this.authService.ensureInitialized())) return;
      await this.loadNotifications();
      this.initRealtimeSocket();
    } catch (error) {
      console.error('[NotificationService] Failed to initialize notifications:', error);
    }
  }

  private initRealtimeSocket(): void {
    try {
      const currentUser = this.authService.currentUser();
      const token = this.authService.accessToken();
      if (!currentUser || !token) return;
      const backendUrl = getBackendBaseUrl();
      this.socket = io(backendUrl, {
        auth: {
          token,
          userId: currentUser.id,
          role: currentUser.role,
          email: currentUser.email,
          fullName: currentUser.fullName,
        },
        transports: ['polling', 'websocket'],
        reconnectionAttempts: 5,
        timeout: 10000,
      });

      this.socket.on('connect_error', (error) => {
        console.error('[NotificationService] Realtime connection failed:', error.message);
      });

      this.socket.on('notification:created', (rawNotif: NotificationItem) => {
        const notif = sanitizeNotification(rawNotif);
        const currentUserId = String(this.authService.currentUser()?.id ?? '').trim().toLowerCase();
        if (!currentUserId || String(notif.userId ?? '').trim().toLowerCase() !== currentUserId) return;

        this.notifications.update((list) => {
          if (list.some((item) => String(item.id) === String(notif.id))) return list;
          return [notif, ...list];
        });
        if (!notif.isRead) this.triggerToast(notif);
      });

      const syncOnTaskEvent = () => {
        this.loadNotifications();
      };
      this.socket.on('task:assigned', syncOnTaskEvent);
      this.socket.on('task:in_progress', syncOnTaskEvent);
      this.socket.on('task:submitted', syncOnTaskEvent);
      this.socket.on('task:approved', syncOnTaskEvent);
      this.socket.on('task:redesign_required', syncOnTaskEvent);
      this.socket.on('task:revision_required', syncOnTaskEvent);
      this.socket.on('task:updated', syncOnTaskEvent);
      this.socket.on('task:comment', syncOnTaskEvent);
      this.socket.on('lead:assigned', syncOnTaskEvent);
      this.socket.on('lead:created', syncOnTaskEvent);
      this.socket.on('lead:status_changed', syncOnTaskEvent);
      this.socket.on('call:completed', syncOnTaskEvent);
      this.socket.on('leads:batch_imported', syncOnTaskEvent);
      this.socket.on('telecaller_target:updated', syncOnTaskEvent);
    } catch (e) {
      console.log('[NotificationService] Socket.IO connection notice:', e);
    }
  }

  triggerToast(notif: NotificationItem): void {
    this.activeToast.set(notif);
    setTimeout(() => {
      if (this.activeToast()?.id === notif.id) {
        this.activeToast.set(null);
      }
    }, 6000);
  }

  closeToast(): void {
    this.activeToast.set(null);
  }

  async loadNotifications(): Promise<void> {
    try {
      if (!this.authService.currentUser()) return;
      const res = await safeFetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          this.notifications.set(data.map(sanitizeNotification));
        }
      } else {
        console.error(`[NotificationService] Loading notifications failed (${res.status}).`);
      }
    } catch (err) {
      console.error('[NotificationService] Error loading notifications:', err);
    }
  }

  async markAsRead(id: string): Promise<void> {
    try {
      const res = await safeFetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}.`);
      this.notifications.update((list) =>
        list.map((notification) => (notification.id === id ? { ...notification, isRead: true } : notification))
      );
    } catch (err) {
      console.error('[NotificationService] Error marking notification read:', err);
    }
  }

  async markAllAsRead(): Promise<void> {
    try {
      const res = await safeFetch('/api/notifications/read-all', {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}.`);
      this.notifications.update((list) =>
        list.map((notification) => ({ ...notification, isRead: true }))
      );
    } catch (err) {
      console.error('[NotificationService] Error marking all notifications read:', err);
    }
  }

  getNotificationTargetRoute(notif: NotificationItem): string {
    const currentRole = this.authService.currentUser()?.role || '';
    const text = `${notif.title || ''} ${notif.message || ''}`.toLowerCase();


    let extractedProduct = '';
    let extractedPackage = '';

    const prodMatch = notif.message?.match(/Product:\s*([^->\r\n]+?)(?:\s*->|\s*Package:|\s*Total|$)/i) ||
                      notif.title?.match(/Product:\s*([^->\r\n]+?)(?:\s*->|\s*Package:|\s*Total|$)/i);
    if (prodMatch && prodMatch[1]) {
      extractedProduct = prodMatch[1].replace(/\.trim\(\)/g, '').trim();
    }

    const pkgMatch = notif.message?.match(/Package:\s*([^->\r\n]+?)(?:\s*->|\s*Total|\s*Assigned|$)/i) ||
                     notif.title?.match(/Package:\s*([^->\r\n]+?)(?:\s*->|\s*Total|\s*Assigned|$)/i);
    if (pkgMatch && pkgMatch[1]) {
      extractedPackage = pkgMatch[1].replace(/\.trim\(\)/g, '').trim();
    }


    if (extractedProduct) {
      const cleanP = extractedProduct.toLowerCase().trim();
      const matchedFixed = FIXED_PACKAGES.find(
        (fp) => fp.name.toLowerCase() === cleanP || fp.id.toLowerCase() === cleanP || cleanP.includes(fp.name.toLowerCase())
      );
      if (matchedFixed) {
        extractedProduct = matchedFixed.name;
      }
    }


    const isTelecallingOrTarget =
      currentRole === 'TELECALLER' ||
      text.includes('lead') ||
      text.includes('telecaller') ||
      text.includes('target deficit') ||
      text.includes('target achieved') ||
      text.includes('deficit warning') ||
      text.includes('daily target') ||
      text.includes('calls/day') ||
      text.includes('calls today') ||
      text.includes('daily calls') ||
      text.includes('target') ||
      text.includes('deficit') ||
      text.includes('quota') ||
      text.includes('milestone') ||
      text.includes('qualified') ||
      text.includes('interested') ||
      (notif.targetRoute && (notif.targetRoute.includes('/targets') || notif.targetRoute.includes('/telecalling') || notif.targetRoute.includes('/leads') || notif.targetRoute.includes('/calls') || notif.targetRoute.includes('/follow-ups') || notif.targetRoute.includes('/qualification') || notif.targetRoute.includes('dept=TELECALLING')));

    if (isTelecallingOrTarget) {
   
      let leadName = '';
      const leadTitleMatch = notif.title?.match(/Lead (?:Qualified|Assigned|Created|Interested):\s*(.+)$/i);
      if (leadTitleMatch && leadTitleMatch[1]) {
        leadName = leadTitleMatch[1].replace(/->/g, '').replace(/\.trim\(\)/g, '').replace(/["']/g, '').trim().toLowerCase();
      }
      if (!leadName) {
        const leadQuoteMatch = notif.message?.match(/"([^"]+)"/);
        if (leadQuoteMatch && leadQuoteMatch[1]) {
          leadName = leadQuoteMatch[1].replace(/\.trim\(\)/g, '').replace(/["']/g, '').trim().toLowerCase();
        }
      }

      if (leadName && !extractedPackage) {
        const allLeads = this.leadService.leads();
        const foundLead = allLeads.find((l) => {
          const fullName = `${l.firstName || ''} ${l.lastName || ''}`.trim().toLowerCase();
          return fullName === leadName || fullName.includes(leadName) || leadName.includes(fullName);
        });
        if (foundLead) {
          extractedPackage = (foundLead as any).packageName || (foundLead as any).package || foundLead.campaignName || '';
          if (!extractedProduct && (foundLead as any).productName) {
            extractedProduct = (foundLead as any).productName;
          }
        }
      }

      if (!extractedProduct && extractedPackage) {
        const allPkgs = this.packageService.packages();
        const foundPkg = allPkgs.find(
          (p) => String(p.name).toLowerCase().trim() === extractedPackage.toLowerCase().trim() || String(p.id) === extractedPackage
        );
        if (foundPkg && foundPkg.productId) {
          const prodObj = FIXED_PACKAGES.find((fp) => fp.id.toLowerCase() === foundPkg.productId.toLowerCase());
          if (prodObj) extractedProduct = prodObj.name;
        }
      }

      if (!extractedProduct) {
        const cleanPkg = (extractedPackage || text).toLowerCase();
        if (cleanPkg.includes('class')) extractedProduct = 'Classmate';
        else if (cleanPkg.includes('jesus') || cleanPkg.includes('messang') || cleanPkg.includes('messeng')) extractedProduct = 'Jesus the messanger';
        else extractedProduct = 'Careermate';
      }

      const prod = extractedProduct || 'Careermate';
      const pkg = extractedPackage || 'CURRENT AFFAIRS AUGUST -2026';

      if (currentRole === 'TELECALLER') {
        return `/package-works?package=${encodeURIComponent(prod)}&workspace=${encodeURIComponent(pkg)}&dept=TELECALLING&tab=TELECALLING`;
      }
      return `/package-works?package=${encodeURIComponent(prod)}&workspace=${encodeURIComponent(pkg)}&dept=TELECALLING&tab=TELECALLER_MEMBERS`;
    }

    let matchedTaskTitle = '';
    const titleMatch = notif.title?.match(/(?:Task Assigned|Task Approved|Redesign Requested|Work Started|Design Uploaded.*?|Design Submitted):\s*(.+)$/i);
    if (titleMatch && titleMatch[1]) {
      matchedTaskTitle = titleMatch[1].replace(/->/g, '').replace(/\.trim\(\)/g, '').trim();
    }
    if (!matchedTaskTitle && (currentRole === 'DESIGNER' || text.includes('creative') || text.includes('design') || text.includes('submission') || text.includes('redesign'))) {
      const quoteMatch = notif.message?.match(/"([^"]+)"/);
      if (quoteMatch && quoteMatch[1]) {
        matchedTaskTitle = quoteMatch[1].replace(/\.trim\(\)/g, '').trim();
      }
    }


    const allTasks = this.taskService.tasks();
    let matchedTask: Task | null = null;
    if (notif.targetRoute?.includes('taskId=')) {
      const tIdMatch = notif.targetRoute.match(/taskId=([0-9a-zA-Z_-]+)/);
      if (tIdMatch && tIdMatch[1]) {
        matchedTask = allTasks.find((t) => String(t.id) === tIdMatch[1]) || null;
      }
    }
    if (!matchedTask && matchedTaskTitle) {
      const normTitle = matchedTaskTitle.toLowerCase().trim();
      matchedTask = allTasks.find((t) => {
        const tNorm = (t.title || '').toLowerCase().trim();
        return tNorm === normTitle || tNorm.includes(normTitle) || normTitle.includes(tNorm);
      }) || null;
    }

    const isTaskNotif =
      currentRole === 'DESIGNER' ||
      !!matchedTask ||
      !!matchedTaskTitle ||
      text.includes('task') ||
      text.includes('creative') ||
      text.includes('design') ||
      text.includes('submission') ||
      text.includes('redesign');

    if (isTaskNotif) {
      const allPkgs = this.packageService.packages();
      let taskPkg = matchedTask?.packageName || extractedPackage || matchedTask?.title || matchedTaskTitle || 'Careermate';
      let taskProd = extractedProduct || '';

      if (!taskProd) {
        const foundPkg = allPkgs.find(
          (p) =>
            String(p.name).toLowerCase().trim() === String(taskPkg).toLowerCase().trim() ||
            String(p.id) === String(taskPkg)
        );

        if (foundPkg && foundPkg.productId) {
          const prodMatch = FIXED_PACKAGES.find((fp) => fp.id.toLowerCase() === foundPkg.productId.toLowerCase());
          if (prodMatch) taskProd = prodMatch.name;
        } else {
          const cleanPkg = taskPkg.toLowerCase();
          if (cleanPkg.includes('class')) taskProd = 'Classmate';
          else if (cleanPkg.includes('jesus') || cleanPkg.includes('messang') || cleanPkg.includes('messeng')) taskProd = 'Jesus the messanger';
          else taskProd = 'Careermate';
        }
      }

      const taskIdParam = matchedTask ? `&taskId=${matchedTask.id}` : '';
      return `/package-works?package=${encodeURIComponent(taskProd)}&workspace=${encodeURIComponent(taskPkg)}&dept=DESIGNER&tab=TASKS${taskIdParam}`;
    }

  
    if (
      text.includes('campaign') ||
      text.includes('ad ') ||
      text.includes('ads') ||
      text.includes('meta') ||
      text.includes('creative ad') ||
      text.includes('cpc') ||
      text.includes('ctr') ||
      (notif.targetRoute && (notif.targetRoute.includes('/campaigns') || notif.targetRoute.includes('/ads') || notif.targetRoute.includes('/ad-metrics')))
    ) {
      const prod = extractedProduct || 'Careermate';
      const pkg = extractedPackage || 'CURRENT AFFAIRS AUGUST -2026';
      return `/package-works?package=${encodeURIComponent(prod)}&workspace=${encodeURIComponent(pkg)}&dept=DIGITAL_MARKETING&tab=CAMPAIGNS`;
    }

    
    if (
      text.includes('transaction') ||
      text.includes('conversion') ||
      text.includes('revenue') ||
      text.includes('payment') ||
      text.includes('report') ||
      text.includes('performance') ||
      text.includes('audit')
    ) {
      const prod = extractedProduct || 'Careermate';
      const pkg = extractedPackage || 'CURRENT AFFAIRS AUGUST -2026';
      return `/package-works?package=${encodeURIComponent(prod)}&workspace=${encodeURIComponent(pkg)}&dept=ANALYTICS&tab=REPORTS`;
    }

    const defaultProd = extractedProduct || 'Careermate';
    const defaultPkg = extractedPackage || 'CURRENT AFFAIRS AUGUST -2026';
    return `/package-works?package=${encodeURIComponent(defaultProd)}&workspace=${encodeURIComponent(defaultPkg)}`;
  }

  handleNotificationClick(notif: NotificationItem): void {
    this.markAsRead(notif.id);
    this.closeToast();
    const route = this.getNotificationTargetRoute(notif);
    if (route) {
      const urlTree = this.router.parseUrl(route);
      const targetPath = '/' + urlTree.root.children['primary']?.segments.map((s) => s.path).join('/') || '/dashboard';
      this.router.navigate([targetPath], {
        queryParams: urlTree.queryParams,
      });
    }
  }
}
