import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-leads-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './leads-toolbar.component.html',
  styleUrl: './leads-toolbar.component.scss',
})
export class LeadsToolbarComponent {
  @Input() searchQuery = '';
  @Input() filterStatus = 'ALL';
  @Input() filterTelecaller = 'ALL';
  @Input() filterCampaign = 'ALL';
  @Input() isTelecaller = false;
  @Input() activeTelecallers: any[] = [];
  @Input() availableCampaigns: { id: string; name: string }[] = [];
  @Input() hasActiveFilters = false;
  @Input() filteredLeadsCount = 0;
  @Input() myLeadsCount = 0;

  @Output() searchChange = new EventEmitter<string>();
  @Output() statusChange = new EventEmitter<string>();
  @Output() telecallerChange = new EventEmitter<string>();
  @Output() campaignChange = new EventEmitter<string>();
  @Output() resetFilters = new EventEmitter<void>();

  onSearch(query: string) {
    this.searchChange.emit(query);
  }

  onStatus(status: string) {
    this.statusChange.emit(status);
  }

  onTelecaller(tc: string) {
    this.telecallerChange.emit(tc);
  }

  onCampaign(campaign: string) {
    this.campaignChange.emit(campaign);
  }

  onReset() {
    this.resetFilters.emit();
  }
}
