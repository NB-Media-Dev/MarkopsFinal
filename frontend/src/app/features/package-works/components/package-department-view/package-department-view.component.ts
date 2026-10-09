import { Component, EventEmitter, Input, Output, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RoleOperationTab, FixedPackageMeta } from '../../../../core/models/package.model';

import { DesignerDashboardComponent } from '../../../designer/designer-dashboard.component';
import { TelecallingComponent } from '../../../telecalling/telecalling.component';
import { TargetsComponent } from '../../../targets/targets.component';
import { LeadsComponent } from '../../../leads/leads.component';
import { CampaignsComponent } from '../../../campaigns/campaigns.component';
import { AdsComponent } from '../../../ads/ads.component';
import { CampaignKpisComponent } from '../../../campaigns/components/campaign-kpis/campaign-kpis.component';
import { CampaignService } from '../../../../core/services/campaign.service';
import { LeadTelecallingService } from '../../../../core/services/lead-telecalling.service';

@Component({
  selector: 'app-package-department-view',
  standalone: true,
  imports: [
    CommonModule,
    DesignerDashboardComponent,
    TelecallingComponent,
    TargetsComponent,
    LeadsComponent,
    CampaignsComponent,
    AdsComponent,
    CampaignKpisComponent,
  ],
  templateUrl: './package-department-view.component.html',
  styleUrl: './package-department-view.component.scss',
})
export class PackageDepartmentViewComponent {
  @Input() currentDept: 'DESIGNER' | 'DIGITAL_MARKETING' | 'TELECALLING' | 'ANALYTICS' | null = null;
  @Input() activeDepartmentTabs: RoleOperationTab[] = [];
  @Input() activeOperationTab = '';
  @Input() currentFilterTarget = '';
  @Input() activePackageName = '';
  @Input() activePackageMeta: FixedPackageMeta | null = null;
  @Input() filteredTransactions: any[] = [];
  @Input() packageReportSummary: any = null;
  @Input() filteredAuditLogs: any[] = [];

  @Input() getAuditLogCreatorFn!: (log: any) => { name: string; role: string };
  @Input() getAuditLogAssigneeFn!: (log: any) => string;
  @Input() getAuditLogTaskTitleFn!: (log: any) => string;
  @Input() activePackageDisplayNameFn!: () => string;

  @Output() operationTabSelect = new EventEmitter<string>();
  @Output() openTaskAudit = new EventEmitter<{ log: any; event: MouseEvent }>();

  private readonly campaignService = inject(CampaignService);
  private readonly leadService = inject(LeadTelecallingService);

  readonly filteredCampaigns = computed(() => {
    const all = this.campaignService.campaigns();
    const pkg = (this.currentFilterTarget || this.activePackageName || '').toLowerCase().trim();
    if (!pkg) return all;
    return all.filter((c) => {
      const cPkg = (c.packageName || '').toLowerCase().trim();
      const cProd = (c.productId || '').toLowerCase().trim();
      return cPkg === pkg || cProd === pkg || cPkg.includes(pkg) || pkg.includes(cPkg);
    });
  });

  readonly totalCampaignsCount = computed(() => this.filteredCampaigns().length);
  readonly activeCampaignsCount = computed(() => this.filteredCampaigns().filter((c) => c.status === 'ACTIVE').length);
  readonly completedCampaignsCount = computed(() => this.filteredCampaigns().filter((c) => c.status === 'COMPLETED').length);
  readonly totalSpend = computed(() => this.filteredCampaigns().reduce((sum, c) => sum + (c.spend || 0), 0));
  readonly totalBudget = computed(() => this.filteredCampaigns().reduce((sum, c) => sum + (c.budget || 0), 0));
  readonly totalLeads = computed(() => this.filteredCampaigns().reduce((sum, c) => sum + (c.leadsCount || 0), 0));
  readonly totalQualifiedLeads = computed(() => this.filteredCampaigns().reduce((sum, c) => sum + (c.qualifiedLeads || 0), 0));
  readonly totalConversions = computed(() => this.filteredCampaigns().reduce((sum, c) => sum + (c.conversions || 0), 0));

  readonly averageCpl = computed(() => {
    const leads = this.totalLeads();
    return leads > 0 ? (this.totalSpend() / leads).toFixed(2) : '0.00';
  });

  readonly overallConvRate = computed(() => {
    const leads = this.totalLeads();
    const conv = this.totalConversions();
    return leads > 0 ? ((conv / leads) * 100).toFixed(1) : '0.0';
  });

  readonly totalClicks = computed(() => {
    const allAds = this.campaignService.ads();
    const pkg = (this.currentFilterTarget || this.activePackageName || '').toLowerCase().trim();
    const filtered = pkg
      ? allAds.filter((a) => (a.packageName || '').toLowerCase().includes(pkg) || (a.productId || '').toLowerCase().includes(pkg))
      : allAds;
    return filtered.reduce((sum, a) => sum + (a.clicks || 0), 0);
  });

  selectOperationTab(tabId: string) {
    this.operationTabSelect.emit(tabId);
  }

  onOpenTaskAuditModal(log: any, event: MouseEvent) {
    this.openTaskAudit.emit({ log, event });
  }

  getAuditLogCreator(log: any): { name: string; role: string } {
    return this.getAuditLogCreatorFn ? this.getAuditLogCreatorFn(log) : { name: 'Admin', role: 'Staff' };
  }

  getAuditLogAssignee(log: any): string {
    return this.getAuditLogAssigneeFn ? this.getAuditLogAssigneeFn(log) : 'Assigned Designer';
  }

  getAuditLogTaskTitle(log: any): string {
    return this.getAuditLogTaskTitleFn ? this.getAuditLogTaskTitleFn(log) : 'Design Task';
  }

  activePackageDisplayName(): string {
    return this.activePackageDisplayNameFn ? this.activePackageDisplayNameFn() : (this.activePackageMeta?.name || 'Package');
  }
}

