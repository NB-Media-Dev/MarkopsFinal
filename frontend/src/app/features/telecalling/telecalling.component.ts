import { Component, inject, OnInit, OnDestroy, signal, computed, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LeadTelecallingService, LeadItem, CallActivityItem } from '../../core/services/lead-telecalling.service';
import { UserManagementService } from '../../core/services/user-management.service';
import { AuthService } from '../../core/services/auth.service';
import { CampaignService } from '../../core/services/campaign.service';
import { FIXED_PACKAGES, isItemForPackage, resolveProductContext } from '../../core/models/package.model';
import { PackageService } from '../../core/services/package.service';

import { TelecallingKpisComponent } from './components/telecalling-kpis/telecalling-kpis.component';
import { TelecallingPipelineStripComponent } from './components/telecalling-pipeline-strip/telecalling-pipeline-strip.component';
import { TelecallingQueueTableComponent } from './components/telecalling-queue-table/telecalling-queue-table.component';
import { CallHistoryModalComponent } from './components/modals/call-history-modal/call-history-modal.component';
import { CallLogModalComponent } from './components/modals/call-log-modal/call-log-modal.component';

export function isLeadAssignedToUser(l: any, user: any): boolean {
  if (!l || !user) return false;
  const uId = String(user.id || '').trim();
  const uEmail = String(user.email || '').toLowerCase().trim();
  const uName = String(user.fullName || user.name || user.username || '').toLowerCase().trim();

  const lAssignedTo = String(l.assignedTo || l.assigned_to || l.assignedTelecallerId || l.assigned_telecaller_id || '').trim();
  const lAssigneeName = String(l.assigneeName || l.assignee_name || l.assigneeFullName || l.assignedToName || '').toLowerCase().trim();
  const lAssigneeEmail = String(l.assigneeEmail || l.assignee_email || '').toLowerCase().trim();


  if (uId && lAssignedTo) {
    if (lAssignedTo === uId || lAssignedTo.toLowerCase() === uId.toLowerCase()) return true;
    const numUId = parseInt(uId.replace(/\D/g, ''), 10);
    const numLId = parseInt(lAssignedTo.replace(/\D/g, ''), 10);
    if (!isNaN(numUId) && !isNaN(numLId) && numUId === numLId) return true;
  }

 
  if (uEmail && (lAssignedTo.toLowerCase() === uEmail || lAssigneeEmail === uEmail || lAssigneeName === uEmail)) {
    return true;
  }


  if (uName) {
    if (lAssigneeName === uName || lAssignedTo.toLowerCase() === uName) return true;
    if (lAssigneeName && (lAssigneeName.includes(uName) || uName.includes(lAssigneeName))) return true;
    if (lAssignedTo && (lAssignedTo.toLowerCase().includes(uName) || uName.includes(lAssignedTo.toLowerCase()))) return true;
  }


  const uTokens = [uName, uEmail.split('@')[0], uId].filter((t) => t && t.length >= 3);
  const lTokens = [lAssigneeName, lAssignedTo.toLowerCase(), lAssigneeEmail.split('@')[0]].filter((t) => t && t.length >= 3);
  for (const ut of uTokens) {
    for (const lt of lTokens) {
      if (ut === lt || ut.includes(lt) || lt.includes(ut)) return true;
    }
  }

  return false;
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

export function parseFollowUpDateTime(dateStr?: string, timeStr?: string): Date | null {
  if (!dateStr) return null;
  let d = String(dateStr).trim();
  let t = String(timeStr || '').trim();


  if (d.includes('T')) {
    const parts = d.split('T');
    d = parts[0];
    if (!t && parts[1]) t = parts[1];
  } else if (d.includes(' ')) {
    const parts = d.split(/\s+/);
    d = parts[0];
    if (!t && parts[1]) t = parts[1];
  }

  let year = 0, month = 0, day = 0;
  if (d.includes('-')) {
    const p = d.split('-');
    if (p[0].length === 4) {
      year = parseInt(p[0], 10);
      month = parseInt(p[1], 10) - 1;
      day = parseInt(p[2], 10);
    } else {
      day = parseInt(p[0], 10);
      month = parseInt(p[1], 10) - 1;
      year = parseInt(p[2], 10);
    }
  } else if (d.includes('/')) {
    const p = d.split('/');
    if (p[0].length === 4) {
      year = parseInt(p[0], 10);
      month = parseInt(p[1], 10) - 1;
      day = parseInt(p[2], 10);
    } else {
      day = parseInt(p[0], 10);
      month = parseInt(p[1], 10) - 1;
      year = parseInt(p[2], 10);
    }
  } else {
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  }

  let hours = 0;
  let minutes = 0;
  if (t) {
    const cleanTime = t.replace(/Z.*/i, '').trim();
    if (cleanTime.includes(':')) {
      const tp = cleanTime.split(':');
      hours = parseInt(tp[0], 10) || 0;
      minutes = parseInt(tp[1], 10) || 0;
    }
  }

  const dt = new Date(year, month, day, hours, minutes, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt;
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

  callOutcome = 'CONNECTED';
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
    if (summary && summary.telecallerMetrics && summary.telecallerMetrics.length > 0) {
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
          .filter((c) => ['CONNECTED', 'INTERESTED', 'QUALIFIED', 'NOT_INTERESTED', 'FOLLOW_UP', 'WRONG_NUMBER'].includes(c.outcome))
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
          .filter((c) => ['INTERESTED', 'QUALIFIED'].includes(c.outcome))
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
        conversionRate: assigned.length > 0 ? Math.round((uniqueInterestedLeads.size / assigned.length) * 100) : (uniqueLeadsCalled.size > 0 ? Math.round((uniqueInterestedLeads.size / uniqueLeadsCalled.size) * 100) : 0),
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
      } else if (status === 'QUALIFIED' || status === 'CONVERTED') {
        qualifiedCount++;
      } else if (status === 'FOLLOW_UP') {
        followUpCount++;
      } else if (['LINE_BUSY', 'BUSY', 'NO_ANSWER'].includes(status)) {
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
        return s === 'QUALIFIED' || s === 'CONVERTED';
      });
    } else if (pFilter === 'RETRY') {
      leads = leads.filter((l) => ['LINE_BUSY', 'BUSY', 'NO_ANSWER'].includes(this.getLeadCurrentStatus(l).toUpperCase()));
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

    const totalCalls = calls.length;
    const interested = calls.filter((c) => c.outcome === 'INTERESTED' || c.outcome === 'QUALIFIED').length;
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
    this.callOutcome = 'CONNECTED';
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
  }

  closeLeadHistory() {
    this.selectedLeadForHistory.set(null);
  }

  getLeadMetrics(lead: LeadItem) {
    const allCalls = this.leadService.calls();
    const lId = String(lead.id || '').trim().toLowerCase();
    const lPhone = String(lead.phone || '').replace(/\D/g, '');
    const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

    const leadCalls = allCalls.filter((c) => {
      const cLeadId = String(c.leadId || '').trim().toLowerCase();
      const cPhone = String(c.leadPhone || c.phone || '').replace(/\D/g, '');
      const cLeadName = String(c.leadName || '').trim().toLowerCase();
      if (cLeadId && lId && cLeadId === lId) return true;
      if (lPhone && cPhone && lPhone === cPhone) return true;
      if (cLeadName && lName && (cLeadName === lName || cLeadName.includes(lName) || lName.includes(cLeadName))) return true;
      return false;
    });

    const attended = leadCalls.filter((c) => ['CONNECTED', 'INTERESTED', 'QUALIFIED', 'NOT_INTERESTED', 'FOLLOW_UP', 'WRONG_NUMBER'].includes(c.outcome)).length;
    const missed = leadCalls.filter((c) => ['NO_ANSWER', 'BUSY', 'LINE_BUSY'].includes(c.outcome)).length;
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

  getLeadCreatorName(lead: LeadItem): string {
    if (!lead) return 'System Administrator';

    if (lead.creatorName && lead.creatorName.trim()) {
      return lead.creatorName.trim();
    }

    const cId = String(lead.creatorId || lead.uploaderId || '').trim().toLowerCase();
    if (cId) {
      const matchedUser = this.userService.users().find(
        (u) => String(u.id).trim().toLowerCase() === cId || (u.email && u.email.trim().toLowerCase() === cId)
      );
      if (matchedUser && matchedUser.fullName) {
        return matchedUser.fullName;
      }
    }

    const creatorEmail = (lead.creatorEmail || lead.uploaderEmail || '').trim().toLowerCase();
    if (creatorEmail) {
      const matchedUser = this.userService.users().find(
        (u) => u.email && u.email.trim().toLowerCase() === creatorEmail
      );
      if (matchedUser && matchedUser.fullName) {
        return matchedUser.fullName;
      }
      const emailPrefix = creatorEmail.split('@')[0];
      if (emailPrefix) {
        return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
      }
    }

    return 'System Administrator';
  }

  getLeadCurrentStatus(lead: LeadItem): string {
    if (!lead) return 'NEW';
    const metrics = this.getLeadMetrics(lead);
    if (metrics.calls && metrics.calls.length > 0) {
      const latestCall = metrics.calls[0];
      const out = String(latestCall.outcome || '').toUpperCase().replace(/\s+/g, '_');
      return out === 'BUSY' ? 'LINE_BUSY' : out;
    }
    const st = (lead.status || 'ASSIGNED').toUpperCase().replace(/\s+/g, '_');
    return st === 'BUSY' ? 'LINE_BUSY' : st;
  }

  isFollowUpDue(lead: LeadItem): boolean {
    if (!lead) return false;
    const nowMs = this.currentTime();

    const metrics = this.getLeadMetrics(lead);
    const leadCalls = metrics.calls;

    if (leadCalls && leadCalls.length > 0) {
      const latestCall = leadCalls[0];
      if (!latestCall.followUpDate) {
        return false;
      }
      const dt = parseFollowUpDateTime(latestCall.followUpDate, latestCall.followUpTime);
      if (dt) {
        return nowMs >= dt.getTime();
      }
      return false;
    }

    const lId = String(lead.id || '').trim().toLowerCase();
    const lPhone = String(lead.phone || '').replace(/\D/g, '');
    const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

    const allFollowUps = this.leadService.followUps();
    const pendingFollowUp = allFollowUps.find((f) => {
      const fLeadId = String(f.leadId || '').trim().toLowerCase();
      const fPhone = String(f.leadPhone || '').replace(/\D/g, '');
      const fLeadName = String(f.leadName || '').trim().toLowerCase();
      const match = (fLeadId && lId && fLeadId === lId) || (lPhone && fPhone && lPhone === fPhone) || (fLeadName && lName && (fLeadName === lName || fLeadName.includes(lName) || lName.includes(fLeadName)));
      return match && f.status === 'PENDING' && !!f.dueDate;
    });

    if (pendingFollowUp && pendingFollowUp.dueDate) {
      const dt = parseFollowUpDateTime(pendingFollowUp.dueDate, pendingFollowUp.dueTime);
      if (dt) {
        return nowMs >= dt.getTime();
      }
    }

    return false;
  }

  hasScheduledCallback(lead: LeadItem): boolean {
    if (!lead) return false;
    const metrics = this.getLeadMetrics(lead);
    const leadCalls = metrics.calls;

    if (leadCalls && leadCalls.length > 0) {
      return !!leadCalls[0].followUpDate;
    }

    const lId = String(lead.id || '').trim().toLowerCase();
    const lPhone = String(lead.phone || '').replace(/\D/g, '');
    const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

    const allFollowUps = this.leadService.followUps();
    return allFollowUps.some((f) => {
      const fLeadId = String(f.leadId || '').trim().toLowerCase();
      const fPhone = String(f.leadPhone || '').replace(/\D/g, '');
      const fLeadName = String(f.leadName || '').trim().toLowerCase();
      const match = (fLeadId && lId && fLeadId === lId) || (lPhone && fPhone && lPhone === fPhone) || (fLeadName && lName && (fLeadName === lName || fLeadName.includes(lName) || lName.includes(fLeadName)));
      return match && f.status === 'PENDING' && !!f.dueDate;
    });
  }

  getFollowUpTimeLabel(lead: LeadItem): string | null {
    if (!lead) return null;
    const metrics = this.getLeadMetrics(lead);
    const leadCalls = metrics.calls;

    if (leadCalls && leadCalls.length > 0) {
      const latestCall = leadCalls[0];
      if (latestCall.followUpDate) {
        const timePart = latestCall.followUpTime ? ` @ ${latestCall.followUpTime}` : '';
        return `${latestCall.followUpDate}${timePart}`;
      }
      return null;
    }

    const lId = String(lead.id || '').trim().toLowerCase();
    const lPhone = String(lead.phone || '').replace(/\D/g, '');
    const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

    const allFollowUps = this.leadService.followUps();
    const f = allFollowUps.find((item) => {
      const fLeadId = String(item.leadId || '').trim().toLowerCase();
      const fPhone = String(item.leadPhone || '').replace(/\D/g, '');
      const fLeadName = String(item.leadName || '').trim().toLowerCase();
      return ((fLeadId && lId && fLeadId === lId) || (lPhone && fPhone && lPhone === fPhone) || (fLeadName && lName && (fLeadName === lName || fLeadName.includes(lName) || lName.includes(fLeadName)))) && !!item.dueDate && item.status === 'PENDING';
    });

    if (f && f.dueDate) {
      const timePart = f.dueTime ? ` @ ${f.dueTime}` : '';
      return `${f.dueDate}${timePart}`;
    }

    return null;
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
    const outcomeFormatted = String(this.callOutcome || 'CONNECTED').toUpperCase().replace(/\s+/g, '_');
    const finalOutcome = outcomeFormatted === 'BUSY' ? 'LINE_BUSY' : outcomeFormatted;
    const leadFullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
    const shouldShowDur =
      this.callOutcome !== 'BUSY' &&
      this.callOutcome !== 'LINE_BUSY' &&
      this.callOutcome !== 'NO_ANSWER' &&
      this.callOutcome !== 'WRONG_NUMBER';
    const effectiveDuration = shouldShowDur ? (Number(this.callDuration) || 0) : 0;
    const finalFollowUp = (this.enableReminder && this.followUpDate)
      ? (this.followUpTime ? `${this.followUpDate} ${this.followUpTime}` : this.followUpDate)
      : '';
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
          if (res && res.lead) {
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
          if (res && res.call) {
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

  getStatusBadgeClass(status?: string): string {
    const s = (status || '').toUpperCase().trim();
    switch (s) {
      case 'NEW':
        return 'status-pill-sky';
      case 'ASSIGNED':
        return 'status-pill-slate';
      case 'CONTACTED':
        return 'status-pill-indigo';
      case 'FOLLOW_UP':
      case 'FOLLOW_UP_SCHEDULED':
        return 'status-pill-indigo';
      case 'CONNECTED':
        return 'status-pill-blue';
      case 'NO_ANSWER':
        return 'status-pill-amber';
      case 'BUSY':
      case 'LINE_BUSY':
        return 'status-pill-orange';
      case 'INTERESTED':
        return 'status-pill-purple';
      case 'QUALIFIED':
        return 'status-pill-emerald';
      case 'CONVERTED':
      case 'PAID':
        return 'status-pill-teal';
      case 'NOT_INTERESTED':
        return 'status-pill-rose';
      case 'WRONG_NUMBER':
      case 'LOST':
        return 'status-pill-danger';
      default:
        return 'status-pill-slate';
    }
  }
}
