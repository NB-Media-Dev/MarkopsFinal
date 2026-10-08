import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { safeFetch } from '../../core/utils/api-url.utils';

import { RouterModule } from '@angular/router';

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: any;
  newState?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './audit-logs.component.html',
  styleUrl: './audit-logs.component.scss',
})
export class AuditLogsComponent implements OnInit {
  readonly logs = signal<AuditLogEntry[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly searchQuery = signal<string>('');
  readonly actionFilter = signal<string>('ALL');

  readonly totalLogsCount = computed(() => this.logs().length);
  readonly loginEventsCount = computed(() => this.logs().filter((l) => l.action.includes('LOGIN')).length);
  readonly securityEditsCount = computed(() => this.logs().filter((l) => l.action.includes('STATUS') || l.action.includes('UPDATED') || l.action.includes('CREATED')).length);

  readonly filteredLogs = computed(() => {
    const list = this.logs();
    const query = this.searchQuery().toLowerCase().trim();
    const actFilter = this.actionFilter();

    return list.filter((log) => {
      const matchesSearch =
        !query ||
        log.action.toLowerCase().includes(query) ||
        (log.actorEmail || '').toLowerCase().includes(query) ||
        log.entityType.toLowerCase().includes(query) ||
        log.entityId.toLowerCase().includes(query);

      const matchesAction = actFilter === 'ALL' || log.action === actFilter;

      return matchesSearch && matchesAction;
    });
  });

  ngOnInit(): void {
    this.fetchAuditLogs();
  }

  async fetchAuditLogs(): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await safeFetch('/api/audit-logs');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          this.logs.set(data);
          this.isLoading.set(false);
          return;
        }
      }
    } catch (e) {
      console.log('Error fetching audit logs from API:', e);
    }

    this.logs.set([]);
    this.isLoading.set(false);
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  onFilterAction(action: string): void {
    this.actionFilter.set(action);
  }

  getActionBadgeClass(action: string): string {
    if (action.includes('LOGIN_SUCCESS')) return 'badge-success';
    if (action.includes('LOGIN_FAILURE') || action.includes('REJECTED')) return 'badge-danger';
    if (action.includes('CREATED')) return 'badge-info';
    if (action.includes('UPDATED') || action.includes('CHANGED')) return 'badge-warning';
    if (action.includes('DELETED')) return 'badge-danger';
    return 'badge-secondary';
  }

  formatState(state: any): string {
    if (!state) return '-';
    if (typeof state === 'string') return state;
    try {
      return JSON.stringify(state);
    } catch {
      return String(state);
    }
  }
}
