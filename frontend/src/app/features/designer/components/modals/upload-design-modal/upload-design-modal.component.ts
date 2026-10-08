import { Component, Input, Output, EventEmitter, inject, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Task } from '../../../../../core/models/task.model';

@Component({
  selector: 'app-upload-design-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './upload-design-modal.component.html',
  styleUrl: './upload-design-modal.component.scss',
})
export class UploadDesignModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() task: Task | null = null;

  @Output() closeModal = new EventEmitter<void>();
  @Output() submitUpload = new EventEmitter<{
    fileName: string;
    changelog: string;
    fileSizeMb: number;
    dataUrl: string;
    fileContent: string;
  }>();

  private readonly fb = inject(FormBuilder);

  readonly uploadForm: FormGroup = this.fb.group({
    fileName: ['', [Validators.required]],
    changelog: ['', [Validators.required]],
    fileSizeMb: [0],
  });

  readonly selectedFileObject = signal<File | null>(null);
  readonly selectedFileDataUrl = signal<string>('');
  readonly selectedFileContent = signal<string>('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.resetForm();
    }
  }

  resetForm(): void {
    this.selectedFileObject.set(null);
    this.selectedFileDataUrl.set('');
    this.selectedFileContent.set('');
    this.uploadForm.reset({
      fileName: '',
      changelog: '',
      fileSizeMb: 0,
    });
    const el = document.getElementById('designerCreativeFileInput') as HTMLInputElement;
    if (el) el.value = '';
  }

  isPdf(nameOrUrl: string): boolean {
    if (!nameOrUrl) return false;
    const lower = nameOrUrl.toLowerCase();
    return lower.endsWith('.pdf') || lower.includes('.pdf') || lower.includes('pdf');
  }

  triggerFileInput(): void {
    const el = document.getElementById('designerCreativeFileInput') as HTMLInputElement;
    if (el) el.click();
  }

  clearSelectedFile(): void {
    this.selectedFileObject.set(null);
    this.selectedFileDataUrl.set('');
    this.selectedFileContent.set('');
    this.uploadForm.patchValue({
      fileName: '',
      fileSizeMb: 0,
    });
    const el = document.getElementById('designerCreativeFileInput') as HTMLInputElement;
    if (el) el.value = '';
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.selectedFileObject.set(file);
      const sizeMb = Number((file.size / (1024 * 1024)).toFixed(2));
      this.uploadForm.patchValue({
        fileName: file.name,
        fileSizeMb: sizeMb > 0 ? sizeMb : 0.5,
      });

      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        this.selectedFileDataUrl.set((e.target?.result as string) || '');
      };
      reader.readAsDataURL(file);

      if (
        file.type.startsWith('text/') ||
        file.name.endsWith('.txt') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.csv') ||
        file.name.endsWith('.html')
      ) {
        const textReader = new FileReader();
        textReader.onload = (e: ProgressEvent<FileReader>) => {
          this.selectedFileContent.set((e.target?.result as string) || '');
        };
        textReader.readAsText(file);
      } else {
        this.selectedFileContent.set(`Design File: ${file.name}\nFile Size: ${(file.size / 1024).toFixed(1)} KB\nFile Type: ${file.type || 'Binary asset'}`);
      }
    }
  }

  appendChangelog(snippet: string): void {
    const current = (this.uploadForm.get('changelog')?.value || '').trim();
    const cleanSnippet = snippet.replace(/^[•\-\*]\s*/, '').trim();
    const bulletText = `• ${cleanSnippet}`;
    const newVal = current ? `${current}\n${bulletText}` : bulletText;
    this.uploadForm.patchValue({ changelog: newVal });
  }

  onChangelogKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const textarea = event.target as HTMLTextAreaElement;
      const { selectionStart, selectionEnd, value } = textarea;
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = value.substring(lineStart, selectionStart);
      if (currentLine.startsWith('• ') || currentLine.startsWith('- ')) {
        event.preventDefault();
        if (currentLine.trim() === '•' || currentLine.trim() === '-') {
          const newValue = value.substring(0, lineStart) + value.substring(selectionEnd);
          this.uploadForm.patchValue({ changelog: newValue });
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = lineStart;
          }, 0);
          return;
        }
        const insert = '\n• ';
        const newValue = value.substring(0, selectionStart) + insert + value.substring(selectionEnd);
        this.uploadForm.patchValue({ changelog: newValue });
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = selectionStart + insert.length;
        }, 0);
      }
    }
  }

  onSubmit(): void {
    if (this.uploadForm.invalid) return;
    const { fileName, changelog, fileSizeMb } = this.uploadForm.value;
    this.submitUpload.emit({
      fileName,
      changelog,
      fileSizeMb: fileSizeMb || 0,
      dataUrl: this.selectedFileDataUrl(),
      fileContent: this.selectedFileContent() || changelog,
    });
  }

  onClose(): void {
    this.closeModal.emit();
  }
}
