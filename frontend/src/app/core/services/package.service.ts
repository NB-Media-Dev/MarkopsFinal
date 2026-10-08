import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { ProductPackage, PackageSummary } from '../models/package.model';
import { getApiUrl } from '../utils/api-url.utils';

export interface ProductHeroBanner {
  productId: string;
  imageUrl: string;
}

@Injectable({
  providedIn: 'root',
})
export class PackageService {
  private readonly http = inject(HttpClient);

  readonly packages = signal<ProductPackage[]>([]);
  readonly summary = signal<PackageSummary | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  loadProductHeroBanner(productId: string) {
    return this.http.get<ProductHeroBanner | null>(
      getApiUrl(`/api/product-banners/${encodeURIComponent(productId)}`)
    );
  }

  updateProductHeroBanner(productId: string, image: string, fileName: string) {
    return this.http.put<ProductHeroBanner>(
      getApiUrl(`/api/product-banners/${encodeURIComponent(productId)}`),
      { image, fileName }
    );
  }

  loadPackages(productId?: string) {
    this.loading.set(true);
    const path = productId ? `/api/packages?productId=${encodeURIComponent(productId)}` : '/api/packages';
    const url = getApiUrl(path);

    return this.http.get<ProductPackage[]>(url).pipe(
      tap({
        next: (data) => {
          if (productId) {

            this.packages.update((current) => {
              const other = current.filter((p) => p.productId !== productId);
              return [...data, ...other];
            });
          } else {
            this.packages.set(data);
          }
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to load packages.');
          this.loading.set(false);
        },
      })
    );
  }

  loadAllPackages() {
    this.loading.set(true);
    return this.http.get<ProductPackage[]>(getApiUrl('/api/packages')).pipe(
      tap({
        next: (data) => {
          this.packages.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to load all packages.');
          this.loading.set(false);
        },
      })
    );
  }

  loadSummary() {
    return this.http.get<PackageSummary>(getApiUrl('/api/packages/summary')).pipe(
      tap({
        next: (data) => {
          this.summary.set(data);
        },
        error: (err) => {
          console.warn('Failed to load package summary:', err);
        },
      })
    );
  }

  createPackage(payload: Partial<ProductPackage> & { image?: string; fileName?: string }) {
    this.loading.set(true);
    return this.http.post<ProductPackage>(getApiUrl('/api/packages'), payload).pipe(
      tap({
        next: (newPkg) => {
          this.packages.update((list) => [newPkg, ...list.filter((p) => String(p.id) !== String(newPkg.id))]);
          this.loading.set(false);
          this.loadSummary().subscribe();
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to create package.');
          this.loading.set(false);
        },
      })
    );
  }

  updatePackage(id: string | number, payload: Partial<ProductPackage> & { image?: string; fileName?: string }) {
    this.loading.set(true);
    return this.http.put<ProductPackage>(getApiUrl(`/api/packages/${id}`), payload).pipe(
      tap({
        next: (updatedPkg) => {
          this.packages.update((list) =>
            list.map((p) => (String(p.id) === String(id) ? updatedPkg : p))
          );
          this.loading.set(false);
          this.loadSummary().subscribe();
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to update package.');
          this.loading.set(false);
        },
      })
    );
  }

  deletePackage(id: string | number) {
    this.loading.set(true);
    return this.http.delete<{ success: boolean; id: string | number }>(getApiUrl(`/api/packages/${id}`)).pipe(
      tap({
        next: () => {
          this.packages.update((list) => list.filter((p) => String(p.id) !== String(id)));
          this.loading.set(false);
          this.loadSummary().subscribe();
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to delete package.');
          this.loading.set(false);
        },
      })
    );
  }
}
