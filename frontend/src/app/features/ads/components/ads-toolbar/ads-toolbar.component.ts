import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ads-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ads-toolbar.component.html',
  styleUrl: './ads-toolbar.component.scss',
})
export class AdsToolbarComponent {
  @Input() searchQuery = '';
  @Input() filterPlatform = 'ALL';

  @Output() searchChange = new EventEmitter<string>();
  @Output() filterChange = new EventEmitter<string>();

  onSearch(query: string) {
    this.searchChange.emit(query);
  }

  setFilter(platform: string) {
    this.filterChange.emit(platform);
  }
}
