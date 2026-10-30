import { Directive, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FixedPackageMeta } from '../../../../core/models/package.model';

@Directive()
export abstract class BasePackageModalDirective {
  @Input() isOpen = false;
  @Input() activePackageMeta: FixedPackageMeta | null = null;
  @Input() form!: FormGroup;
  @Input() imagePreview = '';
  @Input() isSubmitting = false;

  @Output() closeModal = new EventEmitter<void>();
  @Output() submitPackage = new EventEmitter<void>();
  @Output() fileSelected = new EventEmitter<Event>();
  @Output() removeImage = new EventEmitter<void>();

  onClose(): void {
    this.closeModal.emit();
  }

  onSubmit(): void {
    this.submitPackage.emit();
  }

  onFileSelected(event: Event): void {
    this.fileSelected.emit(event);
  }

  onRemoveImage(): void {
    this.removeImage.emit();
  }
}

