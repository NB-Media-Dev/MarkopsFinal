function isSafeViewerUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('vbscript:')) return false;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('/');
}

import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TaskManagementService } from '../../../core/services/task-management.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { UserManagementService } from '../../../core/services/user-management.service';
import { Task, TaskStatus, TaskPriority, TaskVersion, computeTaskProgressPercent } from '../../../core/models/task.model';
import { getApiUrl, getBackendBaseUrl } from '../../../core/utils/api-url.utils';
import { PackageService } from '../../../core/services/package.service';
import { resolveTaskProductAndPackage } from '../../../core/models/package.model';
import { UploadDesignModalComponent } from '../components/modals/upload-design-modal/upload-design-modal.component';

type WorkflowStepState = 'completed' | 'current' | 'upcoming';
type WorkflowFinalStepState = WorkflowStepState | 'revision';

@Component({
  selector: 'app-task-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, UploadDesignModalComponent],
  templateUrl: './task-detail.component.html',
  styleUrl: './task-detail.component.scss',
})
export class TaskDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly fb = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);

  readonly taskService = inject(TaskManagementService);
  readonly authService = inject(AuthService);
  readonly userService = inject(UserManagementService);
  readonly notifService = inject(NotificationService);
  readonly packageService = inject(PackageService);

  readonly task = signal<Task | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly activeTab = signal<'DETAIL' | 'VERSIONS' | 'HISTORY'>('DETAIL');
  readonly returnUrl = signal<string>('');

  readonly isDesignerRole = computed<boolean>(() => {
    return this.authService.currentUser()?.role === 'DESIGNER';
  });

  readonly resolvedScope = computed<{ productName: string; packageName: string }>(() => {
    let prodFromUrl = '';
    let pkgFromUrl = '';
    const ret = this.returnUrl();
    if (ret) {
      try {
        const url = new URL(ret, 'http://localhost');
        prodFromUrl = url.searchParams.get('package') || url.searchParams.get('product') || '';
        pkgFromUrl = url.searchParams.get('workspace') || url.searchParams.get('packageFilter') || '';
      } catch {}
    }

    const t = this.task();
    if (!t) return { productName: prodFromUrl || 'Careermate', packageName: pkgFromUrl || 'Test' };
    const packages = this.packageService.packages();
    const scope = resolveTaskProductAndPackage(t, packages);
    return {
      productName: prodFromUrl || scope.productName || t.productName || 'Careermate',
      packageName: pkgFromUrl || scope.packageName || t.packageName || 'Test',
    };
  });

  readonly resolvedDeptCode = computed<string>(() => {
    const ret = this.returnUrl();
    if (ret) {
      try {
        const url = new URL(ret, 'http://localhost');
        const deptParam = url.searchParams.get('dept');
        if (deptParam) {
          return deptParam.toUpperCase();
        }
      } catch {}
    }
    const t = this.task();
    const role = (t?.creatorRole || '').toUpperCase();
    if (role.includes('MARKETING')) return 'DIGITAL_MARKETING';
    if (role.includes('TELECALL')) return 'TELECALLING';
    if (role.includes('ANALYT')) return 'ANALYTICS';
    return 'DESIGNER';
  });

  readonly resolvedDept = computed<string>(() => {
    const code = this.resolvedDeptCode();
    if (code === 'DESIGNER') return 'Designer';
    if (code === 'DIGITAL_MARKETING') return 'Digital Marketing';
    if (code === 'TELECALLING') return 'Telecalling';
    if (code === 'ANALYTICS') return 'Analytics';
    return 'Designer';
  });

  goToProduct(event?: Event): void {
    if (event) event.preventDefault();
    const scope = this.resolvedScope();
    this.router.navigate(['/package-works'], {
      queryParams: { package: scope.productName || 'Careermate' },
    });
  }

  goToAvailablePackage(event?: Event): void {
    this.goToProduct(event);
  }

  goToDepartmentOperations(event?: Event): void {
    if (event) event.preventDefault();
    const scope = this.resolvedScope();
    this.router.navigate(['/package-works'], {
      queryParams: scope.packageName
        ? { package: scope.productName || 'Careermate', workspace: scope.packageName }
        : { package: scope.productName || 'Careermate', workspace: 'Test' },
    });
  }

  goToDesignerDepartment(event?: Event): void {
    if (event) event.preventDefault();
    const ret = this.returnUrl();
    if (ret && ret !== this.router.url) {
      this.router.navigateByUrl(ret);
      return;
    }
    const scope = this.resolvedScope();
    this.router.navigate(['/package-works'], {
      queryParams: {
        package: scope.productName || 'Careermate',
        workspace: scope.packageName || 'Test',
        dept: this.resolvedDeptCode(),
      },
    });
  }


  readonly isUploadModalOpen = signal<boolean>(false);
  readonly uploadForm: FormGroup = this.fb.group({
    fileName: ['', Validators.required],
    changelog: ['', [Validators.required, Validators.minLength(5)]],
    fileSizeMb: [0],
  });
  readonly selectedFileObject = signal<File | null>(null);
  readonly selectedFileDataUrl = signal<string>('');
  readonly selectedFileContent = signal<string>('');
  readonly uploadError = signal<string | null>(null);

  readonly isRedesignModalOpen = signal<boolean>(false);
  readonly redesignReason = signal<string>('');
  readonly isSubmittingRedesign = signal<boolean>(false);

  readonly isDocViewerOpen = signal<boolean>(false);
  readonly docViewerUrl = signal<SafeResourceUrl | null>(null);
  readonly docViewerRawUrl = signal<string>('');
  readonly docViewerTitle = signal<string>('');
  readonly docViewerContent = signal<string>('');

  readonly isImageViewerOpen = signal<boolean>(false);
  readonly imageViewerUrl = signal<string>('');
  readonly imageViewerTitle = signal<string>('');
  readonly deliverableAltText = computed<string>(() => {
    const title = this.imageViewerTitle();
    if (!title) return 'Deliverable preview';
    return title.replaceAll(/image/gi, 'preview').replaceAll(/photo/gi, 'preview');
  });

  readonly quickRedesignSnippets = [
    '• Revise typography hierarchy & font weights for better readability',
    '• Update color palette to align with brand guidelines',
    '• Add high-resolution product mockup images',
    '• Correct spacing, padding, and layout alignment',
    '• Enhance visual contrast for call-to-action buttons',
  ];

  readonly quickChangelogSnippets = [
    '• Updated color scheme to match brand style',
    '• Adjusted typography weights and line spacing',
    '• Exported high-res graphics (300 DPI)',
    '• Incorporated reviewer feedback from revision request',
  ];

  private notify(title: string, message: string, type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT' = 'INFO'): void {
    this.notifService.triggerToast({
      id: `toast_${Date.now()}`,
      userId: this.authService.currentUser()?.id || 'ALL',
      title,
      message,
      type,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  }

  async ngOnInit(): Promise<void> {
    this.route.queryParams.subscribe((params) => {
      const queryReturn = params['returnUrl'];
      if (queryReturn) {
        this.returnUrl.set(queryReturn);
      }
    });

    if (this.packageService.packages().length === 0) {
      this.packageService.loadAllPackages().subscribe();
    }

    const taskId = this.route.snapshot.paramMap.get('id');
    if (!taskId) {
      this.error.set('No Task ID specified in route.');
      this.isLoading.set(false);
      return;
    }

    await this.loadTaskData(taskId);
  }

  async loadTaskData(taskId: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      await this.taskService.selectTask(taskId);
      const sel = this.taskService.selectedTask();
      if (sel) {
        this.task.set(sel);
      } else {
      
        const res = await fetch(getApiUrl(`/api/tasks/${taskId}`));
        if (res.ok) {
          const data: Task = await res.json();
          this.task.set(data);
        } else {
          this.error.set(`Task #${taskId} not found or failed to load.`);
        }
      }
    } catch (err: any) {
      this.error.set(err?.message || 'Error loading task data.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async refreshTask(): Promise<void> {
    const cur = this.task();
    if (cur?.id) {
      await this.loadTaskData(cur.id);
      this.notify('Task Synchronized', 'Task details updated with database state.', 'INFO');
    }
  }

  goBack(): void {
    this.goToDesignerDepartment();
  }

  getShortId(id?: string): string {
    if (!id) return '';
    return id.length > 8 ? id.substring(0, 8) : id;
  }

  getCleanDescription(t: Task | null): string {
    if (!t?.description) return 'No description provided.';
    return t.description.replace(/^Requirement brief for.*?:/i, '').trim() || t.description;
  }

  hasCustomDescription(t: Task | null): boolean {
    if (!t?.description) return false;
    const clean = t.description.replace(/^Requirement brief for.*?:/i, '').trim();
    return clean.length > 0;
  }

  getCreatorName(t: Task | null): string {
    if (!t) return 'System Admin';
    return t.creatorName || 'System Admin';
  }

  getAssigneeName(t: Task | null): string {
    if (!t) return 'Unassigned';
    return t.assigneeName || 'Unassigned';
  }

  getAssigneeEmail(t: Task | null): string {
    if (!t) return '';
    const name = this.getAssigneeName(t);
    return `${name.toLowerCase().replace(/\s+/g, '.')}@markops.io`;
  }

  getAssigneeUser(t: Task | null): any {
    if (!t) return undefined;
    const assignedTo = String(t.assignedTo || '').trim().toLowerCase();
    const assigneeName = String(t.assigneeName || '').trim().toLowerCase();
    const users = this.userService.users();
    return users.find((u) => {
      const uId = String(u.id || '').trim().toLowerCase();
      const uEmail = String(u.email || '').trim().toLowerCase();
      const uName = String(u.fullName || '').trim().toLowerCase();
      return (
        (assignedTo && (uId === assignedTo || uEmail === assignedTo)) ||
        (assigneeName && (uName === assigneeName || uName.includes(assigneeName) || assigneeName.includes(uName)))
      );
    });
  }

  getAssigneeDisplayName(t: Task | null): string {
    const user = this.getAssigneeUser(t);
    if (user?.fullName) return user.fullName;
    const raw = t?.assigneeName;
    if (raw && raw !== 'Assigned Designer' && raw !== 'Assigned User' && raw !== 'Unassigned') {
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return 'Surya';
  }

  getAssigneeRole(t: Task | null): string {
    const user = this.getAssigneeUser(t);
    if (user?.department && user.department !== 'General') return user.department;
    if (user?.role === 'DESIGNER') return 'UIUX Designer';
    if (user?.role) return this.getRolePrefix(user.role);
    return 'UIUX Designer';
  }

  getAssigneeAvatarUrl(t: Task | null): string | undefined {
    const raw = this.getAssigneeUser(t)?.avatarUrl;
    return raw ? getApiUrl(raw) : undefined;
  }

  getAssigneeAvatarColor(t: Task | null): string {
    const name = this.getAssigneeDisplayName(t);
    const colors = ['#F59E0B', '#EA580C', '#D97706', '#7C3AED', '#2563EB', '#059669', '#0891B2'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = (name.codePointAt(i) || 0) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getAssigneeInitials(t: Task | null): string {
    const name = this.getAssigneeDisplayName(t);
    if (!name || name === 'Unassigned') return 'D';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + (parts.at(-1)?.[0] || "")).toUpperCase();
  }

  getCreatorUser(t: Task | null): any {
    if (!t) return undefined;
    const createdBy = String(t.createdBy || (t as any).created_by || '').trim().toLowerCase();
    const creatorEmail = String(t.creatorEmail || (t as any).creator_email || '').trim().toLowerCase();
    const creatorName = String(t.creatorName || '').trim().toLowerCase();
    const users = this.userService.users();
    return users.find((u) => {
      const uId = String(u.id || '').trim().toLowerCase();
      const uEmail = String(u.email || '').trim().toLowerCase();
      const uName = String(u.fullName || '').trim().toLowerCase();
      return (
        (createdBy && (uId === createdBy || uEmail === createdBy)) ||
        (creatorEmail && uEmail === creatorEmail) ||
        (creatorName && (uName === creatorName || uName.includes(creatorName) || creatorName.includes(uName)))
      );
    });
  }

  getCreatorAvatarUrl(t: Task | null): string | undefined {
    const raw = this.getCreatorUser(t)?.avatarUrl;
    return raw ? getApiUrl(raw) : undefined;
  }

  getCreatorAvatarColor(t: Task | null): string {
    const name = this.getCreatorName(t);
    const colors = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = (name.codePointAt(i) || 0) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getCreatorInitials(t: Task | null): string {
    const name = this.getCreatorName(t);
    if (!name) return 'A';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + (parts.at(-1)?.[0] || "")).toUpperCase();
  }

  getTaskProgress(t: Task | null): number {
    if (!t) return 0;
    return computeTaskProgressPercent(t.status);
  }

  getStatusBadgeClass(status?: TaskStatus): string {
    if (!status) return 'status-default';
    switch (status) {
      case 'DRAFT': return 'status-draft';
      case 'ASSIGNED': return 'status-assigned';
      case 'ACCEPTED': return 'status-accepted';
      case 'IN_PROGRESS': return 'status-progress';
      case 'SUBMITTED':
      case 'RESUBMITTED':
      case 'UNDER_REVIEW': return 'status-review';
      case 'REVISION_REQUIRED':
      case 'REDESIGN_REQUIRED': return 'status-revision';
      case 'APPROVED':
      case 'PUBLISHED':
      case 'COMPLETED': return 'status-completed';
      default: return 'status-default';
    }
  }

  getPriorityBadgeClass(priority?: TaskPriority): string {
    if (!priority) return 'priority-medium';
    switch (priority) {
      case 'URGENT': return 'priority-urgent';
      case 'HIGH': return 'priority-high';
      case 'MEDIUM': return 'priority-medium';
      case 'LOW': return 'priority-low';
      default: return 'priority-medium';
    }
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  formatDateTime(dateStr?: string): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  formatCommitDate(isoDate?: string): string {
    if (!isoDate) return '';
    try {
      const d = new Date(isoDate);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoDate;
    }
  }

  generateShortHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + (str.codePointAt(i) || 0);
      hash = Math.trunc(hash);
    }
    const hex = Math.abs(hash).toString(16).padStart(6, '0');
    return hex.substring(0, 6);
  }

  getRolePrefix(role?: string): string {
    const r = String(role || '').toUpperCase();
    if (r.includes('ADMIN')) return 'Admin';
    if (r.includes('BDM')) return 'BDM';
    if (r.includes('MARKETING') || r.includes('MANAGER')) return 'Manager';
    if (r.includes('DESIGNER')) return 'Designer';
    return role || 'User';
  }

  getRoleClass(role?: string): string {
    const r = String(role || '').toUpperCase();
    if (r.includes('ADMIN')) return 'role-admin';
    if (r.includes('BDM')) return 'role-bdm';
    if (r.includes('MARKETING') || r.includes('MANAGER')) return 'role-mktg';
    if (r.includes('DESIGNER')) return 'role-designer';
    return 'role-default';
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

  isPdf(urlOrName?: string): boolean {
    if (!urlOrName) return false;
    const clean = urlOrName.split('?')[0].split('#')[0].toLowerCase().trim();
    return clean.endsWith('.pdf') || clean.startsWith('data:application/pdf');
  }

  isImage(urlOrName?: string): boolean {
    if (!urlOrName) return false;
    const clean = urlOrName.split('?')[0].split('#')[0].toLowerCase().trim();
    return (
      clean.endsWith('.png') ||
      clean.endsWith('.jpg') ||
      clean.endsWith('.jpeg') ||
      clean.endsWith('.webp') ||
      clean.endsWith('.gif') ||
      clean.endsWith('.svg') ||
      clean.startsWith('data:image/')
    );
  }

  isVideo(urlOrName?: string): boolean {
    if (!urlOrName) return false;
    const clean = urlOrName.split('?')[0].split('#')[0].toLowerCase().trim();
    return (
      clean.startsWith('data:video/') ||
      clean.startsWith('video/') ||
      /\.(mp4|webm|mov|m4v|ogv|avi|mkv|3gp|mpeg|mpg)$/.test(clean)
    );
  }

  getVersionAssetUrl(ver: TaskVersion): string {
    return (ver as any).fileUrl || ver.filePath || ver.fileContent || '';
  }

  getVersionFileSize(ver: TaskVersion): string {
    const raw = ver.fileSize;
    if (!raw) return '';
    const mb = raw > 1000 ? (raw / (1024 * 1024)).toFixed(2) : Number(raw).toFixed(2);
    return `${mb} MB`;
  }

 

  private resolveWorkflowStages(status: string): {
    stage1State: WorkflowStepState;
    stage2State: WorkflowStepState;
    stage3State: WorkflowStepState;
    stage4State: WorkflowFinalStepState;
  } {
    if (status === 'DRAFT' || status === 'ASSIGNED') {
      return { stage1State: 'current', stage2State: 'upcoming', stage3State: 'upcoming', stage4State: 'upcoming' };
    }
    if (status === 'ACCEPTED' || status === 'IN_PROGRESS') {
      return { stage1State: 'completed', stage2State: 'current', stage3State: 'upcoming', stage4State: 'upcoming' };
    }
    if (status === 'SUBMITTED' || status === 'RESUBMITTED' || status === 'UNDER_REVIEW') {
      return { stage1State: 'completed', stage2State: 'completed', stage3State: 'current', stage4State: 'upcoming' };
    }
    if (status === 'REVISION_REQUIRED' || status === 'REDESIGN_REQUIRED') {
      return { stage1State: 'completed', stage2State: 'completed', stage3State: 'completed', stage4State: 'revision' };
    }
    if (status === 'APPROVED' || status === 'PUBLISHED' || status === 'COMPLETED') {
      return { stage1State: 'completed', stage2State: 'completed', stage3State: 'completed', stage4State: 'completed' };
    }
    return { stage1State: 'completed', stage2State: 'upcoming', stage3State: 'upcoming', stage4State: 'upcoming' };
  }

  private getCreativeStageSubtitle(status: string, stage2State: string): string {
    if (status === 'IN_PROGRESS') return 'Active Work';
    if (status === 'ACCEPTED') return 'Accepted';
    if (stage2State === 'completed') return 'Canvas Complete';
    return 'Pending Start';
  }

  private getFinalStageSubtitle(stage4State: string): string {
    if (stage4State === 'completed') return 'Approved & Ready';
    if (stage4State === 'revision') return 'Feedback Requested';
    return 'Pending Review';
  }

  getWorkflowSteps(t: Task | null) {
    if (!t) return [];
    const status = t.status;
    const versionCount = t.versions?.length || 0;
    const { stage1State, stage2State, stage3State, stage4State } = this.resolveWorkflowStages(status);

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
        title: 'Creative Started',
        subtitle: this.getCreativeStageSubtitle(status, stage2State),
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
        subtitle: this.getFinalStageSubtitle(stage4State),
        icon: stage4State === 'revision' ? 'rate_review' : 'verified',
        state: stage4State,
      },
    ];
  }

  getGitCommitTimeline(task: Task | null): {
    id: string;
    hash: string;
    authorLabel: string;
    authorRole: string;
    authorRoleClass: string;
    message: string;
    bulletPoints?: string[];
    type: 'INIT' | 'STATUS' | 'VERSION' | 'COMMENT' | 'REVISION' | 'APPROVED';
    badge: string;
    badgeClass: string;
    nodeClass: string;
    createdAt: string;
    relativeTime: string;
    fileUrl?: string;
    fileName?: string;
    fileContent?: string;
    versionNumber?: number;
    duration?: string;
  }[] {
    if (!task) return [];

    const nodes: any[] = [];
    const seenNodeKeys = new Set<string>();

    const creatorName = this.getCreatorName(task);
    const creatorRole = task.creatorRole || 'ADMINISTRATOR';
    const assigneeName = this.getAssigneeName(task);

    const hasInitialHistory =
      task.statusHistory &&
      task.statusHistory.some(
        (h) => !h.previousStatus || h.newStatus === 'ASSIGNED' || String(h.remark).toLowerCase().includes('task created')
      );

    if (!hasInitialHistory) {
      const initKey = `INIT_${task.createdAt || ''}`;
      seenNodeKeys.add(initKey);
      nodes.push({
        id: `init_${task.id}`,
        hash: this.generateShortHash(`init_${task.id}_${task.createdAt}`),
        authorLabel: `${this.getRolePrefix(creatorRole)} (${creatorName})`,
        authorRole: creatorRole,
        authorRoleClass: this.getRoleClass(creatorRole),
        message: task.description
          ? `Created task "${task.title}": "${task.description}" (Assigned to ${assigneeName})`
          : `Created and assigned task "${task.title}" to ${assigneeName}`,
        type: 'INIT',
        badge: 'ASSIGNED',
        badgeClass: 'badge-init',
        nodeClass: 'git-node-init',
        createdAt: task.createdAt || new Date().toISOString(),
        relativeTime: this.formatCommitDate(task.createdAt),
        fileUrl: task.attachmentUrl,
        fileName: task.attachmentName,
        fileContent: task.content,
      });
    }

    if (task.statusHistory && task.statusHistory.length > 0) {
      const sortedHistory = [...task.statusHistory].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      let lastSeenStatus: string | null = null;

      for (const h of sortedHistory) {
        if (!h.newStatus) continue;
        const remarkStr = String(h.remark || '').toLowerCase();
        if (
          (h.newStatus === 'SUBMITTED' || remarkStr.includes('uploaded creative version') || remarkStr.includes('uploaded design asset')) &&
          task.versions &&
          task.versions.length > 0
        ) {
          continue;
        }

  
        const timeMinuteBucket = h.createdAt ? Math.floor(new Date(h.createdAt).getTime() / 120000) : 0;
        const dedupKey = `STATUS_${h.newStatus}_${timeMinuteBucket}`;
        if (seenNodeKeys.has(dedupKey) || h.newStatus === lastSeenStatus) {
          continue;
        }
        seenNodeKeys.add(dedupKey);
        lastSeenStatus = h.newStatus;

        let actorName = h.actorName;
        let actorRole = (h.actorRole || '').toUpperCase();

        const isDesignerAction =
          h.newStatus === 'IN_PROGRESS' ||
          h.newStatus === 'ACCEPTED' ||
          h.newStatus === 'SUBMITTED' ||
          h.newStatus === 'RESUBMITTED' ||
          remarkStr.includes('accepted') ||
          remarkStr.includes('started');
        const isCreatorAction =
          h.newStatus === 'REVISION_REQUIRED' ||
          h.newStatus === 'APPROVED' ||
          h.newStatus === 'ASSIGNED' ||
          !h.previousStatus ||
          remarkStr.includes('task created');

        if (isDesignerAction) {
          actorRole = 'DESIGNER';
          actorName = assigneeName || actorName || 'Designer';
        } else if (isCreatorAction) {
          actorRole = creatorRole;
          actorName = creatorName || actorName || 'Manager';
        } else {
          actorName = actorName || creatorName;
          actorRole = actorRole || creatorRole;
        }

        const rolePrefix = this.getRolePrefix(actorRole);

        let type: 'STATUS' | 'REVISION' | 'APPROVED' = 'STATUS';
        let badgeClass = 'badge-info';
        let nodeClass = 'git-node-info';
        let badgeLabel: string = h.newStatus;

        if (h.newStatus === 'REVISION_REQUIRED') {
          type = 'REVISION';
          badgeClass = 'badge-danger';
          nodeClass = 'git-node-danger';
          badgeLabel = 'REDESIGN REQUIRED';
        } else if (h.newStatus === 'APPROVED' || h.newStatus === 'COMPLETED' || h.newStatus === 'PUBLISHED') {
          type = 'APPROVED';
          badgeClass = 'badge-success';
          nodeClass = 'git-node-success';
          badgeLabel = 'APPROVED';
        } else if (h.newStatus === 'IN_PROGRESS') {
          badgeClass = 'badge-warning';
          nodeClass = 'git-node-warning';
          badgeLabel = 'IN PROCESS';
        } else if (h.newStatus === 'ACCEPTED') {
          badgeClass = 'badge-primary';
          nodeClass = 'git-node-primary';
          badgeLabel = 'ACCEPTED';
        } else if (h.newStatus === 'ASSIGNED') {
          badgeClass = 'badge-init';
          nodeClass = 'git-node-init';
          badgeLabel = 'ASSIGNED';
        } else if (h.newStatus === 'SUBMITTED' || h.newStatus === 'RESUBMITTED' || h.newStatus === 'UNDER_REVIEW') {
          badgeClass = 'badge-version';
          nodeClass = 'git-node-cyan';
          badgeLabel = 'UNDER REVIEW';
        }

        const fallbackRemark =
          h.newStatus === 'REVISION_REQUIRED'
            ? `Requested Redesign / Revision: "${task.reviewerFeedback || h.remark || 'Please update design as per specifications'}"`
            : h.remark || `Updated status to ${badgeLabel}`;

        const rawRemark = h.remark || fallbackRemark;
        let messageText = rawRemark;
        let bullets: string[] = [];

        const uploadMatch = rawRemark.match(/^Uploaded version (v\d+\.\d+[^:]*):\s*"?([\s\S]*?)"?$/i);
        if (uploadMatch) {
          messageText = `Uploaded version ${uploadMatch[1]}:`;
          bullets = this.parseBulletPoints(uploadMatch[2]);
        } else if (rawRemark.includes('•')) {
          const leadMatch = rawRemark.match(/^([^•:\r\n]+):\s*([\s\S]*)$/);
          if (leadMatch) {
            messageText = leadMatch[1] + ':';
            bullets = this.parseBulletPoints(leadMatch[2]);
          } else {
            bullets = this.parseBulletPoints(rawRemark);
            messageText = '';
          }
        }

        nodes.push({
          id: h.id || `hist_${h.createdAt || Date.now()}_${nodes.length}`,
          hash: this.generateShortHash(`hist_${h.id || h.createdAt}`),
          authorLabel: `${rolePrefix} (${actorName})`,
          authorRole: actorRole,
          authorRoleClass: this.getRoleClass(actorRole),
          message: messageText,
          bulletPoints: bullets,
          type,
          badge: badgeLabel,
          badgeClass,
          nodeClass,
          createdAt: h.createdAt || new Date().toISOString(),
          relativeTime: this.formatCommitDate(h.createdAt),
        });
      }
    }

    if (task.versions && task.versions.length > 0) {
      for (const v of task.versions) {
        const verKey = `VERSION_${v.versionNumber}_${v.fileName || ''}`;
        if (seenNodeKeys.has(verKey)) continue;
        seenNodeKeys.add(verKey);

        const authorName = assigneeName || v.submittedByName || 'Designer';
        const authorRole = 'DESIGNER';
        const rolePrefix = 'Designer';

        const verBullets = this.parseBulletPoints(v.changelog);
        const verMessage =
          verBullets.length > 0
            ? `Uploaded version v${v.versionNumber}.0 (${v.fileName}):`
            : `Uploaded design asset v${v.versionNumber}.0 (${v.fileName})`;

        const duration = this.getVersionDuration(v, task);

        nodes.push({
          id: v.id || `ver_${v.versionNumber}`,
          hash: this.generateShortHash(`ver_${v.id || v.versionNumber}_${v.createdAt}`),
          authorLabel: `${rolePrefix} (${authorName})`,
          authorRole,
          authorRoleClass: this.getRoleClass(authorRole),
          message: verMessage,
          bulletPoints: verBullets,
          type: 'VERSION',
          badge: `v${v.versionNumber}.0 UNDER REVIEW`,
          badgeClass: 'badge-version',
          nodeClass: 'git-node-cyan',
          createdAt: v.createdAt || new Date().toISOString(),
          relativeTime: this.formatCommitDate(v.createdAt),
          fileUrl: (v as any).fileUrl || v.filePath,
          fileName: v.fileName,
          fileContent: v.fileContent,
          versionNumber: v.versionNumber,
          duration,
        });
      }
    }

    return nodes.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  getVersionDuration(ver: any, task?: Task | null): string {
    if (!ver || !ver.createdAt) return '';
    const uploadTime = new Date(ver.createdAt).getTime();
    if (Number.isNaN(uploadTime)) return '';

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
        (v) => (v.id && v.id === ver.id) || v.versionNumber === ver.versionNumber
      );
      if (currIdx > 0) {
        startTime = new Date(sortedVers[currIdx - 1].createdAt).getTime();
      }
    }

   
    if (!startTime && task?.createdAt) {
      startTime = new Date(task.createdAt).getTime();
    }

    if (!startTime || Number.isNaN(startTime) || uploadTime < startTime) {
      return '1 min';
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
      return remMins > 0 ? `${diffHours}h ${remMins} min` : `${diffHours}h`;
    }
    if (diffMinutes > 0) {
      return `${diffMinutes} min`;
    }
    if (diffSec > 0) {
      return `${diffSec}s`;
    }
    return '1 min';
  }


  canStartWork(t: Task | null): boolean {
    if (!t) return false;
    const user = this.authService.currentUser();
    if (!user) return false;
    const isAssignee = user.id === t.assignedTo || user.role === 'DESIGNER';
    return isAssignee && (t.status === 'ASSIGNED' || t.status === 'DRAFT');
  }

  canSubmitWork(t: Task | null): boolean {
    if (!t) return false;
    const user = this.authService.currentUser();
    if (!user) return false;
    const isAssignee = user.id === t.assignedTo || user.role === 'DESIGNER' ;
    return isAssignee && (t.status === 'IN_PROGRESS' || t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED');
  }

  isTaskCreator(t: Task | null): boolean {
    if (!t) return false;
    const currentUser = this.authService.currentUser();
    if (!currentUser) return false;

    const currentId = String(currentUser.id !== undefined && currentUser.id !== null ? currentUser.id : '').trim().toLowerCase();
    const currentEmail = String(currentUser.email || '').toLowerCase().trim();

    const tCreatorId = String(
      t.createdBy !== undefined && t.createdBy !== null
        ? t.createdBy
        : ((t as any).created_by !== undefined && (t as any).created_by !== null ? (t as any).created_by : '')
    ).trim().toLowerCase();
    const tCreatorEmail = String(t.creatorEmail || (t as any).creator_email || '').toLowerCase().trim();

    const matchesId = Boolean(currentId && tCreatorId && currentId === tCreatorId);
    const matchesEmail = Boolean(currentEmail && tCreatorEmail && currentEmail === tCreatorEmail);

    return matchesId || matchesEmail;
  }

  canReview(t: Task | null): boolean {
    if (!t) return false;
    const isCreator = this.isTaskCreator(t);
    return isCreator && (t.status === 'SUBMITTED' || t.status === 'RESUBMITTED' || t.status === 'UNDER_REVIEW');
  }

  canDeleteTask(t: Task | null): boolean {
    if (!t) return false;
    return this.isTaskCreator(t);
  }


  async onStartWork(): Promise<void> {
    const t = this.task();
    if (!t) return;
    const ok = await this.taskService.startWork(t.id);
    if (ok) {
      this.notify('Work Started', 'Task status updated to In Progress.', 'SUCCESS');
      await this.loadTaskData(t.id);
    }
  }

  async onStartRedesign(): Promise<void> {
    const t = this.task();
    if (!t) return;
    const ok = await this.taskService.startRedesign(t.id);
    if (ok) {
      this.notify('Redesign Started', 'Task status moved to In Progress for revision.', 'SUCCESS');
      await this.loadTaskData(t.id);
    }
  }

  async onApproveQuick(): Promise<void> {
    const t = this.task();
    if (!t) return;
    const ok = await this.taskService.approveTask(t.id);
    if (ok) {
      this.notify('Design Approved', `Task "${t.title}" successfully approved.`, 'SUCCESS');
      await this.loadTaskData(t.id);
    }
  }

  openRedesignModal(): void {
    this.redesignReason.set('');
    this.isRedesignModalOpen.set(true);
  }

  closeRedesignModal(): void {
    this.isRedesignModalOpen.set(false);
    this.redesignReason.set('');
  }

  appendRedesignSnippet(snippet: string): void {
    const cur = this.redesignReason().trim();
    const cleanSnippet = snippet.replace(/^[•\-\*]\s*/, '').trim();
    const bulletText = `• ${cleanSnippet}`;
    const nextVal = cur ? `${cur}\n${bulletText}` : bulletText;
    this.redesignReason.set(nextVal);
  }

  onRedesignReasonKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const textarea = event.target as HTMLTextAreaElement;
      const { selectionStart, selectionEnd, value } = textarea;
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = value.substring(lineStart, selectionStart);
      if (currentLine.startsWith('• ') || currentLine.startsWith('- ')) {
        event.preventDefault();
        if (currentLine.trim() === '•' || currentLine.trim() === '-') {
          const newValue = value.substring(0, lineStart) + value.substring(selectionEnd);
          this.redesignReason.set(newValue);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = lineStart;
          }, 0);
          return;
        }
        const insert = '\n• ';
        const newValue = value.substring(0, selectionStart) + insert + value.substring(selectionEnd);
        this.redesignReason.set(newValue);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = selectionStart + insert.length;
        }, 0);
      }
    }
  }

  async submitRedesign(): Promise<void> {
    const t = this.task();
    const reason = this.redesignReason().trim();
    if (!t || !reason) return;

    this.isSubmittingRedesign.set(true);
    try {
      const ok = await this.taskService.requestRedesign(t.id, reason);
      if (ok) {
        this.notify('Redesign Requested', 'Designer notified with detailed feedback remarks.', 'WARNING');
        this.closeRedesignModal();
        await this.loadTaskData(t.id);
      }
    } finally {
      this.isSubmittingRedesign.set(false);
    }
  }

  openUploadModal(): void {
    this.selectedFileObject.set(null);
    this.selectedFileDataUrl.set('');
    this.selectedFileContent.set('');
    this.uploadError.set(null);
    this.uploadForm.reset({
      fileName: '',
      changelog: '',
      fileSizeMb: 0,
    });
    this.isUploadModalOpen.set(true);
  }

  closeUploadModal(): void {
    this.isUploadModalOpen.set(false);
    this.selectedFileObject.set(null);
    this.selectedFileDataUrl.set('');
    this.selectedFileContent.set('');
    this.uploadError.set(null);
  }

  triggerFileInput(): void {
    const el = document.getElementById('taskDetailCreativeFileInput') as HTMLInputElement;
    if (el) el.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    input.value = '';
    this.uploadError.set(null);
    this.selectedFileObject.set(null);
    this.selectedFileDataUrl.set('');
    this.selectedFileContent.set('');
    this.uploadForm.patchValue({ fileName: '', fileSizeMb: 0 });
    const extension = file.name.split('.').pop()?.toLowerCase();
    const isSupported =
      file.type.startsWith('image/') ||
      file.type.startsWith('video/') ||
      file.type === 'application/pdf' ||
      (!file.type && ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'mp4', 'webm', 'mov', 'm4v', 'ogv', 'avi', 'mkv', '3gp', 'mpeg', 'mpg'].includes(extension || ''));
    if (!isSupported) {
      this.uploadError.set('Choose an image, video, or PDF file.');
      return;
    }

    const maxSizeBytes = 35 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.uploadError.set('The file must be 35 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      this.uploadError.set('The selected file could not be read. Please try again.');
    };
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const result = typeof e.target?.result === 'string' ? e.target.result : '';
      if (!result) {
        this.uploadError.set('The selected file could not be read. Please try again.');
        return;
      }

      this.selectedFileObject.set(file);
      this.selectedFileDataUrl.set(result);
      this.selectedFileContent.set('');
      this.uploadForm.patchValue({
        fileName: file.name,
        fileSizeMb: Number((file.size / (1024 * 1024)).toFixed(2)),
      });
    };
    reader.readAsDataURL(file);
  }

  appendChangelog(snippet: string): void {
    const current = (this.uploadForm.get('changelog')?.value || '').trim();
    const cleanSnippet = snippet.replace(/^[•\-\*]\s*/, '').trim();
    const bulletText = `• ${cleanSnippet}`;
    const newVal = current ? `${current}\n${bulletText}` : bulletText;
    this.uploadForm.patchValue({ changelog: newVal });
  }

  onChangelogKeyDown(event: KeyboardEvent): void {
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

  async onHandleSubmitUpload(event: {
    fileName: string;
    changelog: string;
    fileSizeMb: number;
    dataUrl: string;
    fileContent: string;
  }): Promise<void> {
    const t = this.task();
    if (!t) return;

    const ok = await this.taskService.submitDesign(t.id, {
      fileName: event.fileName,
      changelog: event.changelog,
      fileSize: event.fileSizeMb || 1.5,
      filePath: event.dataUrl || '',
      fileContent: event.fileContent || event.changelog,
    });

    if (ok) {
      this.notify('Creative Uploaded', 'Creative asset submitted for review.', 'SUCCESS');
      this.closeUploadModal();
      await this.loadTaskData(t.id);
    }
  }

  async onSubmitUpload(): Promise<void> {
    if (this.uploadForm.invalid) return;
    const t = this.task();
    if (!t) return;

    const { fileName, changelog, fileSizeMb } = this.uploadForm.value;
    const dataUrl = this.selectedFileDataUrl();
    const fileContent = this.selectedFileContent();

    const ok = await this.taskService.submitDesign(t.id, {
      fileName,
      changelog,
      fileSize: fileSizeMb || 1.5,
      filePath: dataUrl || '',
      fileContent: fileContent || changelog,
    });

    if (ok) {
      this.notify('Creative Uploaded', 'Creative asset submitted for review.', 'SUCCESS');
      this.closeUploadModal();
      await this.loadTaskData(t.id);
    }
  }

  async onDeleteTask(): Promise<void> {
    const t = this.task();
    if (!t) return;

    if (!confirm(`Are you sure you want to delete task "${t.title}"? This cannot be undone.`)) {
      return;
    }

    const ok = await this.taskService.deleteTask(t.id);
    if (ok) {
      this.notify('Task Deleted', `Task "${t.title}" has been deleted.`, 'SUCCESS');
      this.goBack();
    }
  }

  
  openImageViewer(url?: string, title?: string): void {
    if (!url) return;
    const resolvedUrl = url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')
      ? url
      : (url.startsWith('/') ? url : `/${url}`);
    this.imageViewerUrl.set(resolvedUrl);
    this.imageViewerTitle.set(title || 'Creative Asset');
    this.isImageViewerOpen.set(true);
  }

  closeImageViewer(): void {
    this.isImageViewerOpen.set(false);
    this.imageViewerUrl.set('');
  }

  openDocViewer(url?: string, title?: string, content?: string): void {
    if (!url && !content) return;

    const resolvedTitle = title || 'Requirement Document';
    const resolvedUrl = url
      ? (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')
          ? url
          : (url.startsWith('/') ? url : `/${url}`))
      : '';

    this.docViewerRawUrl.set(resolvedUrl);
    this.docViewerTitle.set(resolvedTitle);
    this.docViewerContent.set(content || '');

   
    if (resolvedUrl && (this.isImage(resolvedUrl) || this.isImage(resolvedTitle))) {
      this.openImageViewer(resolvedUrl, resolvedTitle);
      return;
    }

    if (resolvedUrl) {
      this.docViewerUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(resolvedUrl));
    } else {
      this.docViewerUrl.set(null);
    }
    this.isDocViewerOpen.set(true);
  }

  closeDocViewer(): void {
    this.isDocViewerOpen.set(false);
    this.docViewerUrl.set(null);
    this.docViewerContent.set('');
    this.docViewerRawUrl.set('');
  }

  async downloadFile(fileUrl?: string, fileName?: string): Promise<void> {
    if (!fileUrl) return;
    let finalName = (fileName || 'download').trim();
    if (!finalName.includes('.')) {
      const urlExt = fileUrl.split('?')[0].split('.').pop();
      if (urlExt && urlExt.length <= 4) {
        finalName = `${finalName}.${urlExt}`;
      }
    }

  
    if (fileUrl.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

  
    if (fileUrl.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    
    try {
      const resolvedUrl = fileUrl.startsWith('http') || fileUrl.startsWith('/')
        ? fileUrl
        : `/${fileUrl}`;

      const response = await fetch(resolvedUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
    } catch (err) {
      console.warn('Direct blob download failed, falling back to anchor navigation:', err);
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = finalName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }
}
