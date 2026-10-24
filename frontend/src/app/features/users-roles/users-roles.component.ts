import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { UserManagementService } from '../../core/services/user-management.service';
import { UserRole } from '../../core/models/auth.model';
import { ManagedUser, SYSTEM_ROLES_METADATA } from '../../core/models/user-management.model';
import { RouterModule } from '@angular/router';
import { getApiUrl } from '../../core/utils/api-url.utils';

@Component({
  selector: 'app-users-roles',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './users-roles.component.html',
  styleUrl: './users-roles.component.scss',
})
export class UsersRolesComponent {
  private readonly fb = inject(FormBuilder);
  readonly authService = inject(AuthService);
  readonly userMgmtService = inject(UserManagementService);

  readonly systemRoles = SYSTEM_ROLES_METADATA;

  readonly userSearchQuery = signal<string>('');
  readonly selectedRoleFilter = signal<string>('ALL');

  trackById(_index: number, user: ManagedUser): string {
    return user.id;
  }

  getAvatarUrl(avatarUrl?: string): string {
    if (!avatarUrl) return '';
    return getApiUrl(avatarUrl);
  }

  readonly isCreateUserModalOpen = signal<boolean>(false);
  readonly createFormSubmitted = signal<boolean>(false);
  readonly showCreatePassword = signal<boolean>(false);
  readonly userSuccessMsg = signal<string | null>(null);
  readonly userErrorMsg = signal<string | null>(null);
  readonly isSubmitting = signal<boolean>(false);

  readonly createUserForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['BDM' as UserRole, [Validators.required]],
    department: ['General Operations'],
    password: ['', [Validators.required, Validators.minLength(6)]],
    isActive: [true],
  });

  readonly isEditUserModalOpen = signal<boolean>(false);
  readonly editFormSubmitted = signal<boolean>(false);
  readonly editingUserId = signal<string | null>(null);
  readonly showEditPassword = signal<boolean>(false);
  readonly editAvatarPreview = signal<string | null>(null);
  readonly editAvatarDataUrl = signal<string | null>(null);

  readonly editUserForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['BDM' as UserRole, [Validators.required]],
    department: ['General Operations'],
    password: ['', [Validators.minLength(6)]],
    isActive: [true],
  });

  readonly filteredUsers = computed(() => {
    const allUsers = this.userMgmtService.users();
    const query = this.userSearchQuery().toLowerCase().trim();
    const roleFilter = this.selectedRoleFilter();

    return allUsers.filter((user) => {
      const matchesSearch =
        !query ||
        user.fullName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query);

      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  });

  openCreateUserModal(): void {
    this.createUserForm.reset({
      fullName: '',
      email: '',
      role: 'BDM',
      department: 'General Operations',
      password: '',
      isActive: true,
    });
    this.createFormSubmitted.set(false);
    this.showCreatePassword.set(false);
    this.userErrorMsg.set(null);
    this.isCreateUserModalOpen.set(true);
  }

  closeCreateUserModal(): void {
    this.isCreateUserModalOpen.set(false);
    this.userErrorMsg.set(null);
  }

  toggleCreatePasswordVisibility(): void {
    this.showCreatePassword.update((v) => !v);
  }

  async onSubmitCreateUser(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    console.log('[UsersRoles] Create Account button clicked! Form valid:', this.createUserForm.valid, 'Values:', this.createUserForm.value);
    this.createFormSubmitted.set(true);
    this.userErrorMsg.set(null);

    if (this.createUserForm.invalid) {
      this.createUserForm.markAllAsTouched();
      const fnErrors = this.createUserForm.get('fullName')?.errors;
      const emailErrors = this.createUserForm.get('email')?.errors;
      const pwErrors = this.createUserForm.get('password')?.errors;
      const roleErrors = this.createUserForm.get('role')?.errors;

      if (fnErrors) {
        this.userErrorMsg.set('Please enter a full name (minimum 2 characters).');
      } else if (emailErrors) {
        this.userErrorMsg.set('Please enter a valid email address (e.g. user@markops.io).');
      } else if (pwErrors) {
        this.userErrorMsg.set('Password is required (minimum 6 characters).');
      } else if (roleErrors) {
        this.userErrorMsg.set('Please select a system role.');
      } else {
        this.userErrorMsg.set('Please check your inputs and complete all required fields.');
      }
      return;
    }

    this.isSubmitting.set(true);

    try {
      const formValue = this.createUserForm.value;
      const payload = {
        ...formValue,
        department: formValue.department || 'General Operations',
      };
      const newUser = await this.userMgmtService.createUser(payload);
      this.userSuccessMsg.set(`User "${newUser.fullName}" (${newUser.email}) created successfully!`);
      this.closeCreateUserModal();
      setTimeout(() => {
        this.userSuccessMsg.set(null);
      }, 4000);
    } catch (err: any) {
      console.error('Failed to create user:', err);
      this.userErrorMsg.set(err?.message || 'Failed to create user. Please check your inputs.');
      setTimeout(() => {
        this.userErrorMsg.set(null);
      }, 6000);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openEditUserModal(user: ManagedUser): void {
    this.editingUserId.set(user.id);
    this.editUserForm.patchValue({
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      department: user.department,
      password: '',
      isActive: user.isActive,
    });
    this.editAvatarPreview.set(user.avatarUrl ? this.getAvatarUrl(user.avatarUrl) : null);
    this.editAvatarDataUrl.set(null);
    this.editFormSubmitted.set(false);
    this.showEditPassword.set(false);
    this.isEditUserModalOpen.set(true);
  }

  closeEditUserModal(): void {
    this.isEditUserModalOpen.set(false);
    this.editingUserId.set(null);
  }

  onSelectEditAvatar(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      this.editAvatarPreview.set(result);
      this.editAvatarDataUrl.set(result);
    };
    reader.readAsDataURL(file);
  }

  removeEditAvatar(): void {
    this.editAvatarPreview.set(null);
    this.editAvatarDataUrl.set(null);
  }

  toggleEditPasswordVisibility(): void {
    this.showEditPassword.update((v) => !v);
  }

  async onSubmitEditUser(): Promise<void> {
    this.editFormSubmitted.set(true);

    if (this.editUserForm.invalid) {
      this.editUserForm.markAllAsTouched();
      return;
    }

    const id = this.editingUserId();
    if (!id) return;

    try {
      const payload = {
        ...this.editUserForm.value,
        avatarDataUrl: this.editAvatarDataUrl() || undefined,
        avatarUrl: !this.editAvatarPreview() ? '' : undefined,
      };
      const updated = await this.userMgmtService.updateUser(id, payload);
      if (updated) {
        this.userSuccessMsg.set(`User "${updated.fullName}" account updated successfully!`);
      }
      this.closeEditUserModal();
    } catch (err) {
      console.error('Failed to update user:', err);
    }

    setTimeout(() => {
      this.userSuccessMsg.set(null);
    }, 4000);
  }


  onSearchUser(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.userSearchQuery.set(val);
  }

  onFilterRole(roleCode: string): void {
    this.selectedRoleFilter.set(roleCode);
  }


  async toggleUserStatus(user: ManagedUser): Promise<void> {
    await this.userMgmtService.toggleUserStatus(user.id);
  }

  async deleteUser(user: ManagedUser): Promise<void> {
    if (user.id === 'usr_admin_01' || user.id === '1') {
      alert('System Administrator account is protected and cannot be deleted.');
      return;
    }
    if (confirm(`Are you sure you want to delete user "${user.fullName}" (${user.email})?`)) {
      await this.userMgmtService.deleteUser(user.id);
      this.userSuccessMsg.set(`User record for "${user.fullName}" removed.`);
      setTimeout(() => this.userSuccessMsg.set(null), 3000);
    }
  }

  getDeptCategoryClass(department: string): string {
    const dept = (department || '').toLowerCase();
    if (dept.includes('exec') || dept.includes('admin') || dept.includes('management')) {
      return 'exec';
    }
    if (dept.includes('growth') || dept.includes('strategy') || dept.includes('marketing')) {
      return 'growth';
    }
    if (dept.includes('media') || dept.includes('paid') || dept.includes('digital') || dept.includes('ads')) {
      return 'media';
    }
    if (dept.includes('creative') || dept.includes('design') || dept.includes('brand') || dept.includes('studio')) {
      return 'creative';
    }
    if (dept.includes('sale') || dept.includes('inside') || dept.includes('call') || dept.includes('tele')) {
      return 'sales';
    }
    if (dept.includes('account') || dept.includes('revenue') || dept.includes('convert') || dept.includes('finance')) {
      return 'finance';
    }
    return 'general';
  }
}
