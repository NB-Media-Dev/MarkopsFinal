import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductPackage, FixedPackageMeta } from '../../../../core/models/package.model';

@Component({
  selector: 'app-package-catalog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './package-catalog.component.html',
  styleUrl: './package-catalog.component.scss',
})
export class PackageCatalogComponent {
  @Input() filteredProductPackages: ProductPackage[] = [];
  @Input() activePackageMeta: FixedPackageMeta | null = null;
  @Input() canCreatePackage = false;
  @Input() canEditPackage = false;
  @Input() canDeletePackage = false;
  @Input() formatAssetUrlFn!: (url?: string) => string;

  @Output() openPackage = new EventEmitter<ProductPackage>();
  @Output() editPackage = new EventEmitter<{ pkg: ProductPackage; event: MouseEvent }>();
  @Output() deletePackage = new EventEmitter<{ pkg: ProductPackage; event: MouseEvent }>();
  @Output() createPackage = new EventEmitter<void>();

  activeMenuPkgId: string | number | null = null;
  currentPage = 1;
  readonly pageSize = 6;

  get totalPages(): number {
    return Math.max(1, Math.ceil((this.filteredProductPackages?.length || 0) / this.pageSize));
  }

  get paginatedProductPackages(): ProductPackage[] {
    const list = this.filteredProductPackages || [];
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }
    const start = (this.currentPage - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const pages: number[] = [];
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
    return pages;
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.activeMenuPkgId = null;
  }

  toggleMenu(pkg: ProductPackage, event: MouseEvent) {
    event.stopPropagation();
    if (this.activeMenuPkgId === pkg.id) {
      this.activeMenuPkgId = null;
    } else {
      this.activeMenuPkgId = pkg.id;
    }
  }

  onOpenPackage(pkg: ProductPackage) {
    this.openPackage.emit(pkg);
  }

  onEditPackage(pkg: ProductPackage, event: MouseEvent) {
    event.stopPropagation();
    this.activeMenuPkgId = null;
    this.editPackage.emit({ pkg, event });
  }

  onDeletePackage(pkg: ProductPackage, event: MouseEvent) {
    event.stopPropagation();
    this.activeMenuPkgId = null;
    this.deletePackage.emit({ pkg, event });
  }

  onCreatePackage() {
    this.createPackage.emit();
  }

  formatAssetUrl(url?: string): string {
    return this.formatAssetUrlFn ? this.formatAssetUrlFn(url) : (url || '');
  }

  inferPackageCategory(name: string): string {
    const n = (name || '').toLowerCase();
    if (n.includes('affair') || n.includes('design') || n.includes('art') || n.includes('ui')) return 'Design';
    if (n.includes('social') || n.includes('post') || n.includes('feed') || n.includes('media')) return 'Social Media';
    if (n.includes('brand') || n.includes('market') || n.includes('ads')) return 'Marketing';
    if (n.includes('video') || n.includes('edit') || n.includes('anim') || n.includes('reel') || n.includes('motion')) return 'Video Editing';
    if (n.includes('content') || n.includes('write') || n.includes('blog') || n.includes('seo') || n.includes('script')) return 'Content Writing';
    return 'Design';
  }

  getPackageCategoryIcon(name: string): string {
    const cat = this.inferPackageCategory(name);
    switch (cat) {
      case 'Design': return 'draw';
      case 'Social Media': return 'campaign';
      case 'Marketing': return 'ads_click';
      case 'Video Editing': return 'videocam';
      case 'Content Writing': return 'article';
      case 'Creative': return 'auto_awesome';
      default: return 'draw';
    }
  }

  getPackageSquircleIcon(name: string): string {
    const cat = this.inferPackageCategory(name);
    switch (cat) {
      case 'Design': return 'draw';
      case 'Social Media': return 'post_add';
      case 'Marketing': return 'menu_book';
      case 'Video Editing': return 'videocam';
      case 'Content Writing': return 'description';
      case 'Creative': return 'flare';
      default: return 'edit';
    }
  }

  getPackageDescription(pkg: ProductPackage): string {
    if (pkg.description && pkg.description.trim().length > 0) {
      return pkg.description;
    }
    const n = (pkg.name || '').toLowerCase();
    if (n.includes('affair')) {
      return 'Create engaging current affairs content with modern design templates and visuals.';
    }
    if (n.includes('social')) {
      return 'Design eye-catching social media posts for all platforms with trending templates.';
    }
    if (n.includes('brand')) {
      return 'Complete branding solutions including logo, posters, banners and more.';
    }
    if (n.includes('video')) {
      return 'Professional video editing with high-quality outputs for your campaigns.';
    }
    if (n.includes('content')) {
      return 'Well-researched and SEO-friendly content for better reach and engagement.';
    }
    return 'Professional pre-built package tailored for high performance and results.';
  }

  getPackageTasks(pkg: ProductPackage): number {
    const n = (pkg.name || '').toLowerCase();
    if (n.includes('affair')) return 12;
    if (n.includes('social')) return 10;
    if (n.includes('brand')) return 15;
    if (n.includes('video')) return 8;
    if (n.includes('content')) return 18;
    const hash = String(pkg.id || pkg.name).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return (hash % 12) + 6;
  }

  getPackageDays(pkg: ProductPackage): number {
    const n = (pkg.name || '').toLowerCase();
    if (n.includes('affair')) return 2;
    if (n.includes('social')) return 5;
    if (n.includes('brand')) return 7;
    if (n.includes('video')) return 4;
    if (n.includes('content')) return 8;
    const hash = String(pkg.id || pkg.name).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return (hash % 6) + 2;
  }

  getPackageBannerImage(pkg: ProductPackage): string {
    if (pkg.imageUrl) {
      return this.formatAssetUrl(pkg.imageUrl);
    }
    return '';
  }

  selectPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }
}
