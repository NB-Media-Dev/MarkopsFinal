import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getApiUrl } from '../../../../core/utils/api-url.utils';

export interface DesignerSummary {
  id: string | number;
  name: string;
  email: string;
  department: string;
  avatarColor: string;
  avatarUrl?: string;
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  inProgressCount?: number;
  submittedCount?: number;
  revisionCount?: number;
  completionRate?: number;
}

@Component({
  selector: 'app-designers-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './designers-table.component.html',
  styleUrl: './designers-table.component.scss',
})
export class DesignersTableComponent {
  @Input() designers: DesignerSummary[] = [];
  @Input() searchQuery: string = '';

  @Output() searchChange = new EventEmitter<string>();
  @Output() selectDesigner = new EventEmitter<string | number>();
  @Output() deleteDesigner = new EventEmitter<string | number>();
  @Output() editDesigner = new EventEmitter<DesignerSummary>();

  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(4);

  readonly totalPages = computed(() => {
    const count = this.designers.length;
    return Math.max(1, Math.ceil(count / this.pageSize()));
  });

  readonly paginatedDesigners = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.designers.slice(start, start + this.pageSize());
  });

  readonly pageNumbers = computed<number[]>(() => {
    const total = this.totalPages();
    const pages: number[] = [];
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
    return pages;
  });

  getInitials(name: string): string {
    if (!name) return 'D';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts.at(-1)![0]).toUpperCase();
  }

  getAvatarUrl(avatarUrl?: string): string {
    if (!avatarUrl) return '';
    return getApiUrl(avatarUrl);
  }

  getWorkloadStatus(activeCount: number): { label: string; tone: 'optimal' | 'heavy' | 'available' } {
    if (activeCount >= 4) {
      return { label: 'Heavy Load', tone: 'heavy' };
    }
    if (activeCount >= 2) {
      return { label: 'Optimal', tone: 'optimal' };
    }
    return { label: 'Available', tone: 'available' };
  }

  getProgressBarWidth(activeCount: number): number {
    if (activeCount <= 0) return 0;
    return Math.min(100, Math.max(18, Math.round((activeCount / 5) * 100)));
  }

  getStatusDotTone(activeCount: number): 'green' | 'amber' {
    return activeCount >= 4 ? 'amber' : 'green';
  }

  onSearch(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.currentPage.set(1);
    this.searchChange.emit(val);
  }

  clearSearch(): void {
    this.currentPage.set(1);
    this.searchChange.emit('');
  }

  onSelect(designerId: string | number): void {
    this.selectDesigner.emit(designerId);
  }

  onDelete(designerId: string | number): void {
    this.deleteDesigner.emit(designerId);
  }

  onEdit(designer: DesignerSummary): void {
    this.editDesigner.emit(designer);
    this.selectDesigner.emit(designer.id);
  }

  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.set(this.currentPage() - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.set(this.currentPage() + 1);
    }
  }
}
