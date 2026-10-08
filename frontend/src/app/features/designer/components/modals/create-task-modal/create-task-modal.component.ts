import { Component, Input, Output, EventEmitter, inject, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TaskPriority } from '../../../../../core/models/task.model';

@Component({
  selector: 'app-create-task-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-task-modal.component.html',
  styleUrl: './create-task-modal.component.scss',
})
export class CreateTaskModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() availablePackages: { name: string; icon: string }[] = [];
  @Input() designers: { id: string | number; name: string }[] = [];
  @Input() defaultPackage = 'Careermate';
  @Input() preselectedDesignerId = '';

  @Output() closeModal = new EventEmitter<void>();
  @Output() submitCreateTask = new EventEmitter<{
    formValues: any;
    fileName: string;
    dataUrl: string;
    fileContent: string;
    fileObj: File | null;
  }>();

  private readonly fb = inject(FormBuilder);

  readonly todayDate = new Date().toISOString().split('T')[0];

  readonly createTaskForm: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    packageName: ['Careermate', [Validators.required]],
    description: [''],
    assignedTo: ['', [Validators.required]],
    priority: ['HIGH' as TaskPriority, [Validators.required]],
    dueDate: [new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0], [Validators.required]],
  });

  readonly createdBriefFile = signal<File | null>(null);
  readonly createdBriefFileName = signal<string>('');
  readonly createdBriefDataUrl = signal<string>('');
  readonly createdBriefContent = signal<string>('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.resetModal();
    }
  }

  resetModal(): void {
    this.createdBriefFile.set(null);
    this.createdBriefFileName.set('');
    this.createdBriefDataUrl.set('');
    this.createdBriefContent.set('');
    const targetDesigner = this.preselectedDesignerId || (this.designers[0]?.id ? String(this.designers[0].id) : '');
    this.createTaskForm.reset({
      title: '',
      description: '',
      packageName: this.defaultPackage || (this.availablePackages[0]?.name || 'Careermate'),
      assignedTo: targetDesigner,
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    });
  }

  getPackageIcon(packageName?: string): string {
    const targetName = (packageName || this.defaultPackage || 'Careermate').toLowerCase().trim();
    const pkg = this.availablePackages.find((p) => p.name.toLowerCase().trim() === targetName);
    return pkg?.icon || 'palette';
  }

  onTaskBriefFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.createdBriefFile.set(file);
      this.createdBriefFileName.set(file.name);

      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        this.createdBriefDataUrl.set((e.target?.result as string) || '');
      };
      reader.readAsDataURL(file);

      if (
        file.type.startsWith('text/') ||
        file.name.endsWith('.txt') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.csv') ||
        file.name.endsWith('.html') ||
        file.name.endsWith('.doc') ||
        file.name.endsWith('.docx')
      ) {
        const textReader = new FileReader();
        textReader.onload = (e: ProgressEvent<FileReader>) => {
          this.createdBriefContent.set((e.target?.result as string) || '');
        };
        textReader.readAsText(file);
      } else {
        this.createdBriefContent.set(`Document File: ${file.name}\nFile Size: ${(file.size / 1024).toFixed(1)} KB\nFile Type: ${file.type || 'Binary'}`);
      }
    }
  }

  clearTaskBriefFile(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.createdBriefFile.set(null);
    this.createdBriefFileName.set('');
    this.createdBriefDataUrl.set('');
    this.createdBriefContent.set('');
    const input = document.getElementById('dashBriefFileInput') as HTMLInputElement;
    if (input) input.value = '';
  }

  onSubmit(): void {
    if (this.createTaskForm.invalid) {
      this.createTaskForm.markAllAsTouched();
      return;
    }
    this.submitCreateTask.emit({
      formValues: this.createTaskForm.value,
      fileName: this.createdBriefFileName(),
      dataUrl: this.createdBriefDataUrl(),
      fileContent: this.createdBriefContent(),
      fileObj: this.createdBriefFile(),
    });
  }

  onClose(): void {
    this.closeModal.emit();
  }
}
