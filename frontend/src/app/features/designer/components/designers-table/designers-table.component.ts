import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface DesignerSummary {
  id: string | number;
  name: string;
  email: string;
  department: string;
  avatarColor: string;
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

  getInitials(name: string): string {
    if (!name) return 'D';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  onSearch(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.searchChange.emit(val);
  }

  clearSearch(): void {
    this.searchChange.emit('');
  }

  onSelect(designerId: string | number): void {
    this.selectDesigner.emit(designerId);
  }
}
