export type TaskStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'REDESIGN_REQUIRED'
  | 'APPROVED'
  | 'DRAFT'
  | 'ACCEPTED'
  | 'UNDER_REVIEW'
  | 'REVISION_REQUIRED'
  | 'RESUBMITTED'
  | 'PUBLISHED'
  | 'COMPLETED';

export interface TaskWorkCycle {
  cycleNumber: number;
  startedAt: string;
  submittedAt?: string;
  durationMinutes?: number;
  durationText: string;
  isCurrent: boolean;
}

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TaskVersion {
  id: string;
  taskId: string;
  versionNumber: number;
  submittedBy: string;
  submittedByName?: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType?: string;
  changelog?: string;
  fileContent?: string;
  createdAt: string;
}

export interface TaskStatusHistory {
  id: string;
  taskId: string;
  actorId: string;
  actorName?: string;
  actorRole?: string;
  previousStatus: TaskStatus | null;
  newStatus: TaskStatus;
  remark?: string;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  userRole?: string;
  comment: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  packageName?: string;
  description?: string;
  content?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  reviewerFeedback?: string;
  campaignId?: string;
  campaignName?: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdBy: string;
  creatorName?: string;
  creatorRole?: string;
  creatorEmail?: string;
  assignedTo?: string;
  assigneeName?: string;
  dueDate?: string;
  progressPercent: number;
  createdAt: string;
  updatedAt: string;
  versions?: TaskVersion[];
  statusHistory?: TaskStatusHistory[];
  comments?: TaskComment[];
}

export interface CreateTaskRequest {
  title: string;
  packageName?: string;
  description?: string;
  content?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  campaignId?: string;
  campaignName?: string;
  priority: TaskPriority;
  assignedTo: string;
  dueDate?: string;
  creatorId?: string;
  creatorName?: string;
  creatorRole?: string;
  creatorEmail?: string;
  assigneeName?: string;
}

export interface TransitionTaskStatusRequest {
  status: TaskStatus;
  remark?: string;
}

export interface SubmitVersionRequest {
  fileName: string;
  changelog?: string;
  fileSize?: number;
  filePath?: string;
  fileContent?: string;
}

export interface DesignerDashboardMetrics {
  assignedTodayCount: number;
  inProgressCount: number;
  dueTodayCount: number;
  overdueCount: number;
  submittedWaitingReviewCount: number;
  revisionRequiredCount: number;
  completedThisMonthCount: number;
  avgCompletionHours: number;
  approvalRatePct: number;
  totalRevisionsCount: number;
  activityTimeline: {
    id: string;
    action: string;
    taskTitle: string;
    actorName: string;
    timestamp: string;
  }[];
  recentSubmissions: {
    id: string;
    taskTitle: string;
    versionNumber: number;
    fileName: string;
    submittedAt: string;
    status: TaskStatus;
    reviewerRemark?: string;
  }[];
}


export function computeTaskProgressPercent(status?: string | null, customPercent?: number): number {
  const s = String(status || '').toUpperCase().trim();
  switch (s) {
    case 'APPROVED':
    case 'COMPLETED':
    case 'PUBLISHED':
      return 100;
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
    case 'RESUBMITTED':
      return 80;
    case 'IN_PROGRESS':
      return 50;
    case 'REDESIGN_REQUIRED':
    case 'REVISION_REQUIRED':
      return 50;
    case 'ACCEPTED':
      return 25;
    case 'ASSIGNED':
      return 10;
    case 'DRAFT':
      return 0;
    default:
      if (typeof customPercent === 'number' && customPercent >= 0 && customPercent <= 100) {
        return customPercent;
      }
      return 10;
  }
}

