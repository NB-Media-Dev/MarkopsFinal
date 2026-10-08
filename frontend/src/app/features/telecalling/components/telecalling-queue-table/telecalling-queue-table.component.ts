import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeadItem } from '../../../../core/services/lead-telecalling.service';

@Component({
  selector: 'app-telecalling-queue-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './telecalling-queue-table.component.html',
  styleUrl: './telecalling-queue-table.component.scss',
})
export class TelecallingQueueTableComponent {
  @Input() isTelecaller = false;
  @Input() queueFilter: 'MY_LEADS' | 'ALL_LEADS' = 'ALL_LEADS';
  @Input() totalLeadsCount = 0;
  @Input() myLeadsCount = 0;
  @Input() paginatedLeads: LeadItem[] = [];
  @Input() filteredAssignedLeads: LeadItem[] = [];
  @Input() pipelineStatusFilter: 'ALL' | 'NEW' | 'FOLLOW_UP' | 'INTERESTED' | 'QUALIFIED' | 'RETRY' = 'ALL';
  @Input() searchQuery = '';
  @Input() pipelineFilterLabel = 'All Leads';
  @Input() canLogCalls = false;
  @Input() selectedCampaign = 'ALL';
  @Input() dateFilter: 'ALL' | 'TODAY' | 'YESTERDAY' | 'CUSTOM' = 'ALL';


  @Input() getStatusBadgeClassFn!: (status?: string) => string;
  @Input() getLeadCurrentStatusFn!: (lead: LeadItem) => string;
  @Input() hasScheduledCallbackFn!: (lead: LeadItem) => boolean;
  @Input() getFollowUpTimeLabelFn!: (lead: LeadItem) => string | null;
  @Input() isFollowUpDueFn!: (lead: LeadItem) => boolean;
  @Input() getLeadCreatorNameFn!: (lead: LeadItem) => string;
  @Input() getLeadMetricsFn!: (lead: LeadItem) => any;


  @Input() currentPage = 1;
  @Input() pageSize = 10;
  @Input() totalPages = 1;
  @Input() pageNumbers: number[] = [];

  @Output() queueFilterChange = new EventEmitter<'MY_LEADS' | 'ALL_LEADS'>();
  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() pipelineFilterChange = new EventEmitter<'ALL' | 'NEW' | 'FOLLOW_UP' | 'INTERESTED' | 'QUALIFIED' | 'RETRY'>();
  @Output() resetAllFilters = new EventEmitter<void>();
  @Output() openCallDrawer = new EventEmitter<LeadItem>();
  @Output() openLeadHistory = new EventEmitter<LeadItem>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() nextPage = new EventEmitter<void>();
  @Output() prevPage = new EventEmitter<void>();

  setQueueFilter(filter: 'MY_LEADS' | 'ALL_LEADS') {
    this.queueFilterChange.emit(filter);
  }

  setSearchQuery(q: string) {
    this.searchQueryChange.emit(q);
  }

  setPipelineFilter(filter: 'ALL' | 'NEW' | 'FOLLOW_UP' | 'INTERESTED' | 'QUALIFIED' | 'RETRY') {
    this.pipelineFilterChange.emit(filter);
  }

  onResetAllFilters() {
    this.resetAllFilters.emit();
  }

  onOpenCallDrawer(lead: LeadItem) {
    this.openCallDrawer.emit(lead);
  }

  onOpenLeadHistory(lead: LeadItem) {
    this.openLeadHistory.emit(lead);
  }

  setPage(p: number) {
    this.pageChange.emit(p);
  }

  onNextPage() {
    this.nextPage.emit();
  }

  onPrevPage() {
    this.prevPage.emit();
  }

  mathMin(a: number, b: number): number {
    return Math.min(a, b);
  }
}
