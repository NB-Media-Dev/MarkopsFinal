import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeadItem, CallActivityItem } from '../../../../../core/services/lead-telecalling.service';

@Component({
  selector: 'app-lead-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lead-details-modal.component.html',
  styleUrl: './lead-details-modal.component.scss',
})
export class LeadDetailsModalComponent {
  @Input() lead: LeadItem | null = null;
  @Input() historyCalls: CallActivityItem[] = [];
  @Input() getStatusBadgeClassFn!: (status: string | undefined) => string;

  @Output() closeModal = new EventEmitter<void>();

  getStatusBadgeClass(status: string | undefined): string {
    return this.getStatusBadgeClassFn ? this.getStatusBadgeClassFn(status) : '';
  }

  onClose() {
    this.closeModal.emit();
  }
}
