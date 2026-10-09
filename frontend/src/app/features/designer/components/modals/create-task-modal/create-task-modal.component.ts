import { Component, Input, Output, EventEmitter, inject, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TaskPriority } from '../../../../../core/models/task.model';

export interface TaskTypeOption {
  id: 'BANNER_DESIGN' | 'POST_DESIGN' | 'VIDEO';
  name: string;
  subtitle: string;
  icon: string;
  color: 'orange' | 'purple' | 'blue';
}

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

  readonly taskTypes: TaskTypeOption[] = [
    { id: 'BANNER_DESIGN', name: 'Banner Design', subtitle: 'Banner Design', icon: 'campaign', color: 'orange' },
    { id: 'POST_DESIGN', name: 'Post Design', subtitle: 'Post Design', icon: 'photo_library', color: 'purple' },
    { id: 'VIDEO', name: 'Video', subtitle: 'Video', icon: 'play_arrow', color: 'blue' },
  ];

  readonly selectedTaskType = signal<'BANNER_DESIGN' | 'POST_DESIGN' | 'VIDEO' | ''>('');

  readonly createTaskForm: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(2)]],
    taskType: ['', [Validators.required]],
    packageName: ['', [Validators.required]],
    description: [''],
    assignedTo: ['', [Validators.required]],
    priority: ['', [Validators.required]],
    dueDate: ['', [Validators.required]],
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
    this.selectedTaskType.set('');
    this.createTaskForm.reset({
      title: '',
      taskType: '',
      packageName: '',
      description: '',
      assignedTo: '',
      priority: '',
      dueDate: '',
    });
  }

  selectTaskType(type: TaskTypeOption): void {
    this.selectedTaskType.set(type.id);
    this.createTaskForm.patchValue({
      taskType: type.id,
    });
  }

  setPriority(p: TaskPriority): void {
    this.createTaskForm.patchValue({ priority: p });
  }

  getSelectedDesignerName(): string {
    const id = String(this.createTaskForm.get('assignedTo')?.value || '');
    if (!id) return '';
    const found = this.designers.find((d) => String(d.id) === id);
    return found ? found.name : '';
  }

  getDesignerInitials(name?: string): string {
    const target = (name || this.getSelectedDesignerName()).trim();
    if (!target) return '';
    const parts = target.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return target.slice(0, 2).toUpperCase();
  }

  selectedTaskTypeLabel(): string {
    const type = this.selectedTaskType();
    switch (type) {
      case 'BANNER_DESIGN':
        return 'Banner Design';
      case 'POST_DESIGN':
        return 'Post Design';
      case 'VIDEO':
        return 'Video';
      default:
        return 'Select Task Type';
    }
  }
  getFormattedDisplayDate(dateStr?: string): string {
    const raw = dateStr || this.createTaskForm.get('dueDate')?.value;
    if (!raw) return 'DD/MM/YYYY';
    const parts = raw.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    }
    return raw;
  }

  formatDueDate(dateStr?: string): string {
    const raw = dateStr || this.createTaskForm.get('dueDate')?.value;
    if (!raw) return 'No Deadline';

    try {
      const parts = raw.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
      }
      const d = new Date(raw);
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return raw;
    }
  }


 getRelativeDeadline(dateStr?: string): string {
  const raw = dateStr || this.createTaskForm.get('dueDate')?.value;
  if (!raw) return '';

  try {

    const target = new Date(raw);
    target.setHours(0, 0, 0, 0);


    const now = new Date();
    now.setHours(0, 0, 0, 0);


    const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));


    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 1) return `In ${diffDays} days`;

    return 'Overdue';
  } catch {
    return '';
  }
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
