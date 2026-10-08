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

  @Output() create = new EventEmitter<void>();
  @Output() edit = new EventEmitter<AdItem>();
  @Output() delete = new EventEmitter<AdItem>();

  readonly taskService = inject(TaskManagementService);

  getAdImage(ad: AdItem): string {
    if (ad.designImageUrl) {
      return ad.designImageUrl;
    }
    const tasks = this.taskService.tasks();
    if (tasks && tasks.length > 0) {
      const adNameLower = (ad.name || '').toLowerCase().trim();
      const matched = tasks.find((t) => {
        const titleLower = (t.title || '').toLowerCase().trim();
        return (
          (ad.designId && String(t.id) === String(ad.designId)) ||
          titleLower === adNameLower ||
          (adNameLower && (adNameLower.includes(titleLower) || titleLower.includes(adNameLower)))
        );
      });

      if (matched) {
        if (matched.versions && matched.versions.length > 0) {
          for (const ver of matched.versions) {
            const u = (ver as any).fileUrl || ver.filePath || ver.fileContent;
            if (u) return u;
          }
        }
        if (matched.attachmentUrl) return matched.attachmentUrl;
      }
    }
    return '';
  }

  getDesignTitle(ad: AdItem): string {
    if (ad.designTitle) return ad.designTitle;
    const tasks = this.taskService.tasks();
    if (tasks && tasks.length > 0) {
      const adNameLower = (ad.name || '').toLowerCase().trim();
      const matched = tasks.find((t) => {
        const titleLower = (t.title || '').toLowerCase().trim();
        return (
          (ad.designId && String(t.id) === String(ad.designId)) ||
          titleLower === adNameLower ||
          (adNameLower && (adNameLower.includes(titleLower) || titleLower.includes(adNameLower)))
        );
      });
      if (matched) return matched.title;
    }
    return '';
  }

  onCreate() {
    this.create.emit();
  }

  onEdit(ad: AdItem) {
    this.edit.emit(ad);
  }

  onDelete(ad: AdItem) {
    this.delete.emit(ad);
  }
}
