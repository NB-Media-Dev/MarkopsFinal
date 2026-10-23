import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { getBackendBaseUrl, getAuthToken } from '../utils/api-url.utils';

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
  adName?: string;
  remarks?: string;
  notes?: string;
  status: 'NEW' | 'ASSIGNED' | 'CONTACTED' | 'FOLLOW_UP' | 'INTERESTED' | 'NOT_INTERESTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST' | 'WRONG_NUMBER' | 'BUSY' | 'NO_ANSWER' | 'LINE_BUSY' | string;
  assignedTo?: string | null;
  assigneeName?: string;
  creatorId?: string;
  creatorEmail?: string;
  creatorName?: string;
  uploaderId?: string;
  uploaderEmail?: string;
  productId?: string;
  productName?: string;
  packageName?: string;
  package?: string;
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

function isSameNumericCallId(id1?: string, id2?: string): boolean {
  if (id1 && id2 && String(id1).trim() === String(id2).trim()) {
    return true;
  }
  const isPureDbId1 = /^call_\d+$/.test(String(id1 || '').trim()) || /^\d+$/.test(String(id1 || '').trim());
  const isPureDbId2 = /^call_\d+$/.test(String(id2 || '').trim()) || /^\d+$/.test(String(id2 || '').trim());
  if (isPureDbId1 && isPureDbId2) {
    const num1 = String(id1).replace(/\D/g, '');
    const num2 = String(id2).replace(/\D/g, '');
    return Boolean(num1 && num2 && num1 === num2);
  }
  return false;
}

function isSameLead(c1: CallActivityItem, c2: CallActivityItem): boolean {
  const lead1 = String(c1.leadId || '').replace(/\D/g, '') || String(c1.leadId || '').trim();
  const lead2 = String(c2.leadId || '').replace(/\D/g, '') || String(c2.leadId || '').trim();
  if (lead1 && lead2 && lead1 === lead2) return true;
  const phone1 = String(c1.leadPhone || c1.phone || '').replace(/\D/g, '');
  const phone2 = String(c2.leadPhone || c2.phone || '').replace(/\D/g, '');
  return Boolean(phone1 && phone2 && (phone1 === phone2 || (phone1.length >= 7 && phone2.length >= 7 && (phone1.endsWith(phone2) || phone2.endsWith(phone1)))));
}

function isMatchingOutcome(outcome1?: string, outcome2?: string): boolean {
  const out1 = String(outcome1 || '').toUpperCase().replace(/\s+/g, '_');
  const out2 = String(outcome2 || '').toUpperCase().replace(/\s+/g, '_');
  if (out1 === out2) return true;
  if ((out1 === 'FOLLOW_UP' && out2 === 'CONNECTED') || (out1 === 'CONNECTED' && out2 === 'FOLLOW_UP')) return true;
  if ((out1 === 'LINE_BUSY' && out2 === 'BUSY') || (out1 === 'BUSY' && out2 === 'LINE_BUSY')) return true;
  return (out1 === 'QUALIFIED' || out1 === 'PAID') && (out2 === 'QUALIFIED' || out2 === 'PAID');
}

function isMatchingCallTimestamp(time1?: string | Date, time2?: string | Date): boolean {
  if (!time1 || !time2) return true;
  const t1 = new Date(time1).getTime();
  const t2 = new Date(time2).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return true;
  const diff = Math.abs(t1 - t2);
  const isFivePointFiveHours = Math.abs(diff - (5.5 * 3600 * 1000)) <= 60000;
  return diff <= 60000 || isFivePointFiveHours;
}

export function isClientDuplicateCall(c1: CallActivityItem, c2: CallActivityItem): boolean {
  if (!c1 || !c2) return false;
  if (isSameNumericCallId(c1.id, c2.id)) return true;
  if (!isSameLead(c1, c2)) return false;
  if (!isMatchingOutcome(c1.outcome, c2.outcome)) return false;
  return isMatchingCallTimestamp(c1.calledAt, c2.calledAt);
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
        const token = getAuthToken();
        let cachedUser: any = null;
        try {
          const userStr = localStorage.getItem('markops_user');
          if (userStr) cachedUser = JSON.parse(userStr);
        } catch (error_) { console.log('[Storage Notice] Skipped:', error_); }

        this.socket = io(backendUrl, {
          auth: {
            token: token || undefined,
            userId: cachedUser?.id,
            role: cachedUser?.role,
            email: cachedUser?.email,
            fullName: cachedUser?.fullName,
          },
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 5,
        });

        this.socket.on('connect_error', (error) => {
          console.warn('[LeadTelecallingService] Realtime connection notice:', error.message);
        });

        this.socket.on('lead:status_changed', (data: { leadId: string; status: string }) => {
          if (!data || !data.leadId) return;
          const status = data.status === 'QUALIFIED' ? 'PAID' : data.status;
          this.leads.update((list) =>
            list.map((l) => (String(l.id).trim() === String(data.leadId).trim() ? { ...l, status: status as any } : l))
          );
        });

        this.socket.on('lead:updated', (lead: LeadItem) => {
          if (!lead || !lead.id) return;
          const status = lead.status === 'QUALIFIED' ? 'PAID' : lead.status;
          this.leads.update((list) =>
            list.map((l) => {
              if (String(l.id).trim() !== String(lead.id).trim()) return l;
              return {
                ...l,
                ...lead,
                status: status as any,
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
          const normalizedOutcome = (call.outcome === 'QUALIFIED' || call.outcome === 'PAID') ? 'PAID' : call.outcome;
          const normalizedCall: CallActivityItem = { ...call, outcome: normalizedOutcome };
          this.calls.update((list) => {
            if (list.some((c) => String(c.id) === String(normalizedCall.id) || isClientDuplicateCall(c, normalizedCall))) return list;
            return [normalizedCall, ...list];
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
          const normalized = (data || []).map((l) => ({
            ...l,
            status: l.status === 'QUALIFIED' ? 'PAID' : l.status,
          }));
          this.leads.set(normalized);
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
          const status = updated.status === 'QUALIFIED' ? 'PAID' : updated.status;
          this.leads.update((list) =>
            list.map((l) => (String(l.id).trim() === String(leadId).trim() ? { ...l, ...updated, ...(status ? { status } : {}) } : l))
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
        next: (data) => {
          const unique: CallActivityItem[] = [];
          for (const rawItem of (data || [])) {
            const outcome = (rawItem.outcome === 'QUALIFIED' || rawItem.outcome === 'PAID') ? 'PAID' : rawItem.outcome;
            const item: CallActivityItem = { ...rawItem, outcome };
            if (!unique.some((existing) => isClientDuplicateCall(existing, item))) {
              unique.push(item);
            }
          }
          this.calls.set(unique);
        },
      })
    );
  }

  logCall(payload: { leadId: string; leadPhone?: string; phone?: string; leadName?: string; firstName?: string; lastName?: string; outcome: string; durationSeconds: number; remarks: string; nextAction: string; followUpDate?: string; followUpTime?: string; amount?: number; telecallerId?: string; telecallerName?: string; telecallerEmail?: string }) {
    return this.http.post<{ call: CallActivityItem; lead: LeadItem }>('/api/calls', payload).pipe(
      tap({
        next: (res) => {
          const rawCall = res.call || ({} as any);
          const callOutcome = (rawCall.outcome === 'QUALIFIED' || rawCall.outcome === 'PAID' || payload.outcome === 'QUALIFIED' || payload.outcome === 'PAID') ? 'PAID' : rawCall.outcome;
          const normalizedCall: CallActivityItem = { ...rawCall, outcome: callOutcome };
          this.calls.update((c) => [normalizedCall, ...c.filter((item) => !isClientDuplicateCall(item, normalizedCall))]);
          const targetOutcome = String(payload.outcome || 'BUSY').toUpperCase().replace(/\s+/g, '_');
          let finalStatus = targetOutcome === 'BUSY' ? 'LINE_BUSY' : targetOutcome;
          if (finalStatus === 'QUALIFIED') finalStatus = 'PAID';
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
                  remarks: payload.remarks || (res.lead as any)?.remarks || (item as any)?.remarks || '',
                  notes: payload.remarks || (res.lead as any)?.notes || (item as any)?.notes || '',
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
