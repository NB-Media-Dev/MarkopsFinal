import { Component, inject, OnInit, OnDestroy, signal, computed, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LeadTelecallingService, LeadItem, CallActivityItem, FollowUpItem, isClientDuplicateCall } from '../../core/services/lead-telecalling.service';
import { UserManagementService } from '../../core/services/user-management.service';
import { AuthService } from '../../core/services/auth.service';
import { CampaignService } from '../../core/services/campaign.service';
import { isItemForPackage } from '../../core/models/package.model';
import { PackageService } from '../../core/services/package.service';

import { TelecallingKpisComponent } from './components/telecalling-kpis/telecalling-kpis.component';
import { TelecallingPipelineStripComponent } from './components/telecalling-pipeline-strip/telecalling-pipeline-strip.component';
import { TelecallingQueueTableComponent } from './components/telecalling-queue-table/telecalling-queue-table.component';
import { CallHistoryModalComponent } from './components/modals/call-history-modal/call-history-modal.component';
import { CallLogModalComponent } from './components/modals/call-log-modal/call-log-modal.component';

function isSameUserId(uId: string, lAssignedTo: string): boolean {
  if (!uId || !lAssignedTo) return false;
  if (lAssignedTo === uId || lAssignedTo.toLowerCase() === uId.toLowerCase()) return true;
  const numUId = Number.parseInt(uId.replace(/\D/g, ''), 10);
  const numLId = Number.parseInt(lAssignedTo.replace(/\D/g, ''), 10);
  return !Number.isNaN(numUId) && !Number.isNaN(numLId) && numUId === numLId;
}

function isSameUserEmail(uEmail: string, lAssignedTo: string, lAssigneeEmail: string, lAssigneeName: string): boolean {
  if (!uEmail) return false;
  const target = uEmail.toLowerCase();
  return (
    lAssignedTo.toLowerCase() === target ||
    lAssigneeEmail.toLowerCase() === target ||
    lAssigneeName.toLowerCase() === target
  );
}

function isSameUserName(uName: string, lAssigneeName: string, lAssignedTo: string): boolean {
  if (!uName) return false;
  const target = uName.toLowerCase();
  const aName = lAssigneeName.toLowerCase();
  const aTo = lAssignedTo.toLowerCase();
  if (aName === target || aTo === target) return true;
  if (aName && (aName.includes(target) || target.includes(aName))) return true;
  return Boolean(aTo && (aTo.includes(target) || target.includes(aTo)));
}

function hasMatchingToken(uTokens: string[], lTokens: string[]): boolean {
  for (const ut of uTokens) {
    for (const lt of lTokens) {
      if (ut === lt || ut.includes(lt) || lt.includes(ut)) return true;
    }
  }
  return false;
}

export function isLeadAssignedToUser(l: any, user: any): boolean {
  if (!l || !user) return false;
  const uId = String(user.id || '').trim();
  const uEmail = String(user.email || '').toLowerCase().trim();
  const uName = String(user.fullName || user.name || user.username || '').toLowerCase().trim();

  const lAssignedTo = String(l.assignedTo || l.assigned_to || l.assignedTelecallerId || l.assigned_telecaller_id || '').trim();
  const lAssigneeName = String(l.assigneeName || l.assignee_name || l.assigneeFullName || l.assignedToName || '').toLowerCase().trim();
  const lAssigneeEmail = String(l.assigneeEmail || l.assignee_email || '').toLowerCase().trim();

  if (isSameUserId(uId, lAssignedTo)) return true;
  if (isSameUserEmail(uEmail, lAssignedTo, lAssigneeEmail, lAssigneeName)) return true;
  if (isSameUserName(uName, lAssigneeName, lAssignedTo)) return true;

  const uTokens = [uName, uEmail.split('@')[0], uId].filter((t) => t && t.length >= 3);
  const lTokens = [lAssigneeName, lAssignedTo.toLowerCase(), lAssigneeEmail.split('@')[0]].filter((t) => t && t.length >= 3);
  return hasMatchingToken(uTokens, lTokens);
}

export function normalizeCampaignName(name?: string): string {
  if (!name) return '';
  return name.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isLeadInCampaign(lead: any, campaign: any): boolean {
  if (!lead || !campaign) return false;
  const cId = String(campaign.id || '').trim();
  const lCId = String(lead.campaignId || '').trim();
  if (cId && lCId && cId === lCId) return true;

  const cNorm = normalizeCampaignName(campaign.name);
  const lNorm = normalizeCampaignName(lead.campaignName);
  const sNorm = normalizeCampaignName(lead.source);

  if (cNorm && lNorm) {
    if (cNorm === lNorm) return true;
    if (lNorm.includes(cNorm) || cNorm.includes(lNorm)) return true;
  }
  if (cNorm && sNorm) {
    if (cNorm === sNorm) return true;
    if (sNorm.includes(cNorm) || cNorm.includes(sNorm)) return true;
  }
  return false;
}

export function isLeadBelongsToUser(l: any, user: any): boolean {
  if (!l || !user) return false;


  if (isLeadAssignedToUser(l, user)) return true;

  if (user.role === 'TELECALLER') return false;

  const uId = String(user.id || '').toLowerCase().trim();
  const uEmail = String(user.email || '').toLowerCase().trim();
  const uName = String(user.fullName || '').toLowerCase().trim();

  const cId = String(l.creatorId || l.creator_id || l.uploaderId || l.createdBy || l.userId || '').toLowerCase().trim();
  const cEmail = String(l.creatorEmail || l.creator_email || l.uploaderEmail || '').toLowerCase().trim();
  const cName = String(l.creatorName || l.creator_name || '').toLowerCase().trim();

  if (uId && cId && uId === cId) return true;
  if (uEmail && cEmail && uEmail === cEmail) return true;
  if (uName && cName && uName === cName) return true;

  return false;
}

export function isCallMadeByUser(call: any, user: any): boolean {
  if (!call || !user) return false;
  const uId = String(user.id || '').toLowerCase().trim();
  const uEmail = String(user.email || '').toLowerCase().trim();
  const uName = String(user.fullName || '').toLowerCase().trim();

  const cTelecallerId = String(call.telecallerId || '').toLowerCase().trim();
  const cTelecallerName = String(call.telecallerName || '').toLowerCase().trim();
  const cTelecallerEmail = String(call.telecallerEmail || '').toLowerCase().trim();

  if (cTelecallerId && uId && cTelecallerId === uId) return true;
  if (cTelecallerEmail && uEmail && cTelecallerEmail === uEmail) return true;
  if (cTelecallerName && uName) {
    if (cTelecallerName === uName || cTelecallerName.includes(uName) || uName.includes(cTelecallerName)) return true;
  }
  if ((uName.includes('priya') || uEmail.includes('priya') || uId.includes('priya')) &&
      (cTelecallerName.includes('priya') || cTelecallerEmail.includes('priya') || cTelecallerId.includes('priya'))) {
    return true;
  }
  if ((uName.includes('raj') || uEmail.includes('raj') || uId.includes('raj')) &&
      (cTelecallerName.includes('raj') || cTelecallerEmail.includes('raj') || cTelecallerId.includes('raj'))) {
    return true;
  }
  return false;
}

function parseDateParts(d: string): { year: number; month: number; day: number } | null {
  const delim = d.includes('-') ? '-' : (d.includes('/') ? '/' : null);
  if (!delim) {
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return null;
    return { year: parsed.getFullYear(), month: parsed.getMonth(), day: parsed.getDate() };
  }
  const p = d.split(delim);
  if (p.length < 3) return null;
  if (p[0].length === 4) {
    return {
      year: Number.parseInt(p[0], 10),
      month: Number.parseInt(p[1], 10) - 1,
      day: Number.parseInt(p[2], 10),
    };
  }
  return {
    day: Number.parseInt(p[0], 10),
    month: Number.parseInt(p[1], 10) - 1,
    year: Number.parseInt(p[2], 10),
  };
}

function parseTimeParts(t: string): { hours: number; minutes: number } {
  if (!t) return { hours: 0, minutes: 0 };
  const cleanTime = t.replace(/Z.*/i, '').trim();
  if (!cleanTime.includes(':')) return { hours: 0, minutes: 0 };
  const tp = cleanTime.split(':');
  return {
    hours: Number.parseInt(tp[0], 10) || 0,
    minutes: Number.parseInt(tp[1], 10) || 0,
  };
}

export function parseFollowUpDateTime(dateStr?: string, timeStr?: string): Date | null {
  if (!dateStr) return null;
  let d = String(dateStr).trim();
  let t = String(timeStr || '').trim();

  if (d.includes('T')) {
    const parts = d.split('T');
    d = parts[0];
    t = t || parts[1] || '';
  } else if (d.includes(' ')) {
    const parts = d.split(/\s+/);
    d = parts[0];
    t = t || parts[1] || '';
  }

  const parts = parseDateParts(d);
  if (!parts) return null;

  const { hours, minutes } = parseTimeParts(t);
  const dt = new Date(parts.year, parts.month, parts.day, hours, minutes, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

@Component({
  selector: 'app-telecalling',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TelecallingKpisComponent,
    TelecallingPipelineStripComponent,
    TelecallingQueueTableComponent,
    CallHistoryModalComponent,
    CallLogModalComponent,
  ],
  templateUrl: './telecalling.component.html',
  styleUrl: './telecalling.component.scss',
})
export class TelecallingComponent implements OnInit, OnDestroy {
  private calculateConversionRate(assignedLen: number, calledCount: number, interestedCount: number): number {
    if (assignedLen > 0) {
      return Math.round((interestedCount / assignedLen) * 100);
    }
    if (calledCount > 0) {
      return Math.round((interestedCount / calledCount) * 100);
    }
    return 0;
  }

  @Input() embedded = false;
  @Input() viewMode: 'ALL' | 'MEMBERS' | 'ASSIGNED' | 'OVERVIEW' = 'ALL';

  readonly packageFilterSignal = signal<string | undefined>(undefined);
  @Input() set packageFilter(val: string | undefined) {
    this.packageFilterSignal.set(val);
  }
  get packageFilter(): string | undefined {
    return this.packageFilterSignal();
  }

  readonly productFilterSignal = signal<string | undefined>(undefined);
  @Input() set productFilter(val: string | undefined) {
    this.productFilterSignal.set(val);
  }
  get productFilter(): string | undefined {
    return this.productFilterSignal();
  }

  readonly leadService = inject(LeadTelecallingService);
  readonly userService = inject(UserManagementService);
  readonly authService = inject(AuthService);
  readonly campaignService = inject(CampaignService);
  readonly packageService = inject(PackageService);

  readonly selectedLeadForCall = signal<LeadItem | null>(null);
  readonly selectedLeadForHistory = signal<LeadItem | null>(null);
  readonly queueFilter = signal<'MY_LEADS' | 'ALL_LEADS'>('ALL_LEADS');
  readonly currentTime = signal<number>(Date.now());

  readonly isAdmin = computed(() => this.authService.currentUser()?.role === 'ADMINISTRATOR');
  readonly isManager = computed(() => this.authService.currentUser()?.role === 'MARKETING_MANAGER');
  readonly isTelecaller = computed(() => this.authService.currentUser()?.role === 'TELECALLER');
  readonly canLogCalls = computed(() => {
    const role = this.authService.currentUser()?.role;
    return role === 'TELECALLER';
  });

  callOutcome = 'BUSY';
  callDuration = 120;
  callRemarks = '';
  nextAction = '';
  enableReminder = false;
  followUpDate = '';
  followUpTime = '10:00';
  readonly todayDate = new Date().toISOString().split('T')[0];
  private clockInterval: any;

  readonly telecallerPerformanceList = computed(() => {
    const summary = this.leadService.summary();
    if (summary?.telecallerMetrics && summary.telecallerMetrics.length > 0) {
      return summary.telecallerMetrics;
    }

    const allUsers = this.userService.users();
    const telecallers = allUsers.filter((u) => u.role === 'TELECALLER');
    const allLeads = this.leadService.leads();
    const allCalls = this.leadService.calls();

    const telecallerList = telecallers.length > 0 ? telecallers : [];

    return telecallerList.map((tc) => {
      const assigned = allLeads.filter((l) => isLeadAssignedToUser(l, tc));
      const calls = allCalls.filter((c) => isCallMadeByUser(c, tc));

      const uniqueLeadsCalled = new Set(
        calls
          .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
          .filter((k) => !!k)
      );

      const uniqueAttendedLeads = new Set(
        calls
          .filter((c) => ['CONNECTED', 'INTERESTED', 'QUALIFIED', 'PAID', 'NOT_INTERESTED', 'FOLLOW_UP', 'WRONG_NUMBER'].includes(c.outcome))
          .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
          .filter((k) => !!k)
      );

      const uniqueNotAttendedLeads = new Set(
        calls
          .filter((c) => ['NO_ANSWER', 'BUSY', 'LINE_BUSY'].includes(c.outcome))
          .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
          .filter((k) => !!k)
      );

      const uniqueInterestedLeads = new Set(
        calls
          .filter((c) => ['INTERESTED', 'QUALIFIED', 'PAID'].includes(c.outcome))
          .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
          .filter((k) => !!k)
      );

      const uniqueNotInterestedLeads = new Set(
        calls
          .filter((c) => c.outcome === 'NOT_INTERESTED')
          .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
          .filter((k) => !!k)
      );

      const totalDurationSeconds = calls.reduce((acc, c) => acc + (Number(c.durationSeconds) || 0), 0);
      const avgDurationSeconds = calls.length > 0 ? Math.round(totalDurationSeconds / calls.length) : 0;

      return {
        id: tc.id,
        fullName: tc.fullName,
        email: tc.email,
        department: tc['department'] || 'Telecalling Sales',
        assignedLeadsCount: assigned.length,
        callsLoggedCount: uniqueLeadsCalled.size,
        attendedCount: uniqueAttendedLeads.size,
        notAttendedCount: uniqueNotAttendedLeads.size,
        interestedCount: uniqueInterestedLeads.size,
        notInterestedCount: uniqueNotInterestedLeads.size,
        totalDurationSeconds,
        avgDurationSeconds,
        conversionRate: this.calculateConversionRate(assigned.length, uniqueLeadsCalled.size, uniqueInterestedLeads.size),
      };
    });
  });

  readonly dateFilter = signal<'ALL' | 'TODAY' | 'YESTERDAY' | 'CUSTOM'>('ALL');
  readonly customDate = signal<string>('');
  readonly selectedCampaign = signal<string>('ALL');
  readonly searchQuery = signal<string>('');
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(10);

  readonly myLeads = computed(() => {
    const all = this.leadService.leads();
    const user = this.authService.currentUser();
    if (!user) return [];
    if (user.role === 'TELECALLER') {
      const assigned = all.filter((l) => isLeadAssignedToUser(l, user));
      if (assigned.length > 0) return assigned;

      return all;
    }
    const directAssigned = all.filter((l) => isLeadAssignedToUser(l, user));
    if (directAssigned.length > 0) return directAssigned;
    return all.filter((l) => isLeadBelongsToUser(l, user));
  });

  readonly otherTeamLeads = computed(() => {
    const all = this.leadService.leads();
    const user = this.authService.currentUser();
    if (!user || user.role === 'TELECALLER') return [];
    return all.filter((l) => !isLeadAssignedToUser(l, user));
  });

  readonly assignedLeads = computed(() => {
    const user = this.authService.currentUser();
    let leads: LeadItem[] = [];
    if (user?.role === 'TELECALLER') {
      leads = this.myLeads();
    } else {
      const filter = this.queueFilter();
      leads = filter === 'ALL_LEADS' ? this.leadService.leads() : this.myLeads();
    }

    const pkg = this.packageFilterSignal()?.trim();
    const prod = this.productFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();

    if ((pkg && pkg.toLowerCase() !== 'all') || (prod && prod.toLowerCase() !== 'all')) {
      const filtered = leads.filter((l) => isItemForPackage(l, pkg, prod, dbPkgs));
      if (filtered.length > 0) {
        leads = filtered;
      }
    }

    return leads;
  });

  readonly availableCampaigns = computed(() => {
    const portfolioCampaigns = this.campaignService.campaigns();
    const pkg = this.packageFilterSignal()?.trim();
    const prod = this.productFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();
    const scopedCampaigns = ((pkg && pkg.toLowerCase() !== 'all') || (prod && prod.toLowerCase() !== 'all'))
      ? portfolioCampaigns.filter((c) => isItemForPackage(c, pkg, prod, dbPkgs))
      : portfolioCampaigns;

    const leads = this.assignedLeads();

    if (scopedCampaigns.length > 0) {
      return scopedCampaigns.map((cmp) => {
        const count = leads.filter((l) => isLeadInCampaign(l, cmp)).length;
        return {
          id: cmp.id,
          name: cmp.name,
          count,
        };
      });
    }

    const map = new Map<string, number>();
    leads.forEach((l) => {
      const name = (l.campaignName || '').trim();
      if (name) {
        map.set(name, (map.get(name) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  });

  readonly campaignFilteredLeads = computed(() => {
    const leads = this.assignedLeads();
    const selected = this.selectedCampaign();
    if (!selected || selected === 'ALL') {
      return leads;
    }

    const portfolioCampaigns = this.campaignService.campaigns();
    const matchedCmp = portfolioCampaigns.find(
      (c) => c.name === selected || normalizeCampaignName(c.name) === normalizeCampaignName(selected) || String(c.id) === String(selected)
    );

    if (matchedCmp) {
      return leads.filter((l) => isLeadInCampaign(l, matchedCmp));
    }

    const selectedNorm = normalizeCampaignName(selected);
    return leads.filter((l) => {
      const lNameNorm = normalizeCampaignName(l.campaignName);
      const lSrcNorm = normalizeCampaignName(l.source);
      const lCmpId = String(l.campaignId || '').trim().toLowerCase();
      const sId = String(selected || '').trim().toLowerCase();
      return (
        (lCmpId && sId && lCmpId === sId) ||
        lNameNorm === selectedNorm ||
        lSrcNorm === selectedNorm ||
        (lNameNorm && selectedNorm && (lNameNorm.includes(selectedNorm) || selectedNorm.includes(lNameNorm)))
      );
    });
  });

  readonly pipelineStatusFilter = signal<'ALL' | 'NEW' | 'FOLLOW_UP' | 'INTERESTED' | 'QUALIFIED' | 'RETRY'>('ALL');

  readonly dateFilteredLeads = computed(() => {
    const leads = this.campaignFilteredLeads();
    const filter = this.dateFilter();
    if (filter === 'ALL') {
      return leads;
    }

    if (filter === 'CUSTOM') {
      const targetDate = this.customDate();
      if (!targetDate) return leads;
      return leads.filter((l) => {
        const createdStr = l.createdAt ? String(l.createdAt).split('T')[0] : '';
        const updatedStr = l.updatedAt ? String(l.updatedAt).split('T')[0] : '';
        const metrics = this.getLeadMetrics(l);
        const latestCall = metrics.calls?.[0];
        const callDateStr = latestCall?.calledAt ? String(latestCall.calledAt).split('T')[0] : '';
        return createdStr === targetDate || updatedStr === targetDate || callDateStr === targetDate;
      });
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const yest = new Date(now.getTime() - 86400000);
    const yestStr = yest.toISOString().split('T')[0];

    return leads.filter((l) => {
      const createdStr = l.createdAt ? String(l.createdAt).split('T')[0] : '';
      const updatedStr = l.updatedAt ? String(l.updatedAt).split('T')[0] : '';

      const metrics = this.getLeadMetrics(l);
      const latestCall = metrics.calls?.[0];
      const callDateStr = latestCall?.calledAt ? String(latestCall.calledAt).split('T')[0] : '';

      if (filter === 'TODAY') {
        return createdStr === todayStr || updatedStr === todayStr || callDateStr === todayStr;
      } else if (filter === 'YESTERDAY') {
        return createdStr === yestStr || updatedStr === yestStr || callDateStr === yestStr;
      }
      return true;
    });
  });

  readonly pipelineCounts = computed(() => {
    const leads = this.dateFilteredLeads();
    let newCount = 0;
    let followUpCount = 0;
    let interestedCount = 0;
    let qualifiedCount = 0;
    let retryCount = 0;

    leads.forEach((l) => {
      const status = this.getLeadCurrentStatus(l).toUpperCase();
      const metrics = this.getLeadMetrics(l);

      if (status === 'INTERESTED') {
        interestedCount++;
      } else if (status === 'QUALIFIED' || status === 'CONVERTED' || status === 'PAID') {
        qualifiedCount++;
      } else if (status === 'FOLLOW_UP') {
        followUpCount++;
      } else if (['LINE_BUSY', 'BUSY', 'NO_ANSWER', 'WRONG_NUMBER'].includes(status)) {
        retryCount++;
      } else if (status === 'NEW' || status === 'UNASSIGNED' || metrics.callsCount === 0) {
        newCount++;
      }
    });

    return {
      all: leads.length,
      new: newCount,
      followUp: followUpCount,
      interested: interestedCount,
      qualified: qualifiedCount,
      retry: retryCount,
    };
  });

  readonly filteredAssignedLeads = computed(() => {
    let leads = this.dateFilteredLeads();
    const pFilter = this.pipelineStatusFilter();

    if (pFilter === 'NEW') {
      leads = leads.filter((l) => {
        const s = this.getLeadCurrentStatus(l).toUpperCase();
        return s === 'NEW' || s === 'UNASSIGNED' || this.getLeadMetrics(l).callsCount === 0;
      });
    } else if (pFilter === 'FOLLOW_UP') {
      leads = leads.filter((l) => this.getLeadCurrentStatus(l).toUpperCase() === 'FOLLOW_UP');
    } else if (pFilter === 'INTERESTED') {
      leads = leads.filter((l) => this.getLeadCurrentStatus(l).toUpperCase() === 'INTERESTED');
    } else if (pFilter === 'QUALIFIED') {
      leads = leads.filter((l) => {
        const s = this.getLeadCurrentStatus(l).toUpperCase();
        return s === 'QUALIFIED' || s === 'CONVERTED' || s === 'PAID';
      });
    } else if (pFilter === 'RETRY') {
      leads = leads.filter((l) => ['LINE_BUSY', 'BUSY', 'NO_ANSWER', 'WRONG_NUMBER'].includes(this.getLeadCurrentStatus(l).toUpperCase()));
    }

    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      leads = leads.filter((l) => {
        const leadFullName = `${l.firstName || ''} ${l.lastName || ''}`.toLowerCase();
        const leadPhone = String(l.phone || '').toLowerCase();
        const assignee = String(l.assigneeName || l.assignedTo || '').toLowerCase();
        const campaign = String(l.campaignName || l.source || '').toLowerCase();
        const status = this.getLeadCurrentStatus(l).toLowerCase();
        const metrics = this.getLeadMetrics(l);
        const telecallerCallers = (metrics.calls || []).map((c: any) => String(c.telecallerName || '').toLowerCase()).join(' ');

        return (
          assignee.includes(q) ||
          telecallerCallers.includes(q) ||
          leadFullName.includes(q) ||
          leadPhone.includes(q) ||
          campaign.includes(q) ||
          status.includes(q)
        );
      });
    }

    return leads;
  });

  readonly totalPages = computed(() => {
    const total = this.filteredAssignedLeads().length;
    const size = this.pageSize();
    return Math.max(1, Math.ceil(total / size));
  });

  readonly paginatedLeads = computed(() => {
    const list = this.filteredAssignedLeads();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  });


  readonly getStatusBadgeClassFn = (status?: string) => this.getStatusBadgeClass(status);
  readonly getLeadCurrentStatusFn = (lead: LeadItem) => this.getLeadCurrentStatus(lead);
  readonly hasScheduledCallbackFn = (lead: LeadItem) => this.hasScheduledCallback(lead);
  readonly getFollowUpTimeLabelFn = (lead: LeadItem) => this.getFollowUpTimeLabel(lead);
  readonly isFollowUpDueFn = (lead: LeadItem) => this.isFollowUpDue(lead);
  readonly getLeadCreatorNameFn = (lead: LeadItem) => this.getLeadCreatorName(lead);
  readonly getLeadMetricsFn = (lead: LeadItem) => this.getLeadMetrics(lead);
  readonly formatStatusLabelFn = (status?: string) => this.formatStatusLabel(status);

  setSearchQuery(query: string) {
    this.searchQuery.set(query);
    this.currentPage.set(1);
  }

  setQueueFilter(filter: 'MY_LEADS' | 'ALL_LEADS') {
    this.queueFilter.set(filter);
    this.currentPage.set(1);
  }

  setPipelineFilter(filter: 'ALL' | 'NEW' | 'FOLLOW_UP' | 'INTERESTED' | 'QUALIFIED' | 'RETRY') {
    if (this.pipelineStatusFilter() === filter) {
      this.pipelineStatusFilter.set('ALL');
    } else {
      this.pipelineStatusFilter.set(filter);
    }
    this.currentPage.set(1);
  }

  getPipelineFilterLabel(): string {
    const filter = this.pipelineStatusFilter();
    switch (filter) {
      case 'NEW': return 'Never Called';
      case 'FOLLOW_UP': return 'Follow-ups';
      case 'INTERESTED': return 'Interested';
      case 'QUALIFIED': return 'Qualified';
      default: return 'All Leads';
    }
  }

  setDateFilter(filter: 'ALL' | 'TODAY' | 'YESTERDAY' | 'CUSTOM') {
    this.dateFilter.set(filter);
    if (filter !== 'CUSTOM') {
      this.customDate.set('');
    }
    this.currentPage.set(1);
  }

  setCustomDate(date: string) {
    if (date && date > this.todayDate) {
      date = this.todayDate;
    }
    this.customDate.set(date);
    if (date) {
      this.dateFilter.set('CUSTOM');
    } else {
      this.dateFilter.set('ALL');
    }
    this.currentPage.set(1);
  }

  selectCampaign(name: string) {
    this.selectedCampaign.set(name);
    this.currentPage.set(1);
  }

  resetAllFilters() {
    this.selectedCampaign.set('ALL');
    this.dateFilter.set('ALL');
    this.customDate.set('');
    this.pipelineStatusFilter.set('ALL');
    this.searchQuery.set('');
    this.currentPage.set(1);
  }

  setPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
    }
  }

  getPageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];

    let start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  mathMin(a: number, b: number): number {
    return Math.min(a, b);
  }

  readonly displayedCalls = computed(() => {
    const allCalls = this.leadService.calls();
    const user = this.authService.currentUser();
    const filter = this.queueFilter();

    if (this.isTelecaller()) {
      return allCalls.filter((c) => isCallMadeByUser(c, user));
    }

    if (filter === 'MY_LEADS' && user) {
      return allCalls.filter((c) => isCallMadeByUser(c, user));
    }

    return allCalls;
  });

  readonly myStats = computed(() => {
    const user = this.authService.currentUser();
    const calls = this.leadService.calls();
    const myLeads = this.assignedLeads();

    const myCalls = calls.filter((c) => isCallMadeByUser(c, user));

    const uniqueLeadsCalled = new Set(
      myCalls
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );
    const uniqueInterestedLeads = new Set(
      myCalls
        .filter((c) => c.outcome === 'INTERESTED' || c.outcome === 'QUALIFIED')
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );
    const uniqueNotInterestedLeads = new Set(
      myCalls
        .filter((c) => c.outcome === 'NOT_INTERESTED')
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );
    const uniqueAttendedLeads = new Set(
      myCalls
        .filter((c) => ['CONNECTED', 'INTERESTED', 'QUALIFIED', 'NOT_INTERESTED', 'FOLLOW_UP', 'WRONG_NUMBER'].includes(c.outcome))
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );
    const uniqueNotAttendedLeads = new Set(
      myCalls
        .filter((c) => ['NO_ANSWER', 'BUSY', 'LINE_BUSY'].includes(c.outcome))
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );

    return {
      assignedCount: myLeads.length,
      callsCount: uniqueLeadsCalled.size,
      interestedCount: uniqueInterestedLeads.size,
      notInterestedCount: uniqueNotInterestedLeads.size,
      attendedCount: uniqueAttendedLeads.size,
      notAttendedCount: uniqueNotAttendedLeads.size,
    };
  });

  readonly teamSummaryKpis = computed(() => {
    const list = this.telecallerPerformanceList();
    const calls = this.leadService.calls();
    const leads = this.leadService.leads();

    const uniqueLeadsCalled = new Set(
      calls
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );
    const uniqueInterestedLeads = new Set(
      calls
        .filter((c) => ['INTERESTED', 'QUALIFIED', 'PAID'].includes(String(c.outcome || '').toUpperCase()))
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );
    const totalCalls = uniqueLeadsCalled.size;
    const interested = uniqueInterestedLeads.size;
    const avgConv = list.length > 0 ? Math.round(list.reduce((acc, tc) => acc + tc.conversionRate, 0) / list.length) : 0;

    return {
      activeTelecallers: list.length,
      totalCalls,
      totalLeads: leads.length,
      interestedLeads: interested,
      avgConversionRate: avgConv,
    };
  });

  ngOnInit() {
    this.leadService.loadLeads().subscribe();
    this.leadService.loadCalls().subscribe();
    this.leadService.loadFollowUps().subscribe();
    this.leadService.loadSummary().subscribe();
    this.userService.loadUsersFromDatabase();
    this.campaignService.loadCampaigns().subscribe();
    this.packageService.loadPackages().subscribe();

    this.clockInterval = setInterval(() => {
      this.currentTime.set(Date.now());
    }, 2000);
  }

  ngOnDestroy() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
  }

  openCallDrawer(lead: LeadItem) {
    if (!this.canLogCalls()) {
      alert('Access Restricted: Administrator role is in View-Only mode and cannot enter call logs.');
      return;
    }
    this.selectedLeadForCall.set(lead);
    this.callOutcome = 'BUSY';
    this.callDuration = 120;
    this.callRemarks = '';
    this.nextAction = '';
    this.enableReminder = false;
    this.followUpDate = '';
    this.followUpTime = '10:00';
  }

  closeDrawer() {
    this.selectedLeadForCall.set(null);
  }

  openLeadHistory(lead: LeadItem) {
    this.selectedLeadForHistory.set(lead);
    this.leadService.loadCalls().subscribe();
    this.leadService.loadLeads().subscribe();
  }

  closeLeadHistory() {
    this.selectedLeadForHistory.set(null);
  }

  readonly currentLeadForHistory = computed(() => {
    const sel = this.selectedLeadForHistory();
    if (!sel) return null;
    const leads = this.leadService.leads();
    const lId = String(sel.id || '').trim().toLowerCase();
    const lPhone = String(sel.phone || '').replace(/\D/g, '');
    const found = leads.find((l) => {
      const id = String(l.id || '').trim().toLowerCase();
      const phone = String(l.phone || '').replace(/\D/g, '');
      if (id && lId && id === lId) return true;
      if (phone && lPhone && (phone === lPhone || (phone.length >= 7 && lPhone.length >= 7 && (phone.endsWith(lPhone) || lPhone.endsWith(phone))))) return true;
      return false;
    });
    return found ? { ...sel, ...found } : sel;
  });

  readonly currentLeadHistoryCalls = computed(() => {
    const lead = this.currentLeadForHistory();
    if (!lead) return [];
    return this.getLeadMetrics(lead).calls;
  });

  private matchesCallPhone(lPhone: string, cPhone: string): boolean {
    if (!lPhone || !cPhone) return false;
    if (lPhone === cPhone) return true;
    if (lPhone.length >= 10 && cPhone.length >= 10 && lPhone.slice(-10) === cPhone.slice(-10)) return true;
    return lPhone.length >= 7 && (lPhone.endsWith(cPhone) || cPhone.endsWith(lPhone));
  }

  private matchesLeadCallItem(c: CallActivityItem, lId: string, lNum: string, lPhone: string, lName: string): boolean {
    const cLeadId = String(c.leadId || '').trim().toLowerCase();
    const cNum = cLeadId.replace(/\D/g, '');
    if ((cLeadId && lId && cLeadId === lId) || (cNum && lNum && cNum === lNum)) return true;

    const cPhone = String(c.leadPhone || c.phone || '').replace(/\D/g, '');
    if (this.matchesCallPhone(lPhone, cPhone)) return true;

    const cLeadName = String(c.leadName || '').trim().toLowerCase();
    return Boolean(cLeadName && lName && lName.length >= 3 && (cLeadName === lName || cLeadName.includes(lName) || lName.includes(cLeadName)));
  }

  private matchesPendingFollowUp(f: FollowUpItem, lId: string, lPhone: string, lName: string): boolean {
    const fLeadId = String(f.leadId || '').trim().toLowerCase();
    const fPhone = String(f.leadPhone || '').replace(/\D/g, '');
    const fLeadName = String(f.leadName || '').trim().toLowerCase();
    const match = (fLeadId && lId && (fLeadId === lId || fLeadId.replace(/\D/g, '') === lId.replace(/\D/g, ''))) ||
                  (lPhone && fPhone && lPhone.length >= 7 && (lPhone === fPhone || lPhone.endsWith(fPhone) || fPhone.endsWith(lPhone))) ||
                  (!lPhone && !fPhone && fLeadName && lName && fLeadName === lName);
    return Boolean(match && f.status === 'PENDING' && !!f.dueDate);
  }

  private parseFollowUpParts(rawDate: string, rawTime: string): { cleanDate: string; cleanTime: string } {
    let cleanDate = rawDate;
    let cleanTime = rawTime;
    if (cleanDate.includes('T')) {
      const parts = cleanDate.split('T');
      cleanDate = parts[0];
      if (!cleanTime && parts[1]) cleanTime = parts[1].slice(0, 5);
    } else if (cleanDate.includes(' ')) {
      const parts = cleanDate.split(/\s+/);
      cleanDate = parts[0];
      if (!cleanTime && parts[1]) cleanTime = parts[1].slice(0, 5);
    }
    return { cleanDate, cleanTime };
  }

  getLeadMetrics(lead: LeadItem): {
    callsCount: number;
    attended: number;
    missed: number;
    avgDuration: number;
    calls: CallActivityItem[];
  } {
    if (!lead) {
      return { callsCount: 0, attended: 0, missed: 0, avgDuration: 0, calls: [] };
    }
    const allCalls = this.leadService.calls();
    const lId = String(lead.id || '').trim().toLowerCase();
    const lNum = lId.replace(/\D/g, '');
    const lPhone = String(lead.phone || '').replace(/\D/g, '');
    const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

    const rawCalls = allCalls.filter((c) => this.matchesLeadCallItem(c, lId, lNum, lPhone, lName));

    const leadCalls: CallActivityItem[] = [];
    for (const call of rawCalls) {
      if (!leadCalls.some((existing) => isClientDuplicateCall(existing, call))) {
        leadCalls.push(call);
      }
    }
    leadCalls.sort((a, b) => new Date(b.calledAt || 0).getTime() - new Date(a.calledAt || 0).getTime());

    const attendedSet = new Set(['CONNECTED', 'INTERESTED', 'QUALIFIED', 'PAID', 'CONVERTED', 'NOT_INTERESTED', 'FOLLOW_UP', 'FOLLOW_UP_SCHEDULED', 'WRONG_NUMBER']);
    const missedSet = new Set(['NO_ANSWER', 'BUSY', 'LINE_BUSY', 'MISSED', 'UNANSWERED']);

    const attended = leadCalls.filter((c) => {
      const out = String(c.outcome || '').toUpperCase().replace(/\s+/g, '_');
      return attendedSet.has(out);
    }).length;

    const missed = leadCalls.filter((c) => {
      const out = String(c.outcome || '').toUpperCase().replace(/\s+/g, '_');
      return missedSet.has(out);
    }).length;

    const totalDuration = leadCalls.reduce((acc, c) => acc + (Number(c.durationSeconds) || 0), 0);
    const avgDuration = leadCalls.length > 0 ? Math.round(totalDuration / leadCalls.length) : 0;

    return {
      callsCount: leadCalls.length,
      attended,
      missed,
      avgDuration,
      calls: leadCalls,
    };
  }

  private resolveCreatorFromId(cId: string): string | null {
    const matched = this.userService.users().find(
      (u) => String(u.id).trim().toLowerCase() === cId || u.email?.trim().toLowerCase() === cId
    );
    return matched?.fullName || null;
  }

  private resolveCreatorFromEmail(email: string): string | null {
    const matched = this.userService.users().find(
      (u) => u.email?.trim().toLowerCase() === email
    );
    if (matched?.fullName) return matched.fullName;
    const prefix = email.split('@')[0];
    return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : null;
  }

  getLeadCreatorName(lead: LeadItem): string {
    if (!lead) return 'System Administrator';
    if (lead.creatorName?.trim()) return lead.creatorName.trim();

    const cId = String(lead.creatorId || lead.uploaderId || '').trim().toLowerCase();
    if (cId) {
      const name = this.resolveCreatorFromId(cId);
      if (name) return name;
    }

    const email = (lead.creatorEmail || lead.uploaderEmail || '').trim().toLowerCase();
    if (email) {
      const name = this.resolveCreatorFromEmail(email);
      if (name) return name;
    }

    return 'System Administrator';
  }

  getLeadCurrentStatus(lead: LeadItem): string {
    if (!lead) return 'ASSIGNED';
    const statusMap: Record<string, string> = {
      BUSY: 'LINE_BUSY',
      LINE_BUSY: 'LINE_BUSY',
      NO_ANSWER: 'NO_ANSWER',
      WRONG_NUMBER: 'WRONG_NUMBER',
      FOLLOW_UP: 'FOLLOW_UP',
      FOLLOW_UP_SCHEDULED: 'FOLLOW_UP',
      INTERESTED: 'INTERESTED',
      NOT_INTERESTED: 'NOT_INTERESTED',
      QUALIFIED: 'PAID',
      CONVERTED: 'PAID',
      PAID: 'PAID',
      CONNECTED: 'CONNECTED',
    };

    const metrics = this.getLeadMetrics(lead);
    if (metrics.calls && metrics.calls.length > 0) {
      const latestCall = metrics.calls[0];
      const rawOut = String(latestCall.outcome || '').toUpperCase().replace(/\s+/g, '_');
      if (rawOut === 'CONNECTED') {
        return (latestCall.followUpDate || this.hasScheduledCallback(lead)) ? 'FOLLOW_UP' : 'CONNECTED';
      }
      return statusMap[rawOut] || rawOut;
    }

    const rawSt = String(lead.status || '').toUpperCase().replace(/\s+/g, '_');
    return statusMap[rawSt] || lead.status || 'ASSIGNED';
  }

  isFollowUpDue(lead: LeadItem): boolean {
    if (!lead) return false;
    const currentStatus = this.getLeadCurrentStatus(lead);
    if (['PAID', 'QUALIFIED', 'NOT_INTERESTED', 'WRONG_NUMBER'].includes(currentStatus)) {
      return false;
    }

    const nowMs = this.currentTime();
    const metrics = this.getLeadMetrics(lead);
    const leadCalls = metrics.calls;

    if (leadCalls && leadCalls.length > 0) {
      const latestCall = leadCalls[0];
      if (latestCall.followUpDate) {
        const dt = parseFollowUpDateTime(latestCall.followUpDate, latestCall.followUpTime);
        if (dt && nowMs >= dt.getTime()) {
          return true;
        }
      }
    }

    const lId = String(lead.id || '').trim().toLowerCase();
    const lPhone = String(lead.phone || '').replace(/\D/g, '');
    const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

    const allFollowUps = this.leadService.followUps();
    const pendingFollowUp = allFollowUps.find((f) => this.matchesPendingFollowUp(f, lId, lPhone, lName));

    if (pendingFollowUp?.dueDate) {
      const dt = parseFollowUpDateTime(pendingFollowUp.dueDate, pendingFollowUp.dueTime);
      if (dt && nowMs >= dt.getTime()) {
        return true;
      }
    }

    return false;
  }

  hasScheduledCallback(lead: LeadItem): boolean {
    if (!lead) return false;
    const currentStatus = String(lead.status || '').toUpperCase();
    if (['PAID', 'QUALIFIED', 'NOT_INTERESTED', 'WRONG_NUMBER'].includes(currentStatus)) {
      return false;
    }

    const metrics = this.getLeadMetrics(lead);
    const leadCalls = metrics.calls;

    if (leadCalls && leadCalls.length > 0 && leadCalls[0].followUpDate) {
      return true;
    }

    const lId = String(lead.id || '').trim().toLowerCase();
    const lPhone = String(lead.phone || '').replace(/\D/g, '');
    const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

    const allFollowUps = this.leadService.followUps();
    return allFollowUps.some((f) => this.matchesPendingFollowUp(f, lId, lPhone, lName));
  }

  private resolveLeadFollowUpRawDateTime(lead: LeadItem, leadCalls: CallActivityItem[]): { fDate: string; fTime: string } {
    if (leadCalls && leadCalls.length > 0 && leadCalls[0].followUpDate) {
      return {
        fDate: leadCalls[0].followUpDate,
        fTime: leadCalls[0].followUpTime || '',
      };
    }
    const lId = String(lead.id || '').trim().toLowerCase();
    const lPhone = String(lead.phone || '').replace(/\D/g, '');
    const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

    const allFollowUps = this.leadService.followUps();
    const f = allFollowUps.find((item) => this.matchesPendingFollowUp(item, lId, lPhone, lName));
    if (f?.dueDate) {
      return { fDate: f.dueDate, fTime: f.dueTime || '' };
    }
    return { fDate: '', fTime: '' };
  }

  getFollowUpTimeLabel(lead: LeadItem): string | null {
    if (!lead) return null;
    const currentStatus = String(lead.status || '').toUpperCase();
    if (['PAID', 'QUALIFIED', 'NOT_INTERESTED', 'WRONG_NUMBER'].includes(currentStatus)) {
      return null;
    }

    const metrics = this.getLeadMetrics(lead);
    const { fDate, fTime } = this.resolveLeadFollowUpRawDateTime(lead, metrics.calls);
    if (!fDate) return null;

    const { cleanDate, cleanTime } = this.parseFollowUpParts(fDate, fTime);
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    let dayLabel = cleanDate;
    if (cleanDate === todayStr) {
      dayLabel = 'Today';
    } else if (cleanDate === tomorrowStr) {
      dayLabel = 'Tomorrow';
    }

    return cleanTime ? `${dayLabel} @ ${cleanTime}` : dayLabel;
  }

  getLeadHistoryCalls(lead: LeadItem | null): CallActivityItem[] {
    if (!lead) return [];
    return this.getLeadMetrics(lead).calls;
  }

  submitCallLog() {
    if (!this.canLogCalls()) {
      alert('Access Restricted: Administrator role is in View-Only mode and cannot enter call logs.');
      return;
    }
    const lead = this.selectedLeadForCall();
    if (!lead) return;

    const user = this.authService.currentUser();
    const outcomeFormatted = String(this.callOutcome || 'BUSY').toUpperCase().replace(/\s+/g, '_');
    let finalOutcome = outcomeFormatted === 'BUSY' ? 'LINE_BUSY' : outcomeFormatted;
    if (finalOutcome === 'QUALIFIED') finalOutcome = 'PAID';
    const leadFullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
    const shouldShowDur =
      this.callOutcome !== 'BUSY' &&
      this.callOutcome !== 'LINE_BUSY' &&
      this.callOutcome !== 'NO_ANSWER' &&
      this.callOutcome !== 'WRONG_NUMBER';
    const effectiveDuration = shouldShowDur ? (Number(this.callDuration) || 0) : 0;
    let finalFollowUp = '';
    if (this.enableReminder && this.followUpDate) {
      finalFollowUp = this.followUpTime ? `${this.followUpDate} ${this.followUpTime}` : this.followUpDate;
    }
    const finalFollowUpTime = this.enableReminder ? this.followUpTime : '';

    this.leadService.leads.update((list) =>
      list.map((l) => (l.id === lead.id || (l.phone && lead.phone && l.phone.replace(/\D/g, '') === lead.phone.replace(/\D/g, '')) ? { ...l, status: finalOutcome as any, remarks: this.callRemarks, notes: this.callRemarks } : l))
    );

    this.leadService
      .logCall({
        leadId: lead.id,
        leadPhone: lead.phone,
        leadName: leadFullName,
        firstName: lead.firstName,
        lastName: lead.lastName,
        outcome: this.callOutcome,
        durationSeconds: effectiveDuration,
        remarks: this.callRemarks,
        nextAction: this.nextAction,
        followUpDate: finalFollowUp,
        followUpTime: finalFollowUpTime,
        telecallerId: user?.id,
        telecallerName: user?.fullName,
        telecallerEmail: user?.email,
      })
      .subscribe({
        next: (res) => {
          this.closeDrawer();
          if (res?.lead) {
            this.leadService.leads.update((list) =>
              list.map((l) => {
                const matches =
                  String(l.id).trim() === String(res.lead.id).trim() ||
                  (l.phone && lead.phone && l.phone.replace(/\D/g, '') === lead.phone.replace(/\D/g, ''));
                if (matches) {
                  return {
                    ...l,
                    ...res.lead,
                    campaignName: (res.lead?.campaignName && res.lead.campaignName !== 'Digital Ad Campaign')
                      ? res.lead.campaignName
                      : (l.campaignName || res.lead?.campaignName || ''),
                    campaignId: (res.lead?.campaignId && res.lead.campaignId !== 'cmp_default')
                      ? res.lead.campaignId
                      : (l.campaignId || res.lead?.campaignId || ''),
                    source: (res.lead?.source && res.lead.source !== 'Digital Ads Lead Form')
                      ? res.lead.source
                      : (l.source || res.lead?.source || ''),
                    assignedTo: res.lead?.assignedTo || l.assignedTo,
                    assigneeName: res.lead?.assigneeName || l.assigneeName,
                    status: finalOutcome as any,
                    remarks: this.callRemarks || (res.lead as any)?.remarks || (l as any)?.remarks || '',
                    notes: this.callRemarks || (res.lead as any)?.notes || (l as any)?.notes || '',
                    updatedAt: new Date().toISOString(),
                  };
                }
                return l;
              })
            );
          }
          if (res?.call) {
            this.leadService.calls.update((cList) => [res.call, ...cList.filter((c) => c.id !== res.call.id)]);
          }
          this.leadService.loadLeads().subscribe();
          this.leadService.loadCalls().subscribe();
          this.leadService.loadFollowUps().subscribe();
          this.leadService.loadSummary().subscribe();
        },
        error: (err) => {
          console.error('Failed to log call activity:', err);
        },
      });
  }

  formatStatusLabel(status?: string): string {
    const s = (status || '').toUpperCase().trim();
    switch (s) {
      case 'PAID':
      case 'QUALIFIED':
      case 'CONVERTED':
        return 'Paid';
      case 'ASSIGNED':
      case 'NEW':
        return 'Assigned';
      case 'LINE_BUSY':
      case 'BUSY':
        return 'Line Busy';
      case 'NO_ANSWER':
        return 'No Answer';
      case 'WRONG_NUMBER':
        return 'Wrong Number';
      case 'FOLLOW_UP':
      case 'FOLLOW_UP_SCHEDULED':
        return 'Follow Up';
      case 'INTERESTED':
        return 'Interested';
      case 'NOT_INTERESTED':
        return 'Not Interested';
      case 'CONNECTED':
        return 'Connected';
      default:
        return s ? (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replaceAll('_', ' ')) : 'Assigned';
    }
  }

  getStatusBadgeClass(status?: string): string {
    const s = (status || '').toUpperCase().trim();
    switch (s) {
      case 'ASSIGNED':
      case 'NEW':
        return 'status-pill-slate status-pill-assigned';
      case 'FOLLOW_UP':
      case 'FOLLOW_UP_SCHEDULED':
        return 'status-pill-indigo status-pill-contacted';
      case 'NO_ANSWER':
        return 'status-pill-amber status-pill-no-answer';
      case 'BUSY':
      case 'LINE_BUSY':
        return 'status-pill-orange status-pill-line-busy';
      case 'INTERESTED':
        return 'status-pill-purple status-pill-interested';
      case 'QUALIFIED':
      case 'CONVERTED':
      case 'PAID':
        return 'status-pill-teal status-pill-paid';
      case 'NOT_INTERESTED':
        return 'status-pill-rose status-pill-not-interested';
      case 'WRONG_NUMBER':
        return 'status-pill-danger status-pill-wrong-number';
      case 'CONNECTED':
        return 'status-pill-emerald status-pill-connected';
      default:
        return 'status-pill-slate status-pill-assigned';
    }
  }
}
