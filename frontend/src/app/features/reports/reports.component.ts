import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

import { RouterModule } from '@angular/router';

export interface ReportSummary {
  totalRevenue: number;
  totalLeads: number;
  totalSpend: number;
  avgCpl: string;
  overallRoi: string;
  qualificationRate: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly report = signal<ReportSummary | null>(null);

  ngOnInit() {
    this.http.get<ReportSummary>('/api/reports/summary').subscribe((data) => this.report.set(data));
  }
}
