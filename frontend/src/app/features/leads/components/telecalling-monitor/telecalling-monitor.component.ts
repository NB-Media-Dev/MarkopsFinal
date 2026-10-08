import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-telecalling-monitor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './telecalling-monitor.component.html',
  styleUrl: './telecalling-monitor.component.scss',
})
export class TelecallingMonitorComponent {
  @Input() summary: any = null;

  readonly Math = Math;
}
