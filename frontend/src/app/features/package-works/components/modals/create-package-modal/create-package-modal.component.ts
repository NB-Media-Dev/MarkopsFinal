import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { BasePackageModalDirective } from '../base-package-modal.directive';

@Component({
  selector: 'app-create-package-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-package-modal.component.html',
  styleUrl: './create-package-modal.component.scss',
})
export class CreatePackageModalComponent extends BasePackageModalDirective {}
