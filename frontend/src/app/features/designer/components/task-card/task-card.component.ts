import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task, TaskStatus, TaskPriority, computeTaskProgressPercent } from '../../../../core/models/task.model';
import { UserManagementService } from '../../../../core/services/user-management.service';
import { ManagedUser } from '../../../../core/models/user-management.model';
import { getApiUrl } from '../../../../core/utils/api-url.utils';

@Component({
  selector: 'app-task-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-card.component.html',
  styleUrl: './task-card.component.scss',
})
export class TaskCardComponent {
  private userService = inject(UserManagementService);

  @Input({ required: true }) task!: Task;
  @Input() isSelected = false;
  @Input() currentUser: any = null;

  @Output() view = new EventEmitter<{ event: Event; task: Task }>();
  @Output() startWork = new EventEmitter<Task>();
  @Output() uploadDesign = new EventEmitter<Task>();
  @Output() startRedesign = new EventEmitter<Task>();
  @Output() approve = new EventEmitter<Task>();
  @Output() requestRedesign = new EventEmitter<Task>();
  @Output() delete = new EventEmitter<{ event: Event; task: Task }>();
  @Output() openDoc = new EventEmitter<{ event: Event; url?: string; name?: string; content?: string }>();

  isDesigner(): boolean {
    return this.currentUser?.role === 'DESIGNER';
  }

  isTaskCreator(): boolean {
    if (!this.task || !this.currentUser) return false;
    const currentId = String(this.currentUser.id !== undefined && this.currentUser.id !== null ? this.currentUser.id : '').trim().toLowerCase();
    const currentEmail = String(this.currentUser.email || '').toLowerCase().trim();

    const tCreatorId = String(
      this.task.createdBy !== undefined && this.task.createdBy !== null
        ? this.task.createdBy
        : ((this.task as any).created_by !== undefined && (this.task as any).created_by !== null ? (this.task as any).created_by : '')
    ).trim().toLowerCase();
    const tCreatorEmail = String(this.task.creatorEmail || (this.task as any).creator_email || '').toLowerCase().trim();

    return Boolean((currentId && tCreatorId && currentId === tCreatorId) || (currentEmail && tCreatorEmail && currentEmail === tCreatorEmail));
  }

  canStartWork(): boolean {
    return this.task.status === 'ASSIGNED' && this.isDesigner();
  }

  canUploadDesign(): boolean {
    return this.task.status === 'IN_PROGRESS' && this.isDesigner();
  }

  canStartRedesign(): boolean {
    return (this.task.status === 'REDESIGN_REQUIRED' || this.task.status === 'REVISION_REQUIRED') && this.isDesigner();
  }

  canReview(): boolean {
    return (this.task.status === 'SUBMITTED' || this.task.status === 'RESUBMITTED' || this.task.status === 'UNDER_REVIEW') && this.isTaskCreator();
  }

  canDeleteTask(): boolean {
    return this.isTaskCreator();
  }

  getTaskProgress(): number {
    return computeTaskProgressPercent(this.task.status, this.task.progressPercent);
  }

  getRolePrefix(role?: string): string {
    const r = String(role || '').toUpperCase();
    if (r.includes('ADMIN')) return 'Admin';
    if (r.includes('BDM')) return 'BDM';
    if (r.includes('MARKETING') || r.includes('MANAGER')) return 'Manager';
    if (r.includes('DESIGNER')) return 'Designer';
    return role || 'User';
  }

  getCreatorName(): string {
    if (!this.task) return 'Manager';
    return this.task.creatorName || 'Manager';
  }

  getCreatorDisplayName(): string {
    const raw = this.task?.creatorName;
    if (raw && raw !== 'System Administrator' && raw !== 'admin@markops.io' && !raw.toLowerCase().includes('admin')) {
      if (raw.includes('@')) return raw.split('@')[0];
      return raw;
    }
    const prefix = this.getRolePrefix(this.task?.creatorRole);
    return prefix || 'Admin';
  }

  getAssigneeName(): string {
    if (!this.task) return 'Unassigned';
    return this.task.assigneeName || 'Designer';
  }

  getAssigneeUser(): ManagedUser | undefined {
    if (!this.task) return undefined;
    const assignedTo = String(this.task.assignedTo || '').trim().toLowerCase();
    const assigneeName = String(this.task.assigneeName || '').trim().toLowerCase();
    const users = this.userService.users();
    return users.find((u) => {
      const uId = String(u.id || '').trim().toLowerCase();
      const uEmail = String(u.email || '').trim().toLowerCase();
      const uName = String(u.fullName || '').trim().toLowerCase();
      return (
        (assignedTo && (uId === assignedTo || uEmail === assignedTo)) ||
        (assigneeName && (uName === assigneeName || uName.includes(assigneeName) || assigneeName.includes(uName)))
      );
    });
  }

  getAssigneeDisplayName(): string {
    const user = this.getAssigneeUser();
    if (user?.fullName) return user.fullName;
    const raw = this.task?.assigneeName;
    if (raw && raw !== 'Assigned Designer' && raw !== 'Assigned User' && raw !== 'Unassigned') {
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return 'Surya';
  }

  getAssigneeRole(): string {
    const user = this.getAssigneeUser();
    if (user?.department && user.department !== 'General') {
      return user.department;
    }
    if (user?.role === 'DESIGNER') {
      return 'UIUX Designer';
    }
    if (user?.role) {
      return this.getRolePrefix(user.role);
    }
    return 'UIUX Designer';
  }

  getAssigneeAvatarUrl(): string | undefined {
    const raw = this.getAssigneeUser()?.avatarUrl;
    return raw ? getApiUrl(raw) : undefined;
  }

  getAssigneeAvatarColor(): string {
    const name = this.getAssigneeDisplayName();
    const colors = ['#F59E0B', '#EA580C', '#D97706', '#7C3AED', '#2563EB', '#059669', '#0891B2'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = (name.codePointAt(i) || 0) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getAssigneeInitials(): string {
    const name = this.getAssigneeDisplayName();
    if (!name) return 'S';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  getShortCreator(): string {
    const raw = this.getCreatorName();
    if (!raw || raw === 'System Administrator' || raw === 'admin@markops.io' || raw === 'Manager') {
      return this.getRolePrefix(this.task.creatorRole) || 'Admin';
    }
    const prefix = this.getRolePrefix(this.task.creatorRole);
    const firstName = raw.split(' ')[0];
    return prefix && prefix !== firstName ? `${prefix}(${firstName})` : firstName;
  }

  getShortAssignee(): string {
    const raw = this.getAssigneeName();
    if (!raw || raw === 'Assigned Designer' || raw === 'Assigned User' || raw === 'Designer') {
      return 'Designer';
    }
    return raw.split(' ')[0];
  }

  getTaskTypeLabel(): string {
    const type = this.task.taskType || (this.task as any).task_type;
    switch (type) {
      case 'BANNER_DESIGN': return 'Banner Design';
      case 'POST_DESIGN': return 'Post Design';
      case 'VIDEO': return 'Video';
      default: return '';
    }
  }

  getTaskTypeIcon(): string {
    const type = this.task.taskType || (this.task as any).task_type;
    switch (type) {
      case 'BANNER_DESIGN': return 'campaign';
      case 'POST_DESIGN': return 'photo_library';
      case 'VIDEO': return 'play_arrow';
      default: return 'palette';
    }
  }

  getStatusBadgeClass(status: TaskStatus): string {
    switch (status) {
      case 'DRAFT': return 'badge-secondary';
      case 'ASSIGNED': return 'badge-info';
      case 'ACCEPTED': return 'badge-info';
      case 'IN_PROGRESS': return 'badge-warning';
      case 'SUBMITTED':
      case 'RESUBMITTED':
      case 'UNDER_REVIEW': return 'badge-primary';
      case 'REVISION_REQUIRED':
      case 'REDESIGN_REQUIRED': return 'badge-danger';
      case 'APPROVED':
      case 'PUBLISHED':
      case 'COMPLETED': return 'badge-success';
      default: return 'badge-secondary';
    }
  }

  getPriorityBadgeClass(priority: TaskPriority): string {
    switch (priority) {
      case 'LOW': return 'priority-low';
      case 'MEDIUM': return 'priority-medium';
      case 'HIGH': return 'priority-high';
      case 'URGENT': return 'priority-urgent';
      default: return '';
    }
  }

  onView(event: Event): void {
    this.view.emit({ event, task: this.task });
  }

  onStartWork(): void {
    this.startWork.emit(this.task);
  }

  onUploadDesign(): void {
    this.uploadDesign.emit(this.task);
  }

  onStartRedesign(): void {
    this.startRedesign.emit(this.task);
  }

  onApprove(): void {
    this.approve.emit(this.task);
  }

  onOpenRedesign(): void {
    this.requestRedesign.emit(this.task);
  }

  onDelete(event: Event): void {
    this.delete.emit({ event, task: this.task });
  }

  onOpenDoc(event: Event): void {
    this.openDoc.emit({
      event,
      url: this.task.attachmentUrl,
      name: this.task.attachmentName,
      content: this.task.content,
    });
  }
}
