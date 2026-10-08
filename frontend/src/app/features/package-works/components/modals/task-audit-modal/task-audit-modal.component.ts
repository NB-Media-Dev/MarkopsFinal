import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Task, TaskVersion, TaskStatus } from '../../../../../core/models/task.model';
import { UserManagementService } from '../../../../../core/services/user-management.service';

@Component({
  selector: 'app-task-audit-modal',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './task-audit-modal.component.html',
  styleUrls: ['./task-audit-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskAuditModalComponent {
  private userService = inject(UserManagementService);

  @Input({ required: true }) isOpen = false;
  @Input() auditTask: Task | null = null;
  @Input() activePackageMeta: any = {};

  @Output() close = new EventEmitter<void>();
  @Output() previewDoc = new EventEmitter<{ event: Event; url?: string; name?: string; content?: string }>();
  @Output() download = new EventEmitter<{ event: Event; url: string; name: string }>();

  onClose(): void {
    this.close.emit();
  }

  onPreviewDoc(event: Event, url?: string, name?: string, content?: string): void {
    this.previewDoc.emit({ event, url, name, content });
  }

  onDownload(event: Event, url?: string, name?: string): void {
    if (url && name) {
      this.download.emit({ event, url, name });
    }
  }

  getStatusBadgeClass(status: TaskStatus | string): string {
    switch (status) {
      case 'IN_PROGRESS': return 'badge-amber';
      case 'SUBMITTED':
      case 'RESUBMITTED':
      case 'UNDER_REVIEW': return 'badge-purple';
      case 'APPROVED':
      case 'COMPLETED':
      case 'PUBLISHED': return 'badge-green';
      case 'REVISION_REQUIRED':
      case 'REDESIGN_REQUIRED': return 'badge-danger';
      default: return 'badge-blue';
    }
  }

  getCreatorName(task: Task | null): string {
    if (!task) return 'System Administrator';
    if (task.creatorName) return task.creatorName;
    const user = this.userService.users().find((u: any) => String(u.id) === String(task.createdBy || (task as any).creatorId));
    if (user?.fullName) return user.fullName;
    return 'Manager';
  }

  getCreatorRoleLabel(task: Task | null): string {
    if (!task) return 'ADMINISTRATOR';
    if (task.creatorRole) return task.creatorRole;
    const user = this.userService.users().find((u: any) => String(u.id) === String(task.createdBy || (task as any).creatorId));
    if (user?.role) return user.role;
    return 'MANAGER';
  }

  getAssigneeName(task: Task | null): string {
    if (!task) return 'Assigned Designer';
    if (task.assigneeName) return task.assigneeName;
    const user = this.userService.users().find((u: any) => String(u.id) === String(task.assignedTo));
    if (user?.fullName) return user.fullName;
    return 'Assigned Designer';
  }

  getVersionDuration(task: Task | null, ver: TaskVersion): string {
    if (!task || !ver || !ver.createdAt) return '';
    const verTime = new Date(ver.createdAt).getTime();
    if (isNaN(verTime)) return '';

    if (task.statusHistory && task.statusHistory.length > 0) {
      const sortedHistory = [...task.statusHistory]
        .filter((h) => h.createdAt && !isNaN(new Date(h.createdAt).getTime()))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let lastStart: number | null = null;
      for (const h of sortedHistory) {
        const hTime = new Date(h.createdAt).getTime();
        if (hTime > verTime + 5000) break;

        if (h.newStatus === 'IN_PROGRESS') {
          lastStart = hTime;
        } else if (h.newStatus === 'SUBMITTED' && lastStart && Math.abs(hTime - verTime) < 15000) {
          return this.formatDurationMs(hTime - lastStart);
        }
      }

      if (lastStart && lastStart <= verTime) {
        return this.formatDurationMs(verTime - lastStart);
      }
    }

    if (task.versions && task.versions.length > 1) {
      const sortedVers = [...task.versions]
        .filter((v) => v.createdAt && !isNaN(new Date(v.createdAt).getTime()))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const curIdx = sortedVers.findIndex((v) => v.id === ver.id);
      if (curIdx > 0) {
        const prevTime = new Date(sortedVers[curIdx - 1].createdAt).getTime();
        if (verTime > prevTime) {
          return this.formatDurationMs(verTime - prevTime);
        }
      }
    }

    return '';
  }

  private formatDurationMs(ms: number): string {
    if (ms <= 0) return '0m';
    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${Math.max(1, minutes)}m`;
  }

  parseBulletPoints(raw: string): string[] {
    if (!raw) return [];
    const clean = raw.trim();
    if (!clean) return [];

    const lines = clean.split('\n');
    const items: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const bulletText = trimmed.replace(/^[•\-*]\s*/, '').trim();
        if (bulletText) items.push(bulletText);
      } else if (trimmed.match(/^\d+[\.\)]\s*/)) {
        const numText = trimmed.replace(/^\d+[\.\)]\s*/, '').trim();
        if (numText) items.push(numText);
      } else {
        const cleanedItem = trimmed.replace(/^[•\-*]\s*/, '').trim();
        if (cleanedItem) items.push(cleanedItem);
      }
    }

    return items.length > 0 ? items : [clean];
  }

  getLifecycleJourney(task: Task | null): {
    stepNumber: number;
    stage: string;
    fromStatus: string;
    toStatus: string;
    actorName: string;
    actorRole: string;
    timestamp: string;
    remarks: string;
  }[] {
    if (!task) return [];

    const creatorName = this.getCreatorName(task);
    const creatorRole = this.getCreatorRoleLabel(task);
    const designerName = this.getAssigneeName(task);

    const history = task.statusHistory || [];
    const steps: any[] = [];

    const initialAssignment = history.find(
      (h: any) => h.newStatus === 'ASSIGNED' && (!h.previousStatus || h.previousStatus === 'ASSIGNED')
    );

    steps.push({
      stepNumber: 1,
      stage: 'Task Creation & Assignment',
      fromStatus: 'CREATED',
      toStatus: 'ASSIGNED',
      actorName: initialAssignment?.actorName || creatorName,
      actorRole: initialAssignment?.actorRole || creatorRole,
      timestamp: initialAssignment?.createdAt || task.createdAt || new Date().toISOString(),
      remarks: initialAssignment?.remark || `Task created for package "${task.packageName || this.activePackageMeta?.name || 'Package'}" and assigned to ${designerName}.`,
    });

    const validHistoryTransitions = history.filter((h: any) => {
      if (h === initialAssignment) return false;
      if (h.newStatus === 'ASSIGNED' && (!h.previousStatus || h.previousStatus === 'ASSIGNED')) {
        return false;
      }
      if (h.previousStatus && h.previousStatus === h.newStatus) {
        return false;
      }
      return true;
    });

    validHistoryTransitions.sort((a: any, b: any) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    let stepIdx = 2;
    if (validHistoryTransitions.length > 0) {
      validHistoryTransitions.forEach((h: any) => {
        let stageName = 'Status Updated';
        if (h.newStatus === 'IN_PROGRESS') stageName = ' Work Started';
        else if (h.newStatus === 'SUBMITTED' || h.newStatus === 'RESUBMITTED') stageName = 'Task Submitted';
        else if (h.newStatus === 'REDESIGN_REQUIRED' || h.newStatus === 'REVISION_REQUIRED') stageName = 'Redesign';
        else if (h.newStatus === 'APPROVED' || h.newStatus === 'COMPLETED' || h.newStatus === 'PUBLISHED') stageName = 'Design Approved';
        else if (h.newStatus === 'ACCEPTED') stageName = 'Task Accepted by Designer';

        const prevStep = steps[steps.length - 1];
        if (prevStep && prevStep.toStatus === h.newStatus) {
          return;
        }

        steps.push({
          stepNumber: stepIdx++,
          stage: stageName,
          fromStatus: h.previousStatus || prevStep?.toStatus || 'ASSIGNED',
          toStatus: h.newStatus,
          actorName: h.actorName || (h.newStatus === 'IN_PROGRESS' || h.newStatus === 'SUBMITTED' ? designerName : creatorName),
          actorRole: h.actorRole || (h.newStatus === 'IN_PROGRESS' || h.newStatus === 'SUBMITTED' ? 'DESIGNER' : creatorRole),
          timestamp: h.createdAt || task.updatedAt || task.createdAt,
          remarks: h.remark || (h.newStatus === 'APPROVED' ? 'Deliverable approved without further changes.' : (h.newStatus === 'IN_PROGRESS' ? 'Designer started working on deliverables.' : 'Status transition executed.')),
        });
      });
    } else {
      const status = task.status;
      if (status !== 'ASSIGNED' && status !== 'DRAFT') {
        if (status === 'IN_PROGRESS' || status === 'SUBMITTED' || status === 'APPROVED' || status === 'REDESIGN_REQUIRED' || status === 'COMPLETED') {
          steps.push({
            stepNumber: stepIdx++,
            stage: ' Work Started',
            fromStatus: 'ASSIGNED',
            toStatus: 'IN_PROGRESS',
            actorName: designerName,
            actorRole: 'DESIGNER',
            timestamp: task.updatedAt || task.createdAt,
            remarks: 'Designer accepted assignment and started design draft production.',
          });
        }
        if (status === 'SUBMITTED' || status === 'APPROVED' || status === 'REDESIGN_REQUIRED' || status === 'COMPLETED') {
          steps.push({
            stepNumber: stepIdx++,
            stage: 'Creative Deliverable Submitted',
            fromStatus: 'IN_PROGRESS',
            toStatus: 'SUBMITTED',
            actorName: designerName,
            actorRole: 'DESIGNER',
            timestamp: task.versions && task.versions.length > 0 ? task.versions[0].createdAt : (task.updatedAt || task.createdAt),
            remarks: task.versions && task.versions.length > 0 ? `Version v${task.versions[0].versionNumber}.0 uploaded (${task.versions[0].fileName})` : 'Designer submitted deliverable for review.',
          });
        }
        if (status === 'REDESIGN_REQUIRED') {
          steps.push({
            stepNumber: stepIdx++,
            stage: 'Redesign / Revision Requested',
            fromStatus: 'SUBMITTED',
            toStatus: 'REDESIGN_REQUIRED',
            actorName: creatorName,
            actorRole: creatorRole,
            timestamp: task.updatedAt || task.createdAt,
            remarks: task.reviewerFeedback || 'Changes requested on deliverable.',
          });
        }
        if (status === 'APPROVED' || status === 'COMPLETED') {
          steps.push({
            stepNumber: stepIdx++,
            stage: 'Design Approved & Finalized',
            fromStatus: 'SUBMITTED',
            toStatus: 'APPROVED',
            actorName: creatorName,
            actorRole: creatorRole,
            timestamp: task.updatedAt || task.createdAt,
            remarks: 'Quality verified and design approved for digital deployment.',
          });
        }
      }
    }

    return steps;
  }
}
