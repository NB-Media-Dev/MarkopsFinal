import { Component, Input, Output, EventEmitter, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Task } from '../../../../../core/models/task.model';

@Component({
  selector: 'app-review-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './review-modal.component.html',
  styleUrl: './review-modal.component.scss',
})
export class ReviewModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() task: Task | null = null;
  @Input() defaultAction: 'APPROVE' | 'REQUEST_REVISION' = 'APPROVE';

  @Output() closeModal = new EventEmitter<void>();
  @Output() submitReview = new EventEmitter<{ action: string; remark: string }>();

  private readonly fb = inject(FormBuilder);

  readonly reviewForm: FormGroup = this.fb.group({
    action: ['APPROVE', [Validators.required]],
    remark: ['', [Validators.required, Validators.minLength(5)]],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.reviewForm.reset({
        action: this.defaultAction || 'APPROVE',
        remark: '',
      });
    }
  }

  onSubmit(): void {
    if (this.reviewForm.invalid) return;
    this.submitReview.emit(this.reviewForm.value);
  }

  onClose(): void {
    this.closeModal.emit();
  }
}
