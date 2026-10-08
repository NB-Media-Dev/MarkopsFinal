import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductPackage } from '../../../../../core/models/package.model';

@Component({
  selector: 'app-package-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './package-detail-modal.component.html',
  styleUrl: './package-detail-modal.component.scss',
})
export class PackageDetailModalComponent {
  @Input() isOpen = false;
  @Input() pkg: ProductPackage | null = null;
  @Input() getProductNameForPackageFn!: (pkg: ProductPackage) => string;
  @Input() formatAssetUrlFn!: (url?: string) => string;

  @Output() closeModal = new EventEmitter<void>();
  @Output() viewPackageTasks = new EventEmitter<ProductPackage>();

  onClose() {
    this.closeModal.emit();
  }

  onViewTasks() {
    if (this.pkg) {
      this.viewPackageTasks.emit(this.pkg);
    }
  }

  getProductNameForPackage(p: ProductPackage): string {
    return this.getProductNameForPackageFn ? this.getProductNameForPackageFn(p) : 'Product';
  }

  formatAssetUrl(url?: string): string {
    return this.formatAssetUrlFn ? this.formatAssetUrlFn(url) : (url || '');
  }
}
