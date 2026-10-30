import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdItem } from '../../../../core/services/campaign.service';
import { TaskManagementService } from '../../../../core/services/task-management.service';

@Component({
  selector: 'app-ads-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ads-table.component.html',
  styleUrl: './ads-table.component.scss',
})
export class AdsTableComponent {
  @Input() ads: AdItem[] = [];
  @Input() canManageAds = false;
  @Input() currentUserId: string | number | null = null;

  @Output() create = new EventEmitter<void>();
  @Output() edit = new EventEmitter<AdItem>();
  @Output() delete = new EventEmitter<AdItem>();

  readonly taskService = inject(TaskManagementService);

  private findMatchedTaskForAd(ad: AdItem): any {
    const tasks = this.taskService.tasks();
    if (!tasks || tasks.length === 0) return null;

    const adNameLower = (ad.name || '').toLowerCase().trim();
    return tasks.find((t) => {
      const titleLower = (t.title || '').toLowerCase().trim();
      return (
        (ad.designId && String(t.id) === String(ad.designId)) ||
        titleLower === adNameLower ||
        (adNameLower && (adNameLower.includes(titleLower) || titleLower.includes(adNameLower)))
      );
    }) || null;
  }

  private extractImageFromTask(matched: any): string {
    if (matched.versions && matched.versions.length > 0) {
      for (const ver of matched.versions) {
        const u = ver.fileUrl || ver.filePath || ver.fileContent;
        if (u) return u;
      }
    }
    return matched.attachmentUrl || '';
  }

  getAdImage(ad: AdItem): string {
    if (ad.designImageUrl) {
      return ad.designImageUrl;
    }
    const matched = this.findMatchedTaskForAd(ad);
    return matched ? this.extractImageFromTask(matched) : '';
  }

  getDesignTitle(ad: AdItem): string {
    if (ad.designTitle) return ad.designTitle;
    const matched = this.findMatchedTaskForAd(ad);
    return matched?.title || '';
  }

  onCreate() {
    this.create.emit();
  }

  canManageAd(ad: AdItem): boolean {
    return this.canManageAds &&
      this.currentUserId != null &&
      ad.createdBy != null &&
      String(ad.createdBy) === String(this.currentUserId);
  }

  onEdit(ad: AdItem) {
    this.edit.emit(ad);
  }

  onDelete(ad: AdItem) {
    this.delete.emit(ad);
  }
}
