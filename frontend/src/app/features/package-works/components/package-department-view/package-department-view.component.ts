import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RoleOperationTab, FixedPackageMeta, ProductPackage, resolveTaskProductAndPackage, isTaskForPackage } from '../../../../core/models/package.model';
import { UserPerformanceRecord } from '../../../../core/models/user-management.model';
import { TelecallerTargetService } from '../../../../core/services/telecaller-target.service';

export interface TelecallerCampaignReport {
  sNo: number;
  campaignName: string;
  adName: string;
  assignedDate: string;
  assignedDateRaw: string;
  totalCountLeads: number;
  totalCalls: number;
  averageCalls: number;
  interested: number;
  targets: number;
  callerRatio: string;
  paid: number;
  leads: any[];
}

import { DesignerDashboardComponent } from '../../../designer/designer-dashboard.component';
import { TelecallingComponent } from '../../../telecalling/telecalling.component';
import { TargetsComponent } from '../../../targets/targets.component';
import { LeadsComponent } from '../../../leads/leads.component';
import { CampaignsComponent } from '../../../campaigns/campaigns.component';
import { AdsComponent } from '../../../ads/ads.component';
import { PackageReportsComponent } from '../reports/package-reports.component';

@Component({
  selector: 'app-package-department-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    DecimalPipe,
    DesignerDashboardComponent,
    TelecallingComponent,
    TargetsComponent,
    LeadsComponent,
    CampaignsComponent,
    AdsComponent,
    PackageReportsComponent,
  ],
  templateUrl: './package-department-view.component.html',
  styleUrl: './package-department-view.component.scss',
})
export class PackageDepartmentViewComponent {
  @Input() currentDept: 'DESIGNER' | 'DIGITAL_MARKETING' | 'TELECALLING' | 'ANALYTICS' | null = null;
  @Input() activeDepartmentTabs: RoleOperationTab[] = [];
  @Input() activeOperationTab = '';
  @Input() currentFilterTarget = '';
  @Input() activePackageName = '';
  @Input() activePackageMeta: FixedPackageMeta | null = null;
  @Input() filteredTransactions: any[] = [];
  @Input() packageReportSummary: any = null;
  @Input() filteredAuditLogs: any[] = [];
  @Input() teamPerformanceList: UserPerformanceRecord[] = [];
  @Input() activeUsersCount: number = 10;
  @Input() productPackages: ProductPackage[] = [];
  @Input() activeReportRole: string = 'ALL';
  @Output() activeReportRoleChange = new EventEmitter<string>();


  @Input() getAuditLogCreatorFn!: (log: any) => { name: string; role: string };
  @Input() getAuditLogAssigneeFn!: (log: any) => string;
  @Input() getAuditLogTaskTitleFn!: (log: any) => string;
  @Input() getAuditLogTaskFileFn?: (log: any) => { hasFile: boolean; fileName: string; fileUrl: string; fileContent?: string; isPdf?: boolean } | null;
  @Input() activePackageDisplayNameFn!: () => string;

  @Output() operationTabSelect = new EventEmitter<string>();
  @Output() openTaskAudit = new EventEmitter<{ log: any; event: MouseEvent }>();
  @Output() openTaskFile = new EventEmitter<{ log: any; event: MouseEvent }>();
  @Output() previewTaskDoc = new EventEmitter<{ task: any; event: MouseEvent }>();

 
  readonly targetService = inject(TelecallerTargetService);

  teamSearchQuery = '';
  selectedRoleFilter = 'ALL';
  selectedPerformanceUser: UserPerformanceRecord | null = null;
  expandedCampaignRows = new Set<number>();

  modalDateFilter: 'ALL' | 'YESTERDAY' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM' = 'ALL';
  customFilterDate: string = '';
  filterStartDate: string = '';
  filterEndDate: string = '';
  taskSearchQuery: string = '';
  taskStatusSubFilter: 'ALL' | 'IN_QUEUE' | 'COMPLETED' | 'REVISIONS' = 'ALL';

  toggleExpandCampaignRow(sNo: number): void {
    if (this.expandedCampaignRows.has(sNo)) {
      this.expandedCampaignRows.delete(sNo);
    } else {
      this.expandedCampaignRows.add(sNo);
    }
  }

  selectOperationTab(tabId: string) {
    this.operationTabSelect.emit(tabId);
  }

  onOpenTaskAuditModal(log: any, event: MouseEvent) {
    this.openTaskAudit.emit({ log, event });
  }

  onOpenTaskFile(log: any, event: MouseEvent) {
    this.openTaskFile.emit({ log, event });
  }

  getAuditLogCreator(log: any): { name: string; role: string } {
    return this.getAuditLogCreatorFn ? this.getAuditLogCreatorFn(log) : { name: 'Admin', role: 'Staff' };
  }

  getAuditLogAssignee(log: any): string {
    return this.getAuditLogAssigneeFn ? this.getAuditLogAssigneeFn(log) : 'Assigned Designer';
  }

  getAuditLogTaskTitle(log: any): string {
    return this.getAuditLogTaskTitleFn ? this.getAuditLogTaskTitleFn(log) : 'Design Task';
  }

  getAuditLogTaskFile(log: any): { hasFile: boolean; fileName: string; fileUrl: string; fileContent?: string; isPdf?: boolean } | null {
    return this.getAuditLogTaskFileFn ? this.getAuditLogTaskFileFn(log) : null;
  }

  activePackageDisplayName(): string {
    return this.activePackageDisplayNameFn ? this.activePackageDisplayNameFn() : (this.activePackageMeta?.name || 'Package');
  }

  formatAssignedByRole(role?: string): string {
    if (!role) return 'Admin';
    const r = role.toUpperCase().trim();
    if (r === 'ADMINISTRATOR' || r === 'ADMIN') return 'Admin';
    if (r === 'MARKETING_MANAGER' || r === 'MM') return 'MM';
    if (r === 'BDM') return 'BDM';
    if (r === 'DIGITAL_MARKETING' || r === 'DIGITAL') return 'Digital';
    if (r === 'DESIGNER') return 'Designer';
    if (r === 'TELECALLER') return 'Telecaller';
    return role;
  }

  get reportEligibleMembers(): UserPerformanceRecord[] {
    return (this.teamPerformanceList || []).filter(
      (u) => u.role !== 'ADMINISTRATOR' && u.role !== 'MARKETING_MANAGER'
    );
  }

  get filteredTeamMembers(): UserPerformanceRecord[] {
    const list = this.reportEligibleMembers;
    const query = (this.teamSearchQuery || '').toLowerCase().trim();
    const roleFilter = this.selectedRoleFilter;

    return list.filter((u) => {
      if (roleFilter !== 'ALL') {
        if (roleFilter === 'DIGITAL' && u.role !== 'DIGITAL_MARKETING') return false;
        if (roleFilter === 'BDM' && u.role !== 'BDM') return false;
        if (roleFilter === 'DESIGNER' && u.role !== 'DESIGNER') return false;
        if (roleFilter === 'TELECALLER' && u.role !== 'TELECALLER') return false;
      }

      if (query) {
        const matchesName = (u.name || '').toLowerCase().includes(query);
        const matchesEmail = (u.email || '').toLowerCase().includes(query);
        const matchesRole = (u.roleLabel || '').toLowerCase().includes(query);
        const matchesDept = (u.department || '').toLowerCase().includes(query);
        return matchesName || matchesEmail || matchesRole || matchesDept;
      }

      return true;
    });
  }

  getRoleCount(roleCode: string): number {
    const list = this.reportEligibleMembers;
    if (roleCode === 'ALL') return list.length;
    if (roleCode === 'DIGITAL') return list.filter((u) => u.role === 'DIGITAL_MARKETING').length;
    if (roleCode === 'BDM') return list.filter((u) => u.role === 'BDM').length;
    if (roleCode === 'DESIGNER') return list.filter((u) => u.role === 'DESIGNER').length;
    if (roleCode === 'TELECALLER') return list.filter((u) => u.role === 'TELECALLER').length;
    return 0;
  }

  setRoleFilter(filter: string) {
    this.selectedRoleFilter = filter;
  }

 
  currentPage: number = 1;
  readonly pageSize: number = 15;

  openUserDetailModal(user: UserPerformanceRecord) {
    this.selectedPerformanceUser = user;
    this.customFilterDate = '';
    this.taskSearchQuery = '';
    this.taskStatusSubFilter = 'ALL';
    this.currentPage = 1;
    this.expandedCampaignRows.clear();
    if (user.role === 'TELECALLER') {
      this.setModalDateFilter('WEEK');
    } else {
      this.modalDateFilter = 'ALL';
    }
  }

  closeUserDetailModal() {
    this.selectedPerformanceUser = null;
    this.modalDateFilter = 'ALL';
    this.customFilterDate = '';
    this.taskSearchQuery = '';
    this.taskStatusSubFilter = 'ALL';
    this.currentPage = 1;
    this.expandedCampaignRows.clear();
  }

  setTaskStatusSubFilter(filter: 'ALL' | 'IN_QUEUE' | 'COMPLETED' | 'REVISIONS') {
    this.taskStatusSubFilter = filter;
    this.currentPage = 1;
  }

  
  private toLocalDateString(val: any): string {
    if (!val) return '';
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
      return val.trim();
    }
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) {
      const parsed = Date.parse(val);
      if (!Number.isNaN(parsed)) {
        const pd = new Date(parsed);
        const y = pd.getFullYear();
        const m = String(pd.getMonth() + 1).padStart(2, '0');
        const day = String(pd.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return '';
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  setModalDateFilter(filter: 'ALL' | 'YESTERDAY' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM') {
    this.modalDateFilter = filter;
    this.currentPage = 1;
    const now = new Date();
    const todayStr = this.toLocalDateString(now);

    if (filter === 'TODAY') {
      this.customFilterDate = todayStr;
      this.filterStartDate = todayStr;
      this.filterEndDate = todayStr;
    } else if (filter === 'YESTERDAY') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = this.toLocalDateString(y);
      this.customFilterDate = yStr;
      this.filterStartDate = yStr;
      this.filterEndDate = yStr;
    } else if (filter === 'WEEK') {
      const pastWeek = new Date();
      pastWeek.setDate(now.getDate() - 6);
      this.filterStartDate = this.toLocalDateString(pastWeek);
      this.filterEndDate = todayStr;
      this.customFilterDate = '';
    } else if (filter === 'MONTH') {
      const pastMonth = new Date();
      pastMonth.setDate(now.getDate() - 29);
      this.filterStartDate = this.toLocalDateString(pastMonth);
      this.filterEndDate = todayStr;
      this.customFilterDate = '';
    } else if (filter === 'ALL') {
      this.customFilterDate = '';
      this.filterStartDate = '';
      this.filterEndDate = '';
    }
  }

  get todayDateString(): string {
    return this.toLocalDateString(new Date());
  }

  onCustomDateChange(val: string) {
    if (val && val > this.todayDateString) {
      val = this.todayDateString;
    }
    this.customFilterDate = val;
    this.filterStartDate = val;
    this.filterEndDate = val;
    this.currentPage = 1;
    if (val) {
      this.modalDateFilter = 'CUSTOM';
    } else {
      this.modalDateFilter = 'ALL';
    }
  }

  onStartDateChange(val: string) {
    if (val && val > this.todayDateString) {
      val = this.todayDateString;
    }
    this.filterStartDate = val;
    if (this.filterEndDate && this.filterStartDate && this.filterStartDate > this.filterEndDate) {
      this.filterEndDate = this.filterStartDate;
    }
    this.modalDateFilter = 'CUSTOM';
    this.currentPage = 1;
  }

  onEndDateChange(val: string) {
    if (val && val > this.todayDateString) {
      val = this.todayDateString;
    }
    this.filterEndDate = val;
    if (this.filterStartDate && this.filterEndDate && this.filterEndDate < this.filterStartDate) {
      this.filterStartDate = this.filterEndDate;
    }
    this.modalDateFilter = 'CUSTOM';
    this.currentPage = 1;
  }

  clearDateRange() {
    this.filterStartDate = '';
    this.filterEndDate = '';
    this.customFilterDate = '';
    this.modalDateFilter = 'ALL';
    this.currentPage = 1;
  }

  get totalTaskCount(): number {
    if (this.selectedPerformanceUser?.role === 'TELECALLER') {
      return this.telecallerCampaignReports.length;
    }
    return this.filteredModalTasks.length;
  }

  private getReportLeadKey(lead: any): string {
    const leadId = String(lead.id || lead.leadId || '').trim().toLowerCase();
    if (leadId) return `id_${leadId}`;
    const leadPhone = String(lead.phone || lead.leadPhone || '').replace(/\D/g, '');
    if (leadPhone) return `p_${leadPhone}`;
    return `ref_${lead.title || lead.name || ''}`;
  }

  private getReportLeadOutcome(hasValidOutcome: boolean, rawOutcome: string, hasValidStatus: boolean, rawStatus: string): string {
    if (hasValidOutcome) return rawOutcome.toUpperCase();
    if (hasValidStatus) return rawStatus.toUpperCase();
    return '';
  }

  private isReportLeadCalled(lead: any, hasValidOutcome: boolean, hasValidStatus: boolean): boolean {
    if (Array.isArray(lead.calls) && lead.calls.length > 0) return true;
    if (typeof lead.callAttempts === 'number' && lead.callAttempts > 0) return true;
    if (lead.calledAt || lead.lastCalledAt) return true;
    return hasValidOutcome || hasValidStatus;
  }

  private isReportLeadPaid(lead: any, outcome: string): boolean {
    return outcome === 'PAID' || outcome === 'CONVERTED' || Boolean(lead.isPaid) || (Number(lead.paidAmount) > 0);
  }

  private aggregateGroupLeadStats(groupLeads: any[]): { totalCalls: number; interested: number; paid: number } {
    const calledLeadIds = new Set<string>();
    const interestedLeadIds = new Set<string>();
    const paidLeadIds = new Set<string>();
    const uncalledStatuses = new Set(['NEW', 'UNASSIGNED', 'ASSIGNED', '—', '', 'NULL', 'UNDEFINED']);

    for (const lead of groupLeads) {
      const leadKey = this.getReportLeadKey(lead);
      const rawOutcome = String(lead.callOutcome || '').toUpperCase().trim();
      const rawStatus = String(lead.status || '').toUpperCase().trim();

      const hasValidOutcome = Boolean(rawOutcome && !uncalledStatuses.has(rawOutcome));
      const hasValidStatus = Boolean(rawStatus && !uncalledStatuses.has(rawStatus));

      if (this.isReportLeadCalled(lead, hasValidOutcome, hasValidStatus) && leadKey) {
        calledLeadIds.add(leadKey);
      }

      const outcome = this.getReportLeadOutcome(hasValidOutcome, rawOutcome, hasValidStatus, rawStatus);
      if (this.isReportLeadPaid(lead, outcome)) {
        if (leadKey) {
          paidLeadIds.add(leadKey);
          interestedLeadIds.add(leadKey);
        }
      } else if (['INTERESTED', 'QUALIFIED', 'HOT'].includes(outcome)) {
        if (leadKey) {
          interestedLeadIds.add(leadKey);
        }
      }
    }

    return {
      totalCalls: calledLeadIds.size,
      interested: interestedLeadIds.size,
      paid: paidLeadIds.size,
    };
  }

  private formatReportDate(dateRaw: string): string {
    if (dateRaw?.includes('-')) {
      const parts = dateRaw.split('-');
      if (parts.length === 3) {
        const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (!Number.isNaN(dObj.getTime())) {
          return dObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }
      }
    }
    return dateRaw;
  }

  private buildReportRow(key: string, groupLeads: any[], sNo: number, baseDailyTarget: number): TelecallerCampaignReport {
    const [cName, aName, dateRaw] = key.split('___');
    const totalLeads = groupLeads.length;
    const { totalCalls, interested, paid } = this.aggregateGroupLeadStats(groupLeads);

    const avgCalls = totalLeads > 0 ? Number((totalCalls / totalLeads).toFixed(1)) : 0;
    const rowTarget = baseDailyTarget > 0 ? baseDailyTarget : 50;
    const ratioVal = rowTarget > 0 ? (totalCalls / rowTarget) * 100 : 0;
    const formattedRatio = ratioVal % 1 === 0 ? `${ratioVal}%` : `${ratioVal.toFixed(1)}%`;
    const displayDate = this.formatReportDate(dateRaw);

    return {
      sNo,
      campaignName: cName,
      adName: aName,
      assignedDate: displayDate,
      assignedDateRaw: dateRaw,
      totalCountLeads: totalLeads,
      totalCalls,
      averageCalls: avgCalls,
      interested,
      targets: rowTarget,
      callerRatio: formattedRatio,
      paid,
      leads: groupLeads,
    };
  }

  private getMockTelecallerCampaignReports(pkgDisplayName: string): TelecallerCampaignReport[] {
    const mockRows: TelecallerCampaignReport[] = [
      {
        sNo: 1,
        campaignName: pkgDisplayName || 'current affairs oct',
        adName: 'spiderman poster',
        assignedDate: '13 Oct 2026',
        assignedDateRaw: '2026-10-13',
        totalCountLeads: 2,
        totalCalls: 5,
        averageCalls: 2.5,
        interested: 1,
        targets: 200,
        callerRatio: '2.5%',
        paid: 7,
        leads: [],
      },
      {
        sNo: 2,
        campaignName: pkgDisplayName || 'current affairs oct',
        adName: 'spiderman poster',
        assignedDate: '12 Oct 2026',
        assignedDateRaw: '2026-10-12',
        totalCountLeads: 6,
        totalCalls: 2,
        averageCalls: 0.3,
        interested: 0,
        targets: 50,
        callerRatio: '4%',
        paid: 6,
        leads: [],
      },
      {
        sNo: 3,
        campaignName: pkgDisplayName || 'current affairs oct',
        adName: 'spiderman poster',
        assignedDate: '11 Oct 2026',
        assignedDateRaw: '2026-10-11',
        totalCountLeads: 1,
        totalCalls: 1,
        averageCalls: 1.0,
        interested: 0,
        targets: 50,
        callerRatio: '2%',
        paid: 0,
        leads: [],
      },
    ];

    if (this.taskSearchQuery.trim()) {
      const q = this.taskSearchQuery.toLowerCase().trim();
      return mockRows.filter(
        (r) =>
          r.campaignName.toLowerCase().includes(q) ||
          r.adName.toLowerCase().includes(q) ||
          r.assignedDate.toLowerCase().includes(q)
      );
    }
    return mockRows;
  }

  get telecallerCampaignReports(): TelecallerCampaignReport[] {
    if (this.selectedPerformanceUser?.role !== 'TELECALLER') {
      return [];
    }

    const tasks = this.filteredModalTasks;
    const pkgDisplayName = this.activePackageDisplayName() || this.activePackageMeta?.name || 'current affairs oct';
    const targetInfo = this.targetService.getTargetForTelecaller(this.selectedPerformanceUser.userId || '5');
    const baseDailyTarget = targetInfo?.dailyCallsTarget || 50;

    if (tasks.length === 0 && (!this.selectedPerformanceUser.tasks || this.selectedPerformanceUser.tasks.length === 0)) {
      return this.getMockTelecallerCampaignReports(pkgDisplayName);
    }

    const groups = new Map<string, any[]>();
    for (const t of tasks) {
      const campName = t.campaignName && t.campaignName !== '—' ? t.campaignName : pkgDisplayName;
      const adName = t.adName && t.adName !== '—' ? t.adName : 'spiderman poster';
      const rawDate = this.getTaskAssignedLocalDate(t) || this.toLocalDateString(t.createdAt || t.assignedDate) || this.todayDateString;
      const groupKey = `${campName}___${adName}___${rawDate}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(t);
    }

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      const dateA = a.split('___')[2] || '';
      const dateB = b.split('___')[2] || '';
      return dateB.localeCompare(dateA);
    });

    let sNo = 1;
    return sortedKeys.map((key) => this.buildReportRow(key, groups.get(key) || [], sNo++, baseDailyTarget));
  }

  get paginatedCampaignReports(): TelecallerCampaignReport[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.telecallerCampaignReports.slice(start, start + this.pageSize);
  }

  get telecallerTargetCalls(): number {
    if (this.telecallerCampaignReports.length > 0) {
      const sum = this.telecallerCampaignReports.reduce((acc, r) => acc + (r.targets || 0), 0);
      return sum > 0 ? sum : 300;
    }
    return 300;
  }

  get telecallerTotalCalls(): number {
    if (this.telecallerCampaignReports.length > 0) {
      return this.telecallerCampaignReports.reduce((acc, r) => acc + (r.totalCalls || 0), 0);
    }
    return 0;
  }

  get telecallerPendingCalls(): number {
    if (this.selectedPerformanceUser?.role === 'TELECALLER') {
      if (this.packageScopedTasks.length > 0) {
        return this.modalTasksInProgressCount;
      }
    }
    return 0;
  }

  get telecallerTotalReportCount(): number {
    return this.telecallerCampaignReports.length;
  }

  get telecallerPaginationStart(): number {
    if (this.telecallerTotalReportCount === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get telecallerPaginationEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.telecallerTotalReportCount);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalTaskCount / this.pageSize));
  }

  get paginatedTasks(): any[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredModalTasks.slice(start, start + this.pageSize);
  }

  get paginationStartIndex(): number {
    if (this.totalTaskCount === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get paginationEndIndex(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalTaskCount);
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    for (let i = 1; i <= this.totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  getTaskAssignedLocalDate(task: any): string {
    if (!task) return '';
    if (Array.isArray(task.statusHistory) && task.statusHistory.length > 0) {
      const assignEvent = task.statusHistory.find(
        (h: any) =>
          h.newStatus === 'ASSIGNED' ||
          (h.remark && String(h.remark).toLowerCase().includes('assigned'))
      );
      if (assignEvent && (assignEvent.createdAt || assignEvent.created_at)) {
        const assignStr = this.toLocalDateString(assignEvent.createdAt || assignEvent.created_at);
        if (assignStr) return assignStr;
      }
    }
    const raw = task.launchDate || task.assignedAt || task.assigned_at || task.assignedDate || task.createdAt || task.created_at;
    return this.toLocalDateString(raw);
  }

  taskMatchesDate(task: any, targetDate: string): boolean {
    if (!targetDate) return true;
    const assigned = this.getTaskAssignedLocalDate(task);
    return assigned === targetDate;
  }

  taskMatchesDateRange(task: any, startDate?: string, endDate?: string): boolean {
    if (!startDate && !endDate) return true;

    const rawDates = [
      this.getTaskAssignedLocalDate(task),
      task.launchDate && this.toLocalDateString(task.launchDate),
      task.calledAt && this.toLocalDateString(task.calledAt),
      task.createdAt && this.toLocalDateString(task.createdAt),
      task.submittedAt && this.toLocalDateString(task.submittedAt),
      task.updatedAt && this.toLocalDateString(task.updatedAt),
      task.dueDate && this.toLocalDateString(task.dueDate),
    ];
    const dates = rawDates.filter(Boolean) as string[];

    if (dates.length === 0) return true;

    return dates.some((d) => {
      if (startDate && endDate) return d >= startDate && d <= endDate;
      if (startDate) return d >= startDate;
      if (endDate) return d <= endDate;
      return true;
    });
  }


  private findVersionHistoryStartTime(task: any, uploadTime: number): number | null {
    if (!task?.statusHistory?.length) return null;
    const sorted = [...task.statusHistory].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    let foundTime: number | null = null;
    for (const h of sorted) {
      const hTime = new Date(h.createdAt).getTime();
      if (hTime <= uploadTime) {
        const s = (h.newStatus || '').toUpperCase();
        if (s === 'IN_PROGRESS' || s === 'REVISION_REQUIRED') {
          foundTime = hTime;
        }
      }
    }
    if (foundTime) return foundTime;

    for (const h of sorted) {
      const hTime = new Date(h.createdAt).getTime();
      if (hTime <= uploadTime) {
        const s = (h.newStatus || '').toUpperCase();
        if (s === 'ACCEPTED' || s === 'ASSIGNED') {
          foundTime = hTime;
        }
      }
    }
    return foundTime;
  }

  private findPreviousVersionStartTime(ver: any, task: any): number | null {
    if (!task?.versions || task.versions.length <= 1) return null;
    const sorted = [...task.versions].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const currIdx = sorted.findIndex(
      (v: any) => (v.id && v.id === ver.id) || v.versionNumber === ver.versionNumber
    );
    if (currIdx > 0) {
      return new Date(sorted[currIdx - 1].createdAt).getTime();
    }
    return null;
  }

  private formatDurationMs(diffMs: number): string {
    const diffSec = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      const remHours = diffHours % 24;
      return remHours > 0 ? `${diffDays}d ${remHours}h` : `${diffDays}d`;
    }
    if (diffHours > 0) {
      const remMins = diffMinutes % 60;
      return remMins > 0 ? `${diffHours}h ${remMins}m` : `${diffHours}h`;
    }
    if (diffMinutes > 0) return `${diffMinutes} min`;
    if (diffSec > 0) return `${diffSec}s`;
    return '—';
  }

  getVersionDuration(ver: any, task?: any): string {
    if (!ver?.createdAt) return '';
    const uploadTime = new Date(ver.createdAt).getTime();
    if (Number.isNaN(uploadTime)) return '';

    let startTime = this.findVersionHistoryStartTime(task, uploadTime);
    if (!startTime) {
      startTime = this.findPreviousVersionStartTime(ver, task);
    }
    if (!startTime && task?.createdAt) {
      startTime = new Date(task.createdAt).getTime();
    }

    if (!startTime || Number.isNaN(startTime) || uploadTime < startTime) {
      return '—';
    }

    return this.formatDurationMs(Math.max(0, uploadTime - startTime));
  }

  private resolveFinishedTaskDuration(task: any): string {
    if (!task.createdAt || !task.updatedAt) return '—';
    const start = new Date(task.createdAt).getTime();
    const end = new Date(task.updatedAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
    return this.formatDurationMs(end - start);
  }

  private resolveActiveTaskDuration(task: any): string {
    if (!task.createdAt) return 'In Progress';
    const start = new Date(task.createdAt).getTime();
    const now = Date.now();
    if (Number.isNaN(start) || now <= start) return 'In Progress';

    const diffMs = now - start;
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return `${diffDays}d active`;
    if (diffHours > 0) return `${diffHours}h active`;
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins > 0 ? `${diffMins}m active` : 'Active';
  }

  getTaskDuration(task: any): string {
    if (!task) return '—';
    if (task.workCycle?.durationText) return task.workCycle.durationText;

    if (Array.isArray(task.versions) && task.versions.length > 0) {
      const latestVer = task.versions[task.versions.length - 1];
      const dur = this.getVersionDuration(latestVer, task);
      if (dur && dur !== '—') return dur;
    }

    const finishedStatuses = ['APPROVED', 'COMPLETED', 'PUBLISHED', 'SUBMITTED', 'UNDER_REVIEW'];
    if (finishedStatuses.includes(task.status)) {
      return this.resolveFinishedTaskDuration(task);
    }

    if (task.status === 'IN_PROGRESS' || task.status === 'ACCEPTED') {
      return this.resolveActiveTaskDuration(task);
    }

    return '—';
  }

  getSubmissionDateText(t: any): string {
    if (!t) return '—';
   
    const actualSubDate = t.submittedAt || (Array.isArray(t.versions) && t.versions.length > 0 ? t.versions[t.versions.length - 1].createdAt : null);
    if (actualSubDate) {
      return new Date(actualSubDate).toLocaleDateString();
    }
    if (t.status === 'APPROVED' || t.status === 'COMPLETED' || t.status === 'PUBLISHED') {
      return t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : '—';
    }
    return '—';
  }

  getProgressStatusText(t: any): string {
    if (!t) return '—';
    const pVal = typeof t.progressPercent === 'number' ? t.progressPercent : null;
    const status = t.status;

    switch (status) {
      case 'APPROVED':
      case 'COMPLETED':
      case 'PUBLISHED':
        return '100% Completed';
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return pVal !== null ? `${pVal}% (Under Review)` : 'Under Review';
      case 'REVISION_REQUIRED':
      case 'REDESIGN_REQUIRED':
        return pVal !== null ? `${pVal}% (Changes Req)` : 'Revision Requested';
      case 'RESUBMITTED':
        return pVal !== null ? `${pVal}% (Resubmitted)` : 'Resubmitted';
      case 'IN_PROGRESS':
      case 'ACCEPTED':
        return pVal !== null && pVal > 0 ? `${pVal}% (In Progress)` : 'In Progress';
      default:
        return pVal !== null && pVal > 0 ? `${pVal}%` : (status || 'Assigned');
    }
  }

  getTaskRevisionCount(t: any): number {
    if (!t) return 0;
    if (Array.isArray(t.versions) && t.versions.length > 1) {
      return t.versions.length - 1;
    } else if (t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED') {
      return 1;
    } else if (t.revisionCount !== undefined) {
      return Number(t.revisionCount) || 0;
    }
    return 0;
  }

  get packageScopedTasks(): any[] {
    if (!this.selectedPerformanceUser) return [];
    let tasks = this.selectedPerformanceUser.tasks || [];
    if (this.currentFilterTarget && this.currentFilterTarget !== 'ALL') {
      const allPkgs = this.productPackages || [];
      const prodId = this.activePackageMeta?.id;
      tasks = tasks.filter((t) => isTaskForPackage(t, this.currentFilterTarget, allPkgs, prodId));
    }
    return tasks;
  }

  private filterTasksByDateSelection(tasks: any[]): any[] {
    if (this.filterStartDate || this.filterEndDate) {
      return tasks.filter((t) => this.taskMatchesDateRange(t, this.filterStartDate, this.filterEndDate));
    }
    if (this.modalDateFilter === 'ALL') return tasks;

    let targetDate = '';
    if (this.modalDateFilter === 'TODAY') {
      targetDate = this.toLocalDateString(new Date());
    } else if (this.modalDateFilter === 'YESTERDAY') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      targetDate = this.toLocalDateString(y);
    } else if (this.modalDateFilter === 'CUSTOM') {
      targetDate = this.customFilterDate;
    }

    return targetDate ? tasks.filter((t) => this.taskMatchesDate(t, targetDate)) : tasks;
  }

  private filterTasksByStatusSelection(tasks: any[]): any[] {
    if (this.taskStatusSubFilter === 'ALL') return tasks;
    const isTelecaller = this.selectedPerformanceUser?.role === 'TELECALLER';

    if (this.taskStatusSubFilter === 'COMPLETED') {
      return isTelecaller
        ? tasks.filter((t) => t.calledAt || t.callAttempts > 0 || ['CONNECTED', 'QUALIFIED', 'CONVERTED', 'PAID', 'INTERESTED'].includes(t.status))
        : tasks.filter((t) => t.status === 'APPROVED' || t.status === 'COMPLETED' || t.status === 'PUBLISHED');
    }
    if (this.taskStatusSubFilter === 'IN_QUEUE') {
      return isTelecaller
        ? tasks.filter((t) => !t.calledAt && t.callAttempts === 0 && !['CONNECTED', 'QUALIFIED', 'CONVERTED', 'PAID', 'INTERESTED', 'LOST'].includes(t.status))
        : tasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED' || t.status === 'SUBMITTED' || t.status === 'UNDER_REVIEW' || t.status === 'RESUBMITTED');
    }
    if (this.taskStatusSubFilter === 'REVISIONS') {
      return tasks.filter((t) => t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED');
    }
    return tasks;
  }

  get filteredModalTasks(): any[] {
    if (!this.selectedPerformanceUser) return [];
    const dateFiltered = this.filterTasksByDateSelection(this.packageScopedTasks);
    return this.filterTasksByStatusSelection(dateFiltered);
  }

  get modalTasksCompletedCount(): number {
    const all = this.packageScopedTasks;
    if (this.selectedPerformanceUser?.role === 'TELECALLER') {
      return all.filter((t) => t.calledAt || t.callAttempts > 0 || ['CONNECTED', 'QUALIFIED', 'CONVERTED', 'PAID', 'INTERESTED'].includes(t.status)).length;
    }
    return all.filter(
      (t) => t.status === 'APPROVED' || t.status === 'COMPLETED' || t.status === 'PUBLISHED'
    ).length;
  }

  get modalTasksInProgressCount(): number {
    const all = this.packageScopedTasks;
    if (this.selectedPerformanceUser?.role === 'TELECALLER') {
      return all.filter((t) => !t.calledAt && t.callAttempts === 0 && !['CONNECTED', 'QUALIFIED', 'CONVERTED', 'PAID'].includes(t.status)).length;
    }
    return all.filter(
      (t) => t.status !== 'APPROVED' && t.status !== 'COMPLETED' && t.status !== 'PUBLISHED'
    ).length;
  }

  get modalTasksRevisionCount(): number {
    const all = this.packageScopedTasks;
    if (this.selectedPerformanceUser?.role === 'TELECALLER') {
      return all.filter((t) => t.status === 'FOLLOW_UP' || t.status === 'LINE_BUSY' || t.status === 'NO_ANSWER' || t.status === 'BUSY').length;
    }
    return all.filter(
      (t) => t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED'
    ).length;
  }

  get modalTaskCompletionPct(): number {
    const all = this.packageScopedTasks;
    const total = all.length;
    if (total === 0) return 0;
    return Math.round((this.modalTasksCompletedCount / total) * 100);
  }

  onPreviewTaskDoc(task: any, event: MouseEvent) {
    event.stopPropagation();
    this.previewTaskDoc.emit({ task, event });
  }

  getTaskStatusBadgeClass(status: string): string {
    switch (status) {
      case 'APPROVED':
      case 'COMPLETED':
      case 'PUBLISHED':
        return 'badge-green';
      case 'IN_PROGRESS':
        return 'badge-amber';
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return 'badge-purple';
      case 'REVISION_REQUIRED':
      case 'REDESIGN_REQUIRED':
        return 'badge-danger';
      default:
        return 'badge-blue';
    }
  }

  getLeadStatusBadgeClass(status?: string): string {
    const s = (status || '').toUpperCase().trim();
    switch (s) {
      case 'QUALIFIED':
      case 'CONVERTED':
      case 'PAID':
      case 'INTERESTED':
      case 'CONNECTED':
        return 'badge-green';
      case 'FOLLOW_UP':
      case 'IN_PROGRESS':
        return 'badge-amber';
      case 'BUSY':
      case 'LINE_BUSY':
      case 'NO_ANSWER':
      case 'RETRY':
        return 'badge-purple';
      case 'NOT_INTERESTED':
      case 'LOST':
      case 'WRONG_NUMBER':
        return 'badge-danger';
      default:
        return 'badge-blue';
    }
  }

  getPlatformBadgeClass(platform?: string): string {
    const p = (platform || '').toLowerCase();
    if (p.includes('meta') || p.includes('facebook')) return 'badge-platform-meta';
    if (p.includes('google')) return 'badge-platform-google';
    if (p.includes('insta')) return 'badge-platform-instagram';
    if (p.includes('link')) return 'badge-platform-linkedin';
    if (p.includes('youtube')) return 'badge-platform-youtube';
    return 'badge-platform-default';
  }

  getAdStatusBadgeClass(status?: string): string {
    const s = (status || '').toUpperCase();
    if (s === 'ACTIVE') return 'badge-green';
    if (s === 'PAUSED') return 'badge-amber';
    if (s === 'COMPLETED') return 'badge-blue';
    return 'badge-slate';
  }

  formatProductName(rawName?: string, task?: any): string {
    if (task) {
      if (task.productName && !task.productName.toLowerCase().includes('careermate') && !task.productName.toLowerCase().includes('package')) {
        return String(task.productName).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
      const resolved = resolveTaskProductAndPackage(task, this.productPackages);
      if (resolved?.productName) {
        return String(resolved.productName).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
    }
    if (rawName?.trim() && !rawName.toLowerCase().includes('careermate')) {
      return String(rawName).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
    const raw = this.activePackageMeta?.name || this.activePackageName || 'Product';
    return String(raw).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  formatPackageName(rawName?: string, task?: any): string {
    if (task) {
      if (task.packageName?.trim()) {
        return String(task.packageName).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
      const resolved = resolveTaskProductAndPackage(task, this.productPackages);
      if (resolved?.packageName) {
        return String(resolved.packageName).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
    }
    if (rawName?.trim()) {
      return String(rawName).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
    const raw = this.activePackageDisplayName() || this.activePackageMeta?.name || 'Package';
    return String(raw).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  private buildDesignerCsvLines(user: UserPerformanceRecord, tasks: any[], escapeCsv: (val: any) => string): string[] {
    const lines: string[] = [];
    const designerHeaders = [
      'S.No', 'Designer Name', 'Product', 'Package', 'Task Title', 'Assigned By (Role)',
      'Priority', 'Assigned Date', 'Due Date', 'Submission Date', 'Status',
      'Work Progress Status', 'Time Duration', 'Revisions (Changes)',
      'Admin Feedback / Notes', 'Design File ',
    ];
    lines.push(designerHeaders.map(escapeCsv).join(','));

    tasks.forEach((t: any, index: number) => {
      const fileAsset = t.attachmentName || t.attachmentUrl || (Array.isArray(t.versions) && t.versions.length > 0 ? (t.versions[t.versions.length - 1].fileName || t.versions[t.versions.length - 1].previewUrl) : '') || '—';
      const row = [
        index + 1,
        user.name || 'Designer',
        this.formatProductName(t.productName || t.productId, t),
        this.formatPackageName(t.packageName || t.packageId, t),
        t.title || 'Design Task',
        t.creatorRole || 'Administrator',
        t.priority || 'MEDIUM',
        t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—',
        t.dueDate || 'Ongoing',
        this.getSubmissionDateText(t),
        t.status || 'ASSIGNED',
        this.getProgressStatusText(t),
        this.getTaskDuration(t),
        this.getTaskRevisionCount(t),
        t.reviewerFeedback || t.feedback || t.remark || '—',
        fileAsset,
      ];
      lines.push(row.map(escapeCsv).join(','));
    });
    return lines;
  }

  private buildTelecallerCsvLines(user: UserPerformanceRecord, tasks: any[], escapeCsv: (val: any) => string): string[] {
    const lines: string[] = [];
    const summaryHeaders = [
      'S.No', 'Campaigns', 'Ad Name', 'Assigned Date', 'Total Count Leads',
      'Total Calls', 'Average Calls', 'Interested', 'Targets', 'Caller Ratio', 'Paid',
    ];
    lines.push('--- CAMPAIGN SUMMARY BREAKDOWN ---', summaryHeaders.map(escapeCsv).join(','));
    this.telecallerCampaignReports.forEach((r) => {
      lines.push(
        [r.sNo, r.campaignName, r.adName, r.assignedDate, r.totalCountLeads, r.totalCalls, r.averageCalls, r.interested, r.targets, r.callerRatio, r.paid]
          .map(escapeCsv).join(',')
      );
    });
    lines.push('', '--- DETAILED LEAD RECORDS ---');

    const telecallerHeaders = [
      'S.No', 'Telecaller Name', 'Product', 'Package', 'Lead Name', 'Campaign',
      'Phone Number', 'Ad Name', 'Lead Source', 'Assigned Date', 'Call Date & Time',
      'Call Duration', 'Call Status', 'Total Call Attempts', 'Follow-up Date', 'Telecaller Notes',
    ];
    lines.push(telecallerHeaders.map(escapeCsv).join(','));

    tasks.forEach((t: any, index: number) => {
      const phone = (t.leadPhone && t.leadPhone !== '—' && !t.leadPhone.includes('@')) ? t.leadPhone : '—';
      const attempts = t.callAttemptsText || (t.callAttempts ? `${t.callAttempts} Calls` : '0 Attempts');
      let remarks = '—';
      if (t.remarks && t.remarks !== '—') {
        remarks = t.remarks;
      } else if (t.notes && t.notes !== '—') {
        remarks = t.notes;
      }

      const row = [
        index + 1,
        user.name || 'Telecaller',
        this.formatProductName(t.productName, t),
        this.formatPackageName(t.packageName, t),
        t.leadName || t.title || '—',
        t.campaignName || '—',
        phone,
        t.adName || '—',
        t.source || '—',
        t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—',
        t.calledAt ? new Date(t.calledAt).toLocaleString() : '—',
        t.callDurationText && t.callDurationText !== '—' ? t.callDurationText : '—',
        t.callOutcome || t.status || '—',
        attempts,
        t.followUpDate ? new Date(t.followUpDate).toLocaleDateString() : '—',
        remarks,
      ];
      lines.push(row.map(escapeCsv).join(','));
    });
    return lines;
  }

  private buildDigitalMarketingCsvLines(user: UserPerformanceRecord, tasks: any[], escapeCsv: (val: any) => string): string[] {
    const lines: string[] = [];
    const dmHeaders = [
      'S.No', 'Digital Marketer Name', 'Ad Name', 'Campaign Name', 'Product',
      'Package', 'Platform', 'Date', 'Leads Generated', 'Status',
    ];
    lines.push(dmHeaders.map(escapeCsv).join(','));

    tasks.forEach((t: any, index: number) => {
      const rawDate = t.launchDate || t.createdAt;
      const row = [
        index + 1,
        user.name || 'Digital Marketer',
        t.adName || t.title || '—',
        t.campaignName || '—',
        this.formatProductName(t.productName, t),
        this.formatPackageName(t.packageName, t),
        t.platform || 'Meta Ads',
        rawDate ? new Date(rawDate).toLocaleDateString() : '—',
        t.leadsCount !== undefined ? t.leadsCount : 0,
        t.status || 'ACTIVE',
      ];
      lines.push(row.map(escapeCsv).join(','));
    });
    return lines;
  }

  private buildGeneralStaffCsvLines(user: UserPerformanceRecord, tasks: any[], escapeCsv: (val: any) => string): string[] {
    const lines: string[] = [];
    const generalHeaders = [
      'S.No', 'Staff Name', 'Role', 'Product', 'Package', 'Task Title',
      'Assigned By (Role)', 'Status', 'Priority', 'Due Date', 'Time Duration',
      'Asset / Deliverable', 'Notes',
    ];
    lines.push(generalHeaders.map(escapeCsv).join(','));

    tasks.forEach((t: any, idx: number) => {
      const row = [
        idx + 1,
        user.name,
        user.roleLabel,
        this.formatProductName(t.productName || t.productId, t),
        this.formatPackageName(t.packageName || t.packageId, t),
        t.title || 'Untitled Task',
        t.creatorRole || 'Administrator',
        t.status || 'PENDING',
        t.priority || 'MEDIUM',
        t.dueDate || 'Ongoing',
        this.getTaskDuration(t),
        t.attachmentName || t.attachmentUrl || 'None',
        t.reviewerFeedback || '—',
      ];
      lines.push(row.map(escapeCsv).join(','));
    });
    return lines;
  }

  private resolveExportTasks(user: UserPerformanceRecord): any[] {
    if (this.selectedPerformanceUser?.userId === user.userId) {
      return this.filteredModalTasks;
    }
    return (user.tasks || []).filter((t: any) => {
      if (this.filterStartDate || this.filterEndDate) {
        if (!this.taskMatchesDateRange(t, this.filterStartDate, this.filterEndDate)) return false;
      }
      if (this.currentFilterTarget && this.currentFilterTarget !== 'ALL') {
        return isTaskForPackage(t, this.currentFilterTarget, this.productPackages, this.activePackageMeta?.id);
      }
      return true;
    });
  }

  downloadUserReport(user: UserPerformanceRecord): void {
    if (!user) return;

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replaceAll('"', '""');
      return `"${str}"`;
    };

    const tasks = this.resolveExportTasks(user);
    let lines: string[] = [];

    switch (user.role) {
      case 'DESIGNER':
        lines = this.buildDesignerCsvLines(user, tasks, escapeCsv);
        break;
      case 'TELECALLER':
        lines = this.buildTelecallerCsvLines(user, tasks, escapeCsv);
        break;
      case 'DIGITAL_MARKETING':
        lines = this.buildDigitalMarketingCsvLines(user, tasks, escapeCsv);
        break;
      default:
        lines = this.buildGeneralStaffCsvLines(user, tasks, escapeCsv);
        break;
    }

    const csvContent = lines.join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanName = (user.name || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    let dateSuffix = dateStr;
    if (this.filterStartDate && this.filterEndDate) {
      dateSuffix = `${this.filterStartDate}_to_${this.filterEndDate}`;
    } else if (this.filterStartDate) {
      dateSuffix = `from_${this.filterStartDate}`;
    } else if (this.filterEndDate) {
      dateSuffix = `until_${this.filterEndDate}`;
    }
    link.download = `${cleanName}_Report_${dateSuffix}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
}
