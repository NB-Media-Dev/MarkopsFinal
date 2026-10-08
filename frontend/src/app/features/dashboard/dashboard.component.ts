import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TaskManagementService } from '../../core/services/task-management.service';
import { CampaignService } from '../../core/services/campaign.service';
import { LeadTelecallingService } from '../../core/services/lead-telecalling.service';
import { ConversionTransactionService } from '../../core/services/conversion-transaction.service';
import { PackageService } from '../../core/services/package.service';
import { TelecallerTargetService } from '../../core/services/telecaller-target.service';
import { isTaskForPackage } from '../../core/models/package.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly router = inject(Router);
  readonly authService = inject(AuthService);
  readonly taskService = inject(TaskManagementService);
  readonly campaignService = inject(CampaignService);
  readonly leadService = inject(LeadTelecallingService);
  readonly txnService = inject(ConversionTransactionService);
  readonly packageService = inject(PackageService);
  readonly targetService = inject(TelecallerTargetService);

  openPackage(pkgName: string): void {
    if (!pkgName) return;
    this.router.navigate(['/package-works'], {
      queryParams: { package: pkgName },
    });
  }

  readonly userRole = computed(() => this.authService.currentUser()?.role || 'ADMINISTRATOR');

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    let timeGreeting = 'Good morning';
    if (hour >= 12 && hour < 17) {
      timeGreeting = 'Good afternoon';
    } else if (hour >= 17 || hour < 5) {
      timeGreeting = 'Good evening';
    }
    const user = this.authService.currentUser();
    const name = user?.fullName || 'User';
    return `${timeGreeting}, ${name}`;
  });

  readonly activeCampaignsCount = computed(() =>
    this.campaignService.campaigns().filter((c) => c.status === 'ACTIVE').length
  );

  readonly totalLeadsCount = computed(() => this.leadService.leads().length);

  readonly totalRevenue = computed(() =>
    this.txnService.transactions().reduce((sum, t) => sum + Number(t.amount || 0), 0)
  );

  readonly qualificationRate = computed(() => {
    const leads = this.leadService.leads();
    const qualified = leads.filter((l) => l.status === 'QUALIFIED').length;
    return leads.length > 0 ? Number(((qualified / leads.length) * 100).toFixed(1)) : 0;
  });


  readonly displayRevenue = computed(() => this.totalRevenue());
  readonly displayTargetRevenue = 500000;
  readonly revenuePercentReached = computed(() =>
    this.displayTargetRevenue > 0
      ? Math.min(100, Math.round((this.displayRevenue() / this.displayTargetRevenue) * 100))
      : 0
  );

  readonly displayLeadsCount = computed(() => this.totalLeadsCount());
  readonly displayActiveFunnels = computed(() => this.activeCampaignsCount());
  readonly leadsTodayCount = computed(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return this.leadService.leads().filter((l) => (l.createdAt || '').startsWith(todayStr)).length;
  });

  readonly displayQualRate = computed(() => this.qualificationRate());

  readonly totalOpenTasksCount = computed(() => this.taskService.tasks().length);
  readonly urgentTasksCount = computed(() => {
    return this.taskService.tasks().filter((t) => t.priority === 'URGENT' || t.priority === 'HIGH').length;
  });
  readonly designQueueCount = computed(() => {
    return this.taskService.tasks().filter((t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED').length;
  });
  readonly bdmReviewCount = computed(() => {
    return this.taskService.tasks().filter((t) => t.status === 'REVISION_REQUIRED' || t.status === 'UNDER_REVIEW' || t.status === 'SUBMITTED').length;
  });

 
  readonly activeCampaignTab = signal<'ALL' | 'ACTIVE' | 'PLANNING'>('ACTIVE');

  readonly designerAssignedTasks = computed(() => {
    const tasks = this.taskService.tasks();
    const user = this.authService.currentUser();
    const userId = String(user?.id || '');
    const userName = String(user?.fullName || '').toLowerCase().trim();
    const userEmail = String(user?.email || '').toLowerCase().trim();

    return tasks.filter((t) =>
      (t.assignedTo && String(t.assignedTo) === userId) ||
      (t.assignedTo && userEmail && String(t.assignedTo).toLowerCase() === userEmail) ||
      (t.assigneeName && userName && String(t.assigneeName).toLowerCase().includes(userName))
    );
  });

  readonly designerInProgressCount = computed(() =>
    this.designerAssignedTasks().filter((t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED').length
  );

  readonly designerRevisionCount = computed(() =>
    this.designerAssignedTasks().filter((t) => t.status === 'REVISION_REQUIRED' || t.status === 'REDESIGN_REQUIRED').length
  );

  readonly designerInReviewCount = computed(() =>
    this.designerAssignedTasks().filter((t) => t.status === 'SUBMITTED' || t.status === 'RESUBMITTED' || t.status === 'UNDER_REVIEW').length
  );

  readonly designerApprovedCount = computed(() =>
    this.designerAssignedTasks().filter((t) => t.status === 'APPROVED' || t.status === 'PUBLISHED' || t.status === 'COMPLETED').length
  );

 
  readonly telecallerAssignedLeads = computed(() => {
    const all = this.leadService.leads();
    const user = this.authService.currentUser();
    if (!user) return [];
    const uId = String(user.id || '').trim();
    const uEmail = String(user.email || '').toLowerCase().trim();
    const uName = String(user.fullName || '').toLowerCase().trim();

    return all.filter((l) => {
      const aTo = String(l.assignedTo || (l as any).assigned_to || '').trim();
      const aName = String(l.assigneeName || (l as any).assignee_name || '').toLowerCase().trim();
      return (uId && aTo === uId) ||
             (uEmail && aTo.toLowerCase() === uEmail) ||
             (uName && (aName === uName || aTo.toLowerCase() === uName || aName.includes(uName)));
    });
  });

  readonly myLeadsCount = computed(() => this.telecallerAssignedLeads().length);

  readonly myLeadsTodayCount = computed(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return this.telecallerAssignedLeads().filter((l) => (l.createdAt || '').startsWith(todayStr)).length;
  });

  readonly myPendingQueueCount = computed(() => {
    return this.telecallerAssignedLeads().filter(
      (l) => !l.status || l.status === 'NEW' || l.status === 'CONTACTED' || l.status === 'LINE_BUSY'
    ).length;
  });

  readonly myCallsToday = computed(() => {
    const allCalls = this.leadService.calls();
    const user = this.authService.currentUser();
    if (!user) return [];
    const uId = String(user.id || '').trim();
    const uEmail = String(user.email || '').toLowerCase().trim();
    const uName = String(user.fullName || '').toLowerCase().trim();
    const todayStr = new Date().toISOString().slice(0, 10);

    return allCalls.filter((c) => {
      const cId = String(c.telecallerId || '').trim();
      const cEmail = String(c.telecallerEmail || '').toLowerCase().trim();
      const cName = String(c.telecallerName || '').toLowerCase().trim();
      const isCaller = (uId && cId === uId) ||
                       (uEmail && cEmail === uEmail) ||
                       (uName && (cName === uName || cName.includes(uName)));
      const isToday = c.calledAt && c.calledAt.startsWith(todayStr);
      return isCaller && isToday;
    });
  });

  readonly myUniqueCallsTodayCount = computed(() => {
    const set = new Set(
      this.myCallsToday()
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter(Boolean)
    );
    return set.size;
  });

  readonly myTargetQuota = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return 30;
    const t = this.targetService.getTargetForTelecaller(user.id);
    return t.dailyCallsTarget || 30;
  });

  readonly myCallsTargetPct = computed(() => {
    const quota = this.myTargetQuota();
    const completed = this.myUniqueCallsTodayCount();
    return quota > 0 ? Math.min(100, Math.round((completed / quota) * 100)) : 0;
  });

  readonly myInterestedCount = computed(() => {
    return this.telecallerAssignedLeads().filter(
      (l) => String(l.status || '').toUpperCase() === 'INTERESTED'
    ).length;
  });

  readonly myTargetInterestedQuota = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return 5;
    const t = this.targetService.getTargetForTelecaller(user.id);
    return t.dailyInterestedTarget || 5;
  });

  readonly myInterestedTodayCount = computed(() => {
    const todayCalls = this.myCallsToday();
    const set = new Set(
      todayCalls
        .filter((c) => String(c.outcome || '').toUpperCase() === 'INTERESTED')
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter(Boolean)
    );
    return set.size;
  });

  readonly myInterestedTargetPct = computed(() => {
    const quota = this.myTargetInterestedQuota();
    const completed = this.myInterestedTodayCount();
    return quota > 0 ? Math.min(100, Math.round((completed / quota) * 100)) : 0;
  });

  readonly myPaidConversionsCount = computed(() => {
    const leads = this.telecallerAssignedLeads();
    const leadPaidCount = leads.filter((l) => {
      const s = String(l.status || '').toUpperCase();
      return s === 'PAID' || s === 'QUALIFIED' || s === 'CONVERTED' || (l as any).paid === true;
    }).length;

    const txns = this.txnService.transactions();
    const user = this.authService.currentUser();
    const uId = String(user?.id || '').trim();
    const uName = String(user?.fullName || '').toLowerCase().trim();
    const userTxnsCount = txns.filter((t) => {
      const rec = String(t.recordedBy || '').trim();
      const recName = String(t.recorderName || '').toLowerCase().trim();
      return (uId && rec === uId) || (uName && (recName === uName || recName.includes(uName)));
    }).length;

    return Math.max(leadPaidCount, userTxnsCount);
  });

  readonly myPaidTodayCount = computed(() => {
    const todayCalls = this.myCallsToday();
    const set = new Set(
      todayCalls
        .filter((c) => {
          const out = String(c.outcome || '').toUpperCase();
          return out === 'PAID' || out === 'QUALIFIED' || out === 'CONVERTED';
        })
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter(Boolean)
    );
    return set.size;
  });

  readonly myFollowUpsCount = computed(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return this.telecallerAssignedLeads().filter((l) => {
      if (l.status === 'FOLLOW_UP' || l.status === 'CALLBACK_REQUESTED' || (l as any).followUpDate) {
        const d = (l as any).followUpDate || '';
        return !d || d.startsWith(todayStr) || d <= todayStr;
      }
      return false;
    }).length;
  });

  readonly telecallerPendingCallsCount = computed(() => this.myPendingQueueCount());

  readonly telecallerQualifiedCount = computed(() =>
    this.telecallerAssignedLeads().filter((l) => l.status === 'QUALIFIED').length
  );

  readonly totalCallsLoggedCount = computed(() => this.leadService.calls().length);

  readonly bdmCreatedTasks = computed(() => {
    const tasks = this.taskService.tasks();
    const user = this.authService.currentUser();
    const userId = String(user?.id || '');
    const userEmail = String(user?.email || '').toLowerCase().trim();
    const userName = String(user?.fullName || '').toLowerCase().trim();

    return tasks.filter((t) =>
      t.creatorRole === 'BDM' ||
      (t.createdBy && String(t.createdBy) === userId) ||
      (userEmail && t.createdBy && String(t.createdBy).toLowerCase() === userEmail) ||
      (userName && t.creatorName && String(t.creatorName).toLowerCase().includes(userName))
    );
  });

  readonly bdmInProgressCount = computed(() =>
    this.bdmCreatedTasks().filter((t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED' || t.status === 'SUBMITTED' || t.status === 'RESUBMITTED' || t.status === 'UNDER_REVIEW').length
  );

  readonly bdmApprovedCount = computed(() =>
    this.bdmCreatedTasks().filter((t) => t.status === 'APPROVED' || t.status === 'PUBLISHED' || t.status === 'COMPLETED').length
  );

  readonly bdmRevisionCount = computed(() =>
    this.bdmCreatedTasks().filter((t) => t.status === 'REVISION_REQUIRED').length
  );


  readonly bdmDesignerFlowTasks = computed(() => {
    const tasks = this.taskService.tasks();
    return tasks.filter((t) =>
      t.creatorRole === 'BDM' ||
      (t.createdBy && String(t.createdBy).toLowerCase().includes('bdm')) ||
      (t.creatorName && String(t.creatorName).toLowerCase().includes('bdm'))
    );
  });

  readonly recentCampaigns = computed(() => {
    const rawCampaigns = this.campaignService.campaigns();
    const list = rawCampaigns.map((cmp) => ({
      id: cmp.id,
      name: cmp.name,
      status: cmp.status,
      leads: cmp.leadsCount || 0,
      spend: `₹${(cmp.spend || 0).toLocaleString()}`,
      cpl: `₹${(cmp.cpl || 0).toFixed(2)}`,
    }));

    const tab = this.activeCampaignTab();
    if (tab === 'ALL') return list;
    return list.filter((c) => c.status === tab);
  });

  readonly planningCampaignsCount = computed(() => {
    return this.campaignService.campaigns().filter((c) => c.status !== 'ACTIVE').length;
  });

  readonly fixedPackages = computed(() => {
    const tasks = this.taskService.tasks();
    const campaigns = this.campaignService.campaigns();
    const leads = this.leadService.leads();
    const allPkgs = this.packageService.packages();

    const packages = [
      {
        id: 'pkg_careermate',
        name: 'Vidhvaa CareerMate',
        shortName: 'Careermate',
        image: '/vidhvaa-career-img.png',
        bgImage: '/card-bg-careermate.jpg',
        initial: 'C',
        type: 'careermate',
        colorTheme: 'emerald',
        tagline: 'CAREER & PLACEMENT SOLUTIONS',
        description: 'Bridging talent and opportunity with smart career solutions and industry connections.',
        accentScript: 'Build\nYour\nCareer',
        cardTheme: 'careermate',
      },
      {
        id: 'pkg_classmate',
        name: 'Vidhvaa Classmate',
        shortName: 'Classmate',
        image: '/vidhvaa-class-img.png',
        bgImage: '/card-bg-classmate.jpg',
        initial: 'C',
        type: 'classmate',
        colorTheme: 'indigo',
        tagline: 'STUDENT & LEARNING SOLUTIONS',
        description: 'Connecting students, mentors and opportunities for a brighter future.',
        accentScript: 'Learn\nTogether\nGrow',
        cardTheme: 'classmate',
      },
      {
        id: 'pkg_jesus_messanger',
        name: 'Jesus the Messenger',
        shortName: 'Jesus the messanger',
        image: '/jesus-img.png',
        bgImage: '/card-bg-jesus.jpg',
        initial: 'J',
        type: 'jesus',
        colorTheme: 'purple',
        tagline: 'FAITH & MINISTRY SOLUTIONS',
        description: 'Spreading the message of hope, faith and love through digital platforms.',
        accentScript: 'Share\nHis Love',
        cardTheme: 'jesus',
      },
    ];

    return packages.map((pkg) => {
      const pkgTasks = tasks.filter((t) => isTaskForPackage(t, pkg.shortName) || isTaskForPackage(t, pkg.name));

      const key = pkg.shortName.toLowerCase();
      const pkgCreated = allPkgs.filter((p) => {
        const prodId = (p.productId || '').toLowerCase();
        if (prodId === pkg.id.toLowerCase()) return true;
        if (key.includes('career') && prodId.includes('career')) return true;
        if (key.includes('class') && prodId.includes('class')) return true;
        if ((key.includes('jesus') || key.includes('messang')) && (prodId.includes('jesus') || prodId.includes('messang'))) return true;
        return false;
      });

      const pkgCmps = campaigns.filter((c) => {
        const cName = (c.name || '').toLowerCase();
        const cPkg = ((c as any).packageName || '').toLowerCase();
        return (
          cName.includes(key) ||
          cPkg.includes(key) ||
          (key.includes('career') && cName.includes('career')) ||
          (key.includes('class') && cName.includes('class')) ||
          ((key.includes('jesus') || key.includes('messang') || key.includes('messeng')) &&
            (cName.includes('jesus') || cName.includes('messang') || cName.includes('messeng') || cName.includes('outreach')))
        );
      });

      const pkgLeads = leads.filter((l) => {
        const lCmp = (l.campaignName || '').toLowerCase();
        const lSrc = (l.source || '').toLowerCase();
        const lPkg = ((l as any).packageName || '').toLowerCase();
        return (
          lCmp.includes(key) ||
          lSrc.includes(key) ||
          lPkg.includes(key) ||
          (key.includes('career') && (lCmp.includes('career') || lSrc.includes('career'))) ||
          (key.includes('class') && (lCmp.includes('class') || lSrc.includes('class'))) ||
          ((key.includes('jesus') || key.includes('messang') || key.includes('messeng')) &&
            (lCmp.includes('jesus') || lSrc.includes('jesus') || lCmp.includes('messang') || lSrc.includes('messang')))
        );
      });

      const summary = this.packageService.summary();
      const countFromSummary = summary ? (summary[pkg.id] ?? 0) : 0;
      const finalPkgCount = Math.max(pkgCreated.length, countFromSummary);

      return {
        ...pkg,
        packageCount: finalPkgCount,
        taskCount: pkgTasks.length,
        campaignCount: pkgCmps.length,
        leadCount: pkgLeads.length,
      };
    });
  });

  setCampaignTab(tab: 'ALL' | 'ACTIVE' | 'PLANNING'): void {
    this.activeCampaignTab.set(tab);
  }

  async ngOnInit(): Promise<void> {
    await this.authService.ensureInitialized();
    if (this.authService.isAuthenticated()) {
      await this.taskService.getAllTasks();
      this.taskService.loadDesignerMetrics();
      this.packageService.loadAllPackages().subscribe();
      this.packageService.loadSummary().subscribe();
      this.campaignService.loadCampaigns().subscribe();
      this.leadService.loadLeads().subscribe();
      this.leadService.loadCalls().subscribe();
      this.targetService.loadTargets();
      this.txnService.loadTransactions().subscribe();
    }
  }
}
