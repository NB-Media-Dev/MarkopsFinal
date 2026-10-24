import { resolveTaskProductAndPackage } from '../../../core/models/package.model';

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
  leads?: any[];
}

export function formatReportCleanName(raw?: string): string {
  if (!raw) return 'Product';
  return String(raw)
    .replace(/^pkg_/i, '')
    .replace(/[-_]/g, ' ')
    .trim()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

export function toLocalDateString(val: any): string {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayLocalDateString(): string {
  return toLocalDateString(new Date());
}

export function formatReportDate(dateRaw: string): string {
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

export function getTaskAssignedLocalDate(task: any): string {
  if (!task) return '';
  return (
    toLocalDateString(task.assignedDate) ||
    toLocalDateString(task.assignedAt) ||
    toLocalDateString(task.assignedDateRaw) ||
    toLocalDateString(task.createdAt) ||
    toLocalDateString(task.updatedAt)
  );
}

export function taskMatchesDate(task: any, filterDate: string): boolean {
  if (!filterDate) return true;
  return getTaskAssignedLocalDate(task) === filterDate;
}

export function taskMatchesDateRange(task: any, startDate: string, endDate: string): boolean {
  const dStr = getTaskAssignedLocalDate(task);
  if (!dStr) return false;
  if (startDate && dStr < startDate) return false;
  if (endDate && dStr > endDate) return false;
  return true;
}

export function resolveModalTargetDate(modalDateFilter: string, customFilterDate: string): string {
  if (modalDateFilter === 'TODAY') return toLocalDateString(new Date());
  if (modalDateFilter === 'YESTERDAY') {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return toLocalDateString(y);
  }
  if (modalDateFilter === 'CUSTOM') return customFilterDate;
  return '';
}

export function formatDurationDiff(diffMs: number): string {
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

export function formatActiveDuration(start: number): string {
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

export function getReportLeadKey(lead: any): string {
  return String(lead.leadId || lead.id || lead.phone || lead.leadPhone || '').trim();
}

export function getReportLeadOutcome(hasValidOutcome: boolean, rawOutcome: string, hasValidStatus: boolean, rawStatus: string): string {
  if (hasValidOutcome) return rawOutcome;
  if (hasValidStatus) return rawStatus;
  return '';
}

export function isReportLeadCalled(lead: any, hasValidOutcome: boolean, hasValidStatus: boolean): boolean {
  return hasValidOutcome || hasValidStatus || Boolean(lead.calledAt) || (typeof lead.callDuration === 'number' && lead.callDuration > 0);
}

export function isReportLeadPaid(lead: any, outcome: string): boolean {
  return outcome === 'PAID' || Boolean(lead.isPaid);
}

const UNCALLED_STATUSES = new Set(['ASSIGNED', 'NEW', 'PENDING', 'UNASSIGNED', 'NONE', '']);

export function aggregateGroupLeadStats(groupLeads: any[]): { totalCalls: number; interested: number; paid: number } {
  const calledLeadIds = new Set<string>();
  const interestedLeadIds = new Set<string>();
  const paidLeadIds = new Set<string>();

  for (const lead of groupLeads) {
    const leadKey = getReportLeadKey(lead);
    const rawOutcome = String(lead.callOutcome || lead.outcome || '').toUpperCase().trim();
    const rawStatus = String(lead.status || '').toUpperCase().trim();

    const hasValidOutcome = Boolean(rawOutcome && !UNCALLED_STATUSES.has(rawOutcome));
    const hasValidStatus = Boolean(rawStatus && !UNCALLED_STATUSES.has(rawStatus));

    if (isReportLeadCalled(lead, hasValidOutcome, hasValidStatus) && leadKey) {
      calledLeadIds.add(leadKey);
    }

    const outcome = getReportLeadOutcome(hasValidOutcome, rawOutcome, hasValidStatus, rawStatus);
    if (isReportLeadPaid(lead, outcome)) {
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

export function buildReportRow(key: string, groupLeads: any[], sNo: number, baseDailyTarget: number): TelecallerCampaignReport {
  const [cName, aName, dateRaw] = key.split('___');
  const totalLeads = groupLeads.length;
  const { totalCalls, interested, paid } = aggregateGroupLeadStats(groupLeads);

  const avgCalls = totalLeads > 0 ? Number((totalCalls / totalLeads).toFixed(1)) : 0;
  const rowTarget = baseDailyTarget > 0 ? baseDailyTarget : 50;
  const ratioVal = rowTarget > 0 ? (totalCalls / rowTarget) * 100 : 0;
  const formattedRatio = ratioVal % 1 === 0 ? `${ratioVal}%` : `${ratioVal.toFixed(1)}%`;
  const displayDate = formatReportDate(dateRaw);

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

export function buildTelecallerCampaignReportsFromTasks(
  tasks: any[],
  pkgDisplayName: string,
  baseDailyTarget: number
): TelecallerCampaignReport[] {
  const groups = new Map<string, any[]>();
  const todayStr = todayLocalDateString();

  for (const t of tasks) {
    const campName = t.campaignName && t.campaignName !== '—' ? t.campaignName : pkgDisplayName;
    const adName = t.adName && t.adName !== '—' ? t.adName : (t.title || 'Lead');
    const rawDate = getTaskAssignedLocalDate(t) || toLocalDateString(t.createdAt || t.assignedDate) || todayStr;
    const groupKey = `${campName}___${adName}___${rawDate}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(t);
  }

  const reports: TelecallerCampaignReport[] = [];
  let sNo = 1;
  for (const [key, groupLeads] of groups.entries()) {
    reports.push(buildReportRow(key, groupLeads, sNo++, baseDailyTarget));
  }
  return reports;
}

export function getReportTaskStatusBadgeClass(status: string): string {
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

export function getReportLeadStatusBadgeClass(status?: string): string {
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

export function getReportPlatformBadgeClass(platform?: string): string {
  const p = (platform || '').toLowerCase();
  if (p.includes('meta') || p.includes('facebook')) return 'badge-platform-meta';
  if (p.includes('google')) return 'badge-platform-google';
  if (p.includes('insta')) return 'badge-platform-instagram';
  if (p.includes('link')) return 'badge-platform-linkedin';
  if (p.includes('youtube')) return 'badge-platform-youtube';
  return 'badge-platform-default';
}

export function getReportAdStatusBadgeClass(status?: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE') return 'badge-green';
  if (s === 'PAUSED') return 'badge-amber';
  if (s === 'COMPLETED') return 'badge-blue';
  return 'badge-slate';
}

export function formatReportProductName(
  rawName?: string,
  task?: any,
  productPackages: any[] = [],
  fallbackPkgName = 'Product'
): string {
  if (task) {
    if (task.productName && !task.productName.toLowerCase().includes('careermate') && !task.productName.toLowerCase().includes('package')) {
      return formatReportCleanName(task.productName);
    }
    const resolved = resolveTaskProductAndPackage(task, productPackages);
    if (resolved?.productName) {
      return formatReportCleanName(resolved.productName);
    }
  }
  if (rawName?.trim() && !rawName.toLowerCase().includes('careermate')) {
    return formatReportCleanName(rawName);
  }
  return formatReportCleanName(fallbackPkgName);
}

export function formatReportPackageName(
  rawName?: string,
  task?: any,
  productPackages: any[] = [],
  fallbackPkgName = 'Package'
): string {
  if (task) {
    if (task.packageName && !task.packageName.toLowerCase().includes('careermate') && !task.packageName.toLowerCase().includes('package')) {
      return formatReportCleanName(task.packageName);
    }
    const resolved = resolveTaskProductAndPackage(task, productPackages);
    if (resolved?.packageName) {
      return formatReportCleanName(resolved.packageName);
    }
  }
  if (rawName?.trim()) {
    return formatReportCleanName(rawName);
  }
  return formatReportCleanName(fallbackPkgName);
}
