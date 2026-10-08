import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CampaignItem } from '../../../../../core/services/campaign.service';
import { Task } from '../../../../../core/models/task.model';
import { isTaskForPackage } from '../../../../../core/models/package.model';

export interface ApprovedDesignItem {
  id: string;
  title: string;
  packageName: string;
  campaignName?: string;
  campaignId?: string;
  versionNumber: number;
  imageUrl: string;
  approverName: string;
  approverRole: 'BDM' | 'ADMIN' | 'MANAGER';
  approvedAt?: string;
  status: string;
}

@Component({
  selector: 'app-ad-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ad-form-modal.component.html',
  styleUrl: './ad-form-modal.component.scss',
})
export class AdFormModalComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() isEditing = false;
  @Input() formModel: any = {};
  @Input() campaigns: CampaignItem[] = [];
  @Input() tasks: Task[] = [];
  @Input() packageFilter?: string;
  @Input() computedModalCpl = '0.00';
  @Input() computedModalCtr = '0.00';

  @Output() campaignSelected = new EventEmitter<string>();
  @Output() closeModal = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();

  designSearchQuery = '';
  selectedDesignId: string | null = null;
  activeFilterPackage = 'ALL';

  ngOnInit() {
    this.syncSelectedDesignFromModel();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen'] && this.isOpen) {
      this.syncSelectedDesignFromModel();
    }
  }

  private syncSelectedDesignFromModel() {
    if (this.formModel) {
      this.selectedDesignId = this.formModel.designId || null;
      if (!this.selectedDesignId && this.formModel.name) {
        const found = this.allApprovedDesigns.find(
          (d) => d.title.toLowerCase() === this.formModel.name.toLowerCase()
        );
        if (found) {
          this.selectedDesignId = found.id;
        }
      }
    }
  }

  get allApprovedDesigns(): ApprovedDesignItem[] {
    const list: ApprovedDesignItem[] = [];
    const activePkg = this.packageFilter?.trim().toLowerCase();

    // Extract exclusively approved tasks from task store
    if (this.tasks && this.tasks.length > 0) {
      for (const t of this.tasks) {
        const status = String(t.status || '').toUpperCase().trim();
        const isApproved = status === 'APPROVED' || status === 'COMPLETED' || status === 'PUBLISHED';
        const creatorRole = String(t.creatorRole || '').toUpperCase();
        const isBdmOrAdminCreator = creatorRole === 'BDM' || creatorRole === 'ADMINISTRATOR' || creatorRole === 'MARKETING_MANAGER' || !creatorRole;

        // Check if there is an approval in status history
        const approvalHist = t.statusHistory?.find(
          (h) => String(h.newStatus || '').toUpperCase() === 'APPROVED'
        );

        if (isApproved || isBdmOrAdminCreator || approvalHist) {
          // Strictly filter out designs belonging to other packages
          if (activePkg && activePkg !== 'all') {
            if (!isTaskForPackage(t, this.packageFilter)) {
              continue;
            }
          }
          const approverInfo = this.extractApproverInfo(t, approvalHist);
          const thumbUrl = this.extractTaskImage(t);
          const verNum = t.versions && t.versions.length > 0 ? t.versions[0].versionNumber || t.versions.length : 1;

          list.push({
            id: String(t.id),
            title: t.title,
            packageName: t.packageName || 'Careermate',
            campaignName: t.campaignName || (t.packageName ? `${t.packageName} Campaign` : undefined),
            campaignId: t.campaignId,
            versionNumber: verNum,
            imageUrl: thumbUrl,
            approverName: approverInfo.name,
            approverRole: approverInfo.role,
            approvedAt: approverInfo.label,
            status: t.status,
          });
        }
      }
    }

    return list;
  }

  get filteredApprovedDesigns(): ApprovedDesignItem[] {
    let list = this.allApprovedDesigns;
    const q = this.designSearchQuery.trim().toLowerCase();
    const pkg = this.activeFilterPackage.toLowerCase();

    if (pkg !== 'all') {
      list = list.filter((d) => d.packageName.toLowerCase().includes(pkg) || pkg.includes(d.packageName.toLowerCase()));
    }

    if (q) {
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.packageName.toLowerCase().includes(q) ||
          d.approverName.toLowerCase().includes(q) ||
          (d.campaignName && d.campaignName.toLowerCase().includes(q))
      );
    }

    return list;
  }

  get selectedDesign(): ApprovedDesignItem | null {
    if (!this.selectedDesignId) return null;
    return this.allApprovedDesigns.find((d) => d.id === this.selectedDesignId) || null;
  }

  private extractApproverInfo(t: Task, approvalHist?: any): { name: string; role: 'BDM' | 'ADMIN' | 'MANAGER'; label: string } {
    if (approvalHist) {
      const actorRole = String(approvalHist.actorRole || '').toUpperCase();
      const actorName = approvalHist.actorName || 'Supervisor';
      if (actorRole.includes('BDM')) {
        return { name: actorName, role: 'BDM', label: `Approved by BDM (${actorName})` };
      }
      if (actorRole.includes('ADMIN')) {
        return { name: actorName, role: 'ADMIN', label: `Approved by Admin (${actorName})` };
      }
      return { name: actorName, role: 'MANAGER', label: `Approved by ${actorName}` };
    }

    const creatorRole = String(t.creatorRole || '').toUpperCase();
    const creatorName = t.creatorName || 'Operations';
    if (creatorRole.includes('BDM')) {
      return { name: creatorName, role: 'BDM', label: `Approved by BDM (${creatorName})` };
    }
    if (creatorRole.includes('ADMIN')) {
      return { name: creatorName, role: 'ADMIN', label: `Approved by Admin (${creatorName})` };
    }
    return { name: 'BDM & Admin Review', role: 'BDM', label: 'Approved by BDM & Admin' };
  }

  private extractTaskImage(t: Task): string {
    if (t.versions && t.versions.length > 0) {
      for (const ver of t.versions) {
        const url = (ver as any).fileUrl || ver.filePath || ver.fileContent;
        if (url && typeof url === 'string') {
          const lower = url.toLowerCase();
          if (
            lower.startsWith('data:image/') ||
            lower.startsWith('http') ||
            lower.startsWith('/uploads/') ||
            lower.endsWith('.png') ||
            lower.endsWith('.jpg') ||
            lower.endsWith('.jpeg') ||
            lower.endsWith('.webp') ||
            lower.endsWith('.svg')
          ) {
            return url;
          }
        }
      }
    }
    if (t.attachmentUrl && typeof t.attachmentUrl === 'string') {
      const lower = t.attachmentUrl.toLowerCase();
      if (
        lower.startsWith('data:image/') ||
        lower.startsWith('http') ||
        lower.startsWith('/uploads/') ||
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.svg')
      ) {
        return t.attachmentUrl;
      }
    }

    return '';
  }

  selectDesign(design: ApprovedDesignItem) {
    this.selectedDesignId = design.id;
    this.formModel.name = design.title;
    this.formModel.designId = design.id;
    this.formModel.designTitle = design.title;
    this.formModel.designImageUrl = design.imageUrl;
    this.formModel.packageName = design.packageName;

    // Auto match campaign association
    if (design.campaignId) {
      this.formModel.campaignId = design.campaignId;
      const cmp = this.campaigns.find((c) => String(c.id) === String(design.campaignId));
      if (cmp) {
        this.formModel.campaignName = cmp.name;
        this.campaignSelected.emit(cmp.id);
      }
    } else if (this.campaigns && this.campaigns.length > 0) {
      const pkg = design.packageName.toLowerCase();
      const matchedCmp = this.campaigns.find(
        (c) =>
          c.name.toLowerCase().includes(pkg) ||
          ((c as any).packageName && (c as any).packageName.toLowerCase().includes(pkg))
      );
      if (matchedCmp) {
        this.formModel.campaignId = matchedCmp.id;
        this.formModel.campaignName = matchedCmp.name;
        this.campaignSelected.emit(matchedCmp.id);
      }
    }
  }

  clearSelectedDesign() {
    this.selectedDesignId = null;
    this.formModel.designId = '';
    this.formModel.designTitle = '';
    this.formModel.designImageUrl = '';
  }

  onCampaignChange(campaignId: string) {
    this.campaignSelected.emit(campaignId);
  }

  onClose() {
    this.closeModal.emit();
  }

  onSave() {
    this.save.emit();
  }
}
