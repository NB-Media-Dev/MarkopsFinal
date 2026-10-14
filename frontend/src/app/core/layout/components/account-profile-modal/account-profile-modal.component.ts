import { Component, EventEmitter, HostListener, Output, inject, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { NotificationService } from '../../../services/notification.service';
import { SYSTEM_ROLES_METADATA } from '../../../models/user-management.model';
import { getApiUrl } from '../../../utils/api-url.utils';

@Component({
  selector: 'app-account-profile-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account-profile-modal.component.html',
  styleUrl: './account-profile-modal.component.scss',
})
export class AccountProfileModalComponent {
  @Output() close = new EventEmitter<void>();
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  readonly authService = inject(AuthService);
  private readonly notifService = inject(NotificationService);

  readonly activeTab = signal<'PICTURE' | 'PASSWORD'>('PICTURE');

  getAvatarUrl(url?: string): string {
    if (!url) return '';
    return getApiUrl(url);
  }

  // Profile info display
  readonly currentUser = computed(() => this.authService.currentUser());

  readonly displayName = computed<string>(() => {
    const user = this.currentUser();
    if (!user) return 'Admin';
    if (user.role === 'ADMINISTRATOR' && (!user.fullName || user.fullName === 'System Administrator')) {
      return 'Admin';
    }
    return user.fullName || 'Admin';
  });

  readonly roleBadgeLabel = computed<string>(() => {
    const role = this.currentUser()?.role || 'ADMINISTRATOR';
    if (role === 'ADMINISTRATOR') return 'Admin';
    const meta = SYSTEM_ROLES_METADATA.find((r) => r.code === role);
    return meta ? meta.label : role;
  });

  readonly username = computed<string>(() => {
    const user = this.currentUser();
    if (!user) return 'Admin';
    if (user.role === 'ADMINISTRATOR') return 'Admin';
    if (user.email) {
      const part = user.email.split('@')[0];
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
    return user.fullName || 'Admin';
  });

  readonly userInitial = computed<string>(() => {
    const name = this.displayName();
    return (name.trim().charAt(0) || 'A').toUpperCase();
  });

  // Tab 1: Profile picture state
  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly isUploading = signal<boolean>(false);
  readonly isDragging = signal<boolean>(false);
  readonly uploadError = signal<string | null>(null);
  readonly uploadSuccess = signal<string | null>(null);

  // Tab 2: Change password state
  readonly currentPassword = signal<string>('');
  readonly newPassword = signal<string>('');
  readonly confirmPassword = signal<string>('');

  readonly showCurrentPassword = signal<boolean>(false);
  readonly showNewPassword = signal<boolean>(false);
  readonly showConfirmPassword = signal<boolean>(false);

  readonly isSubmittingPassword = signal<boolean>(false);
  readonly passwordError = signal<string | null>(null);
  readonly passwordSuccess = signal<string | null>(null);

  @HostListener('document:keydown.escape')
  onEscapePress(): void {
    this.onCloseModal();
  }

  setTab(tab: 'PICTURE' | 'PASSWORD'): void {
    this.activeTab.set(tab);
    this.uploadError.set(null);
    this.uploadSuccess.set(null);
    this.passwordError.set(null);
    this.passwordSuccess.set(null);
  }

  onCloseModal(): void {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('mo-modal-backdrop')) {
      this.onCloseModal();
    }
  }

  triggerFileInput(): void {
    this.fileInput?.nativeElement.click();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private handleFile(file: File): void {
    this.uploadError.set(null);
    this.uploadSuccess.set(null);

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      this.uploadError.set('Invalid format. Please select a PNG, JPG, JPEG, or WEBP image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.uploadError.set('File is too large. Maximum allowed size is 5MB.');
      return;
    }

    this.selectedFile.set(file);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.previewUrl.set(dataUrl);
      // Automatically upload or let user confirm
      this.autoUploadPicture(dataUrl);
    };
    reader.onerror = () => {
      this.uploadError.set('Could not read the selected image file. Please try again.');
    };
    reader.readAsDataURL(file);
  }

  private async autoUploadPicture(dataUrl: string): Promise<void> {
    this.isUploading.set(true);
    this.uploadError.set(null);
    this.uploadSuccess.set(null);

    try {
      const result = await this.authService.updateProfileAvatar(dataUrl);
      if (result.success) {
        this.uploadSuccess.set('Profile picture updated successfully!');
        this.notifService.triggerToast({
          id: `toast_avatar_${Date.now()}`,
          userId: this.currentUser()?.id || '1',
          title: 'Profile Updated',
          message: 'Your new profile picture has been saved successfully.',
          type: 'SUCCESS',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      } else {
        this.uploadError.set(result.error || 'Failed to update profile picture.');
      }
    } catch (err: any) {
      this.uploadError.set(err.message || 'An error occurred while uploading picture.');
    } finally {
      this.isUploading.set(false);
    }
  }

  async removeCurrentPicture(): Promise<void> {
    if (!confirm('Are you sure you want to remove your profile picture?')) return;
    this.isUploading.set(true);
    this.uploadError.set(null);
    this.uploadSuccess.set(null);

    try {
      const res = await this.authService.removeProfileAvatar();
      if (res.success) {
        this.previewUrl.set(null);
        this.selectedFile.set(null);
        this.uploadSuccess.set('Profile picture removed.');
        this.notifService.triggerToast({
          id: `toast_avatar_rem_${Date.now()}`,
          userId: this.currentUser()?.id || '1',
          title: 'Profile Updated',
          message: 'Your profile picture has been removed.',
          type: 'INFO',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      } else {
        this.uploadError.set(res.error || 'Failed to remove profile picture.');
      }
    } catch (err: any) {
      this.uploadError.set(err.message || 'Error removing profile picture.');
    } finally {
      this.isUploading.set(false);
    }
  }

  toggleCurrentPasswordVisibility(): void {
    this.showCurrentPassword.update((val) => !val);
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword.update((val) => !val);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update((val) => !val);
  }

  async onUpdatePassword(): Promise<void> {
    this.passwordError.set(null);
    this.passwordSuccess.set(null);

    const current = this.currentPassword().trim();
    const next = this.newPassword().trim();
    const confirm = this.confirmPassword().trim();

    if (!current) {
      this.passwordError.set('Please enter your current password.');
      return;
    }

    if (!next) {
      this.passwordError.set('Please enter a new password.');
      return;
    }

    if (next.length < 8) {
      this.passwordError.set('New password must be at least 8 characters long.');
      return;
    }

    if (next !== confirm) {
      this.passwordError.set('New password and confirmation password do not match.');
      return;
    }

    this.isSubmittingPassword.set(true);

    try {
      const res = await this.authService.changePassword(current, next, confirm);

      if (res.success) {
        this.passwordSuccess.set('Password updated successfully!');
        this.currentPassword.set('');
        this.newPassword.set('');
        this.confirmPassword.set('');

        this.notifService.triggerToast({
          id: `toast_pass_${Date.now()}`,
          userId: this.currentUser()?.id || '1',
          title: 'Security Updated',
          message: 'Your account password has been changed successfully.',
          type: 'SUCCESS',
          isRead: false,
          createdAt: new Date().toISOString(),
        });

        setTimeout(() => {
          this.onCloseModal();
        }, 1200);
      } else {
        this.passwordError.set(res.error || 'Failed to update password. Please check your credentials.');
      }
    } catch (err: any) {
      this.passwordError.set(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      this.isSubmittingPassword.set(false);
    }
  }

  cancelPasswordForm(): void {
    this.currentPassword.set('');
    this.newPassword.set('');
    this.confirmPassword.set('');
    this.passwordError.set(null);
    this.passwordSuccess.set(null);
    this.onCloseModal();
  }
}
