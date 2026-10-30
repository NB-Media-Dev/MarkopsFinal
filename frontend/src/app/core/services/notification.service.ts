function extractBetween(text: string | null | undefined, prefix: string, terminators: string[]): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const pLower = prefix.toLowerCase();
  const idx = lower.indexOf(pLower);
  if (idx === -1) return '';
  let sub = text.slice(idx + prefix.length);
  for (const term of terminators) {
    const tIdx = sub.toLowerCase().indexOf(term.toLowerCase());
    if (tIdx !== -1) {
      sub = sub.slice(0, tIdx);
    }
  }
  return sub.replaceAll('.trim()', '').trim();
}

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
import { safeFetch, getBackendBaseUrl, getAuthToken } from '../utils/api-url.utils';

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
    .replaceAll('.trim()', '')
    .replace(/\u{2B50}\u{FE0F}?/gu, '').replace(/[\u{1F300}-\u{1FAFF}\u{200D}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '')
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
      setTimeout(() => { void this.initializeNotifications(); }, 0);
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
      const token = this.authService.accessToken() || getAuthToken();
      if (!currentUser && !token) return;
      const backendUrl = getBackendBaseUrl();
      this.socket = io(backendUrl, {
        auth: {
          token: token || undefined,
          userId: currentUser?.id,
          role: currentUser?.role,
          email: currentUser?.email,
          fullName: currentUser?.fullName,
        },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        timeout: 10000,
      });

      this.socket.on('connect_error', (error) => {
        console.warn('[NotificationService] Realtime connection notice:', error.message);
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

  private extractNotificationProductAndPackage(notif: NotificationItem): { product: string; pkg: string } {
    let extractedProduct = '';
    let extractedPackage = '';

    const prodMatch = (notif.message && /Product:\s*([^>\r\n-]+)/i.exec(notif.message)) ||
                      (notif.title && /Product:\s*([^>\r\n-]+)/i.exec(notif.title));
    if (prodMatch?.[1]) {
      extractedProduct = prodMatch[1].replace(/package:.*$/i, '').replace(/total.*$/i, '').replaceAll('.trim()', '').trim();
    }

    const pkgMatch = (notif.message && /Package:\s*([^>\r\n-]+)/i.exec(notif.message)) ||
                     (notif.title && /Package:\s*([^>\r\n-]+)/i.exec(notif.title));
    if (pkgMatch?.[1]) {
      extractedPackage = pkgMatch[1].replace(/total.*$/i, '').replace(/assigned.*$/i, '').replaceAll('.trim()', '').trim();
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

    return { product: extractedProduct, pkg: extractedPackage };
  }

  private isTelecallingNotification(notif: NotificationItem, text: string, currentRole: string): boolean {
    return (
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
      Boolean(notif.targetRoute && (notif.targetRoute.includes('/targets') || notif.targetRoute.includes('/telecalling') || notif.targetRoute.includes('/leads') || notif.targetRoute.includes('/calls') || notif.targetRoute.includes('/follow-ups') || notif.targetRoute.includes('/qualification') || notif.targetRoute.includes('dept=TELECALLING')))
    );
  }

  private extractLeadName(notif: NotificationItem): string {
    if (notif.title) {
      const leadTitleMatch = /Lead (?:Qualified|Assigned|Created|Interested):\s*([^\r\n]+)/i.exec(notif.title);
      if (leadTitleMatch?.[1]) {
        return leadTitleMatch[1].replaceAll('->', '').replaceAll('.trim()', '').replaceAll('"', '').replaceAll("'", '').trim().toLowerCase();
      }
    }
    if (notif.message) {
      const leadQuoteMatch = /"([^"]+)"/.exec(notif.message);
      if (leadQuoteMatch?.[1]) {
        return leadQuoteMatch[1].replaceAll('.trim()', '').replaceAll('"', '').replaceAll("'", '').trim().toLowerCase();
      }
    }
    return '';
  }

  private resolveLeadPackageAndProduct(leadName: string): { pkg: string; prod: string } {
    const foundLead = this.leadService.leads().find((l) => {
      const fullName = `${l.firstName || ''} ${l.lastName || ''}`.trim().toLowerCase();
      return fullName === leadName || fullName.includes(leadName) || leadName.includes(fullName);
    });
    if (!foundLead) return { pkg: '', prod: '' };
    return {
      pkg: (foundLead as any).packageName || (foundLead as any).package || foundLead.campaignName || '',
      prod: (foundLead as any).productName || '',
    };
  }

  private resolveFallbackProduct(pkg: string, text: string): string {
    if (pkg) {
      const foundPkg = this.packageService.packages().find(
        (p) => String(p.name).toLowerCase().trim() === pkg.toLowerCase().trim() || String(p.id) === pkg
      );
      if (foundPkg?.productId) {
        const prodObj = FIXED_PACKAGES.find((fp) => fp.id.toLowerCase() === foundPkg.productId!.toLowerCase());
        if (prodObj) return prodObj.name;
      }
    }
    const cleanPkg = (pkg || text).toLowerCase();
    if (cleanPkg.includes('class')) return 'Classmate';
    if (cleanPkg.includes('jesus') || cleanPkg.includes('messang') || cleanPkg.includes('messeng')) return 'Jesus the messanger';
    return 'Careermate';
  }

  private resolveTelecallingRoute(
    notif: NotificationItem,
    text: string,
    currentRole: string,
    extractedProduct: string,
    extractedPackage: string
  ): string {
    let pkg = extractedPackage;
    let prod = extractedProduct;

    const leadName = this.extractLeadName(notif);
    if (leadName && !pkg) {
      const leadInfo = this.resolveLeadPackageAndProduct(leadName);
      pkg = leadInfo.pkg;
      if (!prod && leadInfo.prod) {
        prod = leadInfo.prod;
      }
    }

    if (!prod) {
      prod = this.resolveFallbackProduct(pkg, text);
    }

    const finalProd = prod || 'Careermate';
    const finalPkg = pkg || 'CURRENT AFFAIRS AUGUST -2026';
    const tab = currentRole === 'TELECALLER' ? 'TELECALLING' : 'TELECALLER_MEMBERS';
    return `/package-works?package=${encodeURIComponent(finalProd)}&workspace=${encodeURIComponent(finalPkg)}&dept=TELECALLING&tab=${tab}`;
  }

  private extractTaskTitle(notif: NotificationItem, currentRole: string, text: string): string {
    if (notif.title) {
      const titleMatch = /(?:Task Assigned|Task Approved|Redesign Requested|Work Started|Design Uploaded|Design Submitted):\s*([^\r\n]+)/i.exec(notif.title);
      if (titleMatch?.[1]) {
        return titleMatch[1].replaceAll('->', '').replaceAll('.trim()', '').trim();
      }
    }
    const isDesignContext = currentRole === 'DESIGNER' || text.includes('creative') || text.includes('design') || text.includes('submission') || text.includes('redesign');
    if (isDesignContext && notif.message) {
      const quoteMatch = /"([^"]+)"/.exec(notif.message);
      if (quoteMatch?.[1]) {
        return quoteMatch[1].replaceAll('.trim()', '').trim();
      }
    }
    return '';
  }

  private findMatchingTask(notif: NotificationItem, matchedTaskTitle: string): Task | null {
    const allTasks = this.taskService.tasks();
    if (notif.targetRoute?.includes('taskId=')) {
      const tIdMatch = /taskId=([0-9a-zA-Z_-]+)/.exec(notif.targetRoute);
      if (tIdMatch?.[1]) {
        const found = allTasks.find((t) => String(t.id) === tIdMatch[1]);
        if (found) return found;
      }
    }
    if (matchedTaskTitle) {
      const normTitle = matchedTaskTitle.toLowerCase().trim();
      return allTasks.find((t) => {
        const tNorm = (t.title || '').toLowerCase().trim();
        return tNorm === normTitle || tNorm.includes(normTitle) || normTitle.includes(tNorm);
      }) || null;
    }
    return null;
  }

  private resolveTaskNotificationRoute(
    notif: NotificationItem,
    text: string,
    currentRole: string,
    extractedProduct: string,
    extractedPackage: string
  ): string | null {
    const matchedTaskTitle = this.extractTaskTitle(notif, currentRole, text);
    const matchedTask = this.findMatchingTask(notif, matchedTaskTitle);

    const isTaskNotif =
      currentRole === 'DESIGNER' ||
      Boolean(matchedTask) ||
      Boolean(matchedTaskTitle) ||
      text.includes('task') ||
      text.includes('creative') ||
      text.includes('design') ||
      text.includes('submission') ||
      text.includes('redesign');

    if (!isTaskNotif) return null;

    const allPkgs = this.packageService.packages();
    let taskPkg = matchedTask?.packageName || extractedPackage || matchedTask?.title || matchedTaskTitle || 'Careermate';
    let taskProd = extractedProduct || '';

    if (!taskProd) {
      const foundPkg = allPkgs.find(
        (p) =>
          String(p.name).toLowerCase().trim() === String(taskPkg).toLowerCase().trim() ||
          String(p.id) === String(taskPkg)
      );

      if (foundPkg?.productId) {
        const prodMatch = FIXED_PACKAGES.find((fp) => fp.id.toLowerCase() === foundPkg.productId!.toLowerCase());
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

  private resolveOtherNotificationRoute(
    notif: NotificationItem,
    text: string,
    extractedProduct: string,
    extractedPackage: string
  ): string {
    const isCampaign =
      text.includes('campaign') ||
      text.includes('ad ') ||
      text.includes('ads') ||
      text.includes('meta') ||
      text.includes('creative ad') ||
      text.includes('cpc') ||
      text.includes('ctr') ||
      Boolean(notif.targetRoute && (notif.targetRoute.includes('/campaigns') || notif.targetRoute.includes('/ads') || notif.targetRoute.includes('/ad-metrics')));

    if (isCampaign) {
      const prod = extractedProduct || 'Careermate';
      const pkg = extractedPackage || 'CURRENT AFFAIRS AUGUST -2026';
      return `/package-works?package=${encodeURIComponent(prod)}&workspace=${encodeURIComponent(pkg)}&dept=DIGITAL_MARKETING&tab=CAMPAIGNS`;
    }

    const isAnalytics =
      text.includes('transaction') ||
      text.includes('conversion') ||
      text.includes('revenue') ||
      text.includes('payment') ||
      text.includes('report') ||
      text.includes('performance') ||
      text.includes('audit');

    if (isAnalytics) {
      const prod = extractedProduct || 'Careermate';
      const pkg = extractedPackage || 'CURRENT AFFAIRS AUGUST -2026';
      return `/package-works?package=${encodeURIComponent(prod)}&workspace=${encodeURIComponent(pkg)}&dept=ANALYTICS&tab=REPORTS`;
    }

    const defaultProd = extractedProduct || 'Careermate';
    const defaultPkg = extractedPackage || 'CURRENT AFFAIRS AUGUST -2026';
    return `/package-works?package=${encodeURIComponent(defaultProd)}&workspace=${encodeURIComponent(defaultPkg)}`;
  }

  getNotificationTargetRoute(notif: NotificationItem): string {
    const currentRole = this.authService.currentUser()?.role || '';
    const text = `${notif.title || ''} ${notif.message || ''}`.toLowerCase();
    const { product, pkg } = this.extractNotificationProductAndPackage(notif);

    if (this.isTelecallingNotification(notif, text, currentRole)) {
      return this.resolveTelecallingRoute(notif, text, currentRole, product, pkg);
    }

    const taskRoute = this.resolveTaskNotificationRoute(notif, text, currentRole, product, pkg);
    if (taskRoute) {
      return taskRoute;
    }

    return this.resolveOtherNotificationRoute(notif, text, product, pkg);
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
