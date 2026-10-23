import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NotificationService, TELECALLING_PACKAGE_TARGET_ROUTE } from './notification.service';
import { AuthService } from './auth.service';
import { safeFetch } from '../utils/api-url.utils';

export interface CommonTargetQuota {
  dailyCallsTarget: number;
  dailyInterestedTarget: number;
  dailyDurationTargetSeconds: number;
  updatedBy: string;
  updatedAt: string;
}

export interface TelecallerTarget {
  id: string;
  telecallerId: string;
  telecallerName: string;
  telecallerEmail: string;
  dailyCallsTarget: number;
  dailyInterestedTarget: number;
  dailyDurationTargetSeconds: number;
  updatedBy: string;
  updatedAt: string;
}

export interface TargetProgressStatus {
  telecallerId: string;
  telecallerName: string;
  telecallerEmail: string;
  department: string;
  dailyCallsTarget: number;
  callsCompletedToday: number;
  callsAchievementPct: number;
  dailyInterestedTarget: number;
  interestedCompletedToday: number;
  status: 'ACHIEVED' | 'ON_TRACK' | 'BEHIND_TARGET' | 'CRITICAL_DEFICIT';
  lastEvaluatedAt: string;
}

function isCallTodayForTelecaller(c: any, tc: any, today: Date): boolean {
  const isCaller = c.telecallerId === tc.id || c.telecallerName === tc.fullName;
  if (!isCaller) return false;
  const calledAt = c.calledAt ? new Date(c.calledAt) : null;
  return (
    calledAt?.getFullYear() === today.getFullYear() &&
    calledAt?.getMonth() === today.getMonth() &&
    calledAt?.getDate() === today.getDate()
  );
}

function countUniqueLeadsCalledToday(callsList: any[], tc: any, today: Date): number {
  const uniqueLeadIds = new Set(
    callsList
      .filter((c) => isCallTodayForTelecaller(c, tc, today))
      .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
      .filter((k) => !!k)
  );
  return uniqueLeadIds.size;
}

@Injectable({
  providedIn: 'root',
})
export class TelecallerTargetService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly notifService = inject(NotificationService);
  private readonly authService = inject(AuthService);

  private readonly DEFAULT_COMMON_TARGET: CommonTargetQuota = {
    dailyCallsTarget: 30,
    dailyInterestedTarget: 5,
    dailyDurationTargetSeconds: 3600,
    updatedBy: 'Marketing Manager',
    updatedAt: new Date().toISOString(),
  };

  private readonly DEFAULT_TARGETS: TelecallerTarget[] = [];

  private readonly _commonTarget = signal<CommonTargetQuota>(this.DEFAULT_COMMON_TARGET);
  private readonly _targets = signal<TelecallerTarget[]>(this.DEFAULT_TARGETS);

  readonly commonTarget = computed(() => this._commonTarget());
  readonly targets = computed(() => this._targets());

  private async sendNotification(
    userId: string | number,
    title: string,
    message: string,
    type: 'WARNING' | 'SUCCESS'
  ): Promise<void> {
    const response = await safeFetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        title,
        message,
        type,
        targetRoute: TELECALLING_PACKAGE_TARGET_ROUTE,
      }),
    });
    if (!response.ok) {
      throw new Error(`Notification delivery to user ${userId} failed (${response.status}): ${await response.text()}`);
    }
  }

  constructor() {
    if (this.isBrowser) {
      try {
        localStorage.removeItem('markops_telecaller_targets_store');
        localStorage.removeItem('markops_common_telecaller_target');
      } catch (err) { console.log('[Storage Notice]:', err); }
    }
  }

  async loadTargets(): Promise<void> {
    if (!this.isBrowser) return;
    try {
      const res = await safeFetch('/api/telecaller-targets');
      if (!res.ok) {
        throw new Error(`Unable to load telecaller targets (${res.status}): ${await res.text()}`);
      }
      const data = await res.json();
      if (!data?.common || !Array.isArray(data.targets)) {
        throw new Error('The telecaller targets response was invalid.');
      }
      this._commonTarget.set(data.common);
      this._targets.set(data.targets);
    } catch (err) {
      console.error('Error loading telecaller targets from backend:', err);
      throw err;
    }
  }

  getTargetForTelecaller(telecallerId: string): TelecallerTarget {
    const common = this._commonTarget();
    const list = this._targets();
    const match = list.find((t) => String(t.telecallerId) === String(telecallerId));

    if (match) {
      return match;
    }

    return {
      id: `tgt_${telecallerId}`,
      telecallerId,
      telecallerName: 'Telecaller',
      telecallerEmail: 'telecaller@markops.io',
      dailyCallsTarget: common.dailyCallsTarget,
      dailyInterestedTarget: common.dailyInterestedTarget,
      dailyDurationTargetSeconds: common.dailyCallsTarget * 120,
      updatedBy: common.updatedBy,
      updatedAt: common.updatedAt,
    };
  }

  
  async setCommonTarget(dailyCallsTarget: number, dailyInterestedTarget = 5): Promise<void> {
    const currentUser = this.authService.currentUser();
    const updatedBy = currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'Marketing Manager';
    const callsTarget = Math.max(1, Number(dailyCallsTarget));
    const interestedTarget = Math.max(0, Number(dailyInterestedTarget));

    const updatedCommon: CommonTargetQuota = {
      dailyCallsTarget: callsTarget,
      dailyInterestedTarget: interestedTarget,
      dailyDurationTargetSeconds: callsTarget * 120,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };

    if (this.isBrowser) {
      const response = await safeFetch('/api/telecaller-targets/common', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedCommon),
      });
      if (!response.ok) {
        throw new Error(`Unable to save common target (${response.status}): ${await response.text()}`);
      }
    }

    this._commonTarget.set(updatedCommon);
    this.syncTargetsWithCommon(callsTarget, interestedTarget, updatedBy);
  }

  
  async setTarget(
    telecallerId: string,
    dailyCallsTarget: number,
    dailyInterestedTarget = 5,
    telecallerName?: string,
    telecallerEmail?: string
  ): Promise<void> {
    const currentUser = this.authService.currentUser();
    const updatedBy = currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'Marketing Manager';
    const callsTarget = Math.max(1, Number(dailyCallsTarget));
    const interestedTarget = Math.max(0, Number(dailyInterestedTarget));

    const userTarget: TelecallerTarget = {
      id: `tgt_${telecallerId}`,
      telecallerId: String(telecallerId),
      telecallerName: telecallerName || 'Telecaller',
      telecallerEmail: telecallerEmail || '',
      dailyCallsTarget: callsTarget,
      dailyInterestedTarget: interestedTarget,
      dailyDurationTargetSeconds: callsTarget * 120,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };

    if (this.isBrowser) {
      const response = await safeFetch(`/api/telecaller-targets/${encodeURIComponent(telecallerId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userTarget),
      });
      if (!response.ok) {
        throw new Error(`Unable to save target (${response.status}): ${await response.text()}`);
      }
    }

    this._targets.update((list) => {
      const idx = list.findIndex((t) => String(t.telecallerId) === String(telecallerId));
      if (idx !== -1) {
        const next = [...list];
        next[idx] = { ...next[idx], ...userTarget };
        return next;
      }
      return [...list, userTarget];
    });
  }

  private syncTargetsWithCommon(callsTarget: number, interestedTarget: number, updatedBy?: string): void {
    const currentUser = this.authService.currentUser();
    const byName = updatedBy || (currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'Marketing Manager');

    this._targets.update((list) => {
      if (list.length === 0) return this.DEFAULT_TARGETS;
      return list.map((t) => ({
        ...t,
        dailyCallsTarget: callsTarget,
        dailyInterestedTarget: interestedTarget,
        dailyDurationTargetSeconds: callsTarget * 120,
        updatedBy: byName,
        updatedAt: new Date().toISOString(),
      }));
    });
  }


  private async notifyTargetDeficit(tc: any, callsCount: number, target: TelecallerTarget, achievementPct: number, recipients: string[]): Promise<void> {
    const alertTitle = `Target Deficit Warning: ${tc.fullName}`;
    const alertMessage = `${tc.fullName} called ${callsCount} / ${target.dailyCallsTarget} unique leads today (${achievementPct}% target achievement). Their daily call goal was missed.`;
    for (const recipientId of recipients) {
      try {
        await this.sendNotification(recipientId, alertTitle, alertMessage, 'WARNING');
      } catch (err) {
        console.error('API notification delivery failed:', err);
      }
    }
  }

  private async notifyTargetAchieved(tc: any, callsCount: number, target: TelecallerTarget, achievementPct: number, recipients: string[]): Promise<void> {
    try {
      await this.sendNotification(
        tc.id,
        'Target Achieved! Congratulations!',
        `Outstanding work, ${tc.fullName}! You have successfully achieved your daily target today (${callsCount} / ${target.dailyCallsTarget} calls, ${achievementPct}% achieved).`,
        'SUCCESS'
      );
    } catch (err) {
      console.error('Telecaller target notification delivery failed:', err);
    }
    for (const recipientId of recipients) {
      try {
        await this.sendNotification(
          recipientId,
          `Telecaller Target Achieved: ${tc.fullName}`,
          `${tc.fullName} has reached their daily target today with ${callsCount} calls (${achievementPct}% achieved)!`,
          'SUCCESS'
        );
      } catch (err) {
        console.error('Target achievement notification delivery failed:', err);
      }
    }
  }

  async evaluateTargetsAndBroadcastNotifications(
    callsList: any[],
    usersList: any[]
  ): Promise<{ evaluatedCount: number; alertedCount: number; deficitTelecallers: string[] }> {
    const today = new Date();
    const telecallerList = usersList.filter((u) => u.role === 'TELECALLER');
    const deficitTelecallers: string[] = [];

    const adminUser = usersList.find((u) => u.role === 'ADMINISTRATOR') || { id: 'usr_admin_01' };
    const mktgManager = usersList.find((u) => u.role === 'MARKETING_MANAGER') || { id: 'usr_mktg_01' };
    const managerRecipients = Array.from(new Set([adminUser.id, mktgManager.id]));

    for (const tc of telecallerList) {
      const target = this.getTargetForTelecaller(String(tc.id));
      const callsCount = countUniqueLeadsCalledToday(callsList, tc, today);
      const achievementPct = Math.round((callsCount / target.dailyCallsTarget) * 100);

      if (callsCount < target.dailyCallsTarget) {
        deficitTelecallers.push(tc.fullName);
        await this.notifyTargetDeficit(tc, callsCount, target, achievementPct, managerRecipients);
      } else {
        await this.notifyTargetAchieved(tc, callsCount, target, achievementPct, managerRecipients);
      }
    }

    await this.notifService.loadNotifications();

    return {
      evaluatedCount: telecallerList.length,
      alertedCount: deficitTelecallers.length,
      deficitTelecallers,
    };
  }
}
