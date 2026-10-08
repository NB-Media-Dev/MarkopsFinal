import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-designer-profile-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './designer-profile-banner.component.html',
  styleUrl: './designer-profile-banner.component.scss',
})
export class DesignerProfileBannerComponent {
  @Input() designer: any = null;

  getInitials(name: string): string {
    if (!name) return 'D';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
}
