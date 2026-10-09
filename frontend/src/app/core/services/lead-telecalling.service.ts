import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { getBackendBaseUrl } from '../utils/api-url.utils';

export interface LeadItem {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone: string;
  source: string;
  campaignId: string;
  campaignName: string;
  adId?: string;
  status: 'NEW' | 'ASSIGNED' | 'CONTACTED' | 'FOLLOW_UP' | 'INTERESTED' | 'NOT_INTERESTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST' | 'WRONG_NUMBER' | 'BUSY' | 'NO_ANSWER' | 'LINE_BUSY' | string;
  assignedTo?: string | null;
  assigneeName?: string;
  creatorId?: string;
  creatorEmail?: string;
  creatorName?: string;
  uploaderId?: string;
  uploaderEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CallActivityItem {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone?: string;
  phone?: string;
  telecallerId: string;
  telecallerName: string;
  telecallerEmail?: string;
  outcome: 'CONNECTED' | 'NO_ANSWER' | 'BUSY' | 'WRONG_NUMBER' | 'FOLLOW_UP' | 'INTERESTED' | 'NOT_INTERESTED' | 'QUALIFIED' | 'CONVERTED' | 'PAID' | 'LINE_BUSY' | string;
  durationSeconds: number;
  remarks?: string;
  nextAction?: string;
  followUpDate?: string;
  followUpTime?: string;
  calledAt: string;
}

export interface FollowUpItem {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  telecallerId: string;
  telecallerName: string;
  dueDate: string;
  dueTime?: string;
  status: 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
  notes?: string;
  createdAt: string;
}

export interface TelecallerMetric {
  id: string;
  fullName: string;
  email: string;
  department: string;
  assignedLeadsCount: number;
  callsLoggedCount: number;
  attendedCount: number;
  notAttendedCount: number;
  interestedCount: number;
  notInterestedCount: number;
  totalDurationSeconds: number;
  avgDurationSeconds: number;
  conversionRate: number;
}

export interface TelecallingSummary {
  totalLeads: number;
  assignedLeads: number;
  unassignedLeads: number;
  totalCallsLogged: number;
  statusBreakdown: Record<string, number>;
  telecallerMetrics: TelecallerMetric[];
}

export interface LeadBatchImportResponse {
  success: boolean;
  message: string;
  totalUploaded: number;
  telecallersCount: number;
  leadsPerTelecaller: number;
  allocationSummary: Array<{ id: string; fullName: string; email: string; count: number }>;
  leads: LeadItem[];
}

@Injectable({
  providedIn: 'root',
})
export class LeadTelecallingService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private socket: Socket | null = null;

  readonly leads = signal<LeadItem[]>([]);
  readonly calls = signal<CallActivityItem[]>([]);
  readonly followUps = signal<FollowUpItem[]>([]);
  readonly summary = signal<TelecallingSummary | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  constructor() {
    if (this.isBrowser) {
      try {
        const backendUrl = getBackendBaseUrl();
        this.socket = io(backendUrl, {
          transports: ['polling', 'websocket'],
          reconnectionAttempts: 5,
        });

        this.socket.on('lead:status_changed', (data: { leadId: string; status: string }) => {
          if (!data || !data.leadId) return;
          this.leads.update((list) =>
            list.map((l) => (String(l.id).trim() === String(data.leadId).trim() ? { ...l, status: data.status as any } : l))
          );
        });

        this.socket.on('lead:updated', (lead: LeadItem) => {
          if (!lead || !lead.id) return;
          this.leads.update((list) =>
            list.map((l) => {
              if (String(l.id).trim() !== String(lead.id).trim()) return l;
              return {
                ...l,
                ...lead,
                campaignName: (lead.campaignName && lead.campaignName !== 'Digital Ad Campaign')
                  ? lead.campaignName
                  : (l.campaignName || lead.campaignName || ''),
                campaignId: (lead.campaignId && lead.campaignId !== 'cmp_default')
                  ? lead.campaignId
                  : (l.campaignId || lead.campaignId || ''),
                source: (lead.source && lead.source !== 'Digital Ads Lead Form')
                  ? lead.source
                  : (l.source || lead.source || ''),
                assignedTo: lead.assignedTo ?? l.assignedTo,
                assigneeName: lead.assigneeName || l.assigneeName,
              };
            })
          );
        });

        this.socket.on('lead:deleted', (data: { leadId: string }) => {
          if (!data || !data.leadId) return;
          this.leads.update((list) =>
            list.filter((l) => String(l.id).trim() !== String(data.leadId).trim())
          );
        });

        this.socket.on('call:completed', (call: CallActivityItem) => {
          if (!call || !call.id) return;
          this.calls.update((list) => {
            if (list.some((c) => String(c.id) === String(call.id))) return list;
            return [call, ...list];
          });
        });
      } catch (e) {
        console.log('[LeadTelecallingService] Socket.io init notice:', e);
      }
    }
  }

  loadLeads() {
    this.loading.set(true);
    return this.http.get<LeadItem[]>('/api/leads').pipe(
      tap({
        next: (data) => {
          this.leads.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to load leads.');
          this.loading.set(false);
        },
      })
    );
  }

  createLead(payload: Partial<LeadItem>) {
    this.loading.set(true);
    return this.http.post<LeadItem>('/api/leads', payload).pipe(
      tap({
        next: (newLead) => {
          this.leads.update((list) => [newLead, ...list]);
          this.loading.set(false);
          this.loadSummary();
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to create lead.');
          this.loading.set(false);
        },
      })
    );
  }

  importLeadBatch(payload: {
    leads: Partial<LeadItem>[];
    campaignId: string;
    campaignName: string;
    source: string;
    creatorId: string;
    creatorEmail: string;
    creatorName: string;
    uploaderRole: string;
  }) {
    return this.http.post<LeadBatchImportResponse>('/api/leads/batch-import', payload).pipe(
      tap({
        next: (response) => {
          this.loadLeads().subscribe();
          this.loadSummary().subscribe();
        },
      })
    );
  }

  assignLead(leadId: string, assignedTo: string, assigneeName: string, meta?: { creatorName?: string; productName?: string; packageName?: string }) {
    return this.http.post<LeadItem>(`/api/leads/${leadId}/assign`, { assignedTo, assigneeName, ...meta }).pipe(
      tap({
        next: (updatedLead) => {
          this.leads.update((list) =>
            list.map((l) => (String(l.id).trim() === String(updatedLead.id).trim() ? updatedLead : l))
          );
          this.loadSummary().subscribe();
        },
      })
    );
  }

  updateLead(leadId: string, payload: Partial<LeadItem>) {
    this.loading.set(true);
    return this.http.put<{ success: boolean; lead: LeadItem }>(`/api/leads/${leadId}`, payload).pipe(
      tap({
        next: (res) => {
          const updated = res.lead || payload;
          this.leads.update((list) =>
            list.map((l) => (String(l.id).trim() === String(leadId).trim() ? { ...l, ...updated } : l))
          );
          this.loading.set(false);
          this.loadSummary().subscribe();
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to update lead.');
          this.loading.set(false);
        },
      })
    );
  }

  deleteLead(leadId: string) {
    this.loading.set(true);
    return this.http.delete<{ success: boolean; message: string; leadId: string }>(`/api/leads/${leadId}`).pipe(
      tap({
        next: () => {
          this.leads.update((list) => list.filter((l) => String(l.id).trim() !== String(leadId).trim()));
          this.loading.set(false);
          this.loadSummary().subscribe();
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to delete lead.');
          this.loading.set(false);
        },
      })
    );
  }

  loadCalls() {
    return this.http.get<CallActivityItem[]>('/api/calls').pipe(
      tap({
        next: (data) => this.calls.set(data),
      })
    );
  }

  logCall(payload: { leadId: string; leadPhone?: string; phone?: string; leadName?: string; firstName?: string; lastName?: string; outcome: string; durationSeconds: number; remarks: string; nextAction: string; followUpDate?: string; followUpTime?: string; amount?: number; telecallerId?: string; telecallerName?: string; telecallerEmail?: string }) {
    return this.http.post<{ call: CallActivityItem; lead: LeadItem }>('/api/calls', payload).pipe(
      tap({
        next: (res) => {
          this.calls.update((c) => [res.call, ...c]);
          const targetOutcome = String(payload.outcome || 'CONNECTED').toUpperCase().replace(/\s+/g, '_');
          const finalStatus = targetOutcome === 'BUSY' ? 'LINE_BUSY' : targetOutcome;
          const targetPhone = String(payload.leadPhone || payload.phone || '').replace(/\D/g, '');

          this.leads.update((l) =>
            l.map((item) => {
              const itemPhone = String(item.phone || '').replace(/\D/g, '');
              const matches =
                (res.lead && String(item.id).trim() === String(res.lead.id).trim()) ||
                String(item.id).trim() === String(payload.leadId).trim() ||
                (targetPhone && itemPhone && itemPhone === targetPhone);

              if (matches) {
                const updatedLead: LeadItem = {
                  ...item,
                  ...(res.lead || {}),
                  campaignName: (res.lead?.campaignName && res.lead.campaignName !== 'Digital Ad Campaign')
                    ? res.lead.campaignName
                    : (item.campaignName || res.lead?.campaignName || ''),
                  campaignId: (res.lead?.campaignId && res.lead.campaignId !== 'cmp_default')
                    ? res.lead.campaignId
                    : (item.campaignId || res.lead?.campaignId || ''),
                  source: (res.lead?.source && res.lead.source !== 'Digital Ads Lead Form')
                    ? res.lead.source
                    : (item.source || res.lead?.source || ''),
                  assignedTo: res.lead?.assignedTo || item.assignedTo,
                  assigneeName: res.lead?.assigneeName || item.assigneeName,
                  status: finalStatus as any,
                  updatedAt: new Date().toISOString(),
                };
                return updatedLead;
              }
              return item;
            })
          );
          this.loadFollowUps().subscribe();
          this.loadSummary().subscribe();
        },
      })
    );
  }

  loadFollowUps() {
    return this.http.get<FollowUpItem[]>('/api/followups').pipe(
      tap({
        next: (data) => this.followUps.set(data),
      })
    );
  }

  loadSummary() {
    return this.http.get<TelecallingSummary>('/api/leads/telecalling-summary').pipe(
      tap({
        next: (data) => this.summary.set(data),
      })
    );
  }
}
