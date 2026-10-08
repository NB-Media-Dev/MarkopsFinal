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
      const fixedProd = FIXED_PACKAGES.find(
        (p) => p.name.toLowerCase() === activeProd.toLowerCase() || p.id.toLowerCase() === activeProd.toLowerCase()
      );
      const activeProdId = (fixedProd?.id || activeProd).toLowerCase();
      const activeProdName = fixedProd?.name || activeProd;

      if (filterPkg && (!fixedProd || filterPkg.toLowerCase() !== fixedProd.name.toLowerCase())) {
        map.set(filterPkg.toLowerCase(), {
          name: filterPkg,
          icon: 'inventory_2',
        });
      }

      for (const p of dbPkgs) {
        if (!p.name || !p.name.trim()) continue;
        const pProd = (p.productId || '').toLowerCase().trim();
        const matchesProduct =
          pProd === activeProdId ||
          (activeProdName.toLowerCase().includes('career') && (pProd.includes('career') || pProd === 'pkg_careermate')) ||
          (activeProdName.toLowerCase().includes('class') && (pProd.includes('class') || pProd === 'pkg_classmate')) ||
          ((activeProdName.toLowerCase().includes('jesus') || activeProdName.toLowerCase().includes('messang')) &&
            (pProd.includes('jesus') || pProd.includes('messang') || pProd === 'pkg_jesus_messanger'));

        if (matchesProduct && !map.has(p.name.toLowerCase().trim())) {
          map.set(p.name.toLowerCase().trim(), {
            name: p.name.trim(),
            icon: 'inventory_2',
          });
        }
      }

      if (map.size === 0 && fixedProd) {
        map.set(fixedProd.name.toLowerCase(), {
          name: fixedProd.name,
          icon: fixedProd.icon,
        });
      }
    } else {
      if (filterPkg) {
        map.set(filterPkg.toLowerCase(), {
          name: filterPkg,
          icon: 'inventory_2',
        });
      }

      for (const p of dbPkgs) {
        if (p.name && p.name.trim() && !map.has(p.name.toLowerCase().trim())) {
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
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
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
    }));
  });

  readonly designersSummaryList = computed<DesignerSummary[]>(() => {
    const designers = this.realDesignersList();
    const allTasks = this.taskService.tasks();
    const pkgFilter = this.packageFilterSignal();

    const designerMap = new Map<string, DesignerSummary>();

    for (const d of designers) {
      const dIdStr = String(d.id || '');
      const dNameStr = String(d.name || '');
      const dEmailStr = String(d.email || `${dNameStr.toLowerCase().replace(/\s+/g, '.')}@markops.io`);
      designerMap.set(dIdStr, {
        id: dIdStr,
        name: dNameStr,
        email: dEmailStr,
        department: d.department || 'Creative Design',
        avatarColor: this.getAvatarColor(dNameStr),
        totalCount: 0,
        completedCount: 0,
        pendingCount: 0,
        inProgressCount: 0,
        submittedCount: 0,
        revisionCount: 0,
        completionRate: 0,
      });
    }

    const currentUser = this.authService.currentUser();
    const currentRole = currentUser?.role;
    const currentUserId = String(currentUser?.id || '').toLowerCase().trim();
    const currentUserEmail = String(currentUser?.email || '').toLowerCase().trim();

    const dateFilter = this.selectedDateFilter();
    const tasksToCount = allTasks.filter((t) => {
      if (currentRole === 'DESIGNER') {
        const isAssignedToMe =
          (t.assignedTo !== undefined && String(t.assignedTo).toLowerCase().trim() === currentUserId) ||
          (currentUserEmail && t.assignedTo !== undefined && String(t.assignedTo).toLowerCase().trim() === currentUserEmail);
        if (!isAssignedToMe) return false;
      }

      if (pkgFilter && !isTaskForPackage(t, pkgFilter, this.packageService.packages())) {
        return false;
      }
      if (dateFilter) {
        const createdDate = t.createdAt ? t.createdAt.split('T')[0] : '';
        const dueDate = t.dueDate ? t.dueDate.split('T')[0] : '';
        const updatedDate = t.updatedAt ? t.updatedAt.split('T')[0] : '';
        if (createdDate !== dateFilter && dueDate !== dateFilter && updatedDate !== dateFilter) {
          return false;
        }
      }
      return true;
    });

    for (const t of tasksToCount) {
      let matchedId: string | null = null;
      const tAssignedToStr = String(t.assignedTo || '').toLowerCase().trim();
      const tAssigneeNameStr = String(t.assigneeName || '').toLowerCase().trim();

      for (const d of designers) {
        const dIdStr = String(d.id || '').toLowerCase().trim();
        const dNameStr = String(d.name || '').toLowerCase().trim();
        const dEmailStr = String(d.email || '').toLowerCase().trim();

        if (
          (tAssignedToStr && (tAssignedToStr === dIdStr || tAssignedToStr === dEmailStr)) ||
          (tAssigneeNameStr && (tAssigneeNameStr === dNameStr || tAssigneeNameStr.includes(dNameStr) || dNameStr.includes(tAssigneeNameStr)))
        ) {
          matchedId = String(d.id);
          break;
        }
      }

      if (!matchedId) {
        if (
          t.assigneeName &&
          t.assigneeName !== 'Assigned User' &&
          t.assigneeName !== 'Designer' &&
          t.assigneeName !== 'Assigned Designer' &&
          t.assigneeName !== 'Unassigned'
        ) {
          const customId = `d_${String(t.assigneeName).toLowerCase().replace(/\s+/g, '_')}`;
          if (!designerMap.has(customId)) {
            designerMap.set(customId, {
              id: customId,
              name: String(t.assigneeName),
              email: `${String(t.assigneeName).toLowerCase().replace(/\s+/g, '.')}@markops.io`,
              department: 'Creative Design',
              avatarColor: this.getAvatarColor(String(t.assigneeName)),
              totalCount: 0,
              completedCount: 0,
              pendingCount: 0,
              inProgressCount: 0,
              submittedCount: 0,
              revisionCount: 0,
              completionRate: 0,
            });
          }
          matchedId = customId;
        }
      }

      if (matchedId && designerMap.has(matchedId)) {
        const entry = designerMap.get(matchedId)!;
        entry.totalCount++;

        const isCompleted = t.status === 'APPROVED' || t.status === 'PUBLISHED' || t.status === 'COMPLETED';
        const isInProgress = t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED';
        const isReview = t.status === 'SUBMITTED' || t.status === 'RESUBMITTED' || t.status === 'UNDER_REVIEW';
        const isRevision = t.status === 'REVISION_REQUIRED';

        if (isCompleted) {
          entry.completedCount++;
        } else {
          entry.pendingCount++;
        }

        if (isInProgress) entry.inProgressCount = (entry.inProgressCount || 0) + 1;
        if (isReview) entry.submittedCount = (entry.submittedCount || 0) + 1;
        if (isRevision) entry.revisionCount = (entry.revisionCount || 0) + 1;
      }
    }

    return Array.from(designerMap.values()).map((d) => {
      const rate = d.totalCount > 0 ? Math.round((d.completedCount / d.totalCount) * 100) : 0;
      return {
        ...d,
        completionRate: rate,
      };
    });
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
      if (!t || !t.id) return false;
      const tid = String(t.id);
      if (seenIds.has(tid)) return false;
      seenIds.add(tid);

      const tAssignedToStr = String(t.assignedTo || '').toLowerCase().trim();
      const tAssigneeNameStr = String(t.assigneeName || '').toLowerCase().trim();

      if (currentRole === 'DESIGNER') {
        const isAssignedToMe =
          (tAssignedToStr && (tAssignedToStr === currentUserId || (currentUserEmail && tAssignedToStr === currentUserEmail))) ||
          (tAssigneeNameStr && currentUserName && (tAssigneeNameStr === currentUserName || tAssigneeNameStr.includes(currentUserName)));

        if (!isAssignedToMe) {
          return false;
        }
      } else {
        if (this.activeTaskView() === 'my') {
          const isCreatedByMe = this.isTaskCreator(t);
          if (!isCreatedByMe) {
            return false;
          }
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
      }

      const pkgFilter = this.packageFilterSignal();
      if (pkgFilter) {
        if (!isTaskForPackage(t, pkgFilter, this.packageService.packages())) {
          return false;
        }
      }

      const dateFilter = this.selectedDateFilter();
      if (dateFilter) {
        const createdDate = t.createdAt ? t.createdAt.split('T')[0] : '';
        const dueDate = t.dueDate ? t.dueDate.split('T')[0] : '';
        const updatedDate = t.updatedAt ? t.updatedAt.split('T')[0] : '';
        if (createdDate !== dateFilter && dueDate !== dateFilter && updatedDate !== dateFilter) {
          return false;
        }
      }

      const priority = this.priorityFilter();
      if (priority && priority !== 'ALL') {
        if (String(t.priority || '').toUpperCase() !== priority.toUpperCase()) {
          return false;
        }
      }

      const matchesSearch =
        !query ||
        String(t.title || '').toLowerCase().includes(query) ||
        String(t.campaignName || '').toLowerCase().includes(query) ||
        String(t.description || '').toLowerCase().includes(query) ||
        String(t.content || '').toLowerCase().includes(query);

      let matchesStatus = true;
      if (filter === 'IN_PROGRESS') {
        matchesStatus = t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED';
      } else if (filter === 'REVISION_REQUIRED') {
        matchesStatus = t.status === 'REVISION_REQUIRED';
      } else if (filter === 'SUBMITTED') {
        matchesStatus = t.status === 'SUBMITTED' || t.status === 'RESUBMITTED' || t.status === 'UNDER_REVIEW';
      } else if (filter === 'COMPLETED') {
        matchesStatus = t.status === 'APPROVED' || t.status === 'PUBLISHED' || t.status === 'COMPLETED';
      } else if (filter === 'BDM_FLOW') {
        matchesStatus = t.creatorRole === 'BDM' || Boolean(t.createdBy && String(t.createdBy).toLowerCase().includes('bdm'));
      }

      return matchesSearch && matchesStatus;
    });
  });

  async ngOnInit(): Promise<void> {
    await this.authService.ensureInitialized();

    this.route.queryParams.subscribe((params) => {
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
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
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
    this.router.navigate(['/tasks', task.id], {
      queryParams: { returnUrl: this.router.url },
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
    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
