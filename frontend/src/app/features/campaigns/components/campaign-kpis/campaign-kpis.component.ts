import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-campaign-kpis',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaign-kpis.component.html',
  styleUrl: './campaign-kpis.component.scss',
})
export class CampaignKpisComponent {
  @Input() totalSpend: number = 0;
  @Input() totalBudget: number = 0;
  @Input() budgetUsedPercent: number = 0;
  @Input() totalLeads: number = 0;
  @Input() totalQualifiedLeads: number = 0;
  @Input() averageCpl: string = '0.00';
  @Input() totalConversions: number = 0;
  @Input() overallConvRate: string = '0.0';
  @Input() totalCampaignsCount: number = 0;
  @Input() activeCampaignsCount: number = 0;
  @Input() completedCampaignsCount: number = 0;
  @Input() totalClicks: number = 0;

  @Output() createCampaign = new EventEmitter<void>();
  @Output() viewAnalytics = new EventEmitter<void>();
  @Output() viewLeads = new EventEmitter<void>();

  onCreateCampaign(): void {
    this.createCampaign.emit();
  }

  onViewAnalytics(): void {
    this.viewAnalytics.emit();
  }

  onViewLeads(): void {
    this.viewLeads.emit();
  }
}

