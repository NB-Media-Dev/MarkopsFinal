import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeadItem } from '../../../../../core/services/lead-telecalling.service';

@Component({
  selector: 'app-assign-lead-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assign-lead-modal.component.html',
  styleUrl: './assign-lead-modal.component.scss',
})
export class AssignLeadModalComponent {
  @Input() lead: LeadItem | null = null;
  @Input() selectedUserId = '';
  @Input() realUsersList: any[] = [];

  @Output() userSelected = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  onUserChange(id: string) {
    this.userSelected.emit(id);
  }

  onCancel() {
    this.cancel.emit();
  }

  onConfirm() {
    this.confirm.emit();
  }
}
