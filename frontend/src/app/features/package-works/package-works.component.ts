import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TaskManagementService } from '../../core/services/task-management.service';
import { CampaignService } from '../../core/services/campaign.service';
import { LeadTelecallingService } from '../../core/services/lead-telecalling.service';
import { ConversionTransactionService } from '../../core/services/conversion-transaction.service';
import { TelecallerTargetService } from '../../core/services/telecaller-target.service';
import { UserManagementService } from '../../core/services/user-management.service';
import { AuthService } from '../../core/services/auth.service';
import { PackageService } from '../../core/services/package.service';
import { ProductPackage, FixedPackageMeta, RoleOperationTab, FIXED_PACKAGES, isTaskForPackage, isItemForPackage, resolveTaskProductAndPackage } from '../../core/models/package.model';
import { UserRole } from '../../core/models/auth.model';
import { ManagedUser, UserPerformanceRecord } from '../../core/models/user-management.model';
import { Task, TaskStatus, TaskVersion, computeTaskProgressPercent } from '../../core/models/task.model';
import { safeFetch, getBackendBaseUrl } from '../../core/utils/api-url.utils';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { TaskPriority } from '../../core/models/task.model';

import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PackageCatalogComponent } from './components/package-catalog/package-catalog.component';
import { PackageHubOverviewComponent } from './components/package-hub-overview/package-hub-overview.component';
import { PackageDepartmentViewComponent } from './components/package-department-view/package-department-view.component';
import { CreatePackageModalComponent } from './components/modals/create-package-modal/create-package-modal.component';
import { EditPackageModalComponent } from './components/modals/edit-package-modal/edit-package-modal.component';
import { PackageDetailModalComponent } from './components/modals/package-detail-modal/package-detail-modal.component';
import { DocViewerModalComponent } from './components/modals/doc-viewer-modal/doc-viewer-modal.component';
import { TaskAuditModalComponent } from './components/modals/task-audit-modal/task-audit-modal.component';
import { isLeadAssignedToUser } from '../telecalling/telecalling.component';

export interface OperationDepartment {
  id: 'DESIGNER' | 'DIGITAL_MARKETING' | 'TELECALLING' | 'ANALYTICS';
  label: string;
  icon: string;
  description?: string;
  badge?: string;
  tabs: RoleOperationTab[];
}

@Component({
  selector: 'app-package-works',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    PackageCatalogComponent,
    PackageHubOverviewComponent,
    PackageDepartmentViewComponent,
    CreatePackageModalComponent,
    EditPackageModalComponent,
    PackageDetailModalComponent,
    DocViewerModalComponent,
    TaskAuditModalComponent,
  ],
  templateUrl: './package-works.component.html',
  styleUrl: './package-works.component.scss',
})
export class PackageWorksComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly sanitizer = inject(DomSanitizer);
  readonly taskService = inject(TaskManagementService);
  readonly campaignService = inject(CampaignService);
  readonly leadService = inject(LeadTelecallingService);
  readonly txnService = inject(ConversionTransactionService);
  readonly targetService = inject(TelecallerTargetService);
  readonly userService = inject(UserManagementService);
  readonly authService = inject(AuthService);
  readonly packageService = inject(PackageService);

  readonly availablePackages = FIXED_PACKAGES;
  readonly activePackageName = signal<string>('Careermate');
  readonly packageSearchQuery = signal<string>('');
  readonly selectedCategoryFilter = signal<string>('ALL');
  readonly isCategoryFilterOpen = signal<boolean>(false);
  readonly productHeroBanners = signal<Record<string, string>>({});
  readonly isSavingHeroBanner = signal<boolean>(false);
  readonly heroBannerError = signal<string | null>(null);
  readonly activeHeroBanner = computed(() => {
    const productId = this.activePackageMeta().id;
    return this.productHeroBanners()[productId] || this.productVisual().banner;
  });
  readonly productVisual = computed(() => {
    switch (this.activePackageMeta().id) {
      case 'pkg_classmate':
        return {
          banner: '/classmate-hero-banner.jpg',
          logo: '/vidhvaa-class-img.png',
  
          title: 'Classmate',
        };
      case 'pkg_jesus_messanger':
        return {
          banner: '/jesus-hero-banner.jpg',
          logo: '/jesus-img.png',
      
          title: 'Jesus the Messenger',
        };
      default:
        return {
          banner: '/careermate-hero-banner.jpg',
          logo: '/vidhvaa-career-img.png',
     
          title: 'CareerMate',
        };
    }
  });
  readonly activeWorkspacePackage = signal<ProductPackage | null>(null);
  readonly activeOperationTab = signal<string>('PACKAGES');

  getPackageHeroBanner(pkg?: ProductPackage | null): string {
    if (pkg?.imageUrl) {
      return this.formatAssetUrl(pkg.imageUrl);
    }
    return this.activeHeroBanner();
  }

  readonly isCreateProductPackageModalOpen = signal<boolean>(false);
  readonly isPackageDetailModalOpen = signal<boolean>(false);
  readonly selectedProductPackage = signal<ProductPackage | null>(null);
  readonly createdPackageImageFile = signal<File | null>(null);
  readonly createdPackageImagePreview = signal<string>('');
  readonly isSubmittingPackage = signal<boolean>(false);


  readonly isEditProductPackageModalOpen = signal<boolean>(false);
  readonly editingProductPackage = signal<ProductPackage | null>(null);
  readonly editPackageImageFile = signal<File | null>(null);
  readonly editPackageImagePreview = signal<string>('');

  private validateCreatePackageName = (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const trimmed = String(control.value).trim().toLowerCase();
    if (!trimmed) return null;
    const activeProductId = this.activePackageMeta()?.id;
    const existingPackages = this.packageService.packages();
    const isDuplicate = existingPackages.some(
      (p) => p.productId === activeProductId && p.name.trim().toLowerCase() === trimmed
    );
    return isDuplicate ? { duplicate: true } : null;
  };

  private validateEditPackageName = (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const trimmed = String(control.value).trim().toLowerCase();
    if (!trimmed) return null;
    const activeProductId = this.activePackageMeta()?.id;
    const currentPkgId = this.editingProductPackage()?.id;
    const existingPackages = this.packageService.packages();
    const isDuplicate = existingPackages.some(
      (p) => p.productId === activeProductId && p.id !== currentPkgId && p.name.trim().toLowerCase() === trimmed
    );
    return isDuplicate ? { duplicate: true } : null;
  };

  readonly createProductPackageForm: FormGroup = this.fb.group({
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.pattern(/^[a-zA-Z\s]+$/),
        this.validateCreatePackageName,
      ],
    ],
    imageUrl: [''],
    price: [100],
    description: [''],
  });

  readonly editProductPackageForm: FormGroup = this.fb.group({
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.pattern(/^[a-zA-Z\s]+$/),
        this.validateEditPackageName,
      ],
    ],
    imageUrl: [''],
    price: [100],
    description: [''],
  });

  readonly pkgTaskView = signal<'my' | 'all' | 'designers'>('all');

  readonly isCreateTaskModalOpen = signal<boolean>(false);


  readonly isTaskDetailModalOpen = signal<boolean>(false);
  readonly selectedTask = signal<Task | null>(null);
  readonly activeDetailTab = signal<'BRIEF' | 'VERSIONS' | 'TIMELINE' | 'COMMENTS'>('BRIEF');
  readonly newCommentText = signal<string>('');


  readonly isUploadModalOpen = signal<boolean>(false);
  readonly selectedUploadFile = signal<File | null>(null);
  readonly selectedUploadDataUrl = signal<string>('');
  readonly selectedUploadContent = signal<string>('');


  readonly isRevisionModalOpen = signal<boolean>(false);


  readonly createdBriefFile = signal<File | null>(null);
  readonly createdBriefFileName = signal<string>('');
  readonly createdBriefDataUrl = signal<string>('');
  readonly createdBriefContent = signal<string>('');


  readonly isDocViewerOpen = signal<boolean>(false);
  readonly activeDocName = signal<string>('');
  readonly activeDocUrl = signal<string>('');
  readonly activeDocContent = signal<string>('');


  readonly isTaskAuditModalOpen = signal<boolean>(false);
  readonly selectedAuditTask = signal<Task | null>(null);
  readonly isLoadingAuditTask = signal<boolean>(false);

  readonly canViewTaskAudit = computed<boolean>(() => {
    const role = this.currentRole();
    return role === 'ADMINISTRATOR' || role === 'MARKETING_MANAGER' || role === 'BDM';
  });

  isTaskCreator(task?: Task | null): boolean {
    if (!task) return false;
    const currentUser = this.authService.currentUser();
    if (!currentUser) return false;
    const currentUserId = String(currentUser.id ?? '').trim().toLowerCase();
    const currentUserEmail = String(currentUser.email ?? '').trim().toLowerCase();
    const taskCreatorId = String(task.createdBy ?? (task as any).created_by ?? '').trim().toLowerCase();
    const taskCreatorEmail = String(task.creatorEmail ?? (task as any).creator_email ?? '').trim().toLowerCase();

    return (!!currentUserId && !!taskCreatorId && currentUserId === taskCreatorId) ||
           (!!currentUserEmail && !!taskCreatorEmail && currentUserEmail === taskCreatorEmail);
  }

  canDeleteTask(task?: Task | null): boolean {
    return this.isTaskCreator(task);
  }

  canReview(task?: Task | null): boolean {
    if (!task) return false;
    return (task.status === 'SUBMITTED' || task.status === 'RESUBMITTED' || task.status === 'UNDER_REVIEW') && this.isTaskCreator(task);
  }


  readonly uploadForm: FormGroup = this.fb.group({
    fileName: ['', [Validators.required]],
    changelog: ['', [Validators.required]],
    fileSizeMb: [0],
  });

  readonly revisionForm: FormGroup = this.fb.group({
    remark: ['', [Validators.required, Validators.minLength(5)]],
  });

  readonly activeIframeUrl = computed<SafeResourceUrl | null>(() => {
    let url = this.activeDocUrl();
    if (url) {
      const resolvedUrl = this.formatAssetUrl(url);
      if (
        resolvedUrl.startsWith('data:') ||
        resolvedUrl.startsWith('http://') ||
        resolvedUrl.startsWith('https://') ||
        resolvedUrl.startsWith('blob:')
      ) {
        return this.sanitizer.bypassSecurityTrustResourceUrl(resolvedUrl);
      }
    }
    return null;
  });

  readonly isImageDoc = computed<boolean>(() => {
    const url = (this.activeDocUrl() || '').toLowerCase();
    const name = (this.activeDocName() || '').toLowerCase();
    return (
      url.endsWith('.png') ||
      url.endsWith('.jpg') ||
      url.endsWith('.jpeg') ||
      url.endsWith('.webp') ||
      url.endsWith('.gif') ||
      url.endsWith('.svg') ||
      url.startsWith('data:image') ||
      name.endsWith('.png') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.webp') ||
      name.endsWith('.gif') ||
      name.endsWith('.svg')
    );
  });

  readonly activeImageUrl = computed<string>(() => {
    const url = this.activeDocUrl();
    if (!url) return '';
    return this.formatAssetUrl(url);
  });

  readonly activeIframeSrcdoc = computed<string>(() => {
    const title = this.escapeHtml(this.activeDocName() || 'Document Preview');
    const rawContent = this.activeDocContent() || 'No text content available for this asset.';
    const content = this.escapeHtml(rawContent);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; margin: 0; line-height: 1.6; }
    .doc-header { font-size: 18px; font-weight: 700; color: #38bdf8; border-bottom: 1px solid #334155; padding-bottom: 12px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .doc-body { font-size: 14px; color: #e2e8f0; white-space: pre-wrap; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; line-height: 1.7; word-break: break-word; }
  </style>
</head>
<body>
  <div class="doc-header">${title}</div>
  <div class="doc-body">${content}</div>
</body>
</html>`;
  });

  private escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  readonly canCreateTask = computed<boolean>(() => {
    const role = this.currentRole();
    return role === 'ADMINISTRATOR' || role === 'MARKETING_MANAGER' || role === 'BDM';
  });

  readonly realDesignersList = computed(() => {
    const allUsers = this.userService.users();
    const designers = allUsers.filter((u) => u.role === 'DESIGNER');
    return designers.map((u) => ({ id: u.id, name: u.fullName }));
  });

  readonly todayDate = new Date().toISOString().split('T')[0];

  readonly createTaskForm: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    assignedTo: ['', [Validators.required]],
    priority: ['HIGH' as TaskPriority, [Validators.required]],
    dueDate: [new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0], [Validators.required]],
  });

  readonly currentRole = computed<UserRole>(() => {
    return this.authService.currentUser()?.role || 'ADMINISTRATOR';
  });

  readonly activePackageMeta = computed<FixedPackageMeta>(() => {
    const name = this.activePackageName();
    const match = FIXED_PACKAGES.find((p) => p.name.toLowerCase() === name.toLowerCase());
    return match || FIXED_PACKAGES[0];
  });

  readonly activePackageDisplayName = computed<string>(() => {
    const ws = this.activeWorkspacePackage();
    if (ws && ws.name) return ws.name;
    return this.activePackageName();
  });


  readonly canCreatePackage = computed<boolean>(() => {
    const role = this.currentRole();
    return role === 'ADMINISTRATOR';
  });

  readonly canEditPackage = computed<boolean>(() => {
    const role = this.currentRole();
    return role === 'ADMINISTRATOR';
  });

  readonly canDeletePackage = computed<boolean>(() => {
    const role = this.currentRole();
    return role === 'ADMINISTRATOR';
  });

  readonly filteredProductPackages = computed<ProductPackage[]>(() => {
    const pkgName = this.activePackageName();
    const pkgMeta = this.activePackageMeta();
    const activeId = (pkgMeta?.id || '').toLowerCase().trim();
    const nameLower = (pkgName || '').toLowerCase().trim();
    const all = this.packageService.packages();

    const matchingProduct = all.filter((p) => {
      const pProd = (p.productId || '').toLowerCase().trim();
      if (pProd === activeId) return true;
      if (nameLower.includes('career') && (pProd.includes('career') || pProd === 'pkg_careermate')) return true;
      if (nameLower.includes('class') && (pProd.includes('class') || pProd === 'pkg_classmate')) return true;
      if ((nameLower.includes('jesus') || nameLower.includes('messang') || nameLower.includes('messeng')) &&
          (pProd.includes('jesus') || pProd.includes('messang') || pProd.includes('messeng') || pProd === 'pkg_jesus_messanger')) {
        return true;
      }
      return false;
    });
    const query = this.packageSearchQuery().trim().toLowerCase();
    const catFilter = this.selectedCategoryFilter();

    return matchingProduct.filter((pkg) => {
      const matchesQuery = query
        ? (pkg.name.toLowerCase().includes(query) || (pkg.description || '').toLowerCase().includes(query))
        : true;
      const cat = this.inferPackageCategory(pkg.name);
      const matchesCategory = catFilter === 'ALL' || cat.toLowerCase() === catFilter.toLowerCase();
      return matchesQuery && matchesCategory;
    });
  });

  inferPackageCategory(name: string): string {
    const n = (name || '').toLowerCase();
    if (n.includes('affair') || n.includes('design') || n.includes('art') || n.includes('ui')) return 'Design';
    if (n.includes('social') || n.includes('post') || n.includes('feed') || n.includes('media')) return 'Social Media';
    if (n.includes('brand') || n.includes('market') || n.includes('ads')) return 'Marketing';
    if (n.includes('video') || n.includes('edit') || n.includes('anim') || n.includes('reel') || n.includes('motion')) return 'Video Editing';
    if (n.includes('content') || n.includes('write') || n.includes('blog') || n.includes('seo') || n.includes('script')) return 'Content Writing';
    return 'Design';
  }

  toggleCategoryFilterDropdown(event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.isCategoryFilterOpen.update((v) => !v);
  }

  setCategoryFilter(category: string) {
    this.selectedCategoryFilter.set(category);
    this.isCategoryFilterOpen.set(false);
  }

  getPackageCountForProduct(prodId: string): number {
    const all = this.packageService.packages();
    const idLower = (prodId || '').toLowerCase().trim();
    return all.filter((p) => {
      const pProd = (p.productId || '').toLowerCase().trim();
      if (pProd === idLower) return true;
      if (idLower.includes('career') && (pProd.includes('career') || pProd === 'pkg_careermate')) return true;
      if (idLower.includes('class') && (pProd.includes('class') || pProd === 'pkg_classmate')) return true;
      if ((idLower.includes('jesus') || idLower.includes('messang') || idLower.includes('messeng')) &&
          (pProd.includes('jesus') || pProd.includes('messang') || pProd.includes('messeng') || pProd === 'pkg_jesus_messanger')) {
        return true;
      }
      return false;
    }).length;
  }

  getProductNameForPackage(pkg?: ProductPackage | null): string {
    if (!pkg) return this.activePackageMeta().name;
    const pProd = (pkg.productId || '').toLowerCase().trim();
    const found = this.availablePackages.find(
      (p) => p.id.toLowerCase() === pProd || p.name.toLowerCase() === pProd
    );
    return found ? found.name : this.activePackageMeta().name;
  }

  readonly currentFilterTarget = computed<string>(() => {
    const ws = this.activeWorkspacePackage();
    if (ws && ws.name) return ws.name;
    return this.activePackageName();
  });

  readonly activeDepartment = signal<'DESIGNER' | 'DIGITAL_MARKETING' | 'TELECALLING' | 'ANALYTICS' | null>(null);

  readonly operationDepartments = computed<OperationDepartment[]>(() => {
    const role = this.currentRole();
    const pkg = this.activeWorkspacePackage();

    if (!pkg) {
      return [];
    }

    const depts: OperationDepartment[] = [];


    if (role === 'ADMINISTRATOR' || role === 'MARKETING_MANAGER' || role === 'DESIGNER' || role === 'BDM') {
      depts.push({
        id: 'DESIGNER',
        label: 'Designer',
        icon: 'palette',
        description: 'Creative tasks, design assets, graphic assignments, reviews & revision workflows.',
        badge: 'Tasks & Creatives',
        tabs: [
          { id: 'TASKS', label: role === 'DESIGNER' ? 'My Assigned Tasks' : 'Tasks', icon: 'draw' },
        ],
      });
    }

    if (role === 'ADMINISTRATOR' || role === 'MARKETING_MANAGER' || role === 'DIGITAL_MARKETING') {
      depts.push({
        id: 'DIGITAL_MARKETING',
        label: 'Digital Marketing',
        icon: 'campaign',
        description: 'Multi-channel ad campaigns, live ad metrics, inbound leads pipeline & call monitoring.',
        badge: 'Campaigns & Leads',
        tabs: [
          { id: 'MARKETING_OVERVIEW', label: 'Overview', icon: 'grid_view' },
          { id: 'CAMPAIGNS', label: 'Campaigns', icon: 'campaign' },
          { id: 'ADS', label: 'Ads Metrics', icon: 'ads_click' },
          { id: 'LEADS', label: 'Leads', icon: 'groups' },
        ],
      });
    }

    if (role === 'ADMINISTRATOR' || role === 'MARKETING_MANAGER' || role === 'TELECALLER') {
      const tcTabs: RoleOperationTab[] = [];
      if (role === 'ADMINISTRATOR' || role === 'MARKETING_MANAGER') {
        tcTabs.push({ id: 'TELECALLER_MEMBERS', label: 'Telecalling Member Details', icon: 'badge' });
      } else {
        tcTabs.push({ id: 'TELECALLING', label: 'Telecalling', icon: 'phone_in_talk' });
      }
      tcTabs.push({ id: 'TARGETS', label: role === 'TELECALLER' ? 'My Targets' : 'Targets', icon: 'track_changes' });

      depts.push({
        id: 'TELECALLING',
        label: 'Telecalling',
        icon: 'phone_in_talk',
        description: 'Telecaller team management, caller assignments, call queues & daily conversion targets.',
        badge: 'Calls & Targets',
        tabs: tcTabs,
      });
    }


    if (role === 'ADMINISTRATOR' || role === 'MARKETING_MANAGER' || role === 'BDM') {
      const mgmtTabs: RoleOperationTab[] = [];
      mgmtTabs.push({ id: 'ANALYTICS_OVERVIEW', label: 'Overview', icon: 'grid_view' });
      mgmtTabs.push({ id: 'TRANSACTIONS', label: 'Transactions', icon: 'payments' });
      mgmtTabs.push({ id: 'REPORTS', label: 'Reports', icon: 'analytics' });
      mgmtTabs.push({ id: 'AUDITS', label: 'Audit Logs', icon: 'shield' });

      depts.push({
        id: 'ANALYTICS',
        label: 'Analytics & Management',
        icon: 'analytics',
        description: 'Executive revenue reports, financial transactions, activity audits & security logs.',
        badge: 'Reports & Audits',
        tabs: mgmtTabs,
      });
    }

    return depts;
  });

  readonly activeDepartmentTabs = computed<RoleOperationTab[]>(() => {
    const depts = this.operationDepartments();
    const currentDeptId = this.activeDepartment();
    if (!currentDeptId) return [];
    const found = depts.find((d) => d.id === currentDeptId);
    if (found) return found.tabs;
    return [];
  });

  readonly roleOperations = computed<RoleOperationTab[]>(() => {
    const depts = this.operationDepartments();
    return depts.flatMap((d) => d.tabs);
  });

  selectDepartment(deptId: 'DESIGNER' | 'DIGITAL_MARKETING' | 'TELECALLING' | 'ANALYTICS'): void {
    this.activeDepartment.set(deptId);
    if (deptId === 'DIGITAL_MARKETING') {
      this.selectOperationTab('MARKETING_OVERVIEW');
    } else if (deptId === 'ANALYTICS') {
      this.selectOperationTab('ANALYTICS_OVERVIEW');
    } else {
      const dept = this.operationDepartments().find((d) => d.id === deptId);
      if (dept && dept.tabs.length > 0) {
        this.selectOperationTab(dept.tabs[0].id);
      }
    }
    this.scrollToPageTop();
  }

  backToPackageHub(): void {
    this.activeDepartment.set(null);
    this.activeOperationTab.set('');
    this.scrollToPageTop();
  }

  getDepartmentIcon(deptId: string | null): string {
    if (!deptId) return 'dashboard';
    const dept = this.operationDepartments().find((d) => d.id === deptId);
    return dept?.icon || 'category';
  }

  getDepartmentTitle(deptId: string | null): string {
    if (!deptId) return 'Department';
    const dept = this.operationDepartments().find((d) => d.id === deptId);
    return dept?.label || deptId;
  }

  readonly filteredTasks = computed<Task[]>(() => {
    const ws = this.activeWorkspacePackage();
    const targetFilter = this.currentFilterTarget();
    const allTasks = this.taskService.tasks();
    const currentUser = this.authService.currentUser();
    const currentRole = currentUser?.role;
    const currentUserId = String(currentUser?.id || '').toLowerCase().trim();
    const currentUserEmail = (currentUser?.email || '').toLowerCase().trim();
    const expectedProductId = ws ? ws.productId : this.activePackageMeta().id;

    return allTasks.filter((t) => {
      if (currentRole === 'DESIGNER') {
        const isAssignedToMe =
          (t.assignedTo !== undefined && String(t.assignedTo).toLowerCase().trim() === currentUserId) ||
          (t.assignedTo !== undefined && currentUserEmail && String(t.assignedTo).toLowerCase().trim() === currentUserEmail);

        if (!isAssignedToMe) {
          return false;
        }
      }

      if (ws) {
        return isTaskForPackage(t, targetFilter, this.packageService.packages(), expectedProductId);
      }
      return isTaskForPackage(t, this.activePackageName(), this.packageService.packages(), expectedProductId);
    });
  });

  readonly filteredAllPackageTasks = computed<Task[]>(() => {
    const ws = this.activeWorkspacePackage();
    const targetFilter = this.currentFilterTarget();
    const expectedProductId = ws ? ws.productId : this.activePackageMeta().id;
    if (ws) {
      return this.taskService.tasks().filter((t) => isTaskForPackage(t, targetFilter, this.packageService.packages(), expectedProductId));
    }
    return this.taskService.tasks().filter((t) => isTaskForPackage(t, this.activePackageName(), this.packageService.packages(), expectedProductId));
  });

  readonly filteredMyPackageTasks = computed<Task[]>(() => {
    const ws = this.activeWorkspacePackage();
    const targetFilter = this.currentFilterTarget();
    const currentUser = this.authService.currentUser();
    const currentUserId = String(currentUser?.id || '').toLowerCase().trim();
    const currentUserEmail = (currentUser?.email || '').toLowerCase().trim();
    const currentRole = currentUser?.role;
    const expectedProductId = ws ? ws.productId : this.activePackageMeta().id;

    return this.taskService.tasks().filter((t) => {
      const matches = ws
        ? isTaskForPackage(t, targetFilter, this.packageService.packages(), expectedProductId)
        : isTaskForPackage(t, this.activePackageName(), this.packageService.packages(), expectedProductId);
      if (!matches) return false;

      if (currentRole === 'DESIGNER') {
        return (
          (t.assignedTo !== undefined && String(t.assignedTo).toLowerCase().trim() === currentUserId) ||
          (currentUserEmail && t.assignedTo !== undefined && String(t.assignedTo).toLowerCase().trim() === currentUserEmail)
        );
      }

      return (
        (t.createdBy !== undefined && String(t.createdBy).toLowerCase().trim() === currentUserId) ||
        (currentUserEmail && t.creatorEmail && t.creatorEmail.toLowerCase().trim() === currentUserEmail)
      );
    });
  });

  readonly filteredCampaigns = computed(() => {
    const ws = this.activeWorkspacePackage();
    const allCmps = this.campaignService.campaigns();

    if (ws) {
      const wsName = (ws.name || '').toLowerCase().trim();
      const wsId = String(ws.id || '').toLowerCase().trim();
      return allCmps.filter((c) => {
        const cPkg = ((c as any).packageName || (c as any).package || '').toLowerCase().trim();
        const cPkgId = String((c as any).packageId || (c as any).package_id || '').toLowerCase().trim();
        const cName = (c.name || '').toLowerCase().trim();
        if (cPkg && (cPkg === wsName || cPkg === wsId)) return true;
        if (cPkgId && (cPkgId === wsId || cPkgId === wsName)) return true;
        if (cName.includes(wsName)) return true;
        return false;
      });
    }

    const activeProd = this.activePackageName().toLowerCase().trim();
    return allCmps.filter((c) => {
      const cProd = (c.productId || (c as any).product_id || '').toLowerCase().trim();
      if (cProd.includes(activeProd) || activeProd.includes(cProd)) return true;
      if (activeProd.includes('career') && (cProd.includes('career') || cProd === 'pkg_careermate')) return true;
      if (activeProd.includes('class') && (cProd.includes('class') || cProd === 'pkg_classmate')) return true;
      if ((activeProd.includes('jesus') || activeProd.includes('messang')) && (cProd.includes('jesus') || cProd.includes('messang'))) return true;
      return false;
    });
  });

  readonly filteredLeads = computed(() => {
    const ws = this.activeWorkspacePackage();
    const allLeads = this.leadService.leads();
    const user = this.authService.currentUser();
    const targetFilter = this.currentFilterTarget();
    const pkgMeta = this.activePackageMeta();
    const expectedProductId = ws ? ws.productId : pkgMeta.id;
    const allPkgs = this.packageService.packages();

    return allLeads.filter((l) => {
      if (user && user.role === 'TELECALLER') {
        if (!isLeadAssignedToUser(l, user)) return false;
      }

      if (ws) {
        return isItemForPackage(l, targetFilter, expectedProductId, allPkgs);
      }
      return isItemForPackage(l, this.activePackageName(), expectedProductId, allPkgs);
    });
  });


  readonly filteredCalls = computed(() => {
    return this.leadService.calls();
  });


  readonly filteredTransactions = computed(() => {
    return this.txnService.transactions();
  });


  readonly isTelecaller = computed<boolean>(() => {
    return this.currentRole() === 'TELECALLER';
  });

  readonly telecallerPipelineCounts = computed(() => {
    const leads = this.filteredLeads();
    const calls = this.leadService.calls();
    let newCount = 0;
    let followUpCount = 0;
    let interestedCount = 0;
    let qualifiedCount = 0;
    let retryCount = 0;

    leads.forEach((l) => {
      const lId = String(l.id || '').trim().toLowerCase();
      const lPhone = String(l.phone || '').replace(/\D/g, '');
      const leadCalls = calls.filter((c) => {
        const cLeadId = String(c.leadId || (c as any).lead_id || '').trim().toLowerCase();
        const cPhone = String(c.leadPhone || (c as any).lead_phone || '').replace(/\D/g, '');
        return (cLeadId && lId && cLeadId === lId) || (lPhone && cPhone && lPhone === cPhone);
      });

      let status = (l.status || 'ASSIGNED').toUpperCase().replace(/\s+/g, '_');
      if (leadCalls.length > 0) {
        const sorted = [...leadCalls].sort(
          (a, b) =>
            new Date((b as any).callDate || b.calledAt || (b as any).createdAt || 0).getTime() -
            new Date((a as any).callDate || a.calledAt || (a as any).createdAt || 0).getTime()
        );
        const out = String(sorted[0].outcome || '').toUpperCase().replace(/\s+/g, '_');
        if (out) status = out === 'BUSY' ? 'LINE_BUSY' : out;
      }

      if (status === 'INTERESTED') {
        interestedCount++;
      } else if (status === 'QUALIFIED' || status === 'CONVERTED' || status === 'PAID') {
        qualifiedCount++;
      } else if (status === 'FOLLOW_UP') {
        followUpCount++;
      } else if (['LINE_BUSY', 'BUSY', 'NO_ANSWER'].includes(status)) {
        retryCount++;
      } else if (status === 'NEW' || status === 'UNASSIGNED' || leadCalls.length === 0) {
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

  readonly isDesigner = computed<boolean>(() => {
    return this.currentRole() === 'DESIGNER';
  });

  readonly designerPipelineCounts = computed(() => {
    const tasks = this.filteredTasks();
    const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED').length;
    const revision = tasks.filter((t) => t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED').length;
    const inReview = tasks.filter((t) => t.status === 'SUBMITTED' || t.status === 'RESUBMITTED' || t.status === 'UNDER_REVIEW').length;
    const approved = tasks.filter((t) => t.status === 'APPROVED' || t.status === 'PUBLISHED' || t.status === 'COMPLETED').length;

    return {
      all: tasks.length,
      inProgress,
      revision,
      inReview,
      approved,
    };
  });

  readonly packageMetrics = computed(() => {
    const tasks = this.filteredTasks();
    const cmps = this.filteredCampaigns();
    const leads = this.filteredLeads();
    const pkgs = this.filteredProductPackages();

    const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED').length;
    const completed = tasks.filter((t) => t.status === 'APPROVED' || t.status === 'PUBLISHED' || t.status === 'COMPLETED').length;

    return {
      totalPackages: pkgs.length,
      totalTasks: tasks.length,
      inProgressTasks: inProgress,
      completedTasks: completed,
      totalCampaigns: cmps.length,
      totalLeads: leads.length,
    };
  });

  readonly auditLogs = signal<any[]>([]);

  readonly filteredAuditLogs = computed(() => {
    const ws = this.activeWorkspacePackage();
    const targetFilter = this.currentFilterTarget();
    const pkgName = this.activePackageName();
    const targetFilterLower = (targetFilter || '').toLowerCase().trim();
    const pkgNameLower = (pkgName || '').toLowerCase().trim();
    const logs = this.auditLogs();
    const allTasks = this.taskService.tasks();
    const expectedProductId = ws ? ws.productId : this.activePackageMeta().id;
    const packageTasks = allTasks.filter(
      (t) => ws
        ? isTaskForPackage(t, targetFilter, this.packageService.packages(), expectedProductId)
        : isTaskForPackage(t, pkgName, this.packageService.packages(), expectedProductId)
    );


    const taskRows = packageTasks.map((t) => {
      const taskIdStr = String(t.id).trim();
      const taskTitleLower = (t.title || '').toLowerCase().trim();

      const relatedLogs = logs.filter((l) => {
        const entId = String(l.entityId || '').trim();
        if (entId && (entId === taskIdStr || entId.toLowerCase() === taskTitleLower)) {
          return true;
        }
        const taskVersions = t.versions || (t as any).deliverables || [];
        if (
          taskVersions.some(
            (v: any) =>
              String(v.id || '').trim() === entId ||
              String(v.fileName || '').trim() === entId
          )
        ) {
          return true;
        }
        return false;
      });

      relatedLogs.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      );
      const latestLog = relatedLogs.length > 0 ? relatedLogs[0] : null;

      const creatorName = this.getCreatorName(t);
      const creatorRole = this.getCreatorRoleLabel(t);
      const creatorEmail = this.getCreatorEmail(t);
      const assigneeName = this.getAssigneeName(t);

      const latestDate =
        latestLog?.createdAt ||
        t.updatedAt ||
        t.createdAt ||
        new Date().toISOString();

      const actionName =
        latestLog?.action ||
        (t.status === 'APPROVED'
          ? 'TASK_STATUS_APPROVED'
          : t.status === 'SUBMITTED'
          ? 'TASK_VERSION_SUBMITTED'
          : t.status === 'IN_PROGRESS'
          ? 'TASK_STATUS_IN_PROGRESS'
          : t.status === 'REDESIGN_REQUIRED'
          ? 'TASK_STATUS_REDESIGN'
          : 'TASK_CREATED');

      return {
        id: latestLog?.id ? `log_${latestLog.id}` : `aud_task_${t.id}`,
        dbLogId: latestLog?.id,
        actorId: latestLog?.actorId || t.createdBy,
        actorEmail: latestLog?.actorEmail || creatorEmail,
        action: actionName,
        entityType: 'Task',
        entityId: taskIdStr,
        previousState: latestLog?.previousState,
        newState: latestLog?.newState,
        isTask: true,
        taskId: t.id,
        taskTitle: t.title,
        targetTask: t,
        creatorName,
        creatorRole,
        creatorEmail,
        assigneeName,
        createdAt: latestDate,
      };
    });


    const packageTaskIds = new Set(packageTasks.map((t) => String(t.id)));
    const extraPackageLogs = logs
      .filter((l) => {
        const act = (l.action || '').toLowerCase();
        const ent = (l.entityType || '').toLowerCase();
        const entId = String(l.entityId || "").toLowerCase()
        const matchesPkg = ws
          ? (act.includes(targetFilterLower) || ent.includes(targetFilterLower) || entId.includes(targetFilterLower))
          : (!targetFilterLower ||
             targetFilterLower === 'all' ||
             act.includes(targetFilterLower) ||
             ent.includes(targetFilterLower) ||
             entId.includes(targetFilterLower) ||
             (pkgNameLower && (act.includes(pkgNameLower) || ent.includes(pkgNameLower) || entId.includes(pkgNameLower))));
        if (!matchesPkg) return false;
        if (packageTaskIds.has(String(l.entityId))) return false;
        return true;
      })
      .map((l) => ({
        ...l,
        isTask: false,
      }));

    const allAuditEntries = [...taskRows, ...extraPackageLogs];
    allAuditEntries.sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
    );
    return allAuditEntries;
  });

  readonly packageReportSummary = computed(() => {
    const tasks = this.filteredTasks();
    const cmps = this.filteredCampaigns();
    const leads = this.filteredLeads();
    const txns = this.filteredTransactions();

    const totalRevenue = txns.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const totalSpend = cmps.reduce((acc, curr) => acc + Number(curr.spend || 0), 0);
    const totalLeadsCount = leads.length > 0 ? leads.length : cmps.reduce((acc, curr) => acc + Number(curr.leadsCount || 0), 0);

    const qualifiedLeads = leads.filter((l) => l.status === 'QUALIFIED' || l.status === 'CONVERTED').length;
    const qualificationRate = totalLeadsCount > 0 ? Number(((qualifiedLeads / totalLeadsCount) * 100).toFixed(1)) : 0;

    const avgCpl = totalLeadsCount > 0 ? (totalSpend / totalLeadsCount).toFixed(2) : '0.00';
    const roi = totalSpend > 0 ? `${Math.round(((totalRevenue - totalSpend) / totalSpend) * 100)}%` : (totalRevenue > 0 ? '100%' : '0%');

    const completedTasksCount = tasks.filter((t) => t.status === 'APPROVED' || t.status === 'PUBLISHED' || t.status === 'COMPLETED').length;
    const completedTasksPct = tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0;

    return {
      totalRevenue,
      totalSpend,
      totalLeads: totalLeadsCount,
      qualificationRate: `${qualificationRate}%`,
      avgCpl: `₹${avgCpl}`,
      roi,
      completedTasksPct,
    };
  });

  readonly teamPerformanceList = computed<UserPerformanceRecord[]>(() => {
    const rawUsers = this.userService.users();
    const ws = this.activeWorkspacePackage();
    const targetFilter = this.currentFilterTarget();
    const pkgMeta = this.activePackageMeta();
    const expectedProductId = ws ? ws.productId : pkgMeta.id;
    const allPkgs = this.packageService.packages();
    const scopedLeads = this.filteredLeads();
    const allCalls = this.leadService.calls();
    const allAds = this.campaignService.ads();

   
    const scopedTasks = this.taskService.tasks().filter((t) =>
      isTaskForPackage(t, targetFilter, allPkgs, expectedProductId)
    );

    const enrichedTasks = scopedTasks.map((t) => {
      const res = resolveTaskProductAndPackage(t, allPkgs);
      return {
        ...t,
        productId: t.productId || res.productId,
        productName: t.productName || res.productName,
        packageName: t.packageName || res.packageName,
      };
    });

    const getRoleInfo = (role: string) => {
      switch (role) {
        case 'ADMINISTRATOR':
          return { label: 'Administrator', badgeClass: 'role-badge-admin', avatarClass: 'avatar-slate' };
        case 'DIGITAL_MARKETING':
          return { label: 'Digital Marketing', badgeClass: 'role-badge-digital', avatarClass: 'avatar-sky' };
        case 'BDM':
          return { label: 'BDM', badgeClass: 'role-badge-bdm', avatarClass: 'avatar-rose' };
        case 'DESIGNER':
          return { label: 'Designer', badgeClass: 'role-badge-designer', avatarClass: 'avatar-purple' };
        case 'TELECALLER':
          return { label: 'Telecaller', badgeClass: 'role-badge-telecaller', avatarClass: 'avatar-emerald' };
        default:
          return { label: role || 'Member', badgeClass: 'role-badge-default', avatarClass: 'avatar-indigo' };
      }
    };

    return (rawUsers || []).map((u) => {
      const roleInfo = getRoleInfo(u.role);
      const nameLower = (u.fullName || '').toLowerCase().trim();
      const userIdStr = String(u.id).trim();

      if (u.role === 'TELECALLER') {
        const userLeads = scopedLeads.filter((l) => {
          const assignId = String(l.assignedTo || (l as any).assigned_to || '').trim().toLowerCase();
          const assignName = (l.assigneeName || (l as any).assignee_name || '').toLowerCase().trim();
          const userEmailLower = (u.email || '').toLowerCase().trim();
          if (assignId === userIdStr.toLowerCase()) return true;
          if (assignId && userEmailLower && assignId === userEmailLower) return true;
          if (assignName && (assignName === nameLower || nameLower.includes(assignName) || assignName.includes(nameLower))) return true;
          return false;
        });

        const prodName = ws ? (ws.productId?.includes('jesus') ? 'Jesus the messanger' : (ws.productId?.includes('class') ? 'Classmate' : 'Careermate')) : pkgMeta.name;
        const pkgDisplayName = ws ? ws.name : pkgMeta.name;

        const userLeadRecords = userLeads.map((l) => {
          const lId = String(l.id).trim();
          const lPhone = String(l.phone || '').replace(/\D/g, '');
          const lNameLower = `${l.firstName || ''} ${l.lastName || ''}`.trim().toLowerCase();

          const callsForLead = allCalls.filter((c) => {
            const cLeadId = String(c.leadId || (c as any).lead_id || '').trim();
            const cPhone = String(c.leadPhone || (c as any).lead_phone || (c as any).phone || '').replace(/\D/g, '');
            const cLeadName = String(c.leadName || (c as any).lead_name || '').trim().toLowerCase();
            return (cLeadId && lId && cLeadId === lId) ||
                   (lPhone && cPhone && lPhone === cPhone) ||
                   (cLeadName && lNameLower && (cLeadName === lNameLower || cLeadName.includes(lNameLower) || lNameLower.includes(cLeadName)));
          });

          const sortedCalls = [...callsForLead].sort(
            (a, b) => new Date(b.calledAt || (b as any).callDate || (b as any).createdAt || 0).getTime() - new Date(a.calledAt || (a as any).callDate || (a as any).createdAt || 0).getTime()
          );
          const latestCall = sortedCalls[0] || null;

          let durationText = '—';
          if (latestCall && typeof latestCall.durationSeconds === 'number' && latestCall.durationSeconds > 0) {
            const mins = Math.floor(latestCall.durationSeconds / 60);
            const secs = latestCall.durationSeconds % 60;
            durationText = `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
          } else if (latestCall && (latestCall as any).duration) {
            durationText = String((latestCall as any).duration);
          }

          const rawPhone = String(l.phone || (l as any).phoneNumber || (l as any).mobile || (l as any).contact || '').trim();
          const cleanPhone = (rawPhone && !rawPhone.includes('@') && rawPhone !== '—')
            ? rawPhone
            : (String((l as any).mobile || '').trim() && !String((l as any).mobile).includes('@')
                ? String((l as any).mobile).trim()
                : '—');

          const callAttempts = sortedCalls.length;
          const callAttemptsText = callAttempts === 0 ? '0 Attempts' : (callAttempts === 1 ? '1st Call' : `${callAttempts} Calls`);
          const rawFullName = `${l.firstName || ''} ${l.lastName || ''}`.trim();
          const leadFullName = (rawFullName && !rawFullName.includes('@'))
            ? rawFullName
            : (cleanPhone !== '—' ? cleanPhone : 'Lead #' + String(l.id).slice(-4));

          const resolvedLead = resolveTaskProductAndPackage({
            packageName: (l as any).packageName || (l as any).package || '',
            campaignName: l.campaignName || '',
            title: l.campaignName || l.source || '',
            productId: (l as any).productId || (l as any).product_id || '',
            productName: (l as any).productName || (l as any).product || '',
          }, allPkgs);

          const finalProdName = resolvedLead.productName || (ws ? prodName : pkgMeta.name);
          const finalPkgName = resolvedLead.packageName || (ws ? pkgDisplayName : pkgMeta.name);

          const resolvedAdName = (() => {
            const direct = (l as any).adName || (l as any).ad_name || (l as any).ad;
            if (direct && direct !== '—' && String(direct).trim()) return String(direct).trim();
            const adId = String((l as any).adId || (l as any).ad_id || '').trim().toLowerCase();
            if (adId) {
              const matchedAd = this.campaignService.ads().find((a) => String(a.id).toLowerCase() === adId || String(a.platformAdId || '').toLowerCase() === adId);
              if (matchedAd && matchedAd.name) return matchedAd.name;
            }
            const cmpId = String(l.campaignId || (l as any).campaign_id || '').toLowerCase().trim();
            if (cmpId) {
              const foundByCmpId = this.campaignService.ads().find((a) => String(a.campaignId || '').toLowerCase().trim() === cmpId);
              if (foundByCmpId && foundByCmpId.name) return foundByCmpId.name;
            }
            const cmpName = String(l.campaignName || '').toLowerCase().trim();
            if (cmpName) {
              const foundByCmp = this.campaignService.ads().find((a) => a.campaignName && (a.campaignName.toLowerCase().trim() === cmpName || cmpName.includes(a.campaignName.toLowerCase().trim()) || a.campaignName.toLowerCase().trim().includes(cmpName)));
              if (foundByCmp && foundByCmp.name) return foundByCmp.name;
            }
            const allAds = this.campaignService.ads();
            if (allAds.length > 0 && cmpName && cmpName !== '—') {
              const matchByKeyword = allAds.find((a) => cmpName.split(' ').some((word) => word.length > 3 && a.name.toLowerCase().includes(word)));
              if (matchByKeyword && matchByKeyword.name) return matchByKeyword.name;
            }
            if ((l as any).ad_title && String((l as any).ad_title).trim()) return String((l as any).ad_title).trim();
            if ((l as any).adTitle && String((l as any).adTitle).trim()) return String((l as any).adTitle).trim();
            return '—';
          })();

          const resolvedRemarks = (() => {
            if (latestCall?.remarks && latestCall.remarks !== '—' && String(latestCall.remarks).trim()) {
              return String(latestCall.remarks).trim();
            }
            if ((l as any).remarks && (l as any).remarks !== '—' && String((l as any).remarks).trim()) {
              return String((l as any).remarks).trim();
            }
            if ((l as any).notes && (l as any).notes !== '—' && String((l as any).notes).trim()) {
              return String((l as any).notes).trim();
            }
            for (const callItem of sortedCalls) {
              if (callItem.remarks && callItem.remarks !== '—' && String(callItem.remarks).trim()) {
                return String(callItem.remarks).trim();
              }
            }
            if (latestCall?.nextAction && latestCall.nextAction !== '—' && String(latestCall.nextAction).trim()) {
              return String(latestCall.nextAction).trim();
            }
            return '—';
          })();

          return {
            id: l.id,
            leadId: l.id,
            title: leadFullName,
            leadName: leadFullName,
            leadPhone: cleanPhone,
            source: l.source || l.campaignName || '—',
            campaignName: l.campaignName || l.source || '—',
            adName: resolvedAdName,
            adId: (l as any).adId || (l as any).ad_id || '',
            productName: finalProdName,
            packageName: finalPkgName,
            createdAt: l.createdAt,
            assignedDate: l.createdAt,
            calledAt: latestCall ? (latestCall.calledAt || (latestCall as any).callDate) : null,
            callDurationText: durationText,
            callDurationSeconds: latestCall?.durationSeconds || 0,
            callOutcome: (latestCall?.outcome || l.status || 'NEW').toUpperCase(),
            status: (latestCall?.outcome || l.status || 'NEW').toUpperCase(),
            callAttempts,
            callAttemptsText,
            followUpDate: latestCall?.followUpDate || (l as any).followUpDate || null,
            remarks: resolvedRemarks,
            calls: sortedCalls,
          };
        });

        const callsMade = userLeadRecords.filter((r) => r.calledAt || r.callAttempts > 0).length;
        const interestedLeads = userLeadRecords.filter((r) => ['INTERESTED', 'QUALIFIED', 'CONVERTED', 'PAID', 'HOT'].includes(r.callOutcome)).length;
        const conversionPct = userLeadRecords.length > 0 ? Math.round((callsMade / userLeadRecords.length) * 100) : 0;

        return {
          user: u,
          userId: String(u.id),
          name: u.fullName || u.email?.split('@')[0] || 'Telecaller',
          email: u.email || '',
          role: u.role,
          roleLabel: roleInfo.label,
          roleBadgeClass: roleInfo.badgeClass,
          avatarColor: roleInfo.avatarClass,
          department: u.department || 'Telecalling',
          isActive: u.isActive !== false,
          outputMain: `${callsMade} Calls Made`,
          outputSub: `${userLeadRecords.length} Assigned Leads`,
          efficiencyMain: userLeadRecords.length > 0 ? `${conversionPct}%` : '—',
          efficiencySub: 'Called',
          qualificationPct: conversionPct,
          ratingScore: '—',
          ratingBadge: 'Active Staff',
          ratingBadgeClass: 'badge-target',
          tasksAssignedCount: userLeadRecords.length,
          tasksCompletedCount: callsMade,
          tasksInProgressCount: userLeadRecords.length - callsMade,
          tasksRevisionCount: 0,
          taskCompletionPct: conversionPct,
          tasks: userLeadRecords,
          roleMetrics: [
            { label: 'Assigned Leads', value: userLeadRecords.length },
            { label: 'Calls Made', value: callsMade },
            { label: 'Interested / Warm', value: interestedLeads },
          ],
        };
      }

      if (u.role === 'DIGITAL_MARKETING') {
        const prodName = ws ? (ws.productId?.includes('jesus') ? 'Jesus the messanger' : (ws.productId?.includes('class') ? 'Classmate' : 'Careermate')) : pkgMeta.name;
        const pkgDisplayName = ws ? ws.name : pkgMeta.name;
        const userEmailLower = (u.email || '').toLowerCase().trim();
        const matchingAds = (allAds || []).filter((a) => {
          const adCreatorId = String((a as any).creatorId || (a as any).creator_id || (a as any).userId || (a as any).ownerId || (a as any).createdBy || '').trim().toLowerCase();
          const adCreatorEmail = String((a as any).creatorEmail || (a as any).ownerEmail || '').trim().toLowerCase();
          const adCreatorName = String((a as any).creatorName || (a as any).ownerName || '').trim().toLowerCase();

          const matchingCmp = this.filteredCampaigns().find((c) => String(c.id) === String(a.campaignId) || c.name.toLowerCase() === (a.campaignName || '').toLowerCase().trim());
          const cmpOwnerId = String(matchingCmp?.ownerId || (matchingCmp as any)?.owner_id || (matchingCmp as any)?.createdBy || '').trim().toLowerCase();
          const cmpOwnerEmail = String((matchingCmp as any)?.ownerEmail || (matchingCmp as any)?.creatorEmail || '').trim().toLowerCase();
          const cmpOwnerName = String(matchingCmp?.ownerName || '').trim().toLowerCase();

          const belongsToUser =
            (adCreatorId && (adCreatorId === userIdStr.toLowerCase() || adCreatorId === userEmailLower)) ||
            (adCreatorEmail && adCreatorEmail === userEmailLower) ||
            (adCreatorName && (adCreatorName === nameLower || nameLower.includes(adCreatorName) || adCreatorName.includes(nameLower))) ||
            (cmpOwnerId && (cmpOwnerId === userIdStr.toLowerCase() || cmpOwnerId === userEmailLower)) ||
            (cmpOwnerEmail && cmpOwnerEmail === userEmailLower) ||
            (cmpOwnerName && (cmpOwnerName === nameLower || nameLower.includes(cmpOwnerName) || cmpOwnerName.includes(nameLower)));

          if (!belongsToUser) {
            return false;
          }

          if (ws) {
            const wsName = (ws.name || '').toLowerCase().trim();
            const wsId = String(ws.id || '').toLowerCase().trim();
            const adPkg = ((a as any).packageName || (a as any).package || '').toLowerCase().trim();
            const adPkgId = String((a as any).packageId || (a as any).package_id || '').toLowerCase().trim();
            const adProd = (a.productId || (a as any).product_id || '').toLowerCase().trim();
            const adCmpName = (a.campaignName || '').toLowerCase().trim();
            const adName = (a.name || '').toLowerCase().trim();

            if (adPkg && (adPkg === wsName || adPkg === wsId)) return true;
            if (adPkgId && (adPkgId === wsId || adPkgId === wsName)) return true;
            if (adProd && expectedProductId && adProd.includes(expectedProductId.toLowerCase())) return true;
            if (adCmpName && (adCmpName.includes(wsName) || wsName.includes(adCmpName))) return true;
            if (adName && (adName.includes(wsName) || wsName.includes(adName))) return true;

            if (matchingCmp) return true;
            return false;
          }

          const activeProd = this.activePackageName().toLowerCase().trim();
          const adProd = (a.productId || (a as any).product_id || '').toLowerCase().trim();
          if (adProd && (adProd.includes(activeProd) || activeProd.includes(adProd))) return true;
          if (matchingCmp) return true;
          return false;
        });

        const userAdRecords = matchingAds.map((ad) => {
          const adLeads = scopedLeads.filter((l) => {
            const lAdId = String((l as any).adId || (l as any).ad_id || '').toLowerCase().trim();
            const lAdName = String((l as any).adName || (l as any).ad_name || '').toLowerCase().trim();
            const lCmpId = String(l.campaignId || (l as any).campaign_id || '').toLowerCase().trim();
            const lCmpName = String(l.campaignName || '').toLowerCase().trim();

            if (lAdId && lAdId === String(ad.id).toLowerCase()) return true;
            if (lAdName && lAdName === ad.name.toLowerCase().trim()) return true;
            if (lCmpId && lCmpId === String(ad.campaignId).toLowerCase()) return true;
            if (lCmpName && lCmpName === (ad.campaignName || '').toLowerCase().trim()) return true;
            return false;
          });

          const totalLeads = adLeads.length > 0 ? adLeads.length : (ad.leadsCount || 0);
          const resolved = resolveTaskProductAndPackage({
            productId: ad.productId,
            packageName: ad.packageName || ad.campaignName,
            campaignName: ad.campaignName,
            title: ad.name,
          }, allPkgs);

          const adDate = (ad as any).createdAt || ad.lastSyncedAt || (ws ? ws.createdAt : new Date().toISOString());

          return {
            id: ad.id,
            adId: ad.id,
            title: ad.name,
            adName: ad.name,
            campaignName: ad.campaignName || 'General Campaign',
            campaignId: ad.campaignId,
            platform: ad.platform || 'Meta Ads',
            productName: resolved.productName || (ws ? prodName : pkgMeta.name),
            packageName: resolved.packageName || (ws ? pkgDisplayName : pkgMeta.name),
            productId: resolved.productId || expectedProductId,
            packageId: (resolved as any).packageId || (ws ? ws.id : undefined),
            createdAt: adDate,
            launchDate: adDate,
            leadsCount: totalLeads,
            status: (ad.status || 'ACTIVE').toUpperCase(),
            isAdRecord: true,
          };
        });

        const userTasks = enrichedTasks.filter((t) => {
          const assignId = String(t.assignedTo || (t as any).assigned_to || '').trim().toLowerCase();
          const assignName = (t.assigneeName || (t as any).assignee_name || '').toLowerCase().trim();
          const creatorId = String(t.createdBy || (t as any).created_by || '').trim().toLowerCase();
          const creatorName = ((t as any).creatorName || (t as any).creator_name || '').toLowerCase().trim();
          const userEmailLower = (u.email || '').toLowerCase().trim();

          const isAssigned = Boolean(
            (assignId && assignId !== '0' && assignId !== 'null' && assignId !== 'undefined') ||
            (assignName && assignName !== 'unassigned')
          );

          if (isAssigned) {
            if (assignId === userIdStr.toLowerCase()) return true;
            if (assignId && userEmailLower && assignId === userEmailLower) return true;
            if (assignName && (assignName === nameLower || nameLower.includes(assignName) || assignName.includes(nameLower))) return true;
            return false;
          }

          if (creatorId === userIdStr.toLowerCase()) return true;
          if (creatorId && userEmailLower && creatorId === userEmailLower) return true;
          if (creatorName && (creatorName === nameLower || nameLower.includes(creatorName) || creatorName.includes(nameLower))) return true;
          return false;
        });

        const taskRecords = userTasks.filter((t) => !userAdRecords.some((a) => a.id === t.id)).map((t) => ({
          id: t.id,
          adId: t.id,
          title: t.title,
          adName: t.title,
          campaignName: t.campaignName || t.packageName || 'Marketing Deliverable',
          campaignId: t.campaignId || '',
          platform: (t as any).platform || 'Multi-Channel',
          productName: t.productName || (ws ? prodName : pkgMeta.name),
          packageName: t.packageName || (ws ? pkgDisplayName : pkgMeta.name),
          productId: t.productId || expectedProductId,
          createdAt: t.createdAt,
          launchDate: t.createdAt,
          leadsCount: 0,
          status: t.status || 'ACTIVE',
          isAdRecord: false,
        }));

        const allDmRecords = [...userAdRecords, ...taskRecords];
        const totalLeadsGen = allDmRecords.reduce((acc, curr) => acc + (Number(curr.leadsCount) || 0), 0);
        const activeAdsCount = allDmRecords.filter((r) => r.status === 'ACTIVE').length;
        const pausedAdsCount = allDmRecords.filter((r) => r.status === 'PAUSED').length;

        return {
          user: u,
          userId: String(u.id),
          name: u.fullName || u.email?.split('@')[0] || 'Digital Marketer',
          email: u.email || '',
          role: u.role,
          roleLabel: roleInfo.label,
          roleBadgeClass: roleInfo.badgeClass,
          avatarColor: roleInfo.avatarClass,
          department: u.department || 'Digital Marketing',
          isActive: u.isActive !== false,
          outputMain: `${totalLeadsGen} Leads Generated`,
          outputSub: `${allDmRecords.length} Ads Managed`,
          efficiencyMain: `${activeAdsCount} Active`,
          efficiencySub: 'Campaigns',
          qualificationPct: allDmRecords.length > 0 ? Math.round((activeAdsCount / allDmRecords.length) * 100) : 0,
          ratingScore: '—',
          ratingBadge: 'Active Staff',
          ratingBadgeClass: 'badge-target',
          tasksAssignedCount: allDmRecords.length,
          tasksCompletedCount: activeAdsCount,
          tasksInProgressCount: pausedAdsCount,
          tasksRevisionCount: 0,
          taskCompletionPct: allDmRecords.length > 0 ? Math.round((activeAdsCount / allDmRecords.length) * 100) : 0,
          tasks: allDmRecords,
          roleMetrics: [
            { label: 'Ads Managed', value: allDmRecords.length },
            { label: 'Leads Generated', value: totalLeadsGen },
            { label: 'Active Ads', value: activeAdsCount },
          ],
        };
      }

      const userTasks = enrichedTasks.filter((t) => {
        const assignId = String(t.assignedTo || (t as any).assigned_to || '').trim().toLowerCase();
        const assignName = (t.assigneeName || (t as any).assignee_name || '').toLowerCase().trim();
        const creatorId = String(t.createdBy || (t as any).created_by || '').trim().toLowerCase();
        const creatorName = ((t as any).creatorName || (t as any).creator_name || '').toLowerCase().trim();
        const userEmailLower = (u.email || '').toLowerCase().trim();

        if (assignId === userIdStr.toLowerCase()) return true;
        if (assignId && userEmailLower && assignId === userEmailLower) return true;
        if (assignName && (assignName === nameLower || nameLower.includes(assignName) || assignName.includes(nameLower))) return true;

        if (u.role === 'BDM' || u.role === 'DIGITAL_MARKETING') {
          if (creatorId === userIdStr.toLowerCase()) return true;
          if (creatorId && userEmailLower && creatorId === userEmailLower) return true;
          if (creatorName && (creatorName === nameLower || nameLower.includes(creatorName) || creatorName.includes(nameLower))) return true;
        }

        return false;
      });

      const tasksCompleted = userTasks.filter((t) => t.status === 'APPROVED' || t.status === 'COMPLETED' || t.status === 'PUBLISHED').length;
      const tasksInProgress = userTasks.filter((t) => t.status !== 'APPROVED' && t.status !== 'COMPLETED' && t.status !== 'PUBLISHED').length;
      const tasksRevision = userTasks.filter((t) => t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED').length;
      const completionPct = userTasks.length > 0 ? Math.round((tasksCompleted / userTasks.length) * 100) : 0;

      return {
        user: u,
        userId: String(u.id),
        name: u.fullName || u.email?.split('@')[0] || 'User',
        email: u.email || '',
        role: u.role,
        roleLabel: roleInfo.label,
        roleBadgeClass: roleInfo.badgeClass,
        avatarColor: roleInfo.avatarClass,
        department: u.department || 'Operations',
        isActive: u.isActive !== false,
        outputMain: `${tasksCompleted} Done`,
        outputSub: `${userTasks.length} Assigned`,
        efficiencyMain: userTasks.length > 0 ? `${completionPct}%` : '—',
        efficiencySub: 'Completed',
        qualificationPct: completionPct,
        ratingScore: '—',
        ratingBadge: 'Active Staff',
        ratingBadgeClass: 'badge-target',
        tasksAssignedCount: userTasks.length,
        tasksCompletedCount: tasksCompleted,
        tasksInProgressCount: tasksInProgress,
        tasksRevisionCount: tasksRevision,
        taskCompletionPct: completionPct,
        tasks: userTasks,
        roleMetrics: [
          { label: 'Assigned Tasks', value: userTasks.length },
          { label: 'Completed Deliverables', value: tasksCompleted },
          { label: 'Active in Queue', value: tasksInProgress },
        ],
      };
    });
  });

  readonly activeUsersCount = computed<number>(() => this.teamPerformanceList().filter((u) => u.isActive).length);

  private latestQueryParams: any = null;

  private applyRouteQueryParams(params: any): void {
    if (!params) return;

    const reqProduct = params['package'] || params['product'] || params['productName'];
    const requestedWorkspace = params['workspace'] || params['workspacePkg'] || params['pkg'] || params['packageWorkspace'] || params['packageName'];
    const requestedDept = params['dept'] || params['department'];
    const requestedTab = params['tab'] || params['subtab'];

    if (!reqProduct && !requestedWorkspace && !requestedDept && !requestedTab) {
      return;
    }

    if (reqProduct) {
      const cleanProd = String(reqProduct).toLowerCase().trim();
      const matched = FIXED_PACKAGES.find((p) =>
        p.name.toLowerCase() === cleanProd ||
        p.id.toLowerCase() === cleanProd ||
        cleanProd.includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(cleanProd)
      );
      if (matched) {
        this.activePackageName.set(matched.name);
      } else {
        this.activePackageName.set(String(reqProduct));
      }
    }

    const allPkgs = this.packageService.packages();
    let targetPkg: ProductPackage | null = null;

    if (requestedWorkspace) {
      const normWs = String(requestedWorkspace).toLowerCase().replace(/[^a-z0-9]/g, '');
      targetPkg = allPkgs.find((p) => {
        const pNameNorm = String(p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const pIdNorm = String(p.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return pNameNorm === normWs || pIdNorm === normWs || String(p.id) === String(requestedWorkspace) ||
               String(p.name || '').toLowerCase().includes(String(requestedWorkspace).toLowerCase()) ||
               String(requestedWorkspace).toLowerCase().includes(String(p.name || '').toLowerCase());
      }) || null;
    }

    if (!targetPkg && requestedWorkspace) {
      const prodMeta = this.activePackageMeta();
      targetPkg = {
        id: 4,
        name: String(requestedWorkspace),
        productId: prodMeta?.id || 'pkg_careermate',
        status: 'ACTIVE',
      } as ProductPackage;
    }

    if (!targetPkg && !requestedWorkspace && (requestedDept === 'TELECALLING' || requestedTab === 'TELECALLER_MEMBERS' || requestedTab === 'TARGETS')) {
      targetPkg = allPkgs.find((p) => String(p.name).toLowerCase().includes('current') || String(p.name).toLowerCase().includes('affair'))
        || allPkgs.find((p) => (p.productId || '').toLowerCase().includes('career'))
        || allPkgs[0]
        || null;
    }

    if (targetPkg) {
      this.selectedProductPackage.set(targetPkg);
      this.activeWorkspacePackage.set(targetPkg);

      if (!reqProduct && targetPkg.productId) {
        const prodObj = this.availablePackages.find(
          (p) => p.id.toLowerCase() === targetPkg!.productId.toLowerCase()
        );
        if (prodObj) {
          this.activePackageName.set(prodObj.name);
        }
      }

      if (requestedDept) {
        const validDepts: Array<'DESIGNER' | 'DIGITAL_MARKETING' | 'TELECALLING' | 'ANALYTICS'> = [
          'DESIGNER', 'DIGITAL_MARKETING', 'TELECALLING', 'ANALYTICS'
        ];
        const upperDept = String(requestedDept).toUpperCase();
        if (validDepts.includes(upperDept as any)) {
          this.activeDepartment.set(upperDept as any);
        }
      } else if (requestedTab === 'TELECALLER_MEMBERS' || requestedTab === 'TARGETS' || requestedTab === 'TELECALLING') {
        this.activeDepartment.set('TELECALLING');
      }

      if (requestedTab) {
        this.selectOperationTab(requestedTab);
      } else if (this.activeDepartment() === 'TELECALLING') {
        const role = this.currentRole();
        if (role === 'ADMINISTRATOR' || role === 'MARKETING_MANAGER') {
          this.selectOperationTab('TELECALLER_MEMBERS');
        } else {
          this.selectOperationTab('TELECALLING');
        }
      }
    }
  }

  async ngOnInit(): Promise<void> {
    await this.authService.ensureInitialized();
    if (!this.authService.isAuthenticated()) return;

    this.route.queryParams.subscribe((params) => {
      this.latestQueryParams = params;
      this.applyRouteQueryParams(params);
    });
    this.loadProductHeroBanner(this.activePackageMeta().id);

    const ops = this.roleOperations();
    if (ops.length > 0 && !this.activeOperationTab()) {
      this.activeOperationTab.set(ops[0].id);
    }

    this.packageService.loadAllPackages().subscribe({
      next: () => {
        if (this.latestQueryParams) {
          this.applyRouteQueryParams(this.latestQueryParams);
        }
      },
      error: () => {
        if (this.latestQueryParams) {
          this.applyRouteQueryParams(this.latestQueryParams);
        }
      }
    });
    this.packageService.loadSummary().subscribe();
    this.taskService.loadTasks();
    this.campaignService.loadCampaigns().subscribe();
    this.campaignService.loadAds().subscribe();
    this.leadService.loadLeads().subscribe();
    this.leadService.loadCalls().subscribe();
    this.txnService.loadTransactions().subscribe();
    this.targetService.loadTargets();
    this.userService.loadUsersFromDatabase();
    this.fetchAuditLogs();
  }


  openCreateProductPackageModal(): void {
    if (!this.canCreatePackage()) {
      alert('Only administrators are authorized to create packages.');
      return;
    }
    this.createProductPackageForm.reset({
      name: '',
      imageUrl: '',
      price: 100,
      description: '',
    });
    this.createdPackageImageFile.set(null);
    this.createdPackageImagePreview.set('');
    this.isCreateProductPackageModalOpen.set(true);
  }

  closeCreateProductPackageModal(): void {
    this.isCreateProductPackageModalOpen.set(false);
    this.createdPackageImageFile.set(null);
    this.createdPackageImagePreview.set('');
    this.createProductPackageForm.reset();
  }

  onPackageImageFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.createdPackageImageFile.set(file);
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const result = (e.target?.result as string) || '';
        this.createdPackageImagePreview.set(result);
        this.createProductPackageForm.patchValue({ imageUrl: result });
      };
      reader.readAsDataURL(file);
    }
  }

  removePackageImageFile(): void {
    this.createdPackageImageFile.set(null);
    this.createdPackageImagePreview.set('');
    this.createProductPackageForm.patchValue({ imageUrl: '' });
  }

  async submitCreateProductPackage(): Promise<void> {
    if (!this.canCreatePackage()) {
      alert('Only administrators are authorized to create packages.');
      return;
    }

    if (this.createProductPackageForm.invalid) {
      this.createProductPackageForm.markAllAsTouched();
      return;
    }

    this.isSubmittingPackage.set(true);
    const formVal = this.createProductPackageForm.value;
    const file = this.createdPackageImageFile();
    const activeMeta = this.activePackageMeta();

    const payload = {
      productId: activeMeta.id,
      name: formVal.name.trim(),
      imageUrl: this.createdPackageImagePreview() || formVal.imageUrl || null,
      fileName: file ? file.name : undefined,
      price: formVal.price !== null && formVal.price !== '' ? Number(formVal.price) : null,
      description: formVal.description ? formVal.description.trim() : null,
      status: 'ACTIVE',
    };

    this.packageService.createPackage(payload).subscribe({
      next: () => {
        this.isSubmittingPackage.set(false);
        this.closeCreateProductPackageModal();
      },
      error: (err) => {
        console.error('Failed to create package:', err);
        this.isSubmittingPackage.set(false);
        alert(err.message || 'Failed to create package.');
      },
    });
  }

  openEditProductPackageModal(pkg: ProductPackage, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!this.canEditPackage()) {
      alert('Only administrators are authorized to edit packages.');
      return;
    }
    this.editingProductPackage.set(pkg);
    this.editProductPackageForm.reset({
      name: pkg.name || '',
      imageUrl: pkg.imageUrl || '',
      price: pkg.price !== null && pkg.price !== undefined ? pkg.price : 100,
      description: pkg.description || '',
    });
    this.editPackageImageFile.set(null);
    this.editPackageImagePreview.set(pkg.imageUrl ? this.formatAssetUrl(pkg.imageUrl) : '');
    this.isEditProductPackageModalOpen.set(true);
  }

  closeEditProductPackageModal(): void {
    this.isEditProductPackageModalOpen.set(false);
    this.editingProductPackage.set(null);
    this.editPackageImageFile.set(null);
    this.editPackageImagePreview.set('');
    this.editProductPackageForm.reset();
  }

  onEditPackageImageFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.editPackageImageFile.set(file);
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const result = (e.target?.result as string) || '';
        this.editPackageImagePreview.set(result);
        this.editProductPackageForm.patchValue({ imageUrl: result });
      };
      reader.readAsDataURL(file);
    }
  }

  removeEditPackageImageFile(): void {
    this.editPackageImageFile.set(null);
    this.editPackageImagePreview.set('');
    this.editProductPackageForm.patchValue({ imageUrl: '' });
  }

  async submitEditProductPackage(): Promise<void> {
    if (!this.canEditPackage()) {
      alert('Only administrators are authorized to edit packages.');
      return;
    }

    if (this.editProductPackageForm.invalid) {
      this.editProductPackageForm.markAllAsTouched();
      return;
    }

    const currentPkg = this.editingProductPackage();
    if (!currentPkg) return;

    this.isSubmittingPackage.set(true);
    const formVal = this.editProductPackageForm.value;
    const file = this.editPackageImageFile();

    const payload = {
      name: formVal.name.trim(),
      imageUrl: this.editPackageImagePreview() || formVal.imageUrl || null,
      fileName: file ? file.name : undefined,
      price: formVal.price !== null && formVal.price !== '' ? Number(formVal.price) : null,
      description: formVal.description ? formVal.description.trim() : null,
    };

    this.packageService.updatePackage(currentPkg.id, payload).subscribe({
      next: (updatedPkg) => {
        this.isSubmittingPackage.set(false);
        if (this.selectedProductPackage()?.id === currentPkg.id) {
          this.selectedProductPackage.set(updatedPkg);
        }
        if (this.activeWorkspacePackage()?.id === currentPkg.id) {
          this.activeWorkspacePackage.set(updatedPkg);
        }
        this.closeEditProductPackageModal();
        this.packageService.loadAllPackages().subscribe();
        this.packageService.loadSummary().subscribe();
      },
      error: (err) => {
        console.error('Failed to update package:', err);
        this.isSubmittingPackage.set(false);
        alert(err.message || 'Failed to update package.');
      },
    });
  }

  getTasksCountForPkg(pkg: ProductPackage): number {
    return this.taskService.tasks().filter((t) => isTaskForPackage(t, pkg.name, this.packageService.packages(), pkg.productId)).length;
  }

  openPackageWorkspace(pkg: ProductPackage): void {
    this.selectedProductPackage.set(pkg);
    this.activeWorkspacePackage.set(pkg);
    this.activeDepartment.set(null);
    this.activeOperationTab.set('');
    this.scrollToPageTop();
    this.fetchAuditLogs();
    this.taskService.loadTasks();
  }

  closePackageWorkspace(): void {
    this.activeWorkspacePackage.set(null);
    this.activeDepartment.set(null);
    this.activeOperationTab.set('PACKAGES');
    this.scrollToPageTop();
  }

  onBreadcrumbBack(): void {
    const currentDept = this.activeDepartment();
    const currentTab = this.activeOperationTab();

    if (
      currentDept === 'ANALYTICS' &&
      currentTab &&
      currentTab !== 'ANALYTICS_OVERVIEW' &&
      currentTab !== 'OVERVIEW' &&
      currentTab !== 'MANAGEMENT'
    ) {
      this.selectOperationTab('ANALYTICS_OVERVIEW');
      return;
    }
    if (
      currentDept === 'DIGITAL_MARKETING' &&
      currentTab &&
      currentTab !== 'MARKETING_OVERVIEW'
    ) {
      this.selectOperationTab('MARKETING_OVERVIEW');
      return;
    }
    if (currentDept) {
      this.backToPackageHub();
      return;
    }
    if (this.activeWorkspacePackage()) {
      this.closePackageWorkspace();
      return;
    }
    this.router.navigate(['/dashboard']);
  }

  getOperationTabLabel(tabId: string): string {
    switch (tabId) {
      case 'CAMPAIGNS':
        return 'Campaigns';
      case 'ADS':
        return 'Ads Metrics';
      case 'LEADS':
        return 'Leads';
      case 'MARKETING_OVERVIEW':
        return 'Overview';
      case 'ANALYTICS_OVERVIEW':
        return 'Overview';
      case 'TRANSACTIONS':
        return 'Transactions';
      case 'REPORTS':
        return 'Reports';
      case 'AUDITS':
        return 'Audit Logs';
      case 'TELECALLER_MEMBERS':
        return 'Telecaller Details';
      case 'TELECALLING':
        return 'Telecalling';
      case 'TARGETS':
        return 'Targets';
      case 'TASKS':
        return 'Tasks';
      case 'WORKS':
        return 'Works';
      default:
        return tabId;
    }
  }

  openPackageDetailsModal(pkg: ProductPackage): void {
    this.selectedProductPackage.set(pkg);
    this.isPackageDetailModalOpen.set(true);
  }

  closePackageDetailsModal(): void {
    this.isPackageDetailModalOpen.set(false);
  }

  viewPackageTasksFromModal(pkg?: ProductPackage | null): void {
    const targetPkg = pkg || this.selectedProductPackage();
    this.closePackageDetailsModal();
    if (targetPkg) {
      this.openPackageWorkspace(targetPkg);
    }
  }

  deleteProductPackage(pkg: ProductPackage, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!this.canDeletePackage()) {
      alert('Only administrators are authorized to delete packages.');
      return;
    }
    if (!confirm(`Are you sure you want to delete package "${pkg.name}"?`)) {
      return;
    }
    this.packageService.deletePackage(pkg.id).subscribe({
      next: () => {
        if (this.selectedProductPackage()?.id === pkg.id) {
          this.closePackageDetailsModal();
        }
        if (this.activeWorkspacePackage()?.id === pkg.id) {
          this.closePackageWorkspace();
        }
      },
      error: (err) => {
        console.error('Failed to delete package:', err);
        alert(err.message || 'Failed to delete package.');
      },
    });
  }

  async fetchAuditLogs(): Promise<void> {
    try {
      const res = await safeFetch('/api/audit-logs');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          this.auditLogs.set(data);
        }
      }
    } catch (e) {
      console.log('Error fetching audit logs:', e);
    }
  }

  selectPackage(pkgName: string): void {
    this.activePackageName.set(pkgName);
    const selectedProduct = this.availablePackages.find(
      (product) => product.name.toLowerCase() === pkgName.toLowerCase()
    );
    if (selectedProduct) {
      this.loadProductHeroBanner(selectedProduct.id);
    }
    this.activeWorkspacePackage.set(null);
    this.activeOperationTab.set('PACKAGES');
    this.scrollToPageTop();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { package: pkgName },
      queryParamsHandling: 'merge',
    });
    this.fetchAuditLogs();
    this.taskService.loadTasks();
    this.packageService.loadAllPackages().subscribe();
  }

  private scrollToPageTop(): void {
    if (typeof window === 'undefined') return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        document.querySelector<HTMLElement>('.mo-main-content')?.scrollTo({
          top: 0,
          left: 0,
          behavior: 'auto',
        });
      });
    });
  }

  onHeroBannerSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.heroBannerError.set('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.heroBannerError.set('The banner image must be 10 MB or smaller.');
      return;
    }

    this.heroBannerError.set(null);
    const productId = this.activePackageMeta().id;
    const reader = new FileReader();
    reader.onerror = () => {
      this.heroBannerError.set('The selected banner image could not be read.');
    };
    reader.onload = () => {
      const image = typeof reader.result === 'string' ? reader.result : '';
      if (!image) {
        this.heroBannerError.set('The selected banner image could not be read.');
        return;
      }

      this.isSavingHeroBanner.set(true);
      this.packageService.updateProductHeroBanner(productId, image, file.name).subscribe({
        next: (banner) => {
          this.productHeroBanners.update((banners) => ({
            ...banners,
            [banner.productId]: this.formatAssetUrl(banner.imageUrl),
          }));
          this.isSavingHeroBanner.set(false);
        },
        error: (err) => {
          console.error('Failed to update product hero banner:', err);
          this.heroBannerError.set(
            err.error?.error ||
              `Failed to save the banner${err.status ? ` (HTTP ${err.status})` : ''}. Please try again.`
          );
          this.isSavingHeroBanner.set(false);
        },
      });
    };
    reader.readAsDataURL(file);
  }

  private loadProductHeroBanner(productId: string): void {
    this.packageService.loadProductHeroBanner(productId).subscribe({
      next: (banner) => {
        if (banner?.imageUrl) {
          this.productHeroBanners.update((banners) => ({
            ...banners,
            [productId]: this.formatAssetUrl(banner.imageUrl),
          }));
        }
      },
      error: (err) => {
        console.error(`Failed to load hero banner for ${productId}:`, err);
      },
    });
  }

  onPackageSelectChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (target && target.value) {
      this.selectPackage(target.value);
    }
  }

  selectOperationTab(tabId: string): void {
    const depts = this.operationDepartments();
    for (const dept of depts) {
      if (dept.tabs.some((t) => t.id === tabId)) {
        this.activeDepartment.set(dept.id);
        break;
      }
    }

    this.activeOperationTab.set(tabId);
    if (tabId === 'TASKS') {
      this.pkgTaskView.set('all');
    }
    if (tabId === 'AUDITS' || tabId === 'REPORTS' || tabId === 'TASKS') {
      this.fetchAuditLogs();
      this.taskService.loadTasks();
    }
  }

  switchPkgTaskView(view: 'my' | 'all' | 'designers'): void {
    this.pkgTaskView.set(view);
  }

  onTaskBriefFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.createdBriefFile.set(file);
      this.createdBriefFileName.set(file.name);

      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        this.createdBriefDataUrl.set((e.target?.result as string) || '');
      };
      reader.readAsDataURL(file);

      if (
        file.type.startsWith('text/') ||
        file.name.endsWith('.txt') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.csv') ||
        file.name.endsWith('.html') ||
        file.name.endsWith('.doc') ||
        file.name.endsWith('.docx')
      ) {
        const textReader = new FileReader();
        textReader.onload = (e: ProgressEvent<FileReader>) => {
          this.createdBriefContent.set((e.target?.result as string) || '');
        };
        textReader.readAsText(file);
      } else {
        this.createdBriefContent.set(`Document File: ${file.name}\nFile Size: ${(file.size / 1024).toFixed(1)} KB\nFile Type: ${file.type || 'Binary'}`);
      }
    }
  }

  clearTaskBriefFile(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.createdBriefFile.set(null);
    this.createdBriefFileName.set('');
    this.createdBriefDataUrl.set('');
    this.createdBriefContent.set('');
    const input = document.getElementById('briefFileInput') as HTMLInputElement;
    if (input) input.value = '';
  }

  openDocViewer(event: Event, url?: string, name?: string, content?: string): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const docName = name || 'Content Document';
    const docUrl = url && url !== '#' ? url : '';
    const docContent = content || 'Document brief details and specifications for this creative task.';

    this.activeDocName.set(docName);
    this.activeDocUrl.set(docUrl);
    this.activeDocContent.set(docContent);
    this.isDocViewerOpen.set(true);
  }

  closeDocViewer(): void {
    this.isDocViewerOpen.set(false);
  }

  formatAssetUrl(url?: string): string {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const base = getBackendBaseUrl();
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return `${base}${cleanUrl}`;
  }

  downloadAsset(event: Event, url?: string, filename?: string): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!url) return;
    const resolvedUrl = this.formatAssetUrl(url);
    const link = document.createElement('a');
    link.href = resolvedUrl;
    link.download = filename || 'downloaded-asset';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  getAuditLogTaskTitle(log: any): string {
    if (!log) return '';
    if (log.taskTitle) return log.taskTitle;
    if (log.targetTask?.title) return log.targetTask.title;


    const allTasks = this.taskService.tasks();
    const candidateId = String(log.taskId || log.entityId || '').trim();
    const foundTask = allTasks.find(
      (t) =>
        String(t.id).trim() === candidateId ||
        t.title.toLowerCase().trim() === candidateId.toLowerCase()
    );
    if (foundTask?.title) return foundTask.title;


    let state = log.newState;
    if (typeof state === 'string') {
      try {
        state = JSON.parse(state);
      } catch {}
    }
    if (state?.title) return state.title;


    let prevState = log.previousState;
    if (typeof prevState === 'string') {
      try {
        prevState = JSON.parse(prevState);
      } catch {}
    }
    if (prevState?.title) return prevState.title;

    return log.entityId || 'Task Work';
  }

  getAuditLogCreator(log: any): { name: string; email: string; role: string } {
    if (!log) return { name: 'System Administrator', email: 'admin@markops.io', role: 'ADMINISTRATOR' };

    if (log.creatorName) {
      return {
        name: log.creatorName,
        email: log.creatorEmail || 'admin@markops.io',
        role: log.creatorRole || 'ADMINISTRATOR',
      };
    }

    if (log.targetTask) {
      return {
        name: this.getCreatorName(log.targetTask),
        email: this.getCreatorEmail(log.targetTask),
        role: this.getCreatorRoleLabel(log.targetTask),
      };
    }

    const allTasks = this.taskService.tasks();
    const candidateId = String(log.taskId || log.entityId || '').trim();
    const foundTask = allTasks.find(
      (t) =>
        String(t.id).trim() === candidateId ||
        t.title.toLowerCase().trim() === candidateId.toLowerCase()
    );
    if (foundTask) {
      return {
        name: this.getCreatorName(foundTask),
        email: this.getCreatorEmail(foundTask),
        role: this.getCreatorRoleLabel(foundTask),
      };
    }

    const email = log.actorEmail || 'admin@markops.io';
    const user = this.userService.users().find((u) => u.email.toLowerCase() === email.toLowerCase());
    return {
      name: user?.fullName || (email.includes('@') ? email.split('@')[0] : email),
      email: email,
      role: user?.role || 'ADMINISTRATOR',
    };
  }

  getAuditLogAssignee(log: any): string {
    if (!log) return '—';

    if (log.assigneeName) {
      return log.assigneeName;
    }

    if (log.targetTask) {
      return this.getAssigneeName(log.targetTask);
    }

    const allTasks = this.taskService.tasks();
    const candidateId = String(log.taskId || log.entityId || '').trim();
    const foundTask = allTasks.find(
      (t) =>
        String(t.id).trim() === candidateId ||
        t.title.toLowerCase().trim() === candidateId.toLowerCase()
    );
    if (foundTask) {
      return this.getAssigneeName(foundTask);
    }

    let state = log.newState;
    if (typeof state === 'string') {
      try {
        state = JSON.parse(state);
      } catch {}
    }
    if (state?.assignedTo) {
      const user = this.userService.users().find((u) => String(u.id) === String(state.assignedTo));
      if (user?.fullName) return user.fullName;
    }

    return log.isTask ? 'Assigned Designer' : '—';
  }

  getTaskFromLog(log: any): Task | null {
    if (!log) return null;
    let targetTask: Task | null = log?.targetTask || log?.taskObj || null;
    if (!targetTask && log?.taskId) {
      targetTask = this.taskService.tasks().find((t) => String(t.id).trim() === String(log.taskId).trim()) || null;
    }
    if (!targetTask && log?.entityId) {
      targetTask =
        this.taskService.tasks().find(
          (t) =>
            String(t.id).trim() === String(log.entityId).trim() ||
            t.title.toLowerCase().trim() === String(log.entityId).toLowerCase().trim()
        ) || null;
    }
    return targetTask;
  }

  getTaskFileInfo(task: Task | null): { hasFile: boolean; fileName: string; fileUrl: string; fileContent?: string; isPdf?: boolean } | null {
    if (!task) return null;

    if (task.attachmentName || task.attachmentUrl) {
      const fileName = task.attachmentName || (task.title ? `${task.title.toLowerCase()}-brief.pdf` : 'Requirement_Document.pdf');
      const fileUrl = task.attachmentUrl || '';
      const cleanLower = (fileName + ' ' + fileUrl).toLowerCase();
      const isPdf = cleanLower.includes('.pdf') || fileUrl.startsWith('data:application/pdf');
      return {
        hasFile: true,
        fileName,
        fileUrl,
        fileContent: task.content,
        isPdf,
      };
    }

    if (task.versions && task.versions.length > 0) {
      const latestVer = task.versions[task.versions.length - 1];
      const fileName = latestVer.fileName || 'Deliverable.pdf';
      const fileUrl = latestVer.filePath || '';
      const cleanLower = (fileName + ' ' + fileUrl).toLowerCase();
      const isPdf = cleanLower.includes('.pdf') || fileUrl.startsWith('data:application/pdf');
      return {
        hasFile: true,
        fileName,
        fileUrl,
        fileContent: latestVer.fileContent,
        isPdf,
      };
    }

    if (task.content) {
      return {
        hasFile: true,
        fileName: `${task.title || 'Task'}_Brief.txt`,
        fileUrl: '',
        fileContent: task.content,
        isPdf: false,
      };
    }

    return null;
  }

  getAuditLogTaskFile(log: any): { hasFile: boolean; fileName: string; fileUrl: string; fileContent?: string; isPdf?: boolean } | null {
    const task = this.getTaskFromLog(log);
    return this.getTaskFileInfo(task);
  }

  async openTaskFileFromAudit(log: any, event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    let targetTask = this.getTaskFromLog(log);

    if (!targetTask && log?.entityId) {
      try {
        const res = await safeFetch(`/api/tasks/${log.entityId}`);
        if (res.ok) {
          targetTask = await res.json();
        }
      } catch (e) {
        console.warn('Error fetching task for file preview:', e);
      }
    }

    if (targetTask) {
      const fileInfo = this.getTaskFileInfo(targetTask);
      if (fileInfo && (fileInfo.fileUrl || fileInfo.fileName || fileInfo.fileContent)) {
        this.openDocViewer(
          event || new Event('click'),
          fileInfo.fileUrl,
          fileInfo.fileName,
          fileInfo.fileContent
        );
        return;
      }
    }

    this.openTaskAuditModal(log, event);
  }

  onPreviewTaskDocFromMatrix(data: { task: any; event: MouseEvent }): void {
    if (data.task) {
      const fileInfo = this.getTaskFileInfo(data.task);
      if (fileInfo && (fileInfo.fileUrl || fileInfo.fileName || fileInfo.fileContent)) {
        this.openDocViewer(
          data.event,
          fileInfo.fileUrl,
          fileInfo.fileName,
          fileInfo.fileContent
        );
        return;
      }
      this.openTaskAuditModal(data.task, data.event);
    }
  }

  async openTaskAuditModal(log: any, event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!this.canViewTaskAudit()) return;

    let targetTask: Task | null = this.getTaskFromLog(log);

    if (!targetTask && log?.entityId) {
      try {
        this.isLoadingAuditTask.set(true);
        const res = await safeFetch(`/api/tasks/${log.entityId}`);
        if (res.ok) {
          targetTask = await res.json();
        }
      } catch (e) {
        console.warn('Error fetching task audit record:', e);
      } finally {
        this.isLoadingAuditTask.set(false);
      }
    }

    if (!targetTask) {
      const resolvedTitle = this.getAuditLogTaskTitle(log);
      targetTask = {
        id: String(log?.taskId || log?.entityId || '1'),
        title: resolvedTitle,
        packageName: this.activePackageName(),
        description: 'Package creative design task record.',
        status: (log?.newState?.status || 'APPROVED') as TaskStatus,
        priority: 'HIGH',
        createdBy: log?.actorId || '1',
        creatorName: log?.actorEmail ? log.actorEmail.split('@')[0] : 'System Administrator',
        creatorEmail: log?.actorEmail || 'admin@markops.io',
        assigneeName: 'Assigned Designer',
        dueDate: new Date().toISOString().split('T')[0],
        progressPercent: computeTaskProgressPercent(log?.newState?.status || 'APPROVED'),
        createdAt: log?.createdAt || new Date().toISOString(),
        updatedAt: log?.createdAt || new Date().toISOString(),
      };
    } else {
      targetTask = {
        ...targetTask,
        progressPercent: computeTaskProgressPercent(targetTask.status, targetTask.progressPercent),
      };
    }

    this.selectedAuditTask.set(targetTask);
    this.isTaskAuditModalOpen.set(true);
  }

  closeTaskAuditModal(): void {
    this.isTaskAuditModalOpen.set(false);
    this.selectedAuditTask.set(null);
  }

  openTaskFromAudit(task: Task): void {
    this.closeTaskAuditModal();
    this.openTaskDetailModal(task);
  }

  getCreatorName(task: Task | null): string {
    if (!task) return 'System Administrator';
    if (task.creatorName) return task.creatorName;
    const user = this.userService.users().find((u) => String(u.id) === String(task.createdBy));
    if (user?.fullName) return user.fullName;
    return 'System Administrator';
  }

  getCreatorRoleLabel(task: Task | null): string {
    if (!task) return 'ADMINISTRATOR';
    if (task.creatorRole) return task.creatorRole;
    const user = this.userService.users().find((u) => String(u.id) === String(task.createdBy));
    return user?.role || 'ADMINISTRATOR';
  }

  getCreatorEmail(task: Task | null): string {
    if (!task) return 'admin@markops.io';
    if (task.creatorEmail) return task.creatorEmail;
    const user = this.userService.users().find((u) => String(u.id) === String(task.createdBy));
    return user?.email || 'admin@markops.io';
  }

  getAssigneeName(task: Task | null): string {
    if (!task) return 'Assigned Designer';
    if (task.assigneeName) return task.assigneeName;
    const user = this.userService.users().find((u) => String(u.id) === String(task.assignedTo));
    if (user?.fullName) return user.fullName;
    return 'Assigned Designer';
  }

  getAssigneeEmail(task: Task | null): string {
    if (!task) return 'designer@markops.io';
    const user = this.userService.users().find((u) => String(u.id) === String(task.assignedTo));
    if (user?.email) return user.email;
    return `${(task.assigneeName || 'designer').toLowerCase().replace(/\s+/g, '.')}@markops.io`;
  }

  getLifecycleJourney(task: Task | null): {
    stepNumber: number;
    stage: string;
    fromStatus: string;
    toStatus: string;
    actorName: string;
    actorRole: string;
    timestamp: string;
    remarks: string;
  }[] {
    if (!task) return [];

    const creatorName = this.getCreatorName(task);
    const creatorRole = this.getCreatorRoleLabel(task);
    const designerName = this.getAssigneeName(task);

    const history = task.statusHistory || [];
    const steps: any[] = [];


    const initialAssignment = history.find(
      (h) => h.newStatus === 'ASSIGNED' && (!h.previousStatus || h.previousStatus === 'ASSIGNED')
    );


    steps.push({
      stepNumber: 1,
      stage: 'Task Creation & Assignment',
      fromStatus: 'CREATED',
      toStatus: 'ASSIGNED',
      actorName: initialAssignment?.actorName || creatorName,
      actorRole: initialAssignment?.actorRole || creatorRole,
      timestamp: initialAssignment?.createdAt || task.createdAt || new Date().toISOString(),
      remarks: initialAssignment?.remark || `Task created for package "${task.packageName || this.activePackageName()}" and assigned to ${designerName}.`,
    });


    const validHistoryTransitions = history.filter((h) => {
      if (h === initialAssignment) return false;

      if (h.newStatus === 'ASSIGNED' && (!h.previousStatus || h.previousStatus === 'ASSIGNED')) {
        return false;
      }

      if (h.previousStatus && h.previousStatus === h.newStatus) {
        return false;
      }
      return true;
    });


    validHistoryTransitions.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    let stepIdx = 2;
    if (validHistoryTransitions.length > 0) {
      validHistoryTransitions.forEach((h) => {
        let stageName = 'Status Updated';
        if (h.newStatus === 'IN_PROGRESS') stageName = ' Work Started';
        else if (h.newStatus === 'SUBMITTED' || h.newStatus === 'RESUBMITTED') stageName = 'Task Submitted';
        else if (h.newStatus === 'REDESIGN_REQUIRED' || h.newStatus === 'REVISION_REQUIRED') stageName = 'Redesign';
        else if (h.newStatus === 'APPROVED' || h.newStatus === 'COMPLETED' || h.newStatus === 'PUBLISHED') stageName = 'Design Approved';
        else if (h.newStatus === 'ACCEPTED') stageName = 'Task Accepted by Designer';

        const prevStep = steps[steps.length - 1];

        if (prevStep && prevStep.toStatus === h.newStatus) {
          return;
        }

        steps.push({
          stepNumber: stepIdx++,
          stage: stageName,
          fromStatus: h.previousStatus || prevStep?.toStatus || 'ASSIGNED',
          toStatus: h.newStatus,
          actorName: h.actorName || (h.newStatus === 'IN_PROGRESS' || h.newStatus === 'SUBMITTED' ? designerName : creatorName),
          actorRole: h.actorRole || (h.newStatus === 'IN_PROGRESS' || h.newStatus === 'SUBMITTED' ? 'DESIGNER' : creatorRole),
          timestamp: h.createdAt || task.updatedAt || task.createdAt,
          remarks: h.remark || (h.newStatus === 'APPROVED' ? 'Deliverable approved without further changes.' : (h.newStatus === 'IN_PROGRESS' ? 'Designer started working on deliverables.' : 'Status transition executed.')),
        });
      });
    } else {

      const status = task.status;
      if (status !== 'ASSIGNED' && status !== 'DRAFT') {
        if (status === 'IN_PROGRESS' || status === 'SUBMITTED' || status === 'APPROVED' || status === 'REDESIGN_REQUIRED' || status === 'COMPLETED') {
          steps.push({
            stepNumber: stepIdx++,
            stage: ' Work Started',
            fromStatus: 'ASSIGNED',
            toStatus: 'IN_PROGRESS',
            actorName: designerName,
            actorRole: 'DESIGNER',
            timestamp: task.updatedAt || task.createdAt,
            remarks: 'Designer accepted assignment and started design draft production.',
          });
        }
        if (status === 'SUBMITTED' || status === 'APPROVED' || status === 'REDESIGN_REQUIRED' || status === 'COMPLETED') {
          steps.push({
            stepNumber: stepIdx++,
            stage: 'Creative Deliverable Submitted',
            fromStatus: 'IN_PROGRESS',
            toStatus: 'SUBMITTED',
            actorName: designerName,
            actorRole: 'DESIGNER',
            timestamp: task.versions && task.versions.length > 0 ? task.versions[0].createdAt : (task.updatedAt || task.createdAt),
            remarks: task.versions && task.versions.length > 0 ? `Version v${task.versions[0].versionNumber}.0 uploaded (${task.versions[0].fileName})` : 'Designer submitted deliverable for review.',
          });
        }
        if (status === 'REDESIGN_REQUIRED') {
          steps.push({
            stepNumber: stepIdx++,
            stage: 'Redesign / Revision Requested',
            fromStatus: 'SUBMITTED',
            toStatus: 'REDESIGN_REQUIRED',
            actorName: creatorName,
            actorRole: creatorRole,
            timestamp: task.updatedAt || task.createdAt,
            remarks: task.reviewerFeedback || 'Changes requested on deliverable.',
          });
        }
        if (status === 'APPROVED' || status === 'COMPLETED') {
          steps.push({
            stepNumber: stepIdx++,
            stage: 'Design Approved & Finalized',
            fromStatus: 'SUBMITTED',
            toStatus: 'APPROVED',
            actorName: creatorName,
            actorRole: creatorRole,
            timestamp: task.updatedAt || task.createdAt,
            remarks: 'Quality verified and design approved for digital deployment.',
          });
        }
      }
    }

    return steps;
  }

  openCreateTaskModal(): void {
    this.createdBriefFile.set(null);
    this.createdBriefFileName.set('');
    this.createdBriefDataUrl.set('');
    this.createdBriefContent.set('');
    const firstDesigner = this.realDesignersList()[0]?.id || '';
    this.createTaskForm.reset({
      title: '',
      description: '',
      assignedTo: firstDesigner,
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    });
    this.isCreateTaskModalOpen.set(true);
  }

  closeCreateTaskModal(): void {
    this.isCreateTaskModalOpen.set(false);
    this.createdBriefFile.set(null);
    this.createdBriefFileName.set('');
    this.createdBriefDataUrl.set('');
    this.createdBriefContent.set('');
  }

  async onSubmitCreateTask(): Promise<void> {
    if (this.createTaskForm.invalid) return;
    const formVal = this.createTaskForm.value;
    const activePkg = this.currentFilterTarget();
    const selectedDesigner = this.realDesignersList().find((d) => d.id === formVal.assignedTo);
    const currentUser = this.authService.currentUser();

    const fileName = this.createdBriefFileName();
    const dataUrl = this.createdBriefDataUrl();
    const fileContent = this.createdBriefContent();

    const currentUserId = currentUser?.id || '1';
    const currentUserName = currentUser?.fullName || (currentUser?.role === 'BDM' ? 'Business Development Manager' : 'System Administrator');
    const currentUserRole = currentUser?.role || 'ADMINISTRATOR';
    const currentUserEmail = currentUser?.email || (currentUser?.role === 'BDM' ? 'bdm@markops.io' : 'admin@markops.io');

    const ws = this.activeWorkspacePackage();
    const pkgMeta = this.activePackageMeta();
    const activeProdId = ws ? ws.productId : pkgMeta.id;
    const activeProdName = ws ? this.getProductNameForPackage(ws) : pkgMeta.name;

    const payload = {
      ...formVal,
      packageName: activePkg,
      productId: activeProdId,
      productName: activeProdName,
      creatorId: currentUserId,
      creatorName: currentUserName,
      creatorRole: currentUserRole,
      creatorEmail: currentUserEmail,
      assigneeName: selectedDesigner ? selectedDesigner.name : 'Assigned Designer',
      attachmentName: fileName || (this.createdBriefFile() ? this.createdBriefFile()!.name : ''),
      attachmentUrl: dataUrl || (fileName ? `/uploads/briefs/${fileName}` : ''),
      content: fileContent || formVal.description || `Task brief details for ${activePkg} package.`,
    };

    const created = await this.taskService.createTask(payload);
    if (created) {
      this.fetchAuditLogs();
      this.activeOperationTab.set('TASKS');
      this.taskService.switchView('my');
      this.closeCreateTaskModal();
    }
  }

  openTaskDetailModal(task: Task, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.selectedTask.set(task);
    this.activeDetailTab.set('BRIEF');
    this.isTaskDetailModalOpen.set(true);
  }

  closeTaskDetailModal(): void {
    this.isTaskDetailModalOpen.set(false);
    this.selectedTask.set(null);
  }

  async deleteTask(event: Event, task: Task): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    if (!this.canDeleteTask(task)) {
      alert('Permission Denied: You can only delete tasks created by you.');
      return;
    }
    if (confirm(`Are you sure you want to delete task "${task.title}"? This action is permanent and cannot be undone.`)) {
      const success = await this.taskService.deleteTask(task.id);
      if (success) {
        if (this.selectedTask()?.id === task.id) {
          this.closeTaskDetailModal();
        }
      } else {
        alert(this.taskService.error() || 'Failed to delete task.');
      }
    }
  }

  async acceptTask(task: Task, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    const success = await this.taskService.transitionStatus(task.id, 'ACCEPTED', 'Designer accepted task and reviewed creative specs.');
    if (success) {
      this.refreshSelectedTask(task.id);
    }
  }

  async startWork(task: Task, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    const success = await this.taskService.transitionStatus(task.id, 'IN_PROGRESS', 'Designer started active canvas work.');
    if (success) {
      this.refreshSelectedTask(task.id);
    }
  }

  openUploadModal(task: Task, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedTask.set(task);
    this.selectedUploadFile.set(null);
    this.selectedUploadDataUrl.set('');
    this.selectedUploadContent.set('');
    this.uploadForm.reset({
      fileName: '',
      changelog: '',
      fileSizeMb: 0,
    });
    const el = document.getElementById('pkgCreativeFileInput') as HTMLInputElement;
    if (el) el.value = '';
    this.isUploadModalOpen.set(true);
  }

  closeUploadModal(): void {
    this.isUploadModalOpen.set(false);
    this.selectedUploadFile.set(null);
    this.selectedUploadDataUrl.set('');
    this.selectedUploadContent.set('');
  }

  onUploadFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.selectedUploadFile.set(file);
      const sizeMb = Number((file.size / (1024 * 1024)).toFixed(2));
      this.uploadForm.patchValue({
        fileName: file.name,
        fileSizeMb: sizeMb > 0 ? sizeMb : 0.5,
      });

      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        this.selectedUploadDataUrl.set((e.target?.result as string) || '');
      };
      reader.readAsDataURL(file);

      if (
        file.type.startsWith('text/') ||
        file.name.endsWith('.txt') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.csv') ||
        file.name.endsWith('.html')
      ) {
        const textReader = new FileReader();
        textReader.onload = (e: ProgressEvent<FileReader>) => {
          this.selectedUploadContent.set((e.target?.result as string) || '');
        };
        textReader.readAsText(file);
      } else {
        this.selectedUploadContent.set(`Creative Asset: ${file.name}\nFile Size: ${(file.size / 1024).toFixed(1)} KB\nType: ${file.type || 'Binary'}`);
      }
    }
  }

  async onSubmitUpload(): Promise<void> {
    if (this.uploadForm.invalid) return;
    const task = this.selectedTask();
    if (!task) return;

    const { fileName, changelog, fileSizeMb } = this.uploadForm.value;
    const dataUrl = this.selectedUploadDataUrl();
    const content = this.selectedUploadContent();

    const success = await this.taskService.submitCreativeVersion(task.id, {
      fileName,
      changelog,
      fileSize: Math.round((fileSizeMb || 2) * 1024 * 1024),
      filePath: dataUrl || `/uploads/creatives/${fileName}`,
      fileContent: content || changelog,
    });

    if (success) {
      this.refreshSelectedTask(task.id);
      this.closeUploadModal();
    }
  }

  openRevisionModal(task: Task, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedTask.set(task);
    this.revisionForm.reset({ remark: '' });
    this.isRevisionModalOpen.set(true);
  }

  closeRevisionModal(): void {
    this.isRevisionModalOpen.set(false);
  }

  parseBulletPoints(text: string | null | undefined): string[] {
    if (!text) return [];
    let clean = String(text).trim();
    while ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
      clean = clean.slice(1, -1).trim();
    }
    if (!clean) return [];

    let rawParts: string[] = [];
    if (clean.includes('\n')) {
      rawParts = clean.split('\n');
    } else if (clean.includes('•')) {
      rawParts = clean.split('•');
    } else {
      rawParts = [clean];
    }

    const items: string[] = [];
    for (const part of rawParts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes('•')) {
        const sub = trimmed.split('•').map((s) => s.trim()).filter(Boolean);
        items.push(...sub);
      } else {
        const cleanedItem = trimmed.replace(/^[\-\*]\s*/, '').trim();
        if (cleanedItem) items.push(cleanedItem);
      }
    }

    return items.length > 0 ? items : [clean];
  }

  getVersionDuration(task: Task | null, ver: TaskVersion): string {
    if (!task || !ver || !ver.createdAt) return '';

    const verTime = new Date(ver.createdAt).getTime();
    if (isNaN(verTime)) return '';

    if (task.statusHistory && task.statusHistory.length > 0) {
      const sortedHistory = [...task.statusHistory]
        .filter((h) => h.createdAt && !isNaN(new Date(h.createdAt).getTime()))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let lastStart: number | null = null;
      for (const h of sortedHistory) {
        const hTime = new Date(h.createdAt).getTime();
        if (hTime > verTime + 5000) break;

        if (h.newStatus === 'IN_PROGRESS') {
          lastStart = hTime;
        } else if (h.newStatus === 'SUBMITTED' && lastStart && Math.abs(hTime - verTime) < 15000) {
          return this.formatDurationMs(hTime - lastStart);
        }
      }

      if (lastStart && lastStart <= verTime) {
        return this.formatDurationMs(verTime - lastStart);
      }
    }


    if (task.versions && task.versions.length > 1) {
      const sortedVers = [...task.versions]
        .filter((v) => v.createdAt && !isNaN(new Date(v.createdAt).getTime()))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const curIdx = sortedVers.findIndex((v) => v.id === ver.id);
      if (curIdx > 0) {
        const prevTime = new Date(sortedVers[curIdx - 1].createdAt).getTime();
        if (verTime > prevTime) {
          return this.formatDurationMs(verTime - prevTime);
        }
      }
    }

    if (task.createdAt) {
      const taskCreatedTime = new Date(task.createdAt).getTime();
      if (!isNaN(taskCreatedTime) && verTime >= taskCreatedTime) {
        return this.formatDurationMs(verTime - taskCreatedTime);
      }
    }

    return '1 min';
  }

  formatDurationMs(diffMs: number): string {
    if (diffMs <= 0) return '1 min';
    if (diffMs < 60000) {
      const seconds = Math.max(1, Math.round(diffMs / 1000));
      return `${seconds}s`;
    }
    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes} min` : `${hours}h`;
    }
    return `${minutes} min`;
  }

  appendRevisionRemark(snippet: string): void {
    const current = (this.revisionForm.get('remark')?.value || '').trim();
    const cleanSnippet = snippet.replace(/^[•\-\*]\s*/, '').trim();
    const bulletText = `• ${cleanSnippet}`;
    const newVal = current ? `${current}\n${bulletText}` : bulletText;
    this.revisionForm.patchValue({ remark: newVal });
  }

  onRevisionRemarkKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const textarea = event.target as HTMLTextAreaElement;
      const { selectionStart, selectionEnd, value } = textarea;
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = value.substring(lineStart, selectionStart);
      if (currentLine.startsWith('• ') || currentLine.startsWith('- ')) {
        event.preventDefault();
        if (currentLine.trim() === '•' || currentLine.trim() === '-') {
          const newValue = value.substring(0, lineStart) + value.substring(selectionEnd);
          this.revisionForm.patchValue({ remark: newValue });
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = lineStart;
          }, 0);
          return;
        }
        const insert = '\n• ';
        const newValue = value.substring(0, selectionStart) + insert + value.substring(selectionEnd);
        this.revisionForm.patchValue({ remark: newValue });
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = selectionStart + insert.length;
        }, 0);
      }
    }
  }

  appendUploadChangelog(snippet: string): void {
    const current = (this.uploadForm.get('changelog')?.value || '').trim();
    const cleanSnippet = snippet.replace(/^[•\-\*]\s*/, '').trim();
    const bulletText = `• ${cleanSnippet}`;
    const newVal = current ? `${current}\n${bulletText}` : bulletText;
    this.uploadForm.patchValue({ changelog: newVal });
  }

  onUploadChangelogKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const textarea = event.target as HTMLTextAreaElement;
      const { selectionStart, selectionEnd, value } = textarea;
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = value.substring(lineStart, selectionStart);
      if (currentLine.startsWith('• ') || currentLine.startsWith('- ')) {
        event.preventDefault();
        if (currentLine.trim() === '•' || currentLine.trim() === '-') {
          const newValue = value.substring(0, lineStart) + value.substring(selectionEnd);
          this.uploadForm.patchValue({ changelog: newValue });
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = lineStart;
          }, 0);
          return;
        }
        const insert = '\n• ';
        const newValue = value.substring(0, selectionStart) + insert + value.substring(selectionEnd);
        this.uploadForm.patchValue({ changelog: newValue });
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = selectionStart + insert.length;
        }, 0);
      }
    }
  }

  triggerPackageUploadInput(): void {
    const el = document.getElementById('pkgCreativeFileInput') as HTMLInputElement;
    if (el) el.click();
  }

  clearPackageUploadFile(): void {
    this.selectedUploadFile.set(null);
    this.selectedUploadDataUrl.set('');
    this.selectedUploadContent.set('');
    this.uploadForm.patchValue({
      fileName: '',
      fileSizeMb: 0,
    });
    const el = document.getElementById('pkgCreativeFileInput') as HTMLInputElement;
    if (el) el.value = '';
  }

  isPdf(fileName: string | null | undefined): boolean {
    if (!fileName) return false;
    return fileName.toLowerCase().endsWith('.pdf');
  }

  async onSubmitRevision(): Promise<void> {
    if (this.revisionForm.invalid) return;
    const task = this.selectedTask();
    if (!task) return;

    const { remark } = this.revisionForm.value;

    const success = await this.taskService.transitionStatus(task.id, 'REVISION_REQUIRED', remark);
    if (success) {
      await this.taskService.addComment(task.id, `[CHANGE REQUEST]: ${remark}`);
      this.refreshSelectedTask(task.id);
      this.closeRevisionModal();
    }
  }

  async approveTask(task: Task, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    const success = await this.taskService.transitionStatus(task.id, 'APPROVED', 'Creative design approved by manager.');
    if (success) {
      this.refreshSelectedTask(task.id);
    }
  }

  async onSubmitAddComment(): Promise<void> {
    const text = this.newCommentText().trim();
    const task = this.selectedTask();
    if (!text || !task) return;

    const success = await this.taskService.addComment(task.id, text);
    if (success) {
      this.newCommentText.set('');
      this.refreshSelectedTask(task.id);
    }
  }

  private refreshSelectedTask(taskId: string): void {
    const found = this.taskService.tasks().find((t) => t.id === taskId);
    if (found) {
      this.selectedTask.set(found);
    }
  }

  getStatusBadgeClass(status: TaskStatus | string): string {
    switch (status) {
      case 'IN_PROGRESS': return 'badge-amber';
      case 'SUBMITTED':
      case 'RESUBMITTED':
      case 'UNDER_REVIEW': return 'badge-purple';
      case 'APPROVED':
      case 'COMPLETED':
      case 'PUBLISHED': return 'badge-green';
      case 'REVISION_REQUIRED':
      case 'REDESIGN_REQUIRED': return 'badge-danger';
      default: return 'badge-blue';
    }
  }

  getWorkflowSteps(task: Task) {
    const status = task.status;
    const versionCount = task.versions?.length || 0;

    let stage1State: 'completed' | 'current' | 'upcoming' = 'completed';
    let stage2State: 'completed' | 'current' | 'upcoming' = 'upcoming';
    let stage3State: 'completed' | 'current' | 'upcoming' = 'upcoming';
    let stage4State: 'completed' | 'current' | 'upcoming' | 'revision' = 'upcoming';

    if (status === 'DRAFT' || status === 'ASSIGNED') {
      stage1State = 'current';
    } else if (status === 'ACCEPTED' || status === 'IN_PROGRESS') {
      stage1State = 'completed';
      stage2State = 'current';
    } else if (status === 'SUBMITTED' || status === 'RESUBMITTED' || status === 'UNDER_REVIEW') {
      stage1State = 'completed';
      stage2State = 'completed';
      stage3State = 'current';
    } else if (status === 'REVISION_REQUIRED') {
      stage1State = 'completed';
      stage2State = 'completed';
      stage3State = 'completed';
      stage4State = 'revision';
    } else if (status === 'APPROVED' || status === 'PUBLISHED' || status === 'COMPLETED') {
      stage1State = 'completed';
      stage2State = 'completed';
      stage3State = 'completed';
      stage4State = 'completed';
    }

    return [
      {
        id: 1,
        title: 'Task Assigned',
        subtitle: status === 'ASSIGNED' ? 'Awaiting Acceptance' : 'Brief Received',
        icon: 'assignment_turned_in',
        state: stage1State,
      },
      {
        id: 2,
        title: 'Started',
        subtitle: status === 'IN_PROGRESS' ? 'Active Creative Work' : status === 'ACCEPTED' ? 'Task Accepted' : stage2State === 'completed' ? 'Canvas Complete' : 'Pending Start',
        icon: 'palette',
        state: stage2State,
      },
      {
        id: 3,
        title: 'Under Review',
        subtitle: versionCount > 0 ? `v${versionCount}.0 Submitted` : 'Awaiting Version',
        icon: 'unarchive',
        state: stage3State,
      },
      {
        id: 4,
        title: stage4State === 'revision' ? 'Revision Needed' : 'Completed',
        subtitle: stage4State === 'completed' ? 'Approved & Ready' : stage4State === 'revision' ? 'Feedback Requested' : 'Pending Review',
        icon: stage4State === 'revision' ? 'rate_review' : 'verified',
        state: stage4State,
      },
    ];
  }

  getHistoryNodeIcon(newStatus: TaskStatus): string {
    switch (newStatus) {
      case 'ASSIGNED': return 'assignment';
      case 'ACCEPTED': return 'task_alt';
      case 'IN_PROGRESS': return 'draw';
      case 'SUBMITTED':
      case 'RESUBMITTED': return 'upload_file';
      case 'UNDER_REVIEW': return 'find_in_page';
      case 'REVISION_REQUIRED': return 'rate_review';
      case 'APPROVED':
      case 'PUBLISHED':
      case 'COMPLETED': return 'verified';
      default: return 'history';
    }
  }

  getHistoryNodeClass(newStatus: TaskStatus): string {
    switch (newStatus) {
      case 'ACCEPTED':
      case 'APPROVED':
      case 'PUBLISHED':
      case 'COMPLETED': return 'node-success';
      case 'REVISION_REQUIRED': return 'node-danger';
      case 'SUBMITTED':
      case 'RESUBMITTED':
      case 'UNDER_REVIEW': return 'node-primary';
      case 'IN_PROGRESS': return 'node-warning';
      default: return 'node-info';
    }
  }
}
