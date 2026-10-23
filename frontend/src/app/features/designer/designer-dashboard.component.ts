import { Component, OnInit, signal, computed, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';

import { TaskManagementService } from '../../core/services/task-management.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { UserManagementService } from '../../core/services/user-management.service';
import { PackageService } from '../../core/services/package.service';

import { Task, TaskStatus, TaskPriority } from '../../core/models/task.model';
import { FIXED_PACKAGES, isTaskForPackage } from '../../core/models/package.model';

import { DesignerKpisComponent } from './components/designer-kpis/designer-kpis.component';
import { DesignersTableComponent, DesignerSummary } from './components/designers-table/designers-table.component';
import { DesignerProfileBannerComponent } from './components/designer-profile-banner/designer-profile-banner.component';
import { TaskCardComponent } from './components/task-card/task-card.component';
import { UploadDesignModalComponent } from './components/modals/upload-design-modal/upload-design-modal.component';
import { RedesignModalComponent } from './components/modals/redesign-modal/redesign-modal.component';
import { CreateTaskModalComponent } from './components/modals/create-task-modal/create-task-modal.component';
import { ReviewModalComponent } from './components/modals/review-modal/review-modal.component';
import { DocViewerModalComponent } from './components/modals/doc-viewer-modal/doc-viewer-modal.component';

function initializeDesignerSummaryMap(designers: Array<{ id: string; name: string; email?: string; department?: string; avatarUrl?: string }>, getAvatarColor: (name: string) => string): Map<string, DesignerSummary> {
  const map = new Map<string, DesignerSummary>();
  for (const d of designers) {
    const dIdStr = String(d.id || '');
    const dNameStr = String(d.name || '');
    const dEmailStr = String(d.email || `${dNameStr.toLowerCase().replace(/\s+/g, '.')}@markops.io`);
    map.set(dIdStr, {
      id: dIdStr,
      name: dNameStr,
      email: dEmailStr,
      department: d.department || 'Creative Design',
      avatarColor: getAvatarColor(dNameStr),
      avatarUrl: d.avatarUrl,
      totalCount: 0,
      completedCount: 0,
      pendingCount: 0,
      inProgressCount: 0,
      submittedCount: 0,
      revisionCount: 0,
      completionRate: 0,
    });
  }
  return map;
}

function isTaskMatchingDate(t: Task, dateFilter: string): boolean {
  if (!dateFilter) return true;
  const createdDate = t.createdAt ? t.createdAt.split('T')[0] : '';
  const dueDate = t.dueDate ? t.dueDate.split('T')[0] : '';
  const updatedDate = t.updatedAt ? t.updatedAt.split('T')[0] : '';
  return createdDate === dateFilter || dueDate === dateFilter || updatedDate === dateFilter;
}

function isTaskMatchingDesignerRole(t: Task, currentRole: string | undefined, currentUserId: string, currentUserEmail: string): boolean {
  if (currentRole !== 'DESIGNER') return true;
  const assigned = t.assignedTo !== undefined ? String(t.assignedTo).toLowerCase().trim() : '';
  return assigned === currentUserId || (Boolean(currentUserEmail) && assigned === currentUserEmail);
}

function isTaskEligibleForDesignerSummary(
  t: Task,
  currentRole: string | undefined,
  currentUserId: string,
  currentUserEmail: string,
  pkgFilter: string | null | undefined,
  dateFilter: string,
  packages: any[]
): boolean {
  if (!isTaskMatchingDesignerRole(t, currentRole, currentUserId, currentUserEmail)) return false;
  if (pkgFilter && !isTaskForPackage(t, pkgFilter, packages)) return false;
  return isTaskMatchingDate(t, dateFilter);
}

function matchesDesigner(d: { id: string; name: string; email?: string }, tAssignedToStr: string, tAssigneeNameStr: string): boolean {
  const dIdStr = String(d.id || '').toLowerCase().trim();
  const dNameStr = String(d.name || '').toLowerCase().trim();
  const dEmailStr = String(d.email || '').toLowerCase().trim();

  if (tAssignedToStr && (tAssignedToStr === dIdStr || tAssignedToStr === dEmailStr)) return true;
  if (tAssigneeNameStr && (tAssigneeNameStr === dNameStr || tAssigneeNameStr.includes(dNameStr) || dNameStr.includes(tAssigneeNameStr))) return true;
  return false;
}

function createCustomDesignerEntry(name: string, designerMap: Map<string, DesignerSummary>, getAvatarColor: (name: string) => string): string {
  const customId = `d_${name.toLowerCase().replace(/\s+/g, '_')}`;
  if (!designerMap.has(customId)) {
    designerMap.set(customId, {
      id: customId,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@markops.io`,
      department: 'Creative Design',
      avatarColor: getAvatarColor(name),
      totalCount: 0,
      completedCount: 0,
      pendingCount: 0,
      inProgressCount: 0,
      submittedCount: 0,
      revisionCount: 0,
      completionRate: 0,
    });
  }
  return customId;
}

function resolveTaskMatchedDesignerId(
  t: Task,
  designers: Array<{ id: string; name: string; email?: string }>,
  designerMap: Map<string, DesignerSummary>,
  getAvatarColor: (name: string) => string
): string | null {
  const tAssignedToStr = String(t.assignedTo || '').toLowerCase().trim();
  const tAssigneeNameStr = String(t.assigneeName || '').toLowerCase().trim();

  const found = designers.find((d) => matchesDesigner(d, tAssignedToStr, tAssigneeNameStr));
  if (found) return String(found.id);

  const ignorableNames = new Set(['Assigned User', 'Designer', 'Assigned Designer', 'Unassigned']);
  if (t.assigneeName && !ignorableNames.has(t.assigneeName)) {
    return createCustomDesignerEntry(String(t.assigneeName), designerMap, getAvatarColor);
  }
  return null;
}

function recordTaskStatusForDesigner(entry: DesignerSummary, status?: string) {
  entry.totalCount++;
  const isCompleted = status === 'APPROVED' || status === 'PUBLISHED' || status === 'COMPLETED';
  const isInProgress =
    status === 'IN_PROGRESS' ||
    status === 'ACCEPTED' ||
    status === 'SUBMITTED' ||
    status === 'RESUBMITTED' ||
    status === 'UNDER_REVIEW' ||
    status === 'REVISION_REQUIRED' ||
    status === 'REDESIGN_REQUIRED';
  const isReview = status === 'SUBMITTED' || status === 'RESUBMITTED' || status === 'UNDER_REVIEW';
  const isRevision = status === 'REVISION_REQUIRED' || status === 'REDESIGN_REQUIRED';

  if (isCompleted) {
    entry.completedCount++;
  } else if (isInProgress) {
    entry.inProgressCount = (entry.inProgressCount || 0) + 1;
  } else {
    entry.pendingCount++;
  }

  if (isReview) entry.submittedCount = (entry.submittedCount || 0) + 1;
  if (isRevision) entry.revisionCount = (entry.revisionCount || 0) + 1;
}


function isDbPackageMatchingProduct(p: any, activeProdId: string, activeProdName: string): boolean {
  const pProd = (p.productId || '').toLowerCase().trim();
  const prodNameLower = activeProdName.toLowerCase();
  if (pProd === activeProdId) return true;
  if (prodNameLower.includes('career') && (pProd.includes('career') || pProd === 'pkg_careermate')) return true;
  if (prodNameLower.includes('class') && (pProd.includes('class') || pProd === 'pkg_classmate')) return true;
  return Boolean(
    (prodNameLower.includes('jesus') || prodNameLower.includes('messang')) &&
    (pProd.includes('jesus') || pProd.includes('messang') || pProd === 'pkg_jesus_messanger')
  );
}

function populatePackagesForActiveProduct(
  map: Map<string, { name: string; icon: string }>,
  activeProd: string,
  filterPkg: string | undefined,
  dbPkgs: any[]
): void {
  const fixedProd = FIXED_PACKAGES.find(
    (p) => p.name.toLowerCase() === activeProd.toLowerCase() || p.id.toLowerCase() === activeProd.toLowerCase()
  );
  const activeProdId = (fixedProd?.id || activeProd).toLowerCase();
  const activeProdName = fixedProd?.name || activeProd;

  if (filterPkg && filterPkg.toLowerCase() !== fixedProd?.name.toLowerCase()) {
    map.set(filterPkg.toLowerCase(), { name: filterPkg, icon: 'inventory_2' });
  }

  for (const p of dbPkgs) {
    if (!p.name?.trim()) continue;
    if (isDbPackageMatchingProduct(p, activeProdId, activeProdName) && !map.has(p.name.toLowerCase().trim())) {
      map.set(p.name.toLowerCase().trim(), { name: p.name.trim(), icon: 'inventory_2' });
    }
  }

  if (map.size === 0 && fixedProd) {
    map.set(fixedProd.name.toLowerCase(), { name: fixedProd.name, icon: fixedProd.icon });
  }
}

function populateDefaultPackages(
  map: Map<string, { name: string; icon: string }>,
  filterPkg: string | undefined,
  dbPkgs: any[]
): void {
  if (filterPkg) {
    map.set(filterPkg.toLowerCase(), { name: filterPkg, icon: 'inventory_2' });
  }

  for (const p of dbPkgs) {
    if (p.name?.trim() && !map.has(p.name.toLowerCase().trim())) {
      map.set(p.name.toLowerCase().trim(), { name: p.name.trim(), icon: 'inventory_2' });
    }
  }

  if (map.size === 0) {
    for (const pkg of FIXED_PACKAGES) {
      if (!map.has(pkg.name.toLowerCase())) {
        map.set(pkg.name.toLowerCase(), { name: pkg.name, icon: pkg.icon });
      }
    }
  }
}

@Component({
  selector: 'app-designer-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DesignerKpisComponent,
    DesignersTableComponent,
    DesignerProfileBannerComponent,
    TaskCardComponent,
    UploadDesignModalComponent,
    RedesignModalComponent,
    CreateTaskModalComponent,
    ReviewModalComponent,
    DocViewerModalComponent,
  ],
  templateUrl: './designer-dashboard.component.html',
  styleUrl: './designer-dashboard.component.scss',
})

export class DesignerDashboardComponent implements OnInit {
  readonly packageFilterSignal = signal<string | undefined>(undefined);
  @Input() set packageFilter(val: string | undefined) {
    this.packageFilterSignal.set(val);
    this.selectedDesignerId.set(null);
    if (!this.isDesigner()) {
      this.showDesignersDirectory.set(true);
    }
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

  @Input() embedded = false;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly taskService = inject(TaskManagementService);
  readonly userService = inject(UserManagementService);
  readonly authService = inject(AuthService);
  readonly notifService = inject(NotificationService);
  readonly packageService = inject(PackageService);

  readonly statusFilter = signal<string>('ALL');
  readonly priorityFilter = signal<string>('ALL');
  readonly searchQuery = signal<string>('');
  readonly designerSearchQuery = signal<string>('');
  readonly selectedDesignerId = signal<string | null>(null);
  readonly showDesignersDirectory = signal<boolean>(true);

  readonly currentRoutePath = computed<string>(() => {
    return this.router.url.split('?')[0].toLowerCase();
  });

  readonly pageHeaderTitle = computed<string>(() => {
    return 'Designer';
  });

  readonly activeProductName = computed<string>(() => {
    return this.resolvedActiveProduct() || 'Careermate';
  });

  readonly resolvedActiveProduct = computed<string | null>(() => {
    const prod = this.productFilterSignal()?.trim();
    if (prod) return prod;

    const pkgFilter = this.packageFilterSignal()?.trim();
    if (pkgFilter) {
      const fixed = FIXED_PACKAGES.find((p) => p.name.toLowerCase() === pkgFilter.toLowerCase());
      if (fixed) return fixed.name;

      const dbPkgs = this.packageService.packages();
      const match = dbPkgs.find((p) => p.name.toLowerCase().trim() === pkgFilter.toLowerCase());
      if (match && match.productId) {
        const fixedByProdId = FIXED_PACKAGES.find(
          (fp) => fp.id.toLowerCase() === match.productId.toLowerCase() ||
                  fp.name.toLowerCase().includes(match.productId.toLowerCase().replace('pkg_', ''))
        );
        if (fixedByProdId) return fixedByProdId.name;
        return match.productId;
      }
    }
    return null;
  });

  readonly availablePackagesList = computed<{ name: string; icon: string }[]>(() => {
    const map = new Map<string, { name: string; icon: string }>();
    const activeProd = this.resolvedActiveProduct();
    const filterPkg = this.packageFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();

    if (activeProd) {
      populatePackagesForActiveProduct(map, activeProd, filterPkg, dbPkgs);
    } else {
      populateDefaultPackages(map, filterPkg, dbPkgs);
    }

    return Array.from(map.values());
  });

  get availablePackages() {
    return this.availablePackagesList();
  }

  readonly todayDate = new Date().toISOString().split('T')[0];
  readonly yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  readonly selectedDateFilter = signal<string>('');

  setDateFilter(dateStr: string): void {
    this.selectedDateFilter.set(dateStr || '');
  }

  setQuickDate(preset: 'today' | 'yesterday' | 'all'): void {
    if (preset === 'today') {
      this.selectedDateFilter.set(this.todayDate);
    } else if (preset === 'yesterday') {
      this.selectedDateFilter.set(this.yesterdayDate);
    } else {
      this.selectedDateFilter.set('');
    }
  }

  clearDateFilter(): void {
    this.selectedDateFilter.set('');
  }

  readonly canCreateTask = computed<boolean>(() => {
    const role = this.authService.currentUser()?.role;
    return role === 'ADMINISTRATOR' || role === 'MARKETING_MANAGER' || role === 'BDM';
  });

  readonly activeTaskView = computed<'all' | 'my'>(() => this.taskService.activeView());

  switchTaskView(view: 'all' | 'my'): void {
    this.showDesignersDirectory.set(false);
    this.taskService.switchView(view);
  }

  readonly isDesigner = computed<boolean>(() => {
    return this.authService.currentUser()?.role === 'DESIGNER';
  });

  isTaskCreator(task: Task | null): boolean {
    if (!task) return false;
    const currentUser = this.authService.currentUser();
    if (!currentUser) return false;

    const currentId = String(currentUser.id !== undefined && currentUser.id !== null ? currentUser.id : '').trim().toLowerCase();
    const currentEmail = String(currentUser.email || '').toLowerCase().trim();

    const tCreatorId = String(
      task.createdBy !== undefined && task.createdBy !== null
        ? task.createdBy
        : ((task as any).created_by !== undefined && (task as any).created_by !== null ? (task as any).created_by : '')
    ).trim().toLowerCase();
    const tCreatorEmail = String(task.creatorEmail || (task as any).creator_email || '').toLowerCase().trim();

    return Boolean((currentId && tCreatorId && currentId === tCreatorId) || (currentEmail && tCreatorEmail && currentEmail === tCreatorEmail));
  }

  getAvatarColor(name: string): string {
    const colors = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#4f46e5', '#db2777'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = (name.codePointAt(i) || 0) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  readonly realDesignersList = computed(() => {
    const allUsers = this.userService.users();
    const designers = allUsers.filter((u) => u.role === 'DESIGNER');
    return designers.map((u) => ({
      id: u.id,
      name: u.fullName,
      email: u.email,
      department: u.department || 'Creative Design',
      avatarUrl: u.avatarUrl,
    }));
  });

  readonly designersSummaryList = computed<DesignerSummary[]>(() => {
    const designers = this.realDesignersList();
    const allTasks = this.taskService.tasks();
    const pkgFilter = this.packageFilterSignal();
    const designerMap = initializeDesignerSummaryMap(designers, (name) => this.getAvatarColor(name));

    const currentUser = this.authService.currentUser();
    const currentRole = currentUser?.role;
    const currentUserId = String(currentUser?.id || '').toLowerCase().trim();
    const currentUserEmail = String(currentUser?.email || '').toLowerCase().trim();
    const dateFilter = this.selectedDateFilter();
    const pkgs = this.packageService.packages();

    const tasksToCount = allTasks.filter((t) =>
      isTaskEligibleForDesignerSummary(t, currentRole, currentUserId, currentUserEmail, pkgFilter, dateFilter, pkgs)
    );

    for (const t of tasksToCount) {
      const matchedId = resolveTaskMatchedDesignerId(t, designers, designerMap, (name) => this.getAvatarColor(name));
      if (matchedId && designerMap.has(matchedId)) {
        recordTaskStatusForDesigner(designerMap.get(matchedId)!, t.status);
      }
    }

    return Array.from(designerMap.values()).map((d) => ({
      ...d,
      completionRate: d.totalCount > 0 ? Math.round((d.completedCount / d.totalCount) * 100) : 0,
    }));
  });

  readonly filteredDesigners = computed(() => {
    const query = String(this.designerSearchQuery() || '').toLowerCase().trim();
    const list = this.designersSummaryList();
    if (!query) return list;
    return list.filter(
      (d) =>
        String(d.name || '').toLowerCase().includes(query) ||
        String(d.email || '').toLowerCase().includes(query) ||
        String(d.department || '').toLowerCase().includes(query)
    );
  });

  readonly selectedDesigner = computed(() => {
    const id = this.selectedDesignerId();
    if (!id) return null;
    const idStr = String(id);
    return this.designersSummaryList().find((d) => String(d.id) === idStr) || null;
  });

  readonly totalAllDesigners = computed(() => this.designersSummaryList().length);
  readonly totalAllTasks = computed(() => this.designersSummaryList().reduce((acc, d) => acc + d.totalCount, 0));
  readonly totalAllPending = computed(() => this.designersSummaryList().reduce((acc, d) => acc + d.pendingCount, 0));
  readonly totalAllInProgress = computed(() => this.designersSummaryList().reduce((acc, d) => acc + (d.inProgressCount || 0), 0));
  readonly totalAllCompleted = computed(() => this.designersSummaryList().reduce((acc, d) => acc + d.completedCount, 0));
  readonly totalMyTasks = computed(() => {
    const pkgFilter = this.packageFilterSignal();
    const tasks = pkgFilter ? this.taskService.tasks().filter((t) => isTaskForPackage(t, pkgFilter, this.packageService.packages())) : this.taskService.tasks();
    const isDes = this.isDesigner();
    const currentUser = this.authService.currentUser();
    const currentUserId = String(currentUser?.id || '').toLowerCase().trim();
    const currentUserEmail = String(currentUser?.email || '').toLowerCase().trim();
    const currentUserName = String(currentUser?.fullName || '').toLowerCase().trim();

    return tasks.filter((t) => {
      if (isDes) {
        const tAssignedToStr = String(t.assignedTo || (t as any).assigned_to || '').toLowerCase().trim();
        const tAssigneeNameStr = String(t.assigneeName || (t as any).assignee_name || '').toLowerCase().trim();
        return (tAssignedToStr && (tAssignedToStr === currentUserId || (currentUserEmail && tAssignedToStr === currentUserEmail))) ||
               (tAssigneeNameStr && currentUserName && (tAssigneeNameStr === currentUserName || tAssigneeNameStr.includes(currentUserName)));
      }
      return this.isTaskCreator(t);
    }).length;
  });

  viewDesignerTasks(designerId: string | number): void {
    this.selectedDesignerId.set(String(designerId));
    this.showDesignersDirectory.set(false);
    this.taskService.closeTaskDetail();
  }

  handleDeleteDesigner(designerId: string | number): void {
    const designer = this.designersSummaryList().find((d) => String(d.id) === String(designerId));
    const name = designer?.name || 'this designer';
    if (confirm(`Are you sure you want to remove ${name} from this view?`)) {
      this.notifService.triggerToast({
        id: `notif_${Date.now()}`,
        userId: String(this.authService.currentUser()?.id || ''),
        title: 'Designer Roster',
        message: `Designer ${name} removed from current view.`,
        type: 'INFO',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  handleEditDesigner(designer: DesignerSummary): void {
    this.viewDesignerTasks(designer.id);
  }

  clearDesignerFilter(): void {
    this.selectedDesignerId.set(null);
    this.designerSearchQuery.set('');
  }

  onPriorityFilterChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.priorityFilter.set(val || 'ALL');
  }

  readonly isUploadModalOpen = signal<boolean>(false);
  readonly isReviewModalOpen = signal<boolean>(false);
  readonly isCreateTaskModalOpen = signal<boolean>(false);
  readonly isRedesignModalOpen = signal<boolean>(false);
  readonly activeModalTaskId = signal<string | null>(null);

  readonly isDocViewerOpen = signal<boolean>(false);
  readonly activeDocName = signal<string>('');
  readonly activeDocUrl = signal<string>('');
  readonly activeDocContent = signal<string>('');

  private matchesTaskRoleAssignment(t: Task, currentRole: string | undefined, currentUserId: string, currentUserEmail: string, currentUserName: string, selDesigner: any): boolean {
    const tAssignedToStr = String(t.assignedTo || '').toLowerCase().trim();
    const tAssigneeNameStr = String(t.assigneeName || '').toLowerCase().trim();

    if (currentRole === 'DESIGNER') {
      return Boolean(
        (tAssignedToStr && (tAssignedToStr === currentUserId || (currentUserEmail && tAssignedToStr === currentUserEmail))) ||
        (tAssigneeNameStr && currentUserName && (tAssigneeNameStr === currentUserName || tAssigneeNameStr.includes(currentUserName)))
      );
    }

    if (this.activeTaskView() === 'my' && !this.isTaskCreator(t)) {
      return false;
    }

    if (selDesigner) {
      const dIdStr = String(selDesigner.id || '').toLowerCase().trim();
      const dNameStr = String(selDesigner.name || '').toLowerCase().trim();
      const dEmailStr = String(selDesigner.email || '').toLowerCase().trim();

      const matches =
        (tAssignedToStr && (tAssignedToStr === dIdStr || (dEmailStr && tAssignedToStr === dEmailStr))) ||
        (tAssigneeNameStr && (tAssigneeNameStr === dNameStr || tAssigneeNameStr.includes(dNameStr) || dNameStr.includes(tAssigneeNameStr)));

      if (!matches) {
        return false;
      }
    }
    return true;
  }

  private matchesTaskDateFilter(t: Task, dateFilter: string | null): boolean {
    if (!dateFilter) return true;
    const createdDate = t.createdAt ? t.createdAt.split('T')[0] : '';
    const dueDate = t.dueDate ? t.dueDate.split('T')[0] : '';
    const updatedDate = t.updatedAt ? t.updatedAt.split('T')[0] : '';
    return createdDate === dateFilter || dueDate === dateFilter || updatedDate === dateFilter;
  }

  private matchesTaskStatusFilter(t: Task, filter: string): boolean {
    if (filter === 'IN_PROGRESS') {
      return t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED';
    }
    if (filter === 'REVISION_REQUIRED') {
      return t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED';
    }
    if (filter === 'SUBMITTED') {
      return t.status === 'SUBMITTED' || t.status === 'RESUBMITTED' || t.status === 'UNDER_REVIEW';
    }
    if (filter === 'COMPLETED') {
      return t.status === 'APPROVED' || t.status === 'PUBLISHED' || t.status === 'COMPLETED';
    }
    if (filter === 'BDM_FLOW') {
      return t.creatorRole === 'BDM' || Boolean(t.createdBy && String(t.createdBy).toLowerCase().includes('bdm'));
    }
    if (filter === 'COMMENTS') {
      return Boolean(t.reviewerFeedback || (t.comments && t.comments.length > 0));
    }
    if (filter === 'FILES') {
      return Boolean((t.versions && t.versions.length > 0) || t.attachmentUrl);
    }
    return true;
  }

  private matchesTaskSearchQuery(t: Task, query: string): boolean {
    if (!query) return true;
    return Boolean(
      String(t.title || '').toLowerCase().includes(query) ||
      String(t.campaignName || '').toLowerCase().includes(query) ||
      String(t.description || '').toLowerCase().includes(query) ||
      String(t.content || '').toLowerCase().includes(query)
    );
  }

  readonly filteredTasks = computed(() => {
    const list = this.taskService.tasks();
    const query = String(this.searchQuery() || '').toLowerCase().trim();
    const filter = this.statusFilter();
    const currentUser = this.authService.currentUser();
    const currentRole = currentUser?.role;
    const currentUserId = String(currentUser?.id || '').toLowerCase().trim();
    const currentUserName = String(currentUser?.fullName || '').toLowerCase().trim();
    const currentUserEmail = String(currentUser?.email || '').toLowerCase().trim();
    const selDesigner = this.selectedDesigner();
    const seenIds = new Set<string>();

    return list.filter((t) => {
      if (!t?.id) return false;
      const tid = String(t.id);
      if (seenIds.has(tid)) return false;
      seenIds.add(tid);

      if (!this.matchesTaskRoleAssignment(t, currentRole, currentUserId, currentUserEmail, currentUserName, selDesigner)) {
        return false;
      }

      const pkgFilter = this.packageFilterSignal();
      if (pkgFilter && !isTaskForPackage(t, pkgFilter, this.packageService.packages())) {
        return false;
      }

      if (!this.matchesTaskDateFilter(t, this.selectedDateFilter())) {
        return false;
      }

      const priority = this.priorityFilter();
      if (priority && priority !== 'ALL' && String(t.priority || '').toUpperCase() !== priority.toUpperCase()) {
        return false;
      }

      return this.matchesTaskSearchQuery(t, query) && this.matchesTaskStatusFilter(t, filter);
    });
  });

  async ngOnInit(): Promise<void> {
    await this.authService.ensureInitialized();

    this.route.queryParams.subscribe((params) => {
      const pkgParam = params['workspace'] || params['packageFilter'];
      if (pkgParam && !this.packageFilterSignal()) {
        this.packageFilterSignal.set(pkgParam);
      }
      const prodParam = params['package'] || params['product'];
      if (prodParam && !this.productFilterSignal()) {
        this.productFilterSignal.set(prodParam);
      }

      const view = params['view'] || params['tab'];
      if (view === 'my' || view === 'my_tasks' || view === 'my-tasks') {
        this.showDesignersDirectory.set(false);
        this.selectedDesignerId.set(null);
        this.switchTaskView('my');
      } else if (view === 'all' || view === 'all_tasks' || view === 'all-tasks') {
        this.showDesignersDirectory.set(false);
        this.selectedDesignerId.set(null);
        this.switchTaskView('all');
      } else if (view === 'designers' || view === 'designer') {
        this.showDesignersDirectory.set(true);
        this.selectedDesignerId.set(null);
      } else if (this.isDesigner()) {
        this.showDesignersDirectory.set(false);
        const currentPath = this.router.url.split('?')[0].toLowerCase();
        if (currentPath.includes('submissions')) {
          this.statusFilter.set('SUBMITTED');
        } else if (currentPath.includes('revisions')) {
          this.statusFilter.set('REVISION_REQUIRED');
        } else if (currentPath.includes('comments')) {
          this.statusFilter.set('COMMENTS');
        } else if (currentPath.includes('files')) {
          this.statusFilter.set('FILES');
        }
      } else if (!this.embedded) {
        this.showDesignersDirectory.set(true);
      }

      const taskId = params['taskId'] || params['id'];
      if (taskId) {
        this.taskService.selectTask(taskId);
      }
    });

    if (this.authService.isAuthenticated()) {
      await Promise.all([
        this.taskService.loadTasks(),
        this.taskService.loadDesignerMetrics(),
        this.notifService.loadNotifications(),
        this.userService.loadUsersFromDatabase(),
      ]);
      this.packageService.loadAllPackages().subscribe();
    }
  }

  openDocViewer(event: Event, url?: string, name?: string, content?: string): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const docName = name || 'Content Document';
    let docUrl = url && url !== '#' ? url : '';
    const docContent = content || 'Document brief details and specifications for this creative task.';

    if (docUrl.startsWith('data:application/pdf') || docUrl.startsWith('data:image/')) {
      try {
        const parts = docUrl.split(',');
        const colonIdx = parts[0].indexOf(':');
        const semiIdx = parts[0].indexOf(';');
        const mime = (colonIdx !== -1 && semiIdx > colonIdx) ? parts[0].substring(colonIdx + 1, semiIdx) : 'application/pdf';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.codePointAt(n) || 0;
        }
        const blob = new Blob([u8arr], { type: mime });
        docUrl = URL.createObjectURL(blob);
      } catch (e) {}
    }

    this.activeDocName.set(docName);
    this.activeDocUrl.set(docUrl);
    this.activeDocContent.set(docContent);
    this.isDocViewerOpen.set(true);
  }

  closeDocViewer(): void {
    this.isDocViewerOpen.set(false);
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  setFilter(filter: string): void {
    this.statusFilter.set(filter);
  }

  onFilterChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    if (val) {
      this.setFilter(val);
    }
  }

  async startWork(task: Task): Promise<void> {
    await this.taskService.startWork(task.id);
    await this.notifService.loadNotifications();
  }

  async startRedesign(task: Task): Promise<void> {
    await this.taskService.startRedesign(task.id);
    await this.notifService.loadNotifications();
  }

  async onApproveQuick(task: Task): Promise<void> {
    await this.taskService.approveTask(task.id);
    await this.notifService.loadNotifications();
  }

  openRedesignModal(task: Task): void {
    this.activeModalTaskId.set(task.id);
    this.isRedesignModalOpen.set(true);
  }

  closeRedesignModal(): void {
    this.isRedesignModalOpen.set(false);
    this.activeModalTaskId.set(null);
  }

  async onHandleSubmitRedesign(reason: string): Promise<void> {
    const taskId = this.activeModalTaskId();
    if (!taskId || !reason) return;

    const success = await this.taskService.requestRedesign(taskId, reason);
    if (success) {
      await this.notifService.loadNotifications();
      this.closeRedesignModal();
    }
  }

  getActiveRedesignTask(): Task | null {
    const id = this.activeModalTaskId();
    if (!id) return this.taskService.selectedTask();
    return this.taskService.tasks().find((t) => t.id === id) || this.taskService.selectedTask();
  }

  getActiveUploadTask(): Task | null {
    const id = this.activeModalTaskId();
    if (!id) return this.taskService.selectedTask();
    return this.taskService.tasks().find((t) => t.id === id) || this.taskService.selectedTask();
  }

  getActiveReviewTask(): Task | null {
    const id = this.activeModalTaskId();
    if (!id) return this.taskService.selectedTask();
    return this.taskService.tasks().find((t) => t.id === id) || this.taskService.selectedTask();
  }

  openUploadModal(task: Task): void {
    this.activeModalTaskId.set(task.id);
    this.isUploadModalOpen.set(true);
  }

  closeUploadModal(): void {
    this.isUploadModalOpen.set(false);
    this.activeModalTaskId.set(null);
  }

  async onHandleSubmitUpload(event: {
    fileName: string;
    changelog: string;
    fileSizeMb: number;
    dataUrl: string;
    fileContent: string;
  }): Promise<void> {
    const taskId = this.activeModalTaskId();
    if (!taskId) return;

    const success = await this.taskService.submitDesign(taskId, {
      fileName: event.fileName,
      changelog: event.changelog,
      fileSize: Math.round((event.fileSizeMb || 2) * 1024 * 1024),
      filePath: event.dataUrl || `/uploads/creatives/${event.fileName}`,
      fileContent: event.fileContent || event.changelog,
    });

    if (success) {
      await this.notifService.loadNotifications();
      this.closeUploadModal();
    }
  }

  openReviewModal(task: Task): void {
    this.activeModalTaskId.set(task.id);
    this.isReviewModalOpen.set(true);
  }

  closeReviewModal(): void {
    this.isReviewModalOpen.set(false);
    this.activeModalTaskId.set(null);
  }

  async onHandleSubmitReview(event: { action: string; remark: string }): Promise<void> {
    const taskId = this.activeModalTaskId();
    if (!taskId) return;

    if (event.action === 'APPROVE') {
      const success = await this.taskService.approveTask(taskId);
      if (success) {
        await this.notifService.loadNotifications();
        this.closeReviewModal();
      }
    } else {
      const success = await this.taskService.requestRedesign(taskId, event.remark || 'Please update design layout and spacing.');
      if (success) {
        await this.notifService.loadNotifications();
        this.closeReviewModal();
      }
    }
  }

  openCreateTaskModal(preselectedDesignerId?: string): void {
    this.selectedDesignerId.set(preselectedDesignerId || null);
    this.isCreateTaskModalOpen.set(true);
  }

  closeCreateTaskModal(): void {
    this.isCreateTaskModalOpen.set(false);
  }

  async onHandleSubmitCreateTask(event: {
    formValues: any;
    fileName: string;
    dataUrl: string;
    fileContent: string;
    fileObj: File | null;
  }): Promise<void> {
    const { formValues, fileName, dataUrl, fileContent, fileObj } = event;
    const currentUser = this.authService.currentUser();
    const selectedDesigner = this.realDesignersList().find((d) => d.id === formValues.assignedTo);
    const targetPkg = formValues.packageName || this.packageFilterSignal() || 'Careermate';

    const currentUserId = currentUser?.id || '1';
    const currentUserName = currentUser?.fullName || (currentUser?.role === 'BDM' ? 'Business Development Manager' : 'System Administrator');
    const currentUserRole = currentUser?.role || 'ADMINISTRATOR';
    const currentUserEmail = currentUser?.email || (currentUser?.role === 'BDM' ? 'bdm@markops.io' : 'admin@markops.io');

    const payload = {
      ...formValues,
      packageName: targetPkg,
      creatorId: currentUserId,
      creatorName: currentUserName,
      creatorRole: currentUserRole,
      creatorEmail: currentUserEmail,
      assigneeName: selectedDesigner ? selectedDesigner.name : 'Assigned Designer',
      attachmentName: fileName || (fileObj ? fileObj.name : ''),
      attachmentUrl: dataUrl || (fileName ? `/uploads/briefs/${fileName}` : ''),
      content: fileContent || formValues.description || `Task brief details and specifications for ${targetPkg} package.`,
    };

    const created = await this.taskService.createTask(payload);
    if (created) {
      await this.notifService.loadNotifications();
      this.closeCreateTaskModal();
      this.switchTaskView('my');
    }
  }

  viewTask(event: Event, task: Task): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.taskService.closeTaskDetail();
    const baseRoute = this.isDesigner() ? '/designer-tasks' : '/tasks';
    let returnUrl = this.router.url;
    const prod = this.productFilter || this.activeProductName() || 'Careermate';
    const pkg = this.packageFilter || task.packageName || 'Test';
    returnUrl = `/package-works?package=${encodeURIComponent(prod)}&workspace=${encodeURIComponent(pkg)}&dept=DESIGNER`;

    this.router.navigate([baseRoute, task.id], {
      queryParams: { returnUrl },
    });
  }

  async deleteTask(event: Event, task: Task): Promise<void> {
    event.stopPropagation();
    if (!this.isTaskCreator(task)) {
      alert('Permission Denied: You can only delete tasks created by you.');
      return;
    }
    if (confirm(`Are you sure you want to delete task "${task.title}"? This action is permanent and cannot be undone.`)) {
      const success = await this.taskService.deleteTask(task.id);
      if (!success) {
        alert(this.taskService.error() || 'Failed to delete task.');
      }
    }
  }

  navigateBack(): void {
    if (this.selectedDesignerId()) {
      this.selectedDesignerId.set(null);
      this.showDesignersDirectory.set(true);
      return;
    }
    if (this.selectedDateFilter()) {
      this.clearDateFilter();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    } else if (this.isDesigner()) {
      this.router.navigate(['/designer-tasks']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
