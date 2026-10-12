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

  formatStatus(status?: string): string {
    const s = (status || '').toUpperCase().trim();
    switch (s) {
      case 'PAID':
      case 'QUALIFIED':
      case 'CONVERTED':
        return 'Paid';
      case 'ASSIGNED':
      case 'NEW':
        return 'Assigned';
      case 'LINE_BUSY':
      case 'BUSY':
        return 'Line Busy';
      case 'NO_ANSWER':
        return 'No Answer';
      case 'WRONG_NUMBER':
        return 'Wrong Number';
      case 'FOLLOW_UP':
      case 'FOLLOW_UP_SCHEDULED':
        return 'Follow Up';
      case 'INTERESTED':
        return 'Interested';
      case 'NOT_INTERESTED':
        return 'Not Interested';
      case 'CONNECTED':
      default:
        return 'Assigned';
    }
  }

  onClose() {
    this.closeModal.emit();
  }
}
