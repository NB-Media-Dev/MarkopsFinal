import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-campaign-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './campaign-form-modal.component.html',
  styleUrl: './campaign-form-modal.component.scss',
})
export class CampaignFormModalComponent {
  @Input() isOpen = false;
  @Input() isEditing = false;
  @Input() formModel: any = {};
  @Input() todayDate = new Date().toISOString().split('T')[0];

  @Output() closeModal = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();

  get computedModalCpl(): string {
    const spend = Number(this.formModel.spend) || 0;
    const leads = Number(this.formModel.leadsCount) || 0;
    return leads > 0 ? (spend / leads).toFixed(2) : '0.00';
  }

  get computedModalConvRate(): string {
    const leads = Number(this.formModel.leadsCount) || 0;
    const conv = Number(this.formModel.conversions) || 0;
    return leads > 0 ? ((conv / leads) * 100).toFixed(1) : '0.0';
  }

  onClose() {
    this.closeModal.emit();
  }

  onSave() {
    this.save.emit();
  }
}
