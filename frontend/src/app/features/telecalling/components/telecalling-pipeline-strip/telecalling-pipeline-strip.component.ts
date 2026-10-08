import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-telecalling-pipeline-strip',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './telecalling-pipeline-strip.component.html',
  styleUrl: './telecalling-pipeline-strip.component.scss',
})
export class TelecallingPipelineStripComponent {
  @Input() viewMode: 'ALL' | 'MEMBERS' | 'ASSIGNED' | 'OVERVIEW' = 'ALL';
  @Input() dateFilter: 'ALL' | 'TODAY' | 'YESTERDAY' | 'CUSTOM' = 'ALL';
  @Input() customDate = '';
  @Input() todayDate = '';
  @Input() selectedCampaign = 'ALL';
  @Input() availableCampaigns: { name: string; count: number; id?: string }[] = [];
  @Input() assignedLeadsCount = 0;
  @Input() pipelineStatusFilter: 'ALL' | 'NEW' | 'FOLLOW_UP' | 'INTERESTED' | 'QUALIFIED' | 'RETRY' = 'ALL';
  @Input() pipelineCounts = {
    all: 0,
    new: 0,
    followUp: 0,
    interested: 0,
    qualified: 0,
    retry: 0,
  };

  @Output() dateFilterChange = new EventEmitter<'ALL' | 'TODAY' | 'YESTERDAY' | 'CUSTOM'>();
  @Output() customDateChange = new EventEmitter<string>();
  @Output() campaignChange = new EventEmitter<string>();
  @Output() resetFilters = new EventEmitter<void>();
  @Output() pipelineFilterChange = new EventEmitter<'ALL' | 'NEW' | 'FOLLOW_UP' | 'INTERESTED' | 'QUALIFIED' | 'RETRY'>();

  setDateFilter(filter: 'ALL' | 'TODAY' | 'YESTERDAY' | 'CUSTOM') {
    this.dateFilterChange.emit(filter);
  }

  setCustomDate(date: string) {
    this.customDateChange.emit(date);
  }

  selectCampaign(campaign: string) {
    this.campaignChange.emit(campaign);
  }

  onResetFilters() {
    this.resetFilters.emit();
  }

  setPipelineFilter(filter: 'ALL' | 'NEW' | 'FOLLOW_UP' | 'INTERESTED' | 'QUALIFIED' | 'RETRY') {
    this.pipelineFilterChange.emit(filter);
  }
}
