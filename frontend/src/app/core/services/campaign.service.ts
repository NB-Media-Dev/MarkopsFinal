import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';

export interface CampaignItem {
  id: string;
  name: string;
  objective: string;
  productId?: string;
  packageName?: string;
  status: 'PLANNING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  startDate: string;
  endDate?: string | null;
  budget: number;
  targetLeads: number;
  targetCpl: number;
  targetQualifiedPct: number;
  targetConversionPct: number;
  leadsCount: number;
  spend: number;
  cpl: number;
  qualifiedLeads: number;
  conversions: number;
  convRate: number;
  revenue: number;
  ownerId: string;
  ownerName: string;
  createdAt: string;
}

export interface AdItem {
  id: string;
  campaignId: string;
  createdBy?: string | null;
  campaignName: string;
  name: string;
  platform: 'Meta' | 'Google Ads' | 'Instagram' | 'LinkedIn' | 'YouTube' | string;
  productId?: string;
  packageName?: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'DRAFT' | string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  leadsCount: number;
  cpl: number;
  platformAdId: string;
  lastSyncedAt: string;
  designId?: string;
  designTitle?: string;
  designImageUrl?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CampaignService {
  private readonly http = inject(HttpClient);

  readonly campaigns = signal<CampaignItem[]>([]);
  readonly ads = signal<AdItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);


  loadCampaigns() {
    this.loading.set(true);
    return this.http.get<CampaignItem[]>('/api/campaigns').pipe(
      tap({
        next: (data) => {
          this.campaigns.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to load campaigns.');
          this.loading.set(false);
        },
      })
    );
  }

  createCampaign(payload: Partial<CampaignItem>) {
    this.loading.set(true);
    return this.http.post<CampaignItem>('/api/campaigns', payload).pipe(
      tap({
        next: (newCmp) => {
          this.campaigns.update((list) => [newCmp, ...list]);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to create campaign.');
          this.loading.set(false);
        },
      })
    );
  }

  updateCampaign(id: string, payload: Partial<CampaignItem>) {
    this.loading.set(true);
    return this.http.put<CampaignItem>(`/api/campaigns/${id}`, payload).pipe(
      tap({
        next: (updatedCmp) => {
          this.campaigns.update((list) =>
            list.map((c) => (c.id === id ? updatedCmp : c))
          );
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to update campaign.');
          this.loading.set(false);
        },
      })
    );
  }

  deleteCampaign(id: string) {
    this.loading.set(true);
    return this.http.delete<{ success: boolean; id: string }>(`/api/campaigns/${id}`).pipe(
      tap({
        next: () => {
          this.campaigns.update((list) => list.filter((c) => c.id !== id));
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to delete campaign.');
          this.loading.set(false);
        },
      })
    );
  }


  loadAds() {
    this.loading.set(true);
    return this.http.get<AdItem[]>('/api/ads').pipe(
      tap({
        next: (data) => {
          this.ads.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to load ads.');
          this.loading.set(false);
        },
      })
    );
  }

  createAd(payload: Partial<AdItem>) {
    this.loading.set(true);
    return this.http.post<AdItem>('/api/ads', payload).pipe(
      tap({
        next: (newAd) => {
          this.ads.update((list) => [newAd, ...list]);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to create ad.');
          this.loading.set(false);
        },
      })
    );
  }

  updateAd(id: string, payload: Partial<AdItem>) {
    this.loading.set(true);
    return this.http.put<AdItem>(`/api/ads/${id}`, payload).pipe(
      tap({
        next: (updatedAd) => {
          this.ads.update((list) =>
            list.map((a) => (a.id === id ? updatedAd : a))
          );
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to update ad.');
          this.loading.set(false);
        },
      })
    );
  }

  deleteAd(id: string) {
    this.loading.set(true);
    return this.http.delete<{ success: boolean; id: string }>(`/api/ads/${id}`).pipe(
      tap({
        next: () => {
          this.ads.update((list) => list.filter((a) => a.id !== id));
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to delete ad.');
          this.loading.set(false);
        },
      })
    );
  }

  syncAds() {
    this.loading.set(true);
    return this.http.post<{ message: string; syncedCount: number; timestamp: string }>('/api/ads/sync', {}).pipe(
      tap({
        next: () => {
          this.loadAds().subscribe();
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to synchronize ads.');
          this.loading.set(false);
        },
      })
    );
  }
}
