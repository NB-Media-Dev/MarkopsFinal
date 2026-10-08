import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeadItem } from '../../../../core/services/lead-telecalling.service';

@Component({
  selector: 'app-leads-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './leads-table.component.html',
  styleUrl: './leads-table.component.scss',
})
export class LeadsTableComponent {
  @Input() isTelecaller = false;
  @Input() paginatedLeads: LeadItem[] = [];
  @Input() filteredLeads: LeadItem[] = [];
  @Input() myLeadsList: LeadItem[] = [];
  @Input() hasActiveFilters = false;
  @Input() pageSize = 10;
  @Input() pageSizeOptions: number[] = [10, 25, 50, 100];
  @Input() currentPage = 1;
  @Input() totalPages = 1;
  @Input() canReassignLeadFn!: (lead: LeadItem) => boolean;
  @Input() canEditOrDeleteLeadFn!: (lead: LeadItem) => boolean;
  @Input() getStatusBadgeClassFn!: (status: string | undefined) => string;

  @Output() pageSizeChange = new EventEmitter<number>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() leadDetails = new EventEmitter<LeadItem>();
  @Output() reassign = new EventEmitter<LeadItem>();
  @Output() edit = new EventEmitter<LeadItem>();
  @Output() delete = new EventEmitter<LeadItem>();
  @Output() resetFilters = new EventEmitter<void>();

  readonly Math = Math;

  mathMin(a: number, b: number): number {
    return Math.min(a, b);
  }

  canReassign(lead: LeadItem): boolean {
    return this.canReassignLeadFn ? this.canReassignLeadFn(lead) : false;
  }

  canEditOrDelete(lead: LeadItem): boolean {
    return this.canEditOrDeleteLeadFn ? this.canEditOrDeleteLeadFn(lead) : false;
  }

  getStatusBadgeClass(status: string | undefined): string {
    return this.getStatusBadgeClassFn ? this.getStatusBadgeClassFn(status) : '';
  }

  setPageSize(size: any) {
    this.pageSizeChange.emit(Number(size));
  }

  setPage(page: any) {
    if (typeof page === 'number') {
      this.pageChange.emit(page);
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.pageChange.emit(this.currentPage - 1);
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.pageChange.emit(this.currentPage + 1);
    }
  }

  getPageNumbers(): (number | string)[] {
    const total = this.totalPages;
    const current = this.currentPage;
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [1];
    if (current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  }
}
