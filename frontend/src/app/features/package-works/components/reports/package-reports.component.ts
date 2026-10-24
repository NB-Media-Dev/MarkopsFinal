import {
  TelecallerCampaignReport,
  toLocalDateString,
  formatReportDate,
  getTaskAssignedLocalDate,
  taskMatchesDate,
  taskMatchesDateRange,
  getReportLeadKey,
  getReportLeadOutcome,
  isReportLeadCalled,
  isReportLeadPaid,
  aggregateGroupLeadStats,
  buildReportRow,
  getReportTaskStatusBadgeClass,
  getReportLeadStatusBadgeClass,
  getReportPlatformBadgeClass,
  getReportAdStatusBadgeClass,
  formatReportProductName,
  formatReportPackageName,
} from '../../utils/package-report.utils';
import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { UserPerformanceRecord } from '../../../../core/models/user-management.model';
import {
  ProductPackage,
  FixedPackageMeta,
  isTaskForPackage,
} from '../../../../core/models/package.model';
import { TelecallerTargetService } from '../../../../core/services/telecaller-target.service';
import { TaskManagementService } from '../../../../core/services/task-management.service';
import { getApiUrl } from '../../../../core/utils/api-url.utils';


export interface TeamAvatarItem {
  name: string;
  avatarUrl?: string;
  initial: string;
  bgColorClass: string;
  roleClass: string;
}

export type ReportRoleCode = 'DESIGNER' | 'DIGITAL' | 'TELECALLER' | 'BDM';
export type TaskStatusSubFilterType = 'ALL' | 'IN_QUEUE' | 'COMPLETED' | 'REVISIONS';

export interface RoleTeamCard {
  roleCode: ReportRoleCode;
  title: string;
  memberCount: number;
  avatars: TeamAvatarItem[];
  overflowCount: number;
}


function collectTaskReportDates(task: any, toLocalDateString: (val: any) => string, assignedDate?: string): string[] {
  const dates: string[] = [];
  if (assignedDate) dates.push(assignedDate);
  const candidates = [task.launchDate, task.calledAt, task.createdAt, task.submittedAt, task.updatedAt, task.dueDate];
  for (const c of candidates) {
    if (c) {
      const d = toLocalDateString(c);
      if (d) dates.push(d);
    }
  }
  return dates;
}

function isDateInRange(d: string, startDate?: string, endDate?: string): boolean {
  if (startDate && endDate) return d >= startDate && d <= endDate;
  if (startDate) return d >= startDate;
  if (endDate) return d <= endDate;
  return true;
}

function resolveVersionStartTimeFromHistory(sortedHistory: any[], uploadTime: number): number | null {
  let primaryStart: number | null = null;
  let fallbackStart: number | null = null;
  for (const h of sortedHistory) {
    const hTime = new Date(h.createdAt).getTime();
    if (hTime <= uploadTime) {
      const s = (h.newStatus || '').toUpperCase();
      if (s === 'IN_PROGRESS' || s === 'REVISION_REQUIRED') {
        primaryStart = hTime;
      } else if (s === 'ACCEPTED' || s === 'ASSIGNED') {
        fallbackStart = hTime;
      }
    }
  }
  return primaryStart ?? fallbackStart;
}

function resolveVersionStartTime(ver: any, task?: any, uploadTime?: number): number | null {
  if (task?.statusHistory && task.statusHistory.length > 0 && uploadTime) {
    const sorted = [...task.statusHistory].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const fromHistory = resolveVersionStartTimeFromHistory(sorted, uploadTime);
    if (fromHistory) return fromHistory;
  }
  if (task?.versions && task.versions.length > 1) {
    const sortedVers = [...task.versions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const currIdx = sortedVers.findIndex((v: any) => (v.id && v.id === ver.id) || v.versionNumber === ver.versionNumber);
    if (currIdx > 0) return new Date(sortedVers[currIdx - 1].createdAt).getTime();
  }
  if (task?.createdAt) return new Date(task.createdAt).getTime();
  return null;
}

function formatDurationDiff(diffMs: number): string {
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

function formatActiveDuration(start: number): string {
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

function resolveModalTargetDate(modalDateFilter: string, customFilterDate: string, toLocalDateString: (d: Date) => string): string {
  if (modalDateFilter === 'TODAY') return toLocalDateString(new Date());
  if (modalDateFilter === 'YESTERDAY') {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return toLocalDateString(y);
  }
  if (modalDateFilter === 'CUSTOM') return customFilterDate;
  return '';
}

function matchesModalSubFilter(t: any, subFilter: string, isTelecaller: boolean): boolean {
  if (subFilter === 'COMPLETED') {
    if (isTelecaller) {
      return Boolean(t.calledAt || t.callAttempts > 0 || ['CONNECTED', 'QUALIFIED', 'CONVERTED', 'PAID', 'INTERESTED'].includes(t.status));
    }
    return t.status === 'APPROVED' || t.status === 'COMPLETED' || t.status === 'PUBLISHED';
  }
  if (subFilter === 'IN_QUEUE') {
    if (isTelecaller) {
      return !t.calledAt && t.callAttempts === 0 && !['CONNECTED', 'QUALIFIED', 'CONVERTED', 'PAID'].includes(t.status);
    }
    return t.status !== 'APPROVED' && t.status !== 'COMPLETED' && t.status !== 'PUBLISHED';
  }
  if (subFilter === 'REVISIONS') {
    if (isTelecaller) {
      return t.status === 'FOLLOW_UP' || t.status === 'LINE_BUSY' || t.status === 'NO_ANSWER' || t.status === 'BUSY';
    }
    return t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED';
  }
  return true;
}

@Component({
  selector: 'app-package-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterModule],
  templateUrl: './package-reports.component.html',
  styleUrl: './package-reports.component.scss',
})
export class PackageReportsComponent implements OnInit, OnChanges {
  private readonly targetService = inject(TelecallerTargetService);
  private readonly taskService = inject(TaskManagementService);

  @Input() teamPerformanceList: UserPerformanceRecord[] = [];
  @Input() activePackageMeta: FixedPackageMeta | null = null;
  @Input() productPackages: ProductPackage[] = [];
  @Input() currentFilterTarget: string = '';
  @Input() activePackageDisplayNameFn?: () => string;

  @Input() selectedRoleFilter: string = 'ALL';
  @Output() selectedRoleFilterChange = new EventEmitter<string>();
  @Output() previewTaskDoc = new EventEmitter<{ task: any; event: MouseEvent }>();

  teamSearchQuery: string = '';
  selectedPerformanceUser: UserPerformanceRecord | null = null;
  expandedCampaignRows = new Set<number>();

  expandedUserIds = new Set<string>();

  isFilterDropdownOpen: boolean = false;
  isDateDropdownOpen: boolean = false;
  isUserDropdownOpen: boolean = false;
  selectedMemberIdFilter: string = 'ALL';

  modalDateFilter: 'ALL' | 'YESTERDAY' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM' = 'ALL';
  customFilterDate: string = '';
  filterStartDate: string = '';
  filterEndDate: string = '';
  taskSearchQuery: string = '';
  taskStatusSubFilter: TaskStatusSubFilterType = 'ALL';

  currentPage: number = 1;
  readonly pageSize: number = 15;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (
      !target.closest('.dropdown-wrap-filter') &&
      !target.closest('.dropdown-wrap-date') &&
      !target.closest('.dropdown-wrap-user')
    ) {
      this.isFilterDropdownOpen = false;
      this.isDateDropdownOpen = false;
      this.isUserDropdownOpen = false;
    }
  }

  failedAvatarUserIds = new Set<string>();

  ngOnInit(): void {
    this.selectedMemberIdFilter = 'ALL';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedRoleFilter'] && !changes['selectedRoleFilter'].firstChange) {
      const newRole = changes['selectedRoleFilter'].currentValue;
      if (newRole === 'ALL') {
        this.backToAllRoles(false);
      } else if (newRole && newRole !== this.selectedRoleFilter) {
        this.viewRoleTeam(newRole as any, false);
      }
    }
  }

  hasValidAvatar(u: any): boolean {
    if (!u) return false;
    const url = u.user?.avatarUrl || u.avatarUrl;
    if (!url || typeof url !== 'string' || !url.trim() || url === 'undefined' || url === 'null') {
      return false;
    }
    const id = u.userId || u.id || u.user?.id;
    if (id && this.failedAvatarUserIds.has(id)) {
      return false;
    }
    return true;
  }

  getUserInitial(u: any): string {
    if (!u) return 'U';
    const name = u.name || u.user?.fullName || u.fullName || u.email || 'User';
    const trimmed = name.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : 'U';
  }

  activePackageDisplayName(): string {
    if (this.activePackageDisplayNameFn) return this.activePackageDisplayNameFn();
    return this.activePackageMeta?.name || 'Package';
  }

  get reportEligibleMembers(): UserPerformanceRecord[] {
    return (this.teamPerformanceList || []).filter(
      (u) => u.role !== 'ADMINISTRATOR' && u.role !== 'MARKETING_MANAGER'
    );
  }

  get teamRoleMembers(): UserPerformanceRecord[] {
    const list = this.reportEligibleMembers;
    const roleFilter = this.selectedRoleFilter;
    if (roleFilter === 'ALL') return list;
    return list.filter((u) => {
      if (roleFilter === 'DIGITAL') return u.role === 'DIGITAL_MARKETING';
      if (roleFilter === 'BDM') return u.role === 'BDM';
      if (roleFilter === 'DESIGNER') return u.role === 'DESIGNER';
      if (roleFilter === 'TELECALLER') return u.role === 'TELECALLER';
      return true;
    });
  }

  get filteredTeamMembers(): UserPerformanceRecord[] {
    let list = this.teamRoleMembers;
    if (this.selectedMemberIdFilter && this.selectedMemberIdFilter !== 'ALL') {
      list = list.filter((u) => u.userId === this.selectedMemberIdFilter);
    }
    const query = (this.teamSearchQuery || '').toLowerCase().trim();
    if (query) {
      list = list.filter((u) => {
        const matchesName = (u.name || '').toLowerCase().includes(query);
        const matchesEmail = (u.email || '').toLowerCase().includes(query);
        const matchesRole = (u.roleLabel || '').toLowerCase().includes(query);
        const matchesDept = (u.department || '').toLowerCase().includes(query);
        const matchesTask = (u.tasks || []).some((t: any) =>
          (t.title || '').toLowerCase().includes(query) ||
          (t.productName || '').toLowerCase().includes(query) ||
          (t.packageName || '').toLowerCase().includes(query)
        );
        return matchesName || matchesEmail || matchesRole || matchesDept || matchesTask;
      });
    }
    return list;
  }

  isUserExpanded(userId: string): boolean {
    return this.expandedUserIds.has(userId);
  }

  toggleUserAccordion(userId: string): void {
    if (this.expandedUserIds.has(userId)) {
      this.expandedUserIds.delete(userId);
    } else {
      this.expandedUserIds.add(userId);
    }
  }

  expandUser(userId: string): void {
    this.expandedUserIds.add(userId);
    setTimeout(() => {
      const el = document.getElementById('user-accordion-' + userId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  }

  toggleUserDropdown(): void {
    this.isUserDropdownOpen = !this.isUserDropdownOpen;
    this.isFilterDropdownOpen = false;
    this.isDateDropdownOpen = false;
  }

  selectMemberFilter(userId: string): void {
    this.selectedMemberIdFilter = userId;
    this.isUserDropdownOpen = false;
    if (userId !== 'ALL') {
      this.expandedUserIds.clear();
      this.expandedUserIds.add(userId);
      setTimeout(() => {
        const el = document.getElementById('user-accordion-' + userId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  }

  getSelectedMemberLabel(): string {
    if (this.selectedMemberIdFilter && this.selectedMemberIdFilter !== 'ALL') {
      const found = this.teamRoleMembers.find((m) => m.userId === this.selectedMemberIdFilter);
      if (found) return found.name;
    }
    return 'All Users';
  }

  getActiveDateLabel(): string {
    if (this.filterStartDate && this.filterEndDate) {
      if (this.filterStartDate === this.filterEndDate) {
        return this.formatDisplayDate(this.filterStartDate);
      }
      return `${this.formatDisplayDate(this.filterStartDate)} - ${this.formatDisplayDate(this.filterEndDate)}`;
    }
    if (this.filterStartDate) {
      return `From ${this.formatDisplayDate(this.filterStartDate)}`;
    }
    if (this.modalDateFilter === 'CUSTOM' && this.customFilterDate) {
      return this.formatDisplayDate(this.customFilterDate);
    }
    switch (this.modalDateFilter) {
      case 'TODAY':
        return 'Today';
      case 'YESTERDAY':
        return 'Yesterday';
      case 'WEEK':
        return '1 Week';
      case 'MONTH':
        return '1 Month';
      case 'ALL':
        return 'All Date';
      default:
        return 'All Date';
    }
  }

  getActiveStatusFilterLabel(): string {
    switch (this.taskStatusSubFilter) {
      case 'COMPLETED':
        return 'Completed';
      case 'IN_QUEUE':
        return 'In Queue';
      case 'REVISIONS':
        return 'Revisions';
      default:
        return 'Filter';
    }
  }

  toggleFilterDropdown(): void {
    this.isFilterDropdownOpen = !this.isFilterDropdownOpen;
    this.isDateDropdownOpen = false;
  }

  toggleDateDropdown(): void {
    this.isDateDropdownOpen = !this.isDateDropdownOpen;
    this.isFilterDropdownOpen = false;
  }

  selectDateFilter(filter: 'ALL' | 'YESTERDAY' | 'TODAY' | 'WEEK' | 'MONTH'): void {
    this.setModalDateFilter(filter);
    this.isDateDropdownOpen = false;
  }

  selectStatusFilter(filter: 'ALL' | 'IN_QUEUE' | 'COMPLETED' | 'REVISIONS'): void {
    this.setTaskStatusSubFilter(filter);
    this.isFilterDropdownOpen = false;
  }

  onDownloadReport(user: UserPerformanceRecord, event: MouseEvent): void {
    event.stopPropagation();
    this.downloadUserReport(user);
  }

  getUserTasks(user: UserPerformanceRecord): any[] {
    if (!user) return [];
    let tasks = user.tasks || [];

    if (this.currentFilterTarget && this.currentFilterTarget !== 'ALL') {
      const allPkgs = this.productPackages || [];
      const prodId = this.activePackageMeta?.id;
      tasks = tasks.filter((t) => isTaskForPackage(t, this.currentFilterTarget, allPkgs, prodId));
    }

    if (this.filterStartDate || this.filterEndDate) {
      tasks = tasks.filter((t) => this.taskMatchesDateRange(t, this.filterStartDate, this.filterEndDate));
    } else if (this.modalDateFilter !== 'ALL') {
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
      if (targetDate) {
        tasks = tasks.filter((t) => {
          const assigned = this.getTaskAssignedLocalDate(t);
          if (assigned && assigned === targetDate) return true;
          if (this.modalDateFilter === 'TODAY' && t.assignedDate?.toLowerCase().includes('today')) return true;
          return false;
        });
      }
    }

    if (this.taskStatusSubFilter === 'COMPLETED') {
      tasks = tasks.filter((t) => t.status === 'APPROVED' || t.status === 'COMPLETED' || t.status === 'PUBLISHED');
    } else if (this.taskStatusSubFilter === 'IN_QUEUE') {
      tasks = tasks.filter((t) => t.status !== 'APPROVED' && t.status !== 'COMPLETED' && t.status !== 'PUBLISHED');
    } else if (this.taskStatusSubFilter === 'REVISIONS') {
      tasks = tasks.filter((t) => t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED' || (t.revisions && t.revisions > 0));
    }

    if (this.taskSearchQuery.trim()) {
      const q = this.taskSearchQuery.toLowerCase().trim();
      tasks = tasks.filter((t) => {
        const titleMatch = (t.title || '').toLowerCase().includes(q);
        const prodMatch = (t.productName || '').toLowerCase().includes(q);
        const pkgMatch = (t.packageName || '').toLowerCase().includes(q);
        const statusMatch = (t.status || '').toLowerCase().includes(q);
        return titleMatch || prodMatch || pkgMatch || statusMatch;
      });
    }

    return tasks;
  }

  private getReportLeadKey(lead: any): string {
    return getReportLeadKey(lead);
  }

  private getReportLeadOutcome(hasValidOutcome: boolean, rawOutcome: string, hasValidStatus: boolean, rawStatus: string): string {
    return getReportLeadOutcome(hasValidOutcome, rawOutcome, hasValidStatus, rawStatus);
  }

  private isReportLeadCalled(lead: any, hasValidOutcome: boolean, hasValidStatus: boolean): boolean {
    return isReportLeadCalled(lead, hasValidOutcome, hasValidStatus);
  }

  private isReportLeadPaid(lead: any, outcome: string): boolean {
    return isReportLeadPaid(lead, outcome);
  }

  private aggregateGroupLeadStats(groupLeads: any[]): { totalCalls: number; interested: number; paid: number } {
    return aggregateGroupLeadStats(groupLeads);
  }

  private formatReportDate(dateRaw: string): string {
    return formatReportDate(dateRaw);
  }

  private buildReportRow(key: string, groupLeads: any[], sNo: number, baseDailyTarget: number): TelecallerCampaignReport {
    return buildReportRow(key, groupLeads, sNo, baseDailyTarget);
  }

  private buildTelecallerCampaignReportsFromTasks(tasks: any[], pkgDisplayName: string, baseDailyTarget: number): TelecallerCampaignReport[] {
    const groups = new Map<string, any[]>();
    for (const t of tasks) {
      const campName = t.campaignName && t.campaignName !== '—' ? t.campaignName : pkgDisplayName;
      const adName = t.adName && t.adName !== '—' ? t.adName : (t.title || 'Lead');
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

  getTelecallerReportsForUser(user: UserPerformanceRecord): TelecallerCampaignReport[] {
    if (user?.role !== 'TELECALLER') return [];
    const tasks = this.getUserTasks(user);
    const pkgDisplayName = this.activePackageDisplayName() || this.activePackageMeta?.name || 'current affairs oct';
    const targetInfo = this.targetService.getTargetForTelecaller(user.userId || '5');
    const baseDailyTarget = targetInfo?.dailyCallsTarget || 50;

    if (tasks.length === 0 && (!user.tasks || user.tasks.length === 0)) {
      return [];
    }

    return this.buildTelecallerCampaignReportsFromTasks(tasks, pkgDisplayName, baseDailyTarget);
  }

  formatDisplayDate(d: any): string {
    if (!d) return '—';
    if (typeof d === 'string' && (d.includes('Oct') || d.includes('Nov') || d.includes('Dec') || d.includes('Jan') || d.includes('Feb') || d.includes('Mar') || d.includes('Apr') || d.includes('May') || d.includes('Jun') || d.includes('Jul') || d.includes('Aug') || d.includes('Sep'))) {
      return d;
    }
    const dateObj = new Date(d);
    if (Number.isNaN(dateObj.getTime())) return String(d);
    return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  getProgressBadgeText(t: any): string {
    if (t.progressStatus) return t.progressStatus;
    if (t.status === 'APPROVED' || t.status === 'COMPLETED' || t.status === 'PUBLISHED') {
      return '100% Completed';
    }
    if (t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED') {
      return '50% In Progress';
    }
    if (t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED') {
      return 'Revision Required';
    }
    return 'In Queue';
  }

  getProgressBadgeClass(t: any): string {
    if (t.status === 'APPROVED' || t.status === 'COMPLETED' || t.status === 'PUBLISHED') {
      return 'progress-completed';
    }
    if (t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED') {
      return 'progress-in-progress';
    }
    if (t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED') {
      return 'progress-revision';
    }
    return 'progress-queue';
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

  setRoleFilter(filter: string, emit = true): void {
    this.selectedRoleFilter = filter;
    if (emit) {
      this.selectedRoleFilterChange.emit(filter);
    }
    this.currentPage = 1;
    this.expandedUserIds.clear();
    const members = this.filteredTeamMembers;
    if (members.length > 0) {
      this.expandedUserIds.add(members[0].userId);
    }
  }

  viewRoleTeam(roleCode: 'DESIGNER' | 'DIGITAL' | 'TELECALLER' | 'BDM', emit = true): void {
    this.selectedRoleFilter = roleCode;
    if (emit) {
      this.selectedRoleFilterChange.emit(roleCode);
    }
    this.currentPage = 1;
    this.selectedPerformanceUser = null;
    this.expandedUserIds.clear();
    this.modalDateFilter = 'ALL';
    this.filterStartDate = '';
    this.filterEndDate = '';
    setTimeout(() => {
      this.selectedMemberIdFilter = 'ALL';
    }, 0);
  }

  backToAllRoles(emit = true): void {
    this.selectedRoleFilter = 'ALL';
    if (emit) {
      this.selectedRoleFilterChange.emit('ALL');
    }
    this.selectedMemberIdFilter = 'ALL';
    this.teamSearchQuery = '';
    this.currentPage = 1;
    this.expandedUserIds.clear();
    this.selectedPerformanceUser = null;
  }

  getActiveRoleLabel(): string {
    switch (this.selectedRoleFilter) {
      case 'DESIGNER':
        return 'Designers';
      case 'DIGITAL':
        return 'Digital Marketing';
      case 'TELECALLER':
        return 'Telecalling';
      case 'BDM':
        return 'BDM';
      default:
        return 'All Roles';
    }
  }

  getRoleSquircleClass(role?: string): string {
    if (!role) return 'telecaller';
    const r = role.toLowerCase().trim();
    if (r.includes('admin')) return 'administrator';
    if (r.includes('manager')) return 'marketing_manager';
    if (r.includes('digital')) return 'digital_marketing';
    if (r.includes('design')) return 'designer';
    if (r.includes('tele')) return 'telecaller';
    if (r.includes('bdm')) return 'bdm';
    return r;
  }

  getAvatarUrl(avatarUrl?: string): string {
    if (!avatarUrl) return '';
    return getApiUrl(avatarUrl);
  }

  getUserAvatarUrl(u: any): string {
    if (!u) return '';
    const raw = u.user?.avatarUrl || u.avatarUrl || (u.user as any)?.avatar_url;
    return this.getAvatarUrl(raw);
  }

  onMemberAvatarError(u: any): void {
    if (!u) return;
    const id = u.userId || u.id || u.user?.id;
    if (id) {
      this.failedAvatarUserIds.add(id);
    }
    if (u.user) {
      u.user.avatarUrl = undefined;
    }
    u.avatarUrl = undefined;
  }

  get roleTeamCards(): RoleTeamCard[] {
    const configs: Array<{ code: 'DESIGNER' | 'DIGITAL' | 'TELECALLER' | 'BDM'; title: string }> = [
      { code: 'DESIGNER', title: 'Designers' },
      { code: 'DIGITAL', title: 'Digital Marketing' },
      { code: 'TELECALLER', title: 'Telecalling' },
      { code: 'BDM', title: 'BDM' },
    ];

    return configs.map((cfg) => {
      let roleMembers: UserPerformanceRecord[] = [];
      if (cfg.code === 'DESIGNER') {
        roleMembers = this.reportEligibleMembers.filter((u) => u.role === 'DESIGNER');
      } else if (cfg.code === 'DIGITAL') {
        roleMembers = this.reportEligibleMembers.filter((u) => u.role === 'DIGITAL_MARKETING');
      } else if (cfg.code === 'TELECALLER') {
        roleMembers = this.reportEligibleMembers.filter((u) => u.role === 'TELECALLER');
      } else if (cfg.code === 'BDM') {
        roleMembers = this.reportEligibleMembers.filter((u) => u.role === 'BDM');
      }

      const avatars: TeamAvatarItem[] = [];
      const maxDisplay = 4;
      const visibleMembers = roleMembers.slice(0, maxDisplay);

      for (const m of visibleMembers) {
        const rawUrl = m.user?.avatarUrl || (m as any).avatarUrl || (m.user as any)?.avatar_url;
        const resolvedUrl = rawUrl ? this.getAvatarUrl(rawUrl) : undefined;
        const roleStr = m.user?.role || m.role || cfg.code;
        avatars.push({
          name: m.name || m.user?.fullName || 'User',
          avatarUrl: resolvedUrl,
          initial: (m.name || m.user?.fullName || 'U').charAt(0).toUpperCase(),
          bgColorClass: m.avatarColor || 'avatar-purple',
          roleClass: this.getRoleSquircleClass(roleStr),
        });
      }

      const overflowCount = Math.max(0, roleMembers.length - maxDisplay);

      return {
        roleCode: cfg.code,
        title: cfg.title,
        memberCount: roleMembers.length,
        avatars,
        overflowCount,
      };
    });
  }

  openUserDetailModal(user: UserPerformanceRecord): void {
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

  closeUserDetailModal(): void {
    this.selectedPerformanceUser = null;
    this.modalDateFilter = 'ALL';
    this.customFilterDate = '';
    this.taskSearchQuery = '';
    this.taskStatusSubFilter = 'ALL';
    this.currentPage = 1;
    this.expandedCampaignRows.clear();
  }

  toggleExpandCampaignRow(sNo: number): void {
    if (this.expandedCampaignRows.has(sNo)) {
      this.expandedCampaignRows.delete(sNo);
    } else {
      this.expandedCampaignRows.add(sNo);
    }
  }

  setTaskStatusSubFilter(filter: 'ALL' | 'IN_QUEUE' | 'COMPLETED' | 'REVISIONS'): void {
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

  setModalDateFilter(filter: 'ALL' | 'YESTERDAY' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'): void {
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

  onCustomDateChange(val: string): void {
    if (val && val > this.todayDateString) {
      val = this.todayDateString;
    }
    this.customFilterDate = val;
    this.filterStartDate = val;
    this.filterEndDate = val;
    this.currentPage = 1;
    this.modalDateFilter = val ? 'CUSTOM' : 'ALL';
  }

  onStartDateChange(val: string): void {
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

  onEndDateChange(val: string): void {
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

  clearDateRange(): void {
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

  get telecallerCampaignReports(): TelecallerCampaignReport[] {
    if (this.selectedPerformanceUser?.role !== 'TELECALLER') {
      return [];
    }

    const tasks = this.filteredModalTasks;
    const pkgDisplayName = this.activePackageDisplayName() || this.activePackageMeta?.name || 'current affairs oct';
    const targetInfo = this.targetService.getTargetForTelecaller(this.selectedPerformanceUser.userId || '5');
    const baseDailyTarget = targetInfo?.dailyCallsTarget || 50;

    if (tasks.length === 0 && (!this.selectedPerformanceUser.tasks || this.selectedPerformanceUser.tasks.length === 0)) {
      return [];
    }

    return this.buildTelecallerCampaignReportsFromTasks(tasks, pkgDisplayName, baseDailyTarget);
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
    const assigned = this.getTaskAssignedLocalDate(task);
    const dates = collectTaskReportDates(task, (val) => this.toLocalDateString(val), assigned);
    if (dates.length === 0) return true;
    return dates.some((d) => isDateInRange(d, startDate, endDate));
  }

  getVersionDuration(ver: any, task?: any): string {
    if (!ver?.createdAt) return '';
    const uploadTime = new Date(ver.createdAt).getTime();
    if (Number.isNaN(uploadTime)) return '';

    const startTime = resolveVersionStartTime(ver, task, uploadTime);
    if (!startTime || Number.isNaN(startTime) || uploadTime < startTime) {
      return '—';
    }
    return formatDurationDiff(Math.max(0, uploadTime - startTime));
  }

  private resolveFinishedTaskDuration(task: any): string | null {
    if (!['APPROVED', 'COMPLETED', 'PUBLISHED', 'SUBMITTED', 'UNDER_REVIEW'].includes(task?.status)) {
      return null;
    }
    if (!task.createdAt || !task.updatedAt) return null;
    const start = new Date(task.createdAt).getTime();
    const end = new Date(task.updatedAt).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      return formatDurationDiff(end - start);
    }
    return null;
  }

  private resolveActiveTaskDuration(task: any): string | null {
    if (task?.status !== 'IN_PROGRESS' && task?.status !== 'ACCEPTED') {
      return null;
    }
    if (task.createdAt) {
      const start = new Date(task.createdAt).getTime();
      return formatActiveDuration(start);
    }
    return 'In Progress';
  }

  private resolveVersionDurationFallback(task: any): string | null {
    if (Array.isArray(task?.versions) && task.versions.length > 0) {
      const latestVer = task.versions[task.versions.length - 1];
      const dur = this.getVersionDuration(latestVer, task);
      if (dur && dur !== '—') return dur;
    }
    return null;
  }

  getTaskDuration(task: any): string {
    if (!task) return '—';
    const explicitDur = task.timeDuration || task.duration || task.workCycle?.durationText;
    if (explicitDur) return explicitDur;

    const verDur = this.resolveVersionDurationFallback(task);
    if (verDur) return verDur;

    const finishedDur = this.resolveFinishedTaskDuration(task);
    if (finishedDur) return finishedDur;

    const activeDur = this.resolveActiveTaskDuration(task);
    if (activeDur) return activeDur;

    return '—';
  }

  getSubmissionDateText(t: any): string {
    if (!t) return '—';
    if (t.submissionDate) return t.submissionDate;
    const actualSubDate = t.submittedAt || (Array.isArray(t.versions) && t.versions.length > 0 ? t.versions[t.versions.length - 1].createdAt : null);
    if (actualSubDate) {
      const d = new Date(actualSubDate);
      if (!Number.isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      }
    }
    if (['APPROVED', 'COMPLETED', 'PUBLISHED'].includes(t.status)) {
      const refDate = t.updatedAt || t.createdAt;
      if (refDate) {
        const d = new Date(refDate);
        if (!Number.isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}/${month}/${year}`;
        }
      }
      return '—';
    }
    return '—';
  }

  getTaskRevisionsCount(t: any): number {
    if (!t) return 0;
    if (t.revisions !== undefined) return Number(t.revisions);
    if (Array.isArray(t.versions) && t.versions.length > 1) {
      return t.versions.length - 1;
    }
    if (t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED') {
      return 1;
    }
    if (t.revisionCount !== undefined) {
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

  get filteredModalTasks(): any[] {
    if (!this.selectedPerformanceUser) return [];
    let tasks = this.packageScopedTasks;

    if (this.filterStartDate || this.filterEndDate) {
      tasks = tasks.filter((t) => this.taskMatchesDateRange(t, this.filterStartDate, this.filterEndDate));
    } else if (this.modalDateFilter !== 'ALL') {
      const targetDate = resolveModalTargetDate(this.modalDateFilter, this.customFilterDate, (d) => this.toLocalDateString(d));
      if (targetDate) {
        tasks = tasks.filter((t) => this.taskMatchesDate(t, targetDate));
      }
    }

    const isTelecaller = this.selectedPerformanceUser?.role === 'TELECALLER';
    if (this.taskStatusSubFilter) {
      tasks = tasks.filter((t) => matchesModalSubFilter(t, this.taskStatusSubFilter, isTelecaller));
    }

    if (this.taskSearchQuery.trim()) {
      const q = this.taskSearchQuery.toLowerCase().trim();
      tasks = tasks.filter((t) => {
        const titleMatch = (t.title || '').toLowerCase().includes(q);
        const leadNameMatch = (t.leadName || '').toLowerCase().includes(q);
        const phoneMatch = (t.leadPhone || '').toLowerCase().includes(q);
        const campMatch = (t.campaignName || '').toLowerCase().includes(q);
        const adMatch = (t.adName || '').toLowerCase().includes(q);
        const srcMatch = (t.source || t.campaignName || '').toLowerCase().includes(q);
        const prodMatch = (t.productName || t.productId || '').toLowerCase().includes(q);
        const pkgMatch = (t.packageName || t.packageId || '').toLowerCase().includes(q);
        const statusMatch = (t.status || t.callOutcome || '').toLowerCase().includes(q);
        const notesMatch = (t.remarks || '').toLowerCase().includes(q);
        return titleMatch || leadNameMatch || phoneMatch || campMatch || adMatch || srcMatch || prodMatch || pkgMatch || statusMatch || notesMatch;
      });
    }

    return tasks;
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

  onPreviewTaskDoc(task: any, event: MouseEvent): void {
    event.stopPropagation();
    this.previewTaskDoc.emit({ task, event });
  }

  getTaskStatusBadgeClass(status: string): string {
    return getReportTaskStatusBadgeClass(status);
  }

  getLeadStatusBadgeClass(status?: string): string {
    return getReportLeadStatusBadgeClass(status);
  }

  getPlatformBadgeClass(platform?: string): string {
    return getReportPlatformBadgeClass(platform);
  }

  getAdStatusBadgeClass(status?: string): string {
    return getReportAdStatusBadgeClass(status);
  }

  formatProductName(rawName?: string, task?: any): string {
    return formatReportProductName(rawName, task, this.productPackages, this.activePackageMeta?.name);
  }

  formatPackageName(rawName?: string, task?: any): string {
    return formatReportPackageName(rawName, task, this.productPackages, this.activePackageDisplayName());
  }

  private filterTasksForUserExport(user: UserPerformanceRecord): any[] {
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

  private buildDesignerCsvLines(user: UserPerformanceRecord, tasks: any[], escapeCsv: (val: any) => string): string[] {
    const lines = [
      [
        'S.No', 'Designer Name', 'Product', 'Package', 'Task Title', 'Assigned By (Role)',
        'Priority', 'Assigned Date', 'Due Date', 'Submission Date', 'Status',
        'Progress Status', 'Time Duration', 'No. of Revisions', 'Admin Feedback / Notes', 'Design File'
      ].map(escapeCsv).join(',')
    ];
    tasks.forEach((t: any, index: number) => {
      lines.push([
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
        t.status || 'PENDING',
        `${t.progressPercent || 0}%`,
        this.getTaskDuration(t),
        this.getTaskRevisionsCount(t),
        t.reviewerFeedback || t.remarks || '—',
        t.attachmentName || t.attachmentUrl || 'None',
      ].map(escapeCsv).join(','));
    });
    return lines;
  }

  private buildTelecallerCsvLines(user: UserPerformanceRecord, tasks: any[], escapeCsv: (val: any) => string): string[] {
    const lines = [
      [
        'S.No', 'Telecaller Name', 'Product', 'Package', 'Lead Name', 'Campaign Name',
        'Phone Number', 'Ad Name', 'Source', 'Assigned Date', 'Called Date & Time',
        'Duration', 'Status', 'Call Attempts', 'Follow Up Date', 'Remarks / Notes'
      ].map(escapeCsv).join(',')
    ];
    tasks.forEach((t: any, index: number) => {
      let attempts = 0;
      if (t.callAttempts !== undefined) {
        attempts = t.callAttempts;
      } else if (t.calledAt) {
        attempts = 1;
      }
      lines.push([
        index + 1,
        user.name || 'Telecaller',
        this.formatProductName(t.productName, t),
        this.formatPackageName(t.packageName, t),
        t.leadName || t.title || 'Lead #' + (index + 1),
        t.campaignName || '—',
        t.leadPhone || t.phone || '—',
        t.adName || 'spiderman poster',
        t.source || 'Meta Ads',
        this.getTaskAssignedLocalDate(t) || '—',
        t.calledAt ? new Date(t.calledAt).toLocaleString() : '—',
        t.callDurationSeconds ? `${Math.round(t.callDurationSeconds / 60)} min` : '—',
        t.status || t.callOutcome || 'NEW',
        attempts,
        t.followUpDate ? new Date(t.followUpDate).toLocaleDateString() : '—',
        t.remarks || t.notes || '—',
      ].map(escapeCsv).join(','));
    });
    return lines;
  }

  private buildDigitalMarketingCsvLines(user: UserPerformanceRecord, tasks: any[], escapeCsv: (val: any) => string): string[] {
    const lines = [
      [
        'S.No', 'Digital Marketer Name', 'Ad Name', 'Campaign Name', 'Product',
        'Package', 'Platform', 'Date', 'Leads Generated', 'Status'
      ].map(escapeCsv).join(',')
    ];
    tasks.forEach((t: any, index: number) => {
      let date = '—';
      if (t.launchDate) {
        date = new Date(t.launchDate).toLocaleDateString();
      } else if (t.createdAt) {
        date = new Date(t.createdAt).toLocaleDateString();
      }
      lines.push([
        index + 1,
        user.name || 'Digital Marketer',
        t.adName || t.title || '—',
        t.campaignName || '—',
        this.formatProductName(t.productName, t),
        this.formatPackageName(t.packageName, t),
        t.platform || 'Meta Ads',
        date,
        t.leadsCount !== undefined ? t.leadsCount : 0,
        t.status || 'ACTIVE',
      ].map(escapeCsv).join(','));
    });
    return lines;
  }

  private buildGeneralCsvLines(user: UserPerformanceRecord, tasks: any[], escapeCsv: (val: any) => string): string[] {
    const lines = [
      [
        'S.No', 'Staff Name', 'Role', 'Product', 'Package', 'Task Title',
        'Assigned By (Role)', 'Status', 'Priority', 'Due Date', 'Time Duration',
        'Asset / Deliverable', 'Notes'
      ].map(escapeCsv).join(',')
    ];
    tasks.forEach((t: any, index: number) => {
      lines.push([
        index + 1,
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
      ].map(escapeCsv).join(','));
    });
    return lines;
  }

  private resolveReportDateSuffix(): string {
    const dateStr = new Date().toISOString().split('T')[0];
    if (this.filterStartDate && this.filterEndDate) {
      return `${this.filterStartDate}_to_${this.filterEndDate}`;
    }
    if (this.filterStartDate) {
      return `from_${this.filterStartDate}`;
    }
    if (this.filterEndDate) {
      return `until_${this.filterEndDate}`;
    }
    return dateStr;
  }

  downloadUserReport(user: UserPerformanceRecord): void {
    if (!user) return;

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '""';
      return `"${String(val).replaceAll('"', '""')}"`;
    };

    const tasks = (this.selectedPerformanceUser?.userId === user.userId)
      ? this.filteredModalTasks
      : this.filterTasksForUserExport(user);

    let lines: string[];
    if (user.role === 'DESIGNER') {
      lines = this.buildDesignerCsvLines(user, tasks, escapeCsv);
    } else if (user.role === 'TELECALLER') {
      lines = this.buildTelecallerCsvLines(user, tasks, escapeCsv);
    } else if (user.role === 'DIGITAL_MARKETING') {
      lines = this.buildDigitalMarketingCsvLines(user, tasks, escapeCsv);
    } else {
      lines = this.buildGeneralCsvLines(user, tasks, escapeCsv);
    }

    const csvContent = lines.join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanName = (user.name || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `${cleanName}_Report_${this.resolveReportDateSuffix()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
}
