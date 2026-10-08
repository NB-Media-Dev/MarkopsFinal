import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeadItem } from '../../../../../core/services/lead-telecalling.service';

@Component({
  selector: 'app-edit-lead-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-lead-modal.component.html',
  styleUrl: './edit-lead-modal.component.scss',
})
export class EditLeadModalComponent {
  @Input() isOpen = false;
  @Input() lead: LeadItem | null = null;
  @Input() editFirstName = '';
  @Input() editLastName = '';
  @Input() editPhone = '';
  @Input() editEmail = '';
  @Input() editSource = '';
  @Input() editCampaignName = '';
  @Input() editStatus = '';
  @Input() editAssignedTo = '';
  @Input() editLeadError: string | null = null;
  @Input() isSavingEdit = false;
  @Input() realUsersList: any[] = [];

  @Output() editFirstNameChange = new EventEmitter<string>();
  @Output() editLastNameChange = new EventEmitter<string>();
  @Output() editPhoneChange = new EventEmitter<string>();
  @Output() editEmailChange = new EventEmitter<string>();
  @Output() editSourceChange = new EventEmitter<string>();
  @Output() editCampaignNameChange = new EventEmitter<string>();
  @Output() editStatusChange = new EventEmitter<string>();
  @Output() editAssignedToChange = new EventEmitter<string>();
  @Output() closeModal = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();

  onClose() {
    this.closeModal.emit();
  }

  onSave() {
    this.save.emit();
  }
}
