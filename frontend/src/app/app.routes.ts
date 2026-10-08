import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./core/layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        data: { title: 'Dashboard', icon: 'dashboard' },
      },
      {
        path: 'package-works',
        loadComponent: () =>
          import('./features/package-works/package-works.component').then((m) => m.PackageWorksComponent),
        data: { title: 'Package Works', icon: 'inventory_2' },
      },
      {
        path: 'tasks',
        canActivate: [roleGuard],
        data: { title: 'Tasks', icon: 'task_alt', roles: ['ADMINISTRATOR', 'BDM'] },
        loadComponent: () =>
          import('./features/designer/designer-dashboard.component').then((m) => m.DesignerDashboardComponent),
      },
      {
        path: 'tasks/:id',
        canActivate: [roleGuard],
        data: { title: 'Task Details', icon: 'task_alt', roles: ['ADMINISTRATOR', 'BDM', 'DESIGNER'] },
        loadComponent: () =>
          import('./features/designer/task-detail/task-detail.component').then((m) => m.TaskDetailComponent),
      },
      {
        path: 'designers',
        loadComponent: () =>
          import('./features/performance/performance.component').then((m) => m.PerformanceComponent),
        data: { title: 'Designers', icon: 'palette' },
      },
      {
        path: 'campaigns',
        canActivate: [roleGuard],
        data: { title: 'Campaigns', icon: 'campaign', roles: ['ADMINISTRATOR', 'DIGITAL_MARKETING'] },
        loadComponent: () =>
          import('./features/campaigns/campaigns.component').then((m) => m.CampaignsComponent),
      },
      {
        path: 'targets',
        canActivate: [roleGuard],
        data: { title: 'Targets', icon: 'track_changes', roles: ['ADMINISTRATOR'] },
        loadComponent: () =>
          import('./features/targets/targets.component').then((m) => m.TargetsComponent),
      },
      {
        path: 'ads',
        canActivate: [roleGuard],
        data: { title: 'Ads', icon: 'ads_click', roles: ['ADMINISTRATOR', 'DIGITAL_MARKETING'] },
        loadComponent: () =>
          import('./features/ads/ads.component').then((m) => m.AdsComponent),
      },
      {
        path: 'ad-metrics',
        canActivate: [roleGuard],
        data: { title: 'Ad Metrics', icon: 'query_stats', roles: ['ADMINISTRATOR', 'DIGITAL_MARKETING'] },
        loadComponent: () =>
          import('./features/ads/ads.component').then((m) => m.AdsComponent),
      },
      {
        path: 'leads',
        canActivate: [roleGuard],
        data: { title: 'Leads', icon: 'contacts', roles: ['ADMINISTRATOR', 'DIGITAL_MARKETING', 'TELECALLER'] },
        loadComponent: () =>
          import('./features/leads/leads.component').then((m) => m.LeadsComponent),
      },
      {
        path: 'lead-source',
        canActivate: [roleGuard],
        data: { title: 'Lead Source', icon: 'share', roles: ['ADMINISTRATOR', 'DIGITAL_MARKETING'] },
        loadComponent: () =>
          import('./features/leads/leads.component').then((m) => m.LeadsComponent),
      },
      {
        path: 'assigned-leads',
        canActivate: [roleGuard],
        data: { title: 'Assigned Leads', icon: 'assignment_ind', roles: ['ADMINISTRATOR', 'TELECALLER'] },
        loadComponent: () =>
          import('./features/leads/leads.component').then((m) => m.LeadsComponent),
      },
      {
        path: 'telecalling',
        canActivate: [roleGuard],
        data: { title: 'Telecalling', icon: 'phone_in_talk', roles: ['ADMINISTRATOR', 'TELECALLER'] },
        loadComponent: () =>
          import('./features/telecalling/telecalling.component').then((m) => m.TelecallingComponent),
      },
      {
        path: 'calls',
        canActivate: [roleGuard],
        data: { title: 'Calls', icon: 'phone_in_talk', roles: ['ADMINISTRATOR', 'TELECALLER'] },
        loadComponent: () =>
          import('./features/telecalling/telecalling.component').then((m) => m.TelecallingComponent),
      },
      {
        path: 'follow-ups',
        canActivate: [roleGuard],
        data: { title: 'Follow-ups', icon: 'event_repeat', roles: ['ADMINISTRATOR', 'TELECALLER'] },
        loadComponent: () =>
          import('./features/telecalling/telecalling.component').then((m) => m.TelecallingComponent),
      },
      {
        path: 'qualification',
        canActivate: [roleGuard],
        data: { title: 'Qualification', icon: 'verified', roles: ['ADMINISTRATOR', 'TELECALLER'] },
        loadComponent: () =>
          import('./features/telecalling/telecalling.component').then((m) => m.TelecallingComponent),
      },
      {
        path: 'outcomes',
        canActivate: [roleGuard],
        data: { title: 'Outcomes', icon: 'done_all', roles: ['ADMINISTRATOR', 'TELECALLER'] },
        loadComponent: () =>
          import('./features/telecalling/telecalling.component').then((m) => m.TelecallingComponent),
      },

      {
        path: 'transactions',
        loadComponent: () =>
          import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent),
        data: { title: 'Transactions', icon: 'receipt_long' },
      },
      {
        path: 'transaction-workflow',
        loadComponent: () =>
          import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent),
        data: { title: 'Transaction Workflow', icon: 'receipt_long' },
      },
      {
        path: 'reports',
        canActivate: [roleGuard],
        data: { title: 'Reports', icon: 'bar_chart', roles: ['ADMINISTRATOR', 'BDM'] },
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'performance',
        canActivate: [roleGuard],
        data: { title: 'Performance & Analysis', icon: 'trending_up', roles: ['ADMINISTRATOR', 'BDM', 'DESIGNER'] },
        loadComponent: () =>
          import('./features/performance/performance.component').then((m) => m.PerformanceComponent),
      },
      {
        path: 'achievements',
        loadComponent: () =>
          import('./features/performance/performance.component').then((m) => m.PerformanceComponent),
        data: { title: 'Achievements', icon: 'emoji_events' },
      },
      {
        path: 'users-roles',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRATOR'], title: 'Users & Roles', icon: 'manage_accounts' },
        loadComponent: () =>
          import('./features/users-roles/users-roles.component').then((m) => m.UsersRolesComponent),
      },
      {
        path: 'audit-logs',
        canActivate: [roleGuard],
        data: { title: 'Audit Logs', icon: 'history', roles: ['ADMINISTRATOR', 'BDM'] },
        loadComponent: () =>
          import('./features/audit-logs/audit-logs.component').then((m) => m.AuditLogsComponent),
      },
      {
        path: 'downloads',
        loadComponent: () =>
          import('./features/downloads/downloads.component').then((m) => m.DownloadsComponent),
        data: { title: 'Downloads', icon: 'download' },
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notifications.component').then((m) => m.NotificationsComponent),
        data: { title: 'Notifications', icon: 'notifications' },
      },
      {
        path: 'designer-tasks',
        loadComponent: () =>
          import('./features/designer/designer-dashboard.component').then((m) => m.DesignerDashboardComponent),
        data: { title: 'Own Tasks', icon: 'task_alt' },
      },
      {
        path: 'designer-tasks/:id',
        canActivate: [roleGuard],
        data: { title: 'Task Details', icon: 'task_alt' },
        loadComponent: () =>
          import('./features/designer/task-detail/task-detail.component').then((m) => m.TaskDetailComponent),
      },
      {
        path: 'submissions',
        loadComponent: () =>
          import('./features/designer/designer-dashboard.component').then((m) => m.DesignerDashboardComponent),
        data: { title: 'Submissions', icon: 'upload_file' },
      },
      {
        path: 'revisions',
        loadComponent: () =>
          import('./features/designer/designer-dashboard.component').then((m) => m.DesignerDashboardComponent),
        data: { title: 'Revisions', icon: 'edit_note' },
      },
      {
        path: 'comments',
        loadComponent: () =>
          import('./features/designer/designer-dashboard.component').then((m) => m.DesignerDashboardComponent),
        data: { title: 'Comments', icon: 'chat' },
      },
      {
        path: 'files',
        loadComponent: () =>
          import('./features/designer/designer-dashboard.component').then((m) => m.DesignerDashboardComponent),
        data: { title: 'Files', icon: 'folder' },
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
