import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getUserInitials, getUserAvatarUrl } from '../../../../core/utils/user-display.utils';

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
    return getUserInitials(name, 'D');
  }

  getAvatarUrl(avatarUrl?: string): string {
    return getUserAvatarUrl(avatarUrl);
  }
}
