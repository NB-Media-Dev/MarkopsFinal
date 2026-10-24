import { Component, Input, Output, EventEmitter, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task } from '../../../../../core/models/task.model';
import { appendBulletSnippet, handleBulletTextareaKeyDown } from '../../../../../core/utils/bullet-list.utils';

@Component({
  selector: 'app-redesign-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './redesign-modal.component.html',
  styleUrl: './redesign-modal.component.scss',
})
export class RedesignModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() task: Task | null = null;

  @Output() closeModal = new EventEmitter<void>();
  @Output() submitRedesign = new EventEmitter<string>();

  readonly redesignReason = signal<string>('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.redesignReason.set('');
    }
  }

  getAssigneeName(task: Task | null): string {
    if (!task) return 'Unassigned';
    return task.assigneeName || 'Designer';
  }

  appendRedesignFeedback(snippet: string): void {
    this.redesignReason.set(appendBulletSnippet(this.redesignReason(), snippet));
  }

  onRedesignKeyDown(event: KeyboardEvent): void {
    handleBulletTextareaKeyDown(event, (val) => this.redesignReason.set(val));
  }

  onSubmit(): void {
    const reason = this.redesignReason().trim();
    if (!reason) return;
    this.submitRedesign.emit(reason);
  }

  onClose(): void {
    this.closeModal.emit();
  }
}
