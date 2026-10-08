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
