import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeadItem, CallActivityItem } from '../../../../../core/services/lead-telecalling.service';

@Component({
  selector: 'app-call-history-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './call-history-modal.component.html',
  styleUrl: './call-history-modal.component.scss',
})
export class CallHistoryModalComponent {
  @Input() lead: LeadItem | null = null;
  @Input() leadHistoryCalls: CallActivityItem[] = [];
  @Input() canLogCalls = false;
  @Input() getStatusBadgeClassFn!: (status?: string) => string;
  @Input() formatStatusLabelFn?: (status?: string) => string;

  formatStatus(status?: string): string {
    if (this.formatStatusLabelFn) return this.formatStatusLabelFn(status);
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

  @Output() closeModal = new EventEmitter<void>();
  @Output() openCallDrawer = new EventEmitter<LeadItem>();

  onClose() {
    this.closeModal.emit();
  }

  onLogCall() {
    if (this.lead) {
      this.closeModal.emit();
      this.openCallDrawer.emit(this.lead);
    }
  }
}
