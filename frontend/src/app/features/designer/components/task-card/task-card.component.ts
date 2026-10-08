import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task, TaskStatus, TaskPriority, computeTaskProgressPercent } from '../../../../core/models/task.model';

@Component({
  selector: 'app-task-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-card.component.html',
  styleUrl: './task-card.component.scss',
})
export class TaskCardComponent {
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

  getAssigneeName(): string {
    if (!this.task) return 'Unassigned';
    return this.task.assigneeName || 'Designer';
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

  hasCustomDescription(): boolean {
    const desc = (this.task.description || '').trim();
    if (!desc) return false;
    if (desc.startsWith('Document File:') || (desc.includes('File Size:') && desc.includes('File Type:'))) {
      return false;
    }
    if (this.task.attachmentName && desc.toLowerCase() === this.task.attachmentName.trim().toLowerCase()) {
      return false;
    }
    return true;
  }

  getCleanDescription(): string {
    if (!this.hasCustomDescription()) return '';
    return this.task.description!.trim();
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
      case 'REVISION_REQUIRED': return 'badge-danger';
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
