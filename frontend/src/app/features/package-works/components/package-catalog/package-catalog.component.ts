import { Component, EventEmitter, Input, Output } from '@angular/core';
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

  onOpenPackage(pkg: ProductPackage) {
    this.openPackage.emit(pkg);
  }

  onEditPackage(pkg: ProductPackage, event: MouseEvent) {
    this.editPackage.emit({ pkg, event });
  }

  onDeletePackage(pkg: ProductPackage, event: MouseEvent) {
    this.deletePackage.emit({ pkg, event });
  }

  onCreatePackage() {
    this.createPackage.emit();
  }

  formatAssetUrl(url?: string): string {
    return this.formatAssetUrlFn ? this.formatAssetUrlFn(url) : (url || '');
  }
}
