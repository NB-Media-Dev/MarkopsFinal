import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdItem } from '../../../../../core/services/campaign.service';

@Component({
  selector: 'app-ad-delete-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ad-delete-modal.component.html',
  styleUrl: './ad-delete-modal.component.scss',
})
export class AdDeleteModalComponent {
  @Input() target: AdItem | null = null;

  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  onCancel() {
    this.cancel.emit();
  }

  onConfirm() {
    this.confirm.emit();
  }
}
