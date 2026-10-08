import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CampaignItem } from '../../../../../core/services/campaign.service';

@Component({
  selector: 'app-campaign-delete-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaign-delete-modal.component.html',
  styleUrl: './campaign-delete-modal.component.scss',
})
export class CampaignDeleteModalComponent {
  @Input() target: CampaignItem | null = null;

  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  onCancel() {
    this.cancel.emit();
  }

  onConfirm() {
    this.confirm.emit();
  }
}
