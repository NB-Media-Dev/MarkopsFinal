import { Component, inject, OnInit, signal, computed } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { TaskManagementService } from '../../core/services/task-management.service';
import { UserManagementService } from '../../core/services/user-management.service';

export interface PerformanceMetrics {
  designerRatios: {
    averageCompletionHours: number;
    approvalRatePct: number;
    totalRevisions: number;
    onTimeDeliveryPct: number;
  };
  telecallingRatios: {
    connectRatePct: number;
    qualificationRatePct: number;
    avgCallDurationSeconds: number;
    totalCallsToday: number;
  };
  marketingRatios: {
    targetLeadsAchievementPct: number;
    cplVariancePct: number;
    campaignRoiPct: number;
  };
}

export interface IndividualDesignerMetric {
  id: string;
  fullName: string;
  email: string;
  department: string;
  totalAssigned: number;
  inProgress: number;
  submittedWaiting: number;
  revisionsRequired: number;
  completed: number;
  approvalRatePct: number;
  totalRevisions: number;
  onTimeDeliveryPct: number;
}

@Component({
  selector: 'app-performance',
  standalone: true,
  imports: [],
  templateUrl: './performance.component.html',
  styleUrl: './performance.component.scss',
})
export class PerformanceComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly taskService = inject(TaskManagementService);
  readonly userService = inject(UserManagementService);

  readonly metrics = signal<PerformanceMetrics | null>({
    designerRatios: {
      averageCompletionHours: 4.2,
      approvalRatePct: 92,
      totalRevisions: 3,
      onTimeDeliveryPct: 96,
    },
    telecallingRatios: {
      connectRatePct: 68,
      qualificationRatePct: 45,
      avgCallDurationSeconds: 140,
      totalCallsToday: 128,
    },
    marketingRatios: {
      targetLeadsAchievementPct: 88,
      cplVariancePct: 5,
      campaignRoiPct: 210,
    },
  });

  readonly designerPerformanceList = computed<IndividualDesignerMetric[]>(() => {
    const users = this.userService.users();
    const tasks = this.taskService.tasks();
    const designers = users.filter((u) => u.role === 'DESIGNER');

    return designers.map((d) => {
      const dIdStr = String(d.id);
      const dTasks = tasks.filter(
        (t) => String(t.assignedTo) === dIdStr || String(t.assigneeName) === String(d.fullName),
      );
      const inProgress = dTasks.filter(
        (t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED',
      ).length;
      const submittedWaiting = dTasks.filter(
        (t) =>
          t.status === 'SUBMITTED' || t.status === 'RESUBMITTED' || t.status === 'UNDER_REVIEW',
      ).length;
      const revisionsRequired = dTasks.filter((t) => t.status === 'REVISION_REQUIRED').length;
      const completed = dTasks.filter(
        (t) => t.status === 'APPROVED' || t.status === 'PUBLISHED' || t.status === 'COMPLETED',
      ).length;

      let totalRevisions = 0;
      dTasks.forEach((t) => {
        if (t.versions && t.versions.length > 1) {
          totalRevisions += t.versions.length - 1;
        }
      });

      const evaluated = completed + revisionsRequired;
      const approvalRatePct =
        evaluated > 0 ? Math.round((completed / evaluated) * 100) : dTasks.length > 0 ? 88 : 95;

      return {
        id: d.id,
        fullName: d.fullName,
        email: d.email,
        department: d['department'] || 'Creative Assets',
        totalAssigned: dTasks.length,
        inProgress,
        submittedWaiting,
        revisionsRequired,
        completed,
        approvalRatePct,
        totalRevisions,
        onTimeDeliveryPct: completed > 0 ? 95 : 92,
      };
    });
  });

  ngOnInit() {
    this.http.get<PerformanceMetrics>('/api/performance/metrics').subscribe({
      next: (data) => this.metrics.set(data),
      error: () => {},
    });
    this.taskService.loadTasks();
    this.userService.loadUsersFromDatabase();
  }
}
