import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { NotificationService } from './notification.service';
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

@Injectable({
  providedIn: 'root',
})
export class TelecallerTargetService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly http = inject(HttpClient);
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

  constructor() {
    if (this.isBrowser) {
      try {
        localStorage.removeItem('markops_telecaller_targets_store');
        localStorage.removeItem('markops_common_telecaller_target');
      } catch {}
      this.loadTargets();
    }
  }

  async loadTargets(): Promise<void> {
    if (!this.isBrowser) return;
    try {
      const res = await safeFetch('/api/telecaller-targets');
      if (res.ok) {
        const data = await res.json();
        if (data) {
          if (data.common && typeof data.common.dailyCallsTarget === 'number') {
            this._commonTarget.set(data.common);
          }
          if (Array.isArray(data.targets)) {
            this._targets.set(data.targets);
            return;
          }
        }
      }
    } catch (err) {
      console.log('Error loading telecaller targets from backend:', err);
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
      id: `tgt_${telecallerId || Math.random().toString(36).substring(2, 9)}`,
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

  
  setCommonTarget(dailyCallsTarget: number, dailyInterestedTarget = 5): void {
    const currentUser = this.authService.currentUser();
    const updatedBy = currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'Marketing Manager';
    const callsTarget = Math.max(1, Number(dailyCallsTarget));
    const interestedTarget = Math.max(1, Number(dailyInterestedTarget));

    const updatedCommon: CommonTargetQuota = {
      dailyCallsTarget: callsTarget,
      dailyInterestedTarget: interestedTarget,
      dailyDurationTargetSeconds: callsTarget * 120,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };

    this._commonTarget.set(updatedCommon);
    this.syncTargetsWithCommon(callsTarget, interestedTarget, updatedBy);

    if (this.isBrowser) {
      safeFetch('/api/telecaller-targets/common', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedCommon),
      }).catch((e) => console.log('Error syncing target to backend:', e));
    }
  }

  
  setTarget(
    telecallerId: string,
    dailyCallsTarget: number,
    dailyInterestedTarget = 5,
    telecallerName?: string,
    telecallerEmail?: string
  ): void {
    const currentUser = this.authService.currentUser();
    const updatedBy = currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'Marketing Manager';
    const callsTarget = Math.max(1, Number(dailyCallsTarget));
    const interestedTarget = Math.max(1, Number(dailyInterestedTarget));

    const userTarget: TelecallerTarget = {
      id: `tgt_${telecallerId}_${Date.now()}`,
      telecallerId: String(telecallerId),
      telecallerName: telecallerName || 'Telecaller',
      telecallerEmail: telecallerEmail || '',
      dailyCallsTarget: callsTarget,
      dailyInterestedTarget: interestedTarget,
      dailyDurationTargetSeconds: callsTarget * 120,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };

    this._targets.update((list) => {
      const idx = list.findIndex((t) => String(t.telecallerId) === String(telecallerId));
      if (idx !== -1) {
        const next = [...list];
        next[idx] = { ...next[idx], ...userTarget };
        return next;
      }
      return [...list, userTarget];
    });

    if (this.isBrowser) {
      safeFetch(`/api/telecaller-targets/${telecallerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userTarget),
      }).catch((e) => console.log('Error saving individual target to backend:', e));
    }
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


  async evaluateTargetsAndBroadcastNotifications(
    callsList: any[],
    usersList: any[]
  ): Promise<{ evaluatedCount: number; alertedCount: number; deficitTelecallers: string[] }> {
    const todayStr = new Date().toISOString().split('T')[0];
    const telecallers = usersList.filter((u) => u.role === 'TELECALLER');
    const telecallerList = telecallers.length > 0 ? telecallers : [];

    const deficitTelecallers: string[] = [];
    const common = this._commonTarget();

    const adminUser = usersList.find((u) => u.role === 'ADMINISTRATOR') || { id: 'usr_admin_01' };
    const mktgManager = usersList.find((u) => u.role === 'MARKETING_MANAGER') || { id: 'usr_mktg_01' };

    for (const tc of telecallerList) {
      const todayCalls = callsList.filter((c) => {
        const isCaller = c.telecallerId === tc.id || c.telecallerName === tc.fullName;
        const isToday = c.calledAt && c.calledAt.startsWith(todayStr);
        return isCaller && isToday;
      });

   
      const uniqueLeadIds = new Set(
        todayCalls
          .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
          .filter((k) => !!k)
      );

      const callsCount = uniqueLeadIds.size;
      const achievementPct = Math.round((callsCount / common.dailyCallsTarget) * 100);

      if (callsCount < common.dailyCallsTarget) {
        deficitTelecallers.push(tc.fullName);

        const alertTitle = `Target Deficit Warning: ${tc.fullName}`;
        const alertMessage = `${tc.fullName} called ${callsCount} / ${common.dailyCallsTarget} unique leads today (${achievementPct}% target achievement). Standard common goal of ${common.dailyCallsTarget} leads/day missed!`;

        const targetsToNotify = Array.from(new Set([adminUser.id, mktgManager.id]));

        for (const recipientId of targetsToNotify) {
          try {
            await safeFetch('/api/notifications', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: recipientId,
                title: alertTitle,
                message: alertMessage,
                type: 'WARNING',
                targetRoute: '/package-works?package=CAREERMATE&workspace=CURRENT-AFFAIR-PACKAGE&dept=TELECALLING&tab=TELECALLER_MEMBERS',
              }),
            });
          } catch (err) {
            console.log('API notification call error:', err);
          }
        }
      } else {
       
        try {
        
          await safeFetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: tc.id,
              title: 'Target Achieved! Congratulations!',
              message: `Outstanding work, ${tc.fullName}! You have successfully achieved your daily target today (${callsCount} / ${common.dailyCallsTarget} calls, ${achievementPct}% achieved).`,
              type: 'SUCCESS',
              targetRoute: '/package-works?package=CAREERMATE&workspace=CURRENT-AFFAIR-PACKAGE&dept=TELECALLING&tab=TELECALLER_MEMBERS',
            }),
          });

      
          const targetsToNotify = Array.from(new Set([adminUser.id, mktgManager.id]));
          for (const recipientId of targetsToNotify) {
            await safeFetch('/api/notifications', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: recipientId,
                title: `Telecaller Target Achieved: ${tc.fullName}`,
                message: `${tc.fullName} has reached their daily target today with ${callsCount} calls (${achievementPct}% achieved)!`,
                type: 'SUCCESS',
                targetRoute: '/package-works?package=CAREERMATE&workspace=CURRENT-AFFAIR-PACKAGE&dept=TELECALLING&tab=TELECALLER_MEMBERS',
              }),
            });
          }
        } catch (err) {
          console.log('API target achieved notification notice:', err);
        }
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
