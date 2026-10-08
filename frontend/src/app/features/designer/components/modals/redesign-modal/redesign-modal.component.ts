import { Component, Input, Output, EventEmitter, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task } from '../../../../../core/models/task.model';

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
    const current = this.redesignReason().trim();
    const cleanSnippet = snippet.replace(/^[•\-\*]\s*/, '').trim();
    const bulletText = `• ${cleanSnippet}`;
    const newVal = current ? `${current}\n${bulletText}` : bulletText;
    this.redesignReason.set(newVal);
  }

  onRedesignKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const textarea = event.target as HTMLTextAreaElement;
      const { selectionStart, selectionEnd, value } = textarea;
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = value.substring(lineStart, selectionStart);
      if (currentLine.startsWith('• ') || currentLine.startsWith('- ')) {
        event.preventDefault();
        if (currentLine.trim() === '•' || currentLine.trim() === '-') {
          const newValue = value.substring(0, lineStart) + value.substring(selectionEnd);
          this.redesignReason.set(newValue);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = lineStart;
          }, 0);
          return;
        }
        const insert = '\n• ';
        const newValue = value.substring(0, selectionStart) + insert + value.substring(selectionEnd);
        this.redesignReason.set(newValue);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = selectionStart + insert.length;
        }, 0);
      }
    }
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
