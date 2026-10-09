import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RoleOperationTab, FixedPackageMeta, ProductPackage, FIXED_PACKAGES, resolveTaskProductAndPackage, isTaskForPackage } from '../../../../core/models/package.model';
import { UserPerformanceRecord } from '../../../../core/models/user-management.model';

import { DesignerDashboardComponent } from '../../../designer/designer-dashboard.component';
import { TelecallingComponent } from '../../../telecalling/telecalling.component';
import { TargetsComponent } from '../../../targets/targets.component';
import { LeadsComponent } from '../../../leads/leads.component';
import { CampaignsComponent } from '../../../campaigns/campaigns.component';
import { AdsComponent } from '../../../ads/ads.component';

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


  @Input() getAuditLogCreatorFn!: (log: any) => { name: string; role: string };
  @Input() getAuditLogAssigneeFn!: (log: any) => string;
  @Input() getAuditLogTaskTitleFn!: (log: any) => string;
  @Input() getAuditLogTaskFileFn?: (log: any) => { hasFile: boolean; fileName: string; fileUrl: string; fileContent?: string; isPdf?: boolean } | null;
  @Input() activePackageDisplayNameFn!: () => string;

  @Output() operationTabSelect = new EventEmitter<string>();
  @Output() openTaskAudit = new EventEmitter<{ log: any; event: MouseEvent }>();
  @Output() openTaskFile = new EventEmitter<{ log: any; event: MouseEvent }>();
  @Output() previewTaskDoc = new EventEmitter<{ task: any; event: MouseEvent }>();

 
  teamSearchQuery = '';
  selectedRoleFilter = 'ALL';
  selectedPerformanceUser: UserPerformanceRecord | null = null;


  modalDateFilter: 'ALL' | 'YESTERDAY' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM' = 'ALL';
  customFilterDate: string = '';
  filterStartDate: string = '';
  filterEndDate: string = '';
  taskSearchQuery: string = '';
  taskStatusSubFilter: 'ALL' | 'IN_QUEUE' | 'COMPLETED' | 'REVISIONS' = 'ALL';

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
    this.modalDateFilter = 'ALL';
    this.customFilterDate = '';
    this.taskSearchQuery = '';
    this.taskStatusSubFilter = 'ALL';
    this.currentPage = 1;
  }

  closeUserDetailModal() {
    this.selectedPerformanceUser = null;
    this.modalDateFilter = 'ALL';
    this.customFilterDate = '';
    this.taskSearchQuery = '';
    this.taskStatusSubFilter = 'ALL';
    this.currentPage = 1;
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
    if (isNaN(d.getTime())) {
      const parsed = Date.parse(val);
      if (!isNaN(parsed)) {
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
    return this.filteredModalTasks.length;
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

    const dates: string[] = [];
    const assigned = this.getTaskAssignedLocalDate(task);
    if (assigned) dates.push(assigned);

    if (task.launchDate) {
      const lDate = this.toLocalDateString(task.launchDate);
      if (lDate) dates.push(lDate);
    }
    if (task.calledAt) {
      const cDate = this.toLocalDateString(task.calledAt);
      if (cDate) dates.push(cDate);
    }
    if (task.createdAt) {
      const crDate = this.toLocalDateString(task.createdAt);
      if (crDate) dates.push(crDate);
    }
    if (task.submittedAt) {
      const sDate = this.toLocalDateString(task.submittedAt);
      if (sDate) dates.push(sDate);
    }
    if (task.updatedAt) {
      const uDate = this.toLocalDateString(task.updatedAt);
      if (uDate) dates.push(uDate);
    }
    if (task.dueDate) {
      const dDate = this.toLocalDateString(task.dueDate);
      if (dDate) dates.push(dDate);
    }

    if (dates.length === 0) return true;

    return dates.some((d) => {
      if (startDate && endDate) {
        return d >= startDate && d <= endDate;
      }
      if (startDate) {
        return d >= startDate;
      }
      if (endDate) {
        return d <= endDate;
      }
      return true;
    });
  }


  getVersionDuration(ver: any, task?: any): string {
    if (!ver || !ver.createdAt) return '';
    const uploadTime = new Date(ver.createdAt).getTime();
    if (isNaN(uploadTime)) return '';

    let startTime: number | null = null;

    if (task?.statusHistory && task.statusHistory.length > 0) {
      const sortedHistory = [...task.statusHistory].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      for (const h of sortedHistory) {
        const hTime = new Date(h.createdAt).getTime();
        if (hTime <= uploadTime) {
          const s = (h.newStatus || '').toUpperCase();
          if (s === 'IN_PROGRESS' || s === 'REVISION_REQUIRED') {
            startTime = hTime;
          }
        }
      }

      if (!startTime) {
        for (const h of sortedHistory) {
          const hTime = new Date(h.createdAt).getTime();
          if (hTime <= uploadTime) {
            const s = (h.newStatus || '').toUpperCase();
            if (s === 'ACCEPTED' || s === 'ASSIGNED') {
              startTime = hTime;
            }
          }
        }
      }
    }

    if (!startTime && task?.versions && task.versions.length > 1) {
      const sortedVers = [...task.versions].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const currIdx = sortedVers.findIndex(
        (v: any) => (v.id && v.id === ver.id) || v.versionNumber === ver.versionNumber
      );
      if (currIdx > 0) {
        startTime = new Date(sortedVers[currIdx - 1].createdAt).getTime();
      }
    }

    if (!startTime && task?.createdAt) {
      startTime = new Date(task.createdAt).getTime();
    }

    if (!startTime || isNaN(startTime) || uploadTime < startTime) {
      return '—';
    }

    const diffMs = Math.max(0, uploadTime - startTime);
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
    if (diffMinutes > 0) {
      return `${diffMinutes} min`;
    }
    if (diffSec > 0) {
      return `${diffSec}s`;
    }
    return '—';
  }

  
  getTaskDuration(task: any): string {
    if (!task) return '—';


    if (task.workCycle?.durationText) {
      return task.workCycle.durationText;
    }

   
    if (Array.isArray(task.versions) && task.versions.length > 0) {
      const latestVer = task.versions[task.versions.length - 1];
      const dur = this.getVersionDuration(latestVer, task);
      if (dur && dur !== '—') return dur;
    }

    if (
      task.status === 'APPROVED' ||
      task.status === 'COMPLETED' ||
      task.status === 'PUBLISHED' ||
      task.status === 'SUBMITTED' ||
      task.status === 'UNDER_REVIEW'
    ) {
      if (task.createdAt && task.updatedAt) {
        const start = new Date(task.createdAt).getTime();
        const end = new Date(task.updatedAt).getTime();
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          const diffMs = end - start;
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
          const diffSec = Math.floor(diffMs / 1000);
          return diffSec > 0 ? `${diffSec}s` : '—';
        }
      }
    }

    
    if (task.status === 'IN_PROGRESS' || task.status === 'ACCEPTED') {
      if (task.createdAt) {
        const start = new Date(task.createdAt).getTime();
        const now = Date.now();
        if (!isNaN(start) && now > start) {
          const diffMs = now - start;
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffHours / 24);
          if (diffDays > 0) return `${diffDays}d active`;
          if (diffHours > 0) return `${diffHours}h active`;
          const diffMins = Math.floor(diffMs / 60000);
          return diffMins > 0 ? `${diffMins}m active` : 'Active';
        }
      }
      return 'In Progress';
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
    if (t.status === 'APPROVED' || t.status === 'COMPLETED' || t.status === 'PUBLISHED') {
      return '100% Completed';
    } else if (t.status === 'SUBMITTED' || t.status === 'UNDER_REVIEW') {
      return pVal !== null ? `${pVal}% (Under Review)` : 'Under Review';
    } else if (t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED') {
      return pVal !== null ? `${pVal}% (Changes Req)` : 'Revision Requested';
    } else if (t.status === 'RESUBMITTED') {
      return pVal !== null ? `${pVal}% (Resubmitted)` : 'Resubmitted';
    } else if (t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED') {
      return pVal !== null && pVal > 0 ? `${pVal}% (In Progress)` : 'In Progress';
    }
    return pVal !== null && pVal > 0 ? `${pVal}%` : (t.status || 'Assigned');
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

  get filteredModalTasks(): any[] {
    if (!this.selectedPerformanceUser) return [];
    let tasks = this.packageScopedTasks;

   
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
        tasks = tasks.filter((t) => this.taskMatchesDate(t, targetDate));
      }
    }

    
    const isTelecaller = this.selectedPerformanceUser?.role === 'TELECALLER';
    if (this.taskStatusSubFilter === 'COMPLETED') {
      if (isTelecaller) {
        tasks = tasks.filter((t) => t.calledAt || t.callAttempts > 0 || ['CONNECTED', 'QUALIFIED', 'CONVERTED', 'PAID', 'INTERESTED'].includes(t.status));
      } else {
        tasks = tasks.filter((t) => t.status === 'APPROVED' || t.status === 'COMPLETED' || t.status === 'PUBLISHED');
      }
    } else if (this.taskStatusSubFilter === 'IN_QUEUE') {
      if (isTelecaller) {
        tasks = tasks.filter((t) => !t.calledAt && t.callAttempts === 0 && !['CONNECTED', 'QUALIFIED', 'CONVERTED', 'PAID'].includes(t.status));
      } else {
        tasks = tasks.filter((t) => t.status !== 'APPROVED' && t.status !== 'COMPLETED' && t.status !== 'PUBLISHED');
      }
    } else if (this.taskStatusSubFilter === 'REVISIONS') {
      if (isTelecaller) {
        tasks = tasks.filter((t) => t.status === 'FOLLOW_UP' || t.status === 'LINE_BUSY' || t.status === 'NO_ANSWER' || t.status === 'BUSY');
      } else {
        tasks = tasks.filter((t) => t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED');
      }
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
    if (rawName && rawName.trim() && !rawName.toLowerCase().includes('careermate')) {
      return String(rawName).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
    const raw = this.activePackageMeta?.name || this.activePackageName || 'Product';
    return String(raw).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  formatPackageName(rawName?: string, task?: any): string {
    if (task) {
      if (task.packageName && task.packageName.trim()) {
        return String(task.packageName).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
      const resolved = resolveTaskProductAndPackage(task, this.productPackages);
      if (resolved?.packageName) {
        return String(resolved.packageName).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
    }
    if (rawName && rawName.trim()) {
      return String(rawName).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
    const raw = this.activePackageDisplayName() || this.activePackageMeta?.name || 'Package';
    return String(raw).replace(/^pkg_/i, '').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  downloadUserReport(user: UserPerformanceRecord): void {
    if (!user) return;

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines: string[] = [];

  
    const tasks = (this.selectedPerformanceUser && this.selectedPerformanceUser.userId === user.userId)
      ? this.filteredModalTasks
      : (user.tasks || []).filter((t: any) => {
          if (this.filterStartDate || this.filterEndDate) {
            if (!this.taskMatchesDateRange(t, this.filterStartDate, this.filterEndDate)) return false;
          }
          if (this.currentFilterTarget && this.currentFilterTarget !== 'ALL') {
            return isTaskForPackage(t, this.currentFilterTarget, this.productPackages, this.activePackageMeta?.id);
          }
          return true;
        });

    if (user.role === 'DESIGNER') {
 
      const designerHeaders = [
        'S.No',
        'Designer Name',
        'Product',
        'Package',
        'Task Title',
        'Assigned By (Role)',
        'Priority',
        'Assigned Date',
        'Due Date',
        'Submission Date',
        'Status',
        'Work Progress Status',
        'Time Duration',
        'Revisions (Changes)',
        'Admin Feedback / Notes',
        'Design File ',
      ];
      lines.push(designerHeaders.map(escapeCsv).join(','));

      if (tasks.length > 0) {
        tasks.forEach((t: any, index: number) => {
          const sNo = index + 1;
          const designerName = user.name || 'Designer';
          const product = this.formatProductName(t.productName || t.productId, t);
          const pkg = this.formatPackageName(t.packageName || t.packageId, t);
          const taskTitle = t.title || 'Design Task';

        
          const assignedByRole = t.creatorRole || 'Administrator';

       
          const priority = t.priority || 'MEDIUM';

      
          const assignedDate = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—';

         
          const dueDate = t.dueDate || 'Ongoing';

        
          const submissionDate = this.getSubmissionDateText(t);

       
          const status = t.status || 'ASSIGNED';

        
          const progressStatus = this.getProgressStatusText(t);

    
          const duration = this.getTaskDuration(t);

 
          const revCount = this.getTaskRevisionCount(t);

 
          const feedback = t.reviewerFeedback || t.feedback || t.remark || '—';

     
          const fileAsset = t.attachmentName || t.attachmentUrl || (Array.isArray(t.versions) && t.versions.length > 0 ? (t.versions[t.versions.length - 1].fileName || t.versions[t.versions.length - 1].previewUrl) : '') || '—';

          const row = [
            sNo,
            designerName,
            product,
            pkg,
            taskTitle,
            assignedByRole,
            priority,
            assignedDate,
            dueDate,
            submissionDate,
            status,
            progressStatus,
            duration,
            revCount,
            feedback,
            fileAsset,
          ];
          lines.push(row.map(escapeCsv).join(','));
        });
      }
    } else if (user.role === 'TELECALLER') {

      const telecallerHeaders = [
        'S.No',
        'Telecaller Name',
        'Product',
        'Package',
        'Lead Name',
        'Campaign',
        'Phone Number',
        'Ad Name',
        'Lead Source',
        'Assigned Date',
        'Call Date & Time',
        'Call Duration',
        'Call Status',
        'Total Call Attempts',
        'Follow-up Date',
        'Telecaller Notes',
      ];
      lines.push(telecallerHeaders.map(escapeCsv).join(','));

      if (tasks.length > 0) {
        tasks.forEach((t: any, index: number) => {
          const sNo = index + 1;
          const telecallerName = user.name || 'Telecaller';
          const product = this.formatProductName(t.productName, t);
          const pkg = this.formatPackageName(t.packageName, t);
          const leadName = t.leadName || t.title || '—';
          const campaign = t.campaignName || '—';
          const phone = (t.leadPhone && t.leadPhone !== '—' && !t.leadPhone.includes('@')) ? t.leadPhone : '—';
          const adName = t.adName || '—';
          const source = t.source || '—';
          const assignedDate = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—';
          const callDateTime = t.calledAt ? new Date(t.calledAt).toLocaleString() : '—';
          const duration = t.callDurationText && t.callDurationText !== '—' ? t.callDurationText : '—';
          const status = t.callOutcome || t.status || '—';
          const attempts = t.callAttemptsText || (t.callAttempts ? `${t.callAttempts} Calls` : '0 Attempts');
          const followUp = t.followUpDate ? new Date(t.followUpDate).toLocaleDateString() : '—';
          const remarks = (t.remarks && t.remarks !== '—') ? t.remarks : ((t.notes && t.notes !== '—') ? t.notes : '—');

          const row = [
            sNo,
            telecallerName,
            product,
            pkg,
            leadName,
            campaign,
            phone,
            adName,
            source,
            assignedDate,
            callDateTime,
            duration,
            status,
            attempts,
            followUp,
            remarks,
          ];
          lines.push(row.map(escapeCsv).join(','));
        });
      }
    } else if (user.role === 'DIGITAL_MARKETING') {
    
      const dmHeaders = [
        'S.No',
        'Digital Marketer Name',
        'Ad Name',
        'Campaign Name',
        'Product',
        'Package',
        'Platform',
        'Date',
        'Leads Generated',
        'Status',
      ];
      lines.push(dmHeaders.map(escapeCsv).join(','));

      if (tasks.length > 0) {
        tasks.forEach((t: any, index: number) => {
          const sNo = index + 1;
          const dmName = user.name || 'Digital Marketer';
          const adName = t.adName || t.title || '—';
          const campaign = t.campaignName || '—';
          const product = this.formatProductName(t.productName, t);
          const pkg = this.formatPackageName(t.packageName, t);
          const platform = t.platform || 'Meta Ads';
          const date = t.launchDate ? new Date(t.launchDate).toLocaleDateString() : (t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—');
          const leads = t.leadsCount !== undefined ? t.leadsCount : 0;
          const status = t.status || 'ACTIVE';

          const row = [
            sNo,
            dmName,
            adName,
            campaign,
            product,
            pkg,
            platform,
            date,
            leads,
            status,
          ];
          lines.push(row.map(escapeCsv).join(','));
        });
      }
    } else {
     
      const generalHeaders = [
        'S.No',
        'Staff Name',
        'Role',
        'Product',
        'Package',
        'Task Title',
        'Assigned By (Role)',
        'Status',
        'Priority',
        'Due Date',
        'Time Duration',
        'Asset / Deliverable',
        'Notes',
      ];
      lines.push(generalHeaders.map(escapeCsv).join(','));

      if (tasks.length > 0) {
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
      }
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
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}
