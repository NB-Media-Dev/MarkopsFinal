import { Component, inject, OnInit, signal, computed, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CampaignService, AdItem, CampaignItem } from '../../core/services/campaign.service';
import { TaskManagementService } from '../../core/services/task-management.service';
import { AuthService } from '../../core/services/auth.service';
import { FIXED_PACKAGES, isItemForPackage, resolveProductContext } from '../../core/models/package.model';
import { PackageService } from '../../core/services/package.service';
import { AdKpisComponent } from './components/ad-kpis/ad-kpis.component';
import { AdsToolbarComponent } from './components/ads-toolbar/ads-toolbar.component';
import { AdsTableComponent } from './components/ads-table/ads-table.component';
import { AdFormModalComponent } from './components/modals/ad-form-modal/ad-form-modal.component';
import { AdDeleteModalComponent } from './components/modals/ad-delete-modal/ad-delete-modal.component';

@Component({
  selector: 'app-ads',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AdKpisComponent,
    AdsToolbarComponent,
    AdsTableComponent,
    AdFormModalComponent,
    AdDeleteModalComponent,
  ],
  templateUrl: './ads.component.html',
  styleUrl: './ads.component.scss',
})
export class AdsComponent implements OnInit {
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

  readonly campaignService = inject(CampaignService);
  readonly packageService = inject(PackageService);
  readonly taskService = inject(TaskManagementService);
  readonly authService = inject(AuthService);

  readonly showModal = signal<boolean>(false);
  readonly isEditing = signal<boolean>(false);
  readonly editingAdId = signal<string | null>(null);

  readonly filterPlatform = signal<string>('ALL');
  readonly searchQuery = signal<string>('');
  readonly syncing = signal<boolean>(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  formModel = {
    name: '',
    campaignId: '',
    campaignName: '',
    platform: 'Meta' as 'Meta' | 'Google Ads' | 'Instagram' | 'LinkedIn' | 'YouTube',
    status: 'ACTIVE' as 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'DRAFT',
    spend: 0,
    leadsCount: 0,
    impressions: 5000,
    clicks: 150,
    ctr: 3.0,
    cpc: 5.0,
    platformAdId: '',
    designId: '',
    designTitle: '',
    designImageUrl: '',
  };

  readonly deleteConfirmTarget = signal<AdItem | null>(null);

  readonly totalSpend = computed(() =>
    this.filteredAds.reduce((sum, a) => sum + (a.spend || 0), 0)
  );

  readonly totalLeads = computed(() =>
    this.filteredAds.reduce((sum, a) => sum + (a.leadsCount || 0), 0)
  );

  readonly averageCpl = computed(() => {
    const leads = this.totalLeads();
    return leads > 0 ? (this.totalSpend() / leads).toFixed(2) : '0.00';
  });

  readonly averageCtr = computed(() => {
    const ads = this.filteredAds;
    if (ads.length === 0) return '0.00';
    const totalCtr = ads.reduce((sum, a) => sum + (a.ctr || 0), 0);
    return (totalCtr / ads.length).toFixed(2);
  });

  readonly canManageAds = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return false;
    const role = user.role ? String(user.role).toUpperCase() : '';
    return role === 'ADMINISTRATOR' || role === 'DIGITAL_MARKETING';
  });

  readonly filteredCampaigns = computed(() => {
    const list = this.campaignService.campaigns();
    const pkg = this.packageFilterSignal()?.trim();
    const prod = this.productFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();
    if ((!pkg || pkg.toLowerCase() === 'all') && (!prod || prod.toLowerCase() === 'all')) return list;

    return list.filter((c) => isItemForPackage(c, pkg, prod, dbPkgs));
  });

  ngOnInit() {
    this.campaignService.loadAds().subscribe();
    this.campaignService.loadCampaigns().subscribe();
    this.packageService.loadPackages().subscribe();
    this.taskService.loadTasks();
  }

  get computedModalCpl(): string {
    const spend = Number(this.formModel.spend) || 0;
    const leads = Number(this.formModel.leadsCount) || 0;
    return leads > 0 ? (spend / leads).toFixed(2) : '0.00';
  }

  get computedModalCtr(): string {
    const impressions = Number(this.formModel.impressions) || 0;
    const clicks = Number(this.formModel.clicks) || 0;
    if (impressions > 0 && clicks > 0) {
      return ((clicks / impressions) * 100).toFixed(2);
    }
    return Number(this.formModel.ctr || 0).toFixed(2);
  }

  onCampaignSelected(campaignId: string) {
    this.formModel.campaignId = campaignId;
    const cmp = this.campaignService.campaigns().find((c) => c.id === campaignId);
    if (cmp) {
      this.formModel.campaignName = cmp.name;
    }
  }

  openCreateModal() {
    if (!this.canManageAds()) {
      this.errorMessage.set('Access Denied: Only Digital Marketing Specialists and Administrators can create ads.');
      return;
    }
    this.isEditing.set(false);
    this.editingAdId.set(null);
    const campaigns = this.filteredCampaigns();
    const defaultCmp = campaigns.length > 0 ? campaigns[0] : (this.campaignService.campaigns()[0] || null);

    const defaultPrefix = this.packageFilter ? `${this.packageFilter} - ` : '';

    this.formModel = {
      name: defaultPrefix,
      campaignId: defaultCmp ? defaultCmp.id : '',
      campaignName: defaultCmp ? defaultCmp.name : (this.packageFilter ? `${this.packageFilter} Funnel` : 'General Digital Funnel'),
      platform: 'Meta',
      status: 'ACTIVE',
      spend: 0,
      leadsCount: 0,
      impressions: 5000,
      clicks: 150,
      ctr: 3.0,
      cpc: 5.0,
      platformAdId: `ad_ext_${Math.floor(100000 + Math.random() * 900000)}`,
      designId: '',
      designTitle: '',
      designImageUrl: '',
    };
    this.errorMessage.set(null);
    this.showModal.set(true);
  }

  openEditModal(ad: AdItem) {
    if (!this.canManageAds()) {
      this.errorMessage.set('Access Denied: Only Digital Marketing Specialists and Administrators can edit ads.');
      return;
    }
    this.isEditing.set(true);
    this.editingAdId.set(ad.id);
    this.formModel = {
      name: ad.name,
      campaignId: ad.campaignId || '',
      campaignName: ad.campaignName || '',
      platform: ad.platform as any,
      status: ad.status as any,
      spend: ad.spend || 0,
      leadsCount: ad.leadsCount || 0,
      impressions: ad.impressions || 5000,
      clicks: ad.clicks || 150,
      ctr: ad.ctr || 3.0,
      cpc: ad.cpc || 5.0,
      platformAdId: ad.platformAdId || '',
      designId: ad.designId || '',
      designTitle: ad.designTitle || '',
      designImageUrl: ad.designImageUrl || '',
    };
    this.errorMessage.set(null);
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingAdId.set(null);
    this.errorMessage.set(null);
  }

  saveAd() {
    if (!this.canManageAds()) {
      this.errorMessage.set('Access Denied: Only Digital Marketing Specialists and Administrators can create or modify ads.');
      return;
    }

    if (!this.formModel.name || !this.formModel.name.trim()) {
      this.errorMessage.set('Ad Name is required.');
      return;
    }

    const user = this.authService.currentUser();
    const spend = Number(this.formModel.spend) || 0;
    const leads = Number(this.formModel.leadsCount) || 0;
    const impressions = Number(this.formModel.impressions) || 5000;
    const clicks = Number(this.formModel.clicks) || 150;
    const computedCpl = leads > 0 ? Number((spend / leads).toFixed(2)) : 0;
    const computedCtr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : Number(this.formModel.ctr || 0);
    const computedCpc = clicks > 0 ? Number((spend / clicks).toFixed(2)) : Number(this.formModel.cpc || 0);

    const pkg = this.packageFilterSignal()?.trim();
    const prod = this.productFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();
    const resolved = resolveProductContext(pkg, prod, dbPkgs);

    const activePkg = pkg || resolved.productName;

    const payload: Partial<AdItem> & { creatorRole?: string; userRole?: string } = {
      name: this.formModel.name.trim(),
      campaignId: this.formModel.campaignId,
      campaignName: this.formModel.campaignName || 'General Digital Funnel',
      productId: resolved.productId,
      packageName: activePkg,
      platform: this.formModel.platform,
      status: this.formModel.status,
      spend: spend,
      leadsCount: leads,
      cpl: computedCpl,
      impressions: impressions,
      clicks: clicks,
      ctr: computedCtr,
      cpc: computedCpc,
      platformAdId: this.formModel.platformAdId,
      designId: this.formModel.designId || undefined,
      designTitle: this.formModel.designTitle || undefined,
      designImageUrl: this.formModel.designImageUrl || undefined,
      creatorRole: user?.role,
      userRole: user?.role,
    };

    if (this.isEditing() && this.editingAdId()) {
      this.campaignService.updateAd(this.editingAdId()!, payload).subscribe({
        next: () => {
          this.closeModal();
          this.showFlashMessage('Ad performance metrics updated successfully.');
        },
        error: (err) => {
          this.errorMessage.set(err?.error?.error || 'Failed to update ad.');
        },
      });
    } else {
      this.campaignService.createAd(payload).subscribe({
        next: () => {
          this.closeModal();
          this.showFlashMessage('New ad metric created successfully.');
        },
        error: (err) => {
          this.errorMessage.set(err?.error?.error || 'Failed to create ad.');
        },
      });
    }
  }

  confirmDelete(ad: AdItem) {
    if (!this.canManageAds()) {
      this.errorMessage.set('Access Denied: Only Digital Marketing Specialists and Administrators can delete ads.');
      return;
    }
    this.deleteConfirmTarget.set(ad);
  }

  cancelDelete() {
    this.deleteConfirmTarget.set(null);
  }

  executeDelete() {
    if (!this.canManageAds()) {
      this.errorMessage.set('Access Denied: Only Digital Marketing Specialists and Administrators can delete ads.');
      return;
    }
    const target = this.deleteConfirmTarget();
    if (!target) return;

    this.campaignService.deleteAd(target.id).subscribe({
      next: () => {
        this.deleteConfirmTarget.set(null);
        this.showFlashMessage(`Ad "${target.name}" deleted.`);
      },
      error: (err) => {
        this.deleteConfirmTarget.set(null);
        this.errorMessage.set(err?.error?.error || 'Failed to delete ad.');
      },
    });
  }

  syncAdAccounts() {
    if (!this.canManageAds()) {
      this.errorMessage.set('Access Denied: Only Digital Marketing Specialists and Administrators can trigger ad sync.');
      return;
    }
    this.syncing.set(true);
    this.campaignService.syncAds().subscribe({
      next: (res) => {
        this.syncing.set(false);
        this.showFlashMessage(res?.message || 'Ad metrics successfully synced.');
      },
      error: (err) => {
        this.syncing.set(false);
        this.errorMessage.set(err?.error?.error || 'Failed to synchronize ad accounts.');
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

  get filteredAds(): AdItem[] {
    let list = this.campaignService.ads();
    const plat = this.filterPlatform();
    const q = this.searchQuery().trim().toLowerCase();
    const pkg = this.packageFilterSignal()?.trim();
    const prod = this.productFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();

    if ((pkg && pkg.toLowerCase() !== 'all') || (prod && prod.toLowerCase() !== 'all')) {
      list = list.filter((a) => isItemForPackage(a, pkg, prod, dbPkgs));
    }

    if (plat !== 'ALL') {
      list = list.filter((a) => a.platform === plat);
    }

    if (q) {
      list = list.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        (a.campaignName && a.campaignName.toLowerCase().includes(q)) ||
        (a.platform && a.platform.toLowerCase().includes(q))
      );
    }

    return list;
  }
}

