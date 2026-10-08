import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-telecalling-kpis',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './telecalling-kpis.component.html',
  styleUrl: './telecalling-kpis.component.scss',
})
export class TelecallingKpisComponent {
  @Input() embedded = false;
  @Input() isTelecaller = false;
  @Input() myStats: {
    assignedCount: number;
    callsCount: number;
    interestedCount: number;
    notInterestedCount: number;
    attendedCount: number;
    notAttendedCount: number;
  } | null = null;
  @Input() teamSummaryKpis: {
    activeTelecallers: number;
    totalCalls: number;
    totalLeads: number;
    interestedLeads: number;
    avgConversionRate: number;
  } | null = null;
}
