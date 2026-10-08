import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FixedPackageMeta } from '../../../../../core/models/package.model';

@Component({
  selector: 'app-edit-package-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './edit-package-modal.component.html',
  styleUrl: './edit-package-modal.component.scss',
})
export class EditPackageModalComponent {
  @Input() isOpen = false;
  @Input() activePackageMeta: FixedPackageMeta | null = null;
  @Input() form!: FormGroup;
  @Input() imagePreview = '';
  @Input() isSubmitting = false;

  @Output() closeModal = new EventEmitter<void>();
  @Output() submitPackage = new EventEmitter<void>();
  @Output() fileSelected = new EventEmitter<Event>();
  @Output() removeImage = new EventEmitter<void>();

  onClose() {
    this.closeModal.emit();
  }

  onSubmit() {
    this.submitPackage.emit();
  }

  onFileSelected(event: Event) {
    this.fileSelected.emit(event);
  }

  onRemoveImage() {
    this.removeImage.emit();
  }
}
