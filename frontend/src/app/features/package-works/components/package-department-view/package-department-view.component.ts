import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RoleOperationTab, FixedPackageMeta } from '../../../../core/models/package.model';

import { DesignerDashboardComponent } from '../../../designer/designer-dashboard.component';
import { TelecallingComponent } from '../../../telecalling/telecalling.component';
import { TargetsComponent } from '../../../targets/targets.component';
import { LeadsComponent } from '../../../leads/leads.component';
import { CampaignsComponent } from '../../../campaigns/campaigns.component';
import { AdsComponent } from '../../../ads/ads.component';

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
