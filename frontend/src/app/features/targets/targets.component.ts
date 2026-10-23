import { Component, OnInit, signal, computed, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TelecallerTargetService, TelecallerTarget, TargetProgressStatus } from '../../core/services/telecaller-target.service';
import { LeadTelecallingService } from '../../core/services/lead-telecalling.service';
import { UserManagementService } from '../../core/services/user-management.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-targets',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './targets.component.html',
  styleUrl: './targets.component.scss',
})
export class TargetsComponent implements OnInit {
  @Input() embedded = false;

  readonly targetService = inject(TelecallerTargetService);
  readonly leadService = inject(LeadTelecallingService);
  readonly userService = inject(UserManagementService);
  readonly authService = inject(AuthService);
  readonly notifService = inject(NotificationService);

  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<string>('ALL');


  readonly isEditModalOpen = signal<boolean>(false);
  readonly editingTelecallerId = signal<string | null>(null);
  readonly editingTelecallerName = signal<string>('');
  readonly editingTelecallerEmail = signal<string>('');
  readonly isSaving = signal<boolean>(false);
  readonly saveError = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);

  targetInputCalls = 30;
  targetInputInterested = 5;

  readonly isEvaluating = signal<boolean>(false);
  readonly evaluationError = signal<string | null>(null);
  readonly lastEvaluationSummary = signal<{ alertedCount: number; deficitTelecallers: string[] } | null>(null);

  readonly isManagerOrAdmin = computed(() => {
    const role = this.authService.currentUser()?.role;
    return role === 'ADMINISTRATOR' || role === 'MARKETING_MANAGER';
  });


  readonly telecallerProgressList = computed<TargetProgressStatus[]>(() => {
    const users = this.userService.users();
    const telecallers = users.filter((u) => u.role === 'TELECALLER' && u.isActive);
    const allCalls = this.leadService.calls();
    const today = new Date();

    const telecallerList = telecallers.length > 0 ? telecallers : [
      ];

    return telecallerList.map((tc) => {
      const target = this.targetService.getTargetForTelecaller(tc.id);

      const todayCalls = allCalls.filter((c) => {
        const isCaller = c.telecallerId === tc.id || c.telecallerName === tc.fullName;
        const calledAt = c.calledAt ? new Date(c.calledAt) : null;
        const isToday =
          calledAt?.getFullYear() === today.getFullYear() &&
          calledAt?.getMonth() === today.getMonth() &&
          calledAt?.getDate() === today.getDate();
        return isCaller && isToday;
      });

      const uniqueLeadsCalledToday = new Set(
        todayCalls
          .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
          .filter((k) => !!k)
      );
      const callsCompletedToday = uniqueLeadsCalledToday.size;

      const uniqueInterestedToday = new Set(
        todayCalls
          .filter((c) => c.outcome === 'INTERESTED' || c.outcome === 'PAID' || c.outcome === 'QUALIFIED')
          .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
          .filter((k) => !!k)
      );
      const interestedCompletedToday = uniqueInterestedToday.size;

      const callsAchievementPct = Math.min(100, Math.round((callsCompletedToday / target.dailyCallsTarget) * 100));

      let status: 'ACHIEVED' | 'ON_TRACK' | 'BEHIND_TARGET' | 'CRITICAL_DEFICIT' = 'BEHIND_TARGET';

      if (callsCompletedToday >= target.dailyCallsTarget) {
        status = 'ACHIEVED';
      } else if (callsAchievementPct >= 70) {
        status = 'ON_TRACK';
      } else if (callsAchievementPct >= 40) {
        status = 'BEHIND_TARGET';
      } else {
        status = 'CRITICAL_DEFICIT';
      }

      return {
        telecallerId: tc.id,
        telecallerName: tc.fullName,
        telecallerEmail: tc.email,
        department: tc['department'] || 'Telecalling Operations',
        dailyCallsTarget: target.dailyCallsTarget,
        callsCompletedToday,
        callsAchievementPct,
        dailyInterestedTarget: target.dailyInterestedTarget,
        interestedCompletedToday,
        status,
        lastEvaluatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    });
  });

 
  readonly myTargetProgress = computed(() => {
    const list = this.telecallerProgressList();
    const user = this.authService.currentUser();
    if (!user) return null;
    return list.find(
      (item) =>
        String(item.telecallerId) === String(user.id) ||
        item.telecallerEmail?.toLowerCase() === user.email?.toLowerCase(),
    ) || null;
  });

  readonly filteredProgressList = computed(() => {
    let list = this.telecallerProgressList();
    const user = this.authService.currentUser();

    if (!this.isManagerOrAdmin()) {
      if (!user) return [];
      const userId = String(user.id || '').trim();
      const userEmail = String(user.email || '').toLowerCase().trim();
      list = list.filter((item) => {
        const itemId = String(item.telecallerId || '').trim();
        const itemEmail = String(item.telecallerEmail || '').toLowerCase().trim();
        return (userId && itemId === userId) || (userEmail && itemEmail === userEmail);
      });
    }

    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.statusFilter();

    return list.filter((item) => {
      const matchesSearch =
        !query ||
        item.telecallerName.toLowerCase().includes(query) ||
        item.telecallerEmail.toLowerCase().includes(query) ||
        item.department.toLowerCase().includes(query);

      let matchesStatus = true;
      if (filter !== 'ALL') {
        matchesStatus = filter === 'BEHIND_TARGET'
          ? item.status === 'BEHIND_TARGET' || item.status === 'CRITICAL_DEFICIT'
          : item.status === filter;
      }

      return matchesSearch && matchesStatus;
    });
  });

  readonly summaryKpis = computed(() => {
    const list = this.telecallerProgressList();
    const total = list.length;
    const achieved = list.filter((item) => item.status === 'ACHIEVED').length;
    const onTrack = list.filter((item) => item.status === 'ON_TRACK').length;
    const behind = list.filter((item) => item.status === 'BEHIND_TARGET' || item.status === 'CRITICAL_DEFICIT').length;

    const avgAchievement = total > 0 ? Math.round(list.reduce((acc, curr) => acc + curr.callsAchievementPct, 0) / total) : 0;

    return {
      totalTelecallers: total,
      achievedCount: achieved,
      onTrackCount: onTrack,
      deficitCount: behind,
      overallComplianceRatePct: avgAchievement,
    };
  });

  ngOnInit(): void {
    this.leadService.loadCalls().subscribe();
    this.userService.loadUsersFromDatabase();
    this.targetService.loadTargets().catch((error: unknown) => {
      this.loadError.set(error instanceof Error ? error.message : 'Unable to load telecaller targets.');
    });
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  readonly editingItem = signal<TargetProgressStatus | null>(null);

  setFilter(filter: string): void {
    this.statusFilter.set(filter);
  }

  setPreset(calls: number): void {
    this.targetInputCalls = calls;
    this.targetInputInterested = Math.max(2, Math.round(calls * 0.15));
  }

  openCommonModal(): void {
    this.saveError.set(null);
    this.editingItem.set(null);
    const common = this.targetService.commonTarget();
    this.targetInputCalls = common.dailyCallsTarget;
    this.targetInputInterested = common.dailyInterestedTarget;
    this.isEditModalOpen.set(true);
  }

  openEditModal(item?: TargetProgressStatus): void {
    this.saveError.set(null);
    if (item) {
      this.editingItem.set(item);
      this.targetInputCalls = item.dailyCallsTarget;
      this.targetInputInterested = item.dailyInterestedTarget;
      this.isEditModalOpen.set(true);
    } else {
      this.openCommonModal();
    }
  }

  closeEditModal(): void {
    this.isEditModalOpen.set(false);
    this.editingItem.set(null);
  }

  async saveTarget(): Promise<void> {
    const dailyCallsTarget = Number(this.targetInputCalls);
    const dailyInterestedTarget = Number(this.targetInputInterested);
    if (!Number.isInteger(dailyCallsTarget) || dailyCallsTarget < 1 || dailyCallsTarget > 300) {
      this.saveError.set('Daily calls target must be a whole number from 1 to 300.');
      return;
    }
    if (!Number.isInteger(dailyInterestedTarget) || dailyInterestedTarget < 0 || dailyInterestedTarget > 50) {
      this.saveError.set('Daily interested leads target must be a whole number from 0 to 50.');
      return;
    }

    this.isSaving.set(true);
    this.saveError.set(null);
    const item = this.editingItem();
    try {
      if (item && item.telecallerId) {
        await this.targetService.setTarget(
          item.telecallerId,
          dailyCallsTarget,
          dailyInterestedTarget,
          item.telecallerName,
          item.telecallerEmail
        );
      } else {
        await this.targetService.setCommonTarget(dailyCallsTarget, dailyInterestedTarget);
      }
      this.closeEditModal();
    } catch (error: unknown) {
      this.saveError.set(error instanceof Error ? error.message : 'Unable to save the target.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async runTargetComplianceCheck(): Promise<void> {
    this.isEvaluating.set(true);
    this.evaluationError.set(null);
    try {
      const calls = this.leadService.calls();
      const users = this.userService.users();
      const res = await this.targetService.evaluateTargetsAndBroadcastNotifications(calls, users);
      this.lastEvaluationSummary.set({
        alertedCount: res.alertedCount,
        deficitTelecallers: res.deficitTelecallers,
      });
    } catch (error: unknown) {
      this.evaluationError.set(error instanceof Error ? error.message : 'Unable to check target compliance.');
    } finally {
      this.isEvaluating.set(false);
    }
  }
}
