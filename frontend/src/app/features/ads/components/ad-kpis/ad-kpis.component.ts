import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ad-kpis',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ad-kpis.component.html',
  styleUrl: './ad-kpis.component.scss',
})
export class AdKpisComponent {
  @Input() totalSpend = 0;
  @Input() filteredAdsCount = 0;
  @Input() totalLeads = 0;
  @Input() averageCpl = '0.00';
  @Input() averageCtr = '0.00';
}
