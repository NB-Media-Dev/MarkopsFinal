import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { BasePackageModalDirective } from '../base-package-modal.directive';

@Component({
  selector: 'app-edit-package-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './edit-package-modal.component.html',
  styleUrl: './edit-package-modal.component.scss',
})
export class EditPackageModalComponent extends BasePackageModalDirective {}
