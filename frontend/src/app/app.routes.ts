import { Route, Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

function createRoute(
  path: string,
  title: string,
  icon: string,
  loader: () => Promise<any>,
  roles?: string[]
): Route {
  const route: Route = {
    path,
    loadComponent: loader,
    data: { title, icon, ...(roles ? { roles } : {}) },
  };
  if (roles) {
    route.canActivate = [roleGuard];
  }
  return route;
}

const loadDashboard = () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent);
const loadPackageWorks = () => import('./features/package-works/package-works.component').then((m) => m.PackageWorksComponent);
const loadDesignerDashboard = () => import('./features/designer/designer-dashboard.component').then((m) => m.DesignerDashboardComponent);
const loadTaskDetail = () => import('./features/designer/task-detail/task-detail.component').then((m) => m.TaskDetailComponent);
const loadPerformance = () => import('./features/performance/performance.component').then((m) => m.PerformanceComponent);
const loadCampaigns = () => import('./features/campaigns/campaigns.component').then((m) => m.CampaignsComponent);
const loadTargets = () => import('./features/targets/targets.component').then((m) => m.TargetsComponent);
const loadAds = () => import('./features/ads/ads.component').then((m) => m.AdsComponent);
const loadLeads = () => import('./features/leads/leads.component').then((m) => m.LeadsComponent);
const loadTelecalling = () => import('./features/telecalling/telecalling.component').then((m) => m.TelecallingComponent);
const loadTransactions = () => import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent);
const loadReports = () => import('./features/reports/reports.component').then((m) => m.ReportsComponent);
const loadUsersRoles = () => import('./features/users-roles/users-roles.component').then((m) => m.UsersRolesComponent);
const loadAuditLogs = () => import('./features/audit-logs/audit-logs.component').then((m) => m.AuditLogsComponent);
const loadDownloads = () => import('./features/downloads/downloads.component').then((m) => m.DownloadsComponent);
const loadNotifications = () => import('./features/notifications/notifications.component').then((m) => m.NotificationsComponent);

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      createRoute('dashboard', 'Dashboard', 'dashboard', loadDashboard),
      createRoute('package-works', 'Package Works', 'inventory_2', loadPackageWorks),
      createRoute('tasks', 'Tasks', 'task_alt', loadDesignerDashboard, ['ADMINISTRATOR', 'BDM']),
      createRoute('tasks/:id', 'Task Details', 'task_alt', loadTaskDetail, ['ADMINISTRATOR', 'BDM', 'DESIGNER']),
      createRoute('designers', 'Designers', 'palette', loadPerformance),
      createRoute('campaigns', 'Campaigns', 'campaign', loadCampaigns, ['ADMINISTRATOR', 'DIGITAL_MARKETING']),
      createRoute('targets', 'Targets', 'track_changes', loadTargets, ['ADMINISTRATOR', 'MARKETING_MANAGER', 'TELECALLER']),
      createRoute('ads', 'Ads', 'ads_click', loadAds, ['ADMINISTRATOR', 'DIGITAL_MARKETING']),
      createRoute('ad-metrics', 'Ad Metrics', 'query_stats', loadAds, ['ADMINISTRATOR', 'DIGITAL_MARKETING']),
      createRoute('leads', 'Leads', 'contacts', loadLeads, ['ADMINISTRATOR', 'DIGITAL_MARKETING', 'TELECALLER']),
      createRoute('lead-source', 'Lead Source', 'share', loadLeads, ['ADMINISTRATOR', 'DIGITAL_MARKETING']),
      createRoute('assigned-leads', 'Assigned Leads', 'assignment_ind', loadLeads, ['ADMINISTRATOR', 'TELECALLER']),
      createRoute('telecalling', 'Telecalling', 'phone_in_talk', loadTelecalling, ['ADMINISTRATOR', 'TELECALLER']),
      createRoute('calls', 'Calls', 'phone_in_talk', loadTelecalling, ['ADMINISTRATOR', 'TELECALLER']),
      createRoute('follow-ups', 'Follow-ups', 'event_repeat', loadTelecalling, ['ADMINISTRATOR', 'TELECALLER']),
      createRoute('qualification', 'Qualification', 'verified', loadTelecalling, ['ADMINISTRATOR', 'TELECALLER']),
      createRoute('outcomes', 'Outcomes', 'done_all', loadTelecalling, ['ADMINISTRATOR', 'TELECALLER']),
      createRoute('transactions', 'Transactions', 'receipt_long', loadTransactions),
      createRoute('transaction-workflow', 'Transaction Workflow', 'receipt_long', loadTransactions),
      createRoute('reports', 'Reports', 'bar_chart', loadReports, ['ADMINISTRATOR', 'BDM']),
      createRoute('performance', 'Performance & Analysis', 'trending_up', loadPerformance, ['ADMINISTRATOR', 'BDM', 'DESIGNER']),
      createRoute('achievements', 'Achievements', 'emoji_events', loadPerformance),
      createRoute('users-roles', 'Users & Roles', 'manage_accounts', loadUsersRoles, ['ADMINISTRATOR']),
      createRoute('audit-logs', 'Audit Logs', 'history', loadAuditLogs, ['ADMINISTRATOR', 'BDM']),
      createRoute('downloads', 'Downloads', 'download', loadDownloads),
      createRoute('notifications', 'Notifications', 'notifications', loadNotifications),
      createRoute('designer-tasks', 'Designer', 'palette', loadDesignerDashboard),
      createRoute('designer-tasks/:id', 'Task Details', 'task_alt', loadTaskDetail, ['ADMINISTRATOR', 'BDM', 'DESIGNER']),
      createRoute('submissions', 'Submissions', 'upload_file', loadDesignerDashboard),
      createRoute('revisions', 'Revisions', 'edit_note', loadDesignerDashboard),
      createRoute('comments', 'Comments', 'chat', loadDesignerDashboard),
      createRoute('files', 'Files', 'folder', loadDesignerDashboard),
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
