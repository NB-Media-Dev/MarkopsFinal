import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, DEMO_ACCOUNTS, ROLE_DEFAULT_ROUTES } from '../../../core/services/auth.service';
import { SYSTEM_ROLES_METADATA } from '../../../core/models/user-management.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);


  readonly showPassword = signal<boolean>(false);
  readonly loginSubmitted = signal<boolean>(false);

  readonly rolesList = SYSTEM_ROLES_METADATA;
  readonly demoAccountsMap = DEMO_ACCOUNTS;

  readonly loginForm: FormGroup = this.fb.group({
    email: ['admin@markops.io', [Validators.required, Validators.email]],
    password: ['admin123', [Validators.required, Validators.minLength(4)]],
    rememberMe: [true],
  });

  selectAdminPreset(): void {
    this.loginForm.patchValue({
      email: 'admin@markops.io',
      password: 'admin123',
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((val) => !val);
  }

  async onSubmit(): Promise<void> {
    this.loginSubmitted.set(true);

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password, rememberMe } = this.loginForm.value;
    const success = await this.authService.login({ email, password, rememberMe });

    if (success) {
      this.router.navigate(['/dashboard']);
    }
  }
}

