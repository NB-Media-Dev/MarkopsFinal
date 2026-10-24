import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Task, TaskVersion } from '../../../../../core/models/task.model';
import { UserManagementService } from '../../../../../core/services/user-management.service';
import {
  JourneyStep,
  getTaskStatusBadgeClass,
  calculateVersionDuration,
  parseBulletPointLines,
  buildTaskLifecycleJourney,
} from '../../../utils/task-journey.utils';

@Component({
  selector: 'app-task-audit-modal',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './task-audit-modal.component.html',
  styleUrls: ['./task-audit-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskAuditModalComponent {
  private readonly userService = inject(UserManagementService);

  @Input({ required: true }) isOpen = false;
  @Input() auditTask: Task | null = null;
  @Input() activePackageMeta: any = {};

  @Output() closeModal = new EventEmitter<void>();
  @Output() previewDoc = new EventEmitter<{ event: Event; url?: string; name?: string; content?: string }>();
  @Output() download = new EventEmitter<{ event: Event; url: string; name: string }>();

  onClose(): void {
    this.closeModal.emit();
  }

  onPreviewDoc(event: Event, url?: string, name?: string, content?: string): void {
    this.previewDoc.emit({ event, url, name, content });
  }

  onDownload(event: Event, url?: string, name?: string): void {
    if (url && name) {
      this.download.emit({ event, url, name });
    }
  }

  getStatusBadgeClass(status: string): string {
    return getTaskStatusBadgeClass(status);
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
    return calculateVersionDuration(task, ver);
  }

  parseBulletPoints(raw: string): string[] {
    return parseBulletPointLines(raw);
  }

  getLifecycleJourney(task: Task | null): JourneyStep[] {
    if (!task) return [];
    return buildTaskLifecycleJourney(
      task,
      this.getAssigneeName(task),
      this.getCreatorName(task),
      this.getCreatorRoleLabel(task),
      this.activePackageMeta?.name
    );
  }
}
