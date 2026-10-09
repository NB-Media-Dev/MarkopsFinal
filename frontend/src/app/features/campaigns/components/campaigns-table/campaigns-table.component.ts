import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CampaignItem } from '../../../../core/services/campaign.service';

@Component({
  selector: 'app-campaigns-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaigns-table.component.html',
  styleUrl: './campaigns-table.component.scss',
})
export class CampaignsTableComponent {
  @Input() campaigns: CampaignItem[] = [];
  @Input() totalCampaignsCount = 0;
  @Input() canManageCampaigns = false;
  @Input() currentUserId: string | number | null = null;

  @Output() create = new EventEmitter<void>();
  @Output() edit = new EventEmitter<CampaignItem>();
  @Output() delete = new EventEmitter<CampaignItem>();

  onCreate() {
    this.create.emit();
  }

  canManageCampaign(campaign: CampaignItem): boolean {
    return this.canManageCampaigns &&
      this.currentUserId != null &&
      String(campaign.ownerId) === String(this.currentUserId);
  }

  onEdit(cmp: CampaignItem) {
    this.edit.emit(cmp);
  }

  onDelete(cmp: CampaignItem) {
    this.delete.emit(cmp);
  }
}
