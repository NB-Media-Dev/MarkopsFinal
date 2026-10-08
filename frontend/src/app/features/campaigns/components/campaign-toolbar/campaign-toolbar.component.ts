import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-campaign-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './campaign-toolbar.component.html',
  styleUrl: './campaign-toolbar.component.scss',
})
export class CampaignToolbarComponent {
  @Input() searchQuery = '';
  @Input() filterStatus = 'ALL';
  @Input() totalCampaignsCount = 0;
  @Input() activeCount = 0;
  @Input() planningCount = 0;
  @Input() pausedCount = 0;
  @Input() completedCount = 0;

  @Output() searchChange = new EventEmitter<string>();
  @Output() filterChange = new EventEmitter<string>();

  onSearch(value: string) {
    this.searchChange.emit(value);
  }

  clearSearch() {
    this.searchChange.emit('');
  }

  setFilter(status: string) {
    this.filterChange.emit(status);
  }
}
