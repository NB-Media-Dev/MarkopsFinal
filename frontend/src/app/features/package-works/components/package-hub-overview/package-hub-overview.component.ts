import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OperationDepartment } from '../../package-works.component';

@Component({
  selector: 'app-package-hub-overview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './package-hub-overview.component.html',
  styleUrl: './package-hub-overview.component.scss',
})
export class PackageHubOverviewComponent {
  @Input() packageMetrics: any = null;
  @Input() operationDepartments: OperationDepartment[] = [];
  @Input() isTelecaller = false;
  @Input() telecallerPipelineCounts: {
    all: number;
    new: number;
    followUp: number;
    interested: number;
    qualified: number;
    retry?: number;
  } | null = null;

  @Input() isDesigner = false;
  @Input() designerPipelineCounts: {
    all: number;
    inProgress: number;
    revision: number;
    inReview: number;
    approved: number;
  } | null = null;

  @Output() departmentSelect = new EventEmitter<string>();

  onSelectDepartment(deptId: string) {
    this.departmentSelect.emit(deptId);
  }

  getDepartmentIcon(deptId: string): string {
    switch (deptId) {
      case 'DESIGNER': return 'palette';
      case 'DIGITAL_MARKETING': return 'campaign';
      case 'TELECALLING': return 'phone_in_talk';
      case 'ANALYTICS': return 'monitoring';
      default: return 'category';
    }
  }

  getDepartmentBadge(deptId: string): string {
    switch (deptId) {
      case 'DESIGNER': return 'Tasks & Creatives';
      case 'DIGITAL_MARKETING': return 'Campaigns & Leads';
      case 'TELECALLING': return 'Calls & Targets';
      case 'ANALYTICS': return 'Reports & Audits';
      default: return 'Operations';
    }
  }


  getDepartmentMetricCount(deptId: string): string {
    switch (deptId) {
      case 'DESIGNER': {
        const count = this.designerPipelineCounts?.all ?? this.packageMetrics?.totalTasks ?? 0;
        return `${count} Tasks`;
      }
      case 'DIGITAL_MARKETING': {
        const count = this.packageMetrics?.totalCampaigns ?? 0;
        return `${count} Campaigns`;
      }
      case 'TELECALLING': {
        const count = this.telecallerPipelineCounts?.all ?? this.packageMetrics?.totalLeads ?? 0;
        return `${count} Calls`;
      }
      case 'ANALYTICS': {
        return `0 Reports`;
      }
      default:
        return `0 Items`;
    }
  }

  getDepartmentActiveCount(deptId: string): number {
    switch (deptId) {
      case 'DESIGNER':
        return this.designerPipelineCounts?.inProgress ?? 0;
      case 'DIGITAL_MARKETING':
        return 0;
      case 'TELECALLING':
        return this.telecallerPipelineCounts?.followUp ?? this.telecallerPipelineCounts?.interested ?? 0;
      case 'ANALYTICS':
        return 0;
      default:
        return 0;
    }
  }
}
