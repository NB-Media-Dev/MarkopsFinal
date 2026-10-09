import { Component, inject, OnInit, signal, computed, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { CampaignService, CampaignItem } from '../../core/services/campaign.service';
import { AuthService } from '../../core/services/auth.service';
import { FIXED_PACKAGES, isItemForPackage, resolveProductContext } from '../../core/models/package.model';
import { PackageService } from '../../core/services/package.service';
import { CampaignKpisComponent } from './components/campaign-kpis/campaign-kpis.component';
import { CampaignToolbarComponent } from './components/campaign-toolbar/campaign-toolbar.component';
import { CampaignsTableComponent } from './components/campaigns-table/campaigns-table.component';
import { CampaignFormModalComponent } from './components/modals/campaign-form-modal/campaign-form-modal.component';
import { CampaignDeleteModalComponent } from './components/modals/campaign-delete-modal/campaign-delete-modal.component';

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CampaignKpisComponent,
    CampaignToolbarComponent,
    CampaignsTableComponent,
    CampaignFormModalComponent,
    CampaignDeleteModalComponent,
  ],
  templateUrl: './campaigns.component.html',
  styleUrl: './campaigns.component.scss',
})
export class CampaignsComponent implements OnInit {
  readonly packageFilterSignal = signal<string | undefined>(undefined);
  @Input() set packageFilter(val: string | undefined) {
    this.packageFilterSignal.set(val);
  }
  get packageFilter(): string | undefined {
    return this.packageFilterSignal();
  }

  readonly productFilterSignal = signal<string | undefined>(undefined);
  @Input() set productFilter(val: string | undefined) {
    this.productFilterSignal.set(val);
  }
  get productFilter(): string | undefined {
    return this.productFilterSignal();
  }

  @Input() embedded = false;
  @Input() hideKpis = false;
  @Output() switchTab = new EventEmitter<string>();

  readonly campaignService = inject(CampaignService);
  readonly packageService = inject(PackageService);
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly showModal = signal<boolean>(false);
  readonly isEditing = signal<boolean>(false);
  readonly editingCampaignId = signal<string | null>(null);

  readonly filterStatus = signal<string>('ALL');
  readonly searchQuery = signal<string>('');
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly todayDate = new Date().toISOString().split('T')[0];


  formModel = {
    name: '',
    status: 'ACTIVE' as 'PLANNING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED',
    objective: 'LEAD_GENERATION',
    spend: 0,
    leadsCount: 0,
    qualifiedLeads: 0,
    conversions: 0,
    budget: 50000,
    targetLeads: 300,
    targetCpl: 50,
    startDate: new Date().toISOString().split('T')[0],
  };

 
  readonly deleteConfirmTarget = signal<CampaignItem | null>(null);


  readonly totalSpend = computed(() =>
    this.filteredCampaigns.reduce((sum, c) => sum + (c.spend || 0), 0)
  );

  readonly totalBudget = computed(() =>
    this.filteredCampaigns.reduce((sum, c) => sum + (c.budget || 0), 0)
  );

  readonly totalLeads = computed(() =>
    this.filteredCampaigns.reduce((sum, c) => sum + (c.leadsCount || 0), 0)
  );

  readonly totalQualifiedLeads = computed(() =>
    this.filteredCampaigns.reduce((sum, c) => sum + (c.qualifiedLeads || 0), 0)
  );

  readonly totalConversions = computed(() =>
    this.filteredCampaigns.reduce((sum, c) => sum + (c.conversions || 0), 0)
  );

  readonly averageCpl = computed(() => {
    const leads = this.totalLeads();
    return leads > 0 ? (this.totalSpend() / leads).toFixed(2) : '0.00';
  });

  readonly overallConvRate = computed(() => {
    const leads = this.totalLeads();
    const conv = this.totalConversions();
    return leads > 0 ? ((conv / leads) * 100).toFixed(1) : '0.0';
  });

  readonly budgetUsedPercent = computed(() => {
    const b = this.totalBudget();
    const s = this.totalSpend();
    return b > 0 ? Math.min(100, Math.round((s / b) * 100)) : 0;
  });

  readonly activeCampaignsCount = computed(() =>
    this.filteredCampaigns.filter((c) => c.status === 'ACTIVE').length
  );

  readonly planningCampaignsCount = computed(() =>
    this.filteredCampaigns.filter((c) => c.status === 'PLANNING').length
  );

  readonly pausedCampaignsCount = computed(() =>
    this.filteredCampaigns.filter((c) => c.status === 'PAUSED').length
  );

  readonly completedCampaignsCount = computed(() =>
    this.filteredCampaigns.filter((c) => c.status === 'COMPLETED').length
  );

  readonly totalClicks = computed(() => {
    const allAds = this.campaignService.ads();
    const pkg = this.packageFilterSignal()?.trim();
    const prod = this.productFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();
    const filtered = allAds.filter((a) => isItemForPackage(a, pkg, prod, dbPkgs));
    return filtered.reduce((sum, a) => sum + (a.clicks || 0), 0);
  });

  onViewAnalytics() {
    if (this.embedded) {
      this.switchTab.emit('ADS');
    } else {
      this.router.navigate(['/ads']);
    }
  }

  onViewLeads() {
    if (this.embedded) {
      this.switchTab.emit('LEADS');
    } else {
      this.router.navigate(['/leads']);
    }
  }

  readonly canManageCampaigns = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return false;
    const role = user.role ? String(user.role).toUpperCase() : '';
    return (
      role === 'ADMINISTRATOR' ||
      role === 'MARKETING_MANAGER' ||
      role === 'DIGITAL_MARKETING'
    );
  });

  setFilterStatus(st: string) {
    this.filterStatus.set(st);
  }

  ngOnInit() {
    this.campaignService.loadCampaigns().subscribe();
    this.packageService.loadPackages().subscribe();
  }

  get computedModalCpl(): string {
    const spend = Number(this.formModel.spend) || 0;
    const leads = Number(this.formModel.leadsCount) || 0;
    return leads > 0 ? (spend / leads).toFixed(2) : '0.00';
  }

  get computedModalConvRate(): string {
    const leads = Number(this.formModel.leadsCount) || 0;
    const conv = Number(this.formModel.conversions) || 0;
    return leads > 0 ? ((conv / leads) * 100).toFixed(1) : '0.0';
  }

  openCreateModal() {
    if (!this.canManageCampaigns()) {
      this.errorMessage.set('Access Denied: Only Marketing Manager, Digital Marketing Specialist, and Administrator can create campaigns.');
      return;
    }
    this.isEditing.set(false);
    this.editingCampaignId.set(null);
    const defaultPrefix = this.packageFilter ? `${this.packageFilter} - ` : '';
    this.formModel = {
      name: defaultPrefix,
      status: 'ACTIVE',
      objective: 'LEAD_GENERATION',
      spend: 0,
      leadsCount: 0,
      qualifiedLeads: 0,
      conversions: 0,
      budget: 50000,
      targetLeads: 300,
      targetCpl: 50,
      startDate: new Date().toISOString().split('T')[0],
    };
    this.errorMessage.set(null);
    this.showModal.set(true);
  }

  openEditModal(cmp: CampaignItem) {
    if (!this.canManageCampaigns()) {
      this.errorMessage.set('Access Denied: Only Marketing Manager, Digital Marketing Specialist, and Administrator can edit campaigns.');
      return;
    }
    this.isEditing.set(true);
    this.editingCampaignId.set(cmp.id);
    this.formModel = {
      name: cmp.name,
      status: cmp.status as any,
      objective: cmp.objective || 'LEAD_GENERATION',
      spend: cmp.spend || 0,
      leadsCount: cmp.leadsCount || 0,
      qualifiedLeads: cmp.qualifiedLeads || 0,
      conversions: cmp.conversions || 0,
      budget: cmp.budget || 50000,
      targetLeads: cmp.targetLeads || 300,
      targetCpl: cmp.targetCpl || 50,
      startDate: cmp.startDate || new Date().toISOString().split('T')[0],
    };
    this.errorMessage.set(null);
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingCampaignId.set(null);
    this.errorMessage.set(null);
  }

  saveCampaign() {
    if (!this.canManageCampaigns()) {
      this.errorMessage.set('Access Denied: Only Marketing Manager, Digital Marketing Specialist, and Administrator can create or modify campaigns.');
      return;
    }

    if (!this.formModel.name || !this.formModel.name.trim()) {
      this.errorMessage.set('Campaign name is required.');
      return;
    }

    const user = this.authService.currentUser();
    const spend = Number(this.formModel.spend) || 0;
    const leads = Number(this.formModel.leadsCount) || 0;
    const conversions = Number(this.formModel.conversions) || 0;
    const qualified = Number(this.formModel.qualifiedLeads) || 0;
    const computedCpl = leads > 0 ? Number((spend / leads).toFixed(2)) : 0;
    const computedConvRate = leads > 0 ? Number(((conversions / leads) * 100).toFixed(1)) : 0;

    const pkg = this.packageFilterSignal()?.trim();
    const prod = this.productFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();
    const resolved = resolveProductContext(pkg, prod, dbPkgs);

    const activePkg = pkg || resolved.productName;

    const payload: Partial<CampaignItem> & { creatorRole?: string; userRole?: string } = {
      name: this.formModel.name.trim(),
      status: this.formModel.status,
      objective: this.formModel.objective,
      productId: resolved.productId,
      packageName: activePkg,
      spend: spend,
      leadsCount: leads,
      cpl: computedCpl,
      qualifiedLeads: qualified,
      conversions: conversions,
      convRate: computedConvRate,
      budget: Number(this.formModel.budget) || 50000,
      targetLeads: Number(this.formModel.targetLeads) || 300,
      targetCpl: Number(this.formModel.targetCpl) || 50,
      startDate: this.formModel.startDate,
      ownerId: user?.id,
      ownerName: user?.fullName,
      creatorRole: user?.role,
      userRole: user?.role,
    };

    if (this.isEditing() && this.editingCampaignId()) {
      this.campaignService.updateCampaign(this.editingCampaignId()!, payload).subscribe({
        next: () => {
          this.closeModal();
          this.showFlashMessage('Campaign updated successfully.');
        },
        error: (err) => {
          this.errorMessage.set(err?.error?.error || 'Failed to update campaign.');
        },
      });
    } else {
      this.campaignService.createCampaign(payload).subscribe({
        next: () => {
          this.closeModal();
          this.showFlashMessage('New campaign created successfully.');
        },
        error: (err) => {
          this.errorMessage.set(err?.error?.error || 'Failed to create campaign.');
        },
      });
    }
  }

  confirmDelete(cmp: CampaignItem) {
    if (!this.canManageCampaigns()) {
      this.errorMessage.set('Access Denied: Only Marketing Manager, Digital Marketing Specialist, and Administrator can delete campaigns.');
      return;
    }
    this.deleteConfirmTarget.set(cmp);
  }

  cancelDelete() {
    this.deleteConfirmTarget.set(null);
  }

  executeDelete() {
    if (!this.canManageCampaigns()) {
      this.errorMessage.set('Access Denied: Only Marketing Manager, Digital Marketing Specialist, and Administrator can delete campaigns.');
      return;
    }
    const target = this.deleteConfirmTarget();
    if (!target) return;

    this.campaignService.deleteCampaign(target.id).subscribe({
      next: () => {
        this.deleteConfirmTarget.set(null);
        this.showFlashMessage(`Campaign "${target.name}" deleted.`);
      },
      error: (err) => {
        this.deleteConfirmTarget.set(null);
        this.errorMessage.set(err?.error?.error || 'Failed to delete campaign.');
      },
    });
  }

  showFlashMessage(msg: string) {
    this.successMessage.set(msg);
    setTimeout(() => {
      if (this.successMessage() === msg) {
        this.successMessage.set(null);
      }
    }, 4000);
  }

  get filteredCampaigns(): CampaignItem[] {
    let list = this.campaignService.campaigns();
    const st = this.filterStatus();
    const q = this.searchQuery().trim().toLowerCase();
    const pkg = this.packageFilterSignal()?.trim();
    const prod = this.productFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();

    if ((pkg && pkg.toLowerCase() !== 'all') || (prod && prod.toLowerCase() !== 'all')) {
      list = list.filter((c) => isItemForPackage(c, pkg, prod, dbPkgs));
    }

    if (st !== 'ALL') {
      list = list.filter((c) => c.status === st);
    }

    if (q) {
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.objective && c.objective.toLowerCase().includes(q))
      );
    }

    return list;
  }
}

