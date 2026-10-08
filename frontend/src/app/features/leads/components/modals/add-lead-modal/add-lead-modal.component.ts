import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-add-lead-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-lead-modal.component.html',
  styleUrl: './add-lead-modal.component.scss',
})
export class AddLeadModalComponent {
  @Input() isOpen = false;
  @Input() newFirstName = '';
  @Input() newLastName = '';
  @Input() newEmail = '';
  @Input() newPhone = '';
  @Input() newSource = 'Digital Ads Lead Form';
  @Input() newCampaignId = '';
  @Input() newAssignedTelecallerId = '';
  @Input() availableCampaigns: { id: string; name: string }[] = [];
  @Input() activeTelecallers: any[] = [];
  @Input() isCreatingLead = false;

  @Output() newFirstNameChange = new EventEmitter<string>();
  @Output() newLastNameChange = new EventEmitter<string>();
  @Output() newEmailChange = new EventEmitter<string>();
  @Output() newPhoneChange = new EventEmitter<string>();
  @Output() newSourceChange = new EventEmitter<string>();
  @Output() campaignChange = new EventEmitter<Event>();
  @Output() telecallerChange = new EventEmitter<Event>();
  @Output() closeModal = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();

  firstNameTouched = false;
  lastNameTouched = false;
  emailTouched = false;
  phoneTouched = false;

  isPhoneValid(phone: string): boolean {
    if (!phone || !phone.trim()) return false;
    const clean = phone.replace(/[\s\-\(\)\+]/g, '');
    if (clean.length === 10 && /^[6-9]\d{9}$/.test(clean)) return true;
    if (clean.length === 12 && clean.startsWith('91') && /^[6-9]\d{9}$/.test(clean.substring(2))) return true;
    if (clean.length === 11 && clean.startsWith('0') && /^[6-9]\d{9}$/.test(clean.substring(1))) return true;
    return false;
  }

  isEmailValid(email: string): boolean {
    if (!email || !email.trim()) return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
  }

  get isFormValid(): boolean {
    return (
      this.newFirstName.trim().length >= 2 &&
      this.newLastName.trim().length >= 1 &&
      this.isPhoneValid(this.newPhone) &&
      this.isEmailValid(this.newEmail) &&
      this.newSource.trim().length >= 2
    );
  }

  onClose() {
    this.closeModal.emit();
  }

  onSave() {
    this.save.emit();
  }
}
