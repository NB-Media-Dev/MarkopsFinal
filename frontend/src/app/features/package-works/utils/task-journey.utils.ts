import { Task, TaskVersion } from '../../../core/models/task.model';

export interface JourneyStep {
  stepNumber: number;
  stage: string;
  fromStatus: string;
  toStatus: string;
  actorName: string;
  actorRole: string;
  timestamp: string;
  remarks: string;
}

export function getTaskStatusBadgeClass(status: string): string {
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

export function formatDurationMs(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, minutes)}m`;
}

export function getDurationFromHistory(history: any[], verTime: number): string | null {
  const sortedHistory = [...history]
    .filter((h) => h.createdAt && !Number.isNaN(new Date(h.createdAt).getTime()))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let lastStart: number | null = null;
  for (const h of sortedHistory) {
    const hTime = new Date(h.createdAt).getTime();
    if (hTime > verTime + 5000) break;

    if (h.newStatus === 'IN_PROGRESS') {
      lastStart = hTime;
    } else if (h.newStatus === 'SUBMITTED' && lastStart && Math.abs(hTime - verTime) < 15000) {
      return formatDurationMs(hTime - lastStart);
    }
  }

  if (lastStart && lastStart <= verTime) {
    return formatDurationMs(verTime - lastStart);
  }
  return null;
}

export function getDurationFromVersions(versions: any[], verId: any, verTime: number): string | null {
  if (!versions || versions.length <= 1) return null;
  const sortedVers = [...versions]
    .filter((v) => v.createdAt && !Number.isNaN(new Date(v.createdAt).getTime()))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const curIdx = sortedVers.findIndex((v) => v.id === verId);
  if (curIdx > 0) {
    const prevTime = new Date(sortedVers[curIdx - 1].createdAt).getTime();
    if (verTime > prevTime) {
      return formatDurationMs(verTime - prevTime);
    }
  }
  return null;
}

export function calculateVersionDuration(task: Task | null, ver: TaskVersion): string {
  if (!task || !ver?.createdAt) return '';
  const verTime = new Date(ver.createdAt).getTime();
  if (Number.isNaN(verTime)) return '';

  if (task.statusHistory && task.statusHistory.length > 0) {
    const duration = getDurationFromHistory(task.statusHistory, verTime);
    if (duration) return duration;
  }

  if (task.versions && task.versions.length > 1) {
    const duration = getDurationFromVersions(task.versions, ver.id, verTime);
    if (duration) return duration;
  }

  return '';
}

export function parseBulletPointLines(raw: string): string[] {
  if (!raw) return [];
  const clean = raw.trim();
  if (!clean) return [];

  const items = clean
    .split('\n')
    .map((l) => l.trim().replace(/^([•*-]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

  return items.length > 0 ? items : [clean];
}

export function resolveJourneyTransitionRemark(h: any): string {
  if (h.remark) return h.remark;
  if (h.newStatus === 'APPROVED') return 'Deliverable approved without further changes.';
  if (h.newStatus === 'IN_PROGRESS') return 'Designer started working on deliverables.';
  return 'Status transition executed.';
}

export function resolveJourneyStageName(status: string): string {
  switch (status) {
    case 'IN_PROGRESS': return ' Work Started';
    case 'SUBMITTED':
    case 'RESUBMITTED': return 'Task Submitted';
    case 'REDESIGN_REQUIRED':
    case 'REVISION_REQUIRED': return 'Redesign';
    case 'APPROVED':
    case 'COMPLETED':
    case 'PUBLISHED': return 'Design Approved';
    case 'ACCEPTED': return 'Task Accepted by Designer';
    default: return 'Status Updated';
  }
}

export function buildFallbackJourneySteps(
  task: Task,
  designerName: string,
  creatorName: string,
  creatorRole: string,
  initialIdx: number
): JourneyStep[] {
  const steps: JourneyStep[] = [];
  let stepIdx = initialIdx;
  const status = task.status;
  if (status === 'ASSIGNED' || status === 'DRAFT') return steps;

  if (['IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REDESIGN_REQUIRED', 'COMPLETED'].includes(status)) {
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
  if (['SUBMITTED', 'APPROVED', 'REDESIGN_REQUIRED', 'COMPLETED'].includes(status)) {
    const ver0 = task.versions?.[0];
    steps.push({
      stepNumber: stepIdx++,
      stage: 'Creative Deliverable Submitted',
      fromStatus: 'IN_PROGRESS',
      toStatus: 'SUBMITTED',
      actorName: designerName,
      actorRole: 'DESIGNER',
      timestamp: ver0?.createdAt || task.updatedAt || task.createdAt,
      remarks: ver0 ? `Version v${ver0.versionNumber}.0 uploaded (${ver0.fileName})` : 'Designer submitted deliverable for review.',
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
  return steps;
}

export function buildTaskLifecycleJourney(
  task: Task | null,
  designerName: string,
  creatorName: string,
  creatorRole: string,
  packageName?: string
): JourneyStep[] {
  if (!task) return [];

  const history = task.statusHistory || [];
  const steps: JourneyStep[] = [];

  const initialAssignment = history.find(
    (h: any) => h.newStatus === 'ASSIGNED' && (!h.previousStatus || h.previousStatus === 'ASSIGNED')
  );

  steps.push({
    stepNumber: 1,
    stage: 'Task Creation & Assignment',
    fromStatus: 'CREATED',
    toStatus: 'ASSIGNED',
    actorName: initialAssignment?.actorName || creatorName,
    actorRole: initialAssignment?.actorRole || creatorRole,
    timestamp: initialAssignment?.createdAt || task.createdAt || new Date().toISOString(),
    remarks: initialAssignment?.remark || `Task created for package "${task.packageName || packageName || 'Package'}" and assigned to ${designerName}.`,
  });

  const validHistoryTransitions = history.filter((h: any) => {
    if (h === initialAssignment) return false;
    if (h.newStatus === 'ASSIGNED' && (!h.previousStatus || h.previousStatus === 'ASSIGNED')) {
      return false;
    }
    return !h.previousStatus || h.previousStatus !== h.newStatus;
  });

  validHistoryTransitions.sort((a: any, b: any) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeA - timeB;
  });

  let stepIdx = 2;
  if (validHistoryTransitions.length > 0) {
    validHistoryTransitions.forEach((h: any) => {
      const stageName = resolveJourneyStageName(h.newStatus);
      const prevStep = steps.at(-1);
      if (prevStep?.toStatus === h.newStatus) {
        return;
      }

      const transitionRemarks = resolveJourneyTransitionRemark(h);

      steps.push({
        stepNumber: stepIdx++,
        stage: stageName,
        fromStatus: h.previousStatus || prevStep?.toStatus || 'ASSIGNED',
        toStatus: h.newStatus,
        actorName: h.actorName || (h.newStatus === 'IN_PROGRESS' || h.newStatus === 'SUBMITTED' ? designerName : creatorName),
        actorRole: h.actorRole || (h.newStatus === 'IN_PROGRESS' || h.newStatus === 'SUBMITTED' ? 'DESIGNER' : creatorRole),
        timestamp: h.createdAt || task.updatedAt || task.createdAt,
        remarks: transitionRemarks,
      });
    });
  } else {
    steps.push(...buildFallbackJourneySteps(task, designerName, creatorName, creatorRole, stepIdx));
  }

  return steps;
}

