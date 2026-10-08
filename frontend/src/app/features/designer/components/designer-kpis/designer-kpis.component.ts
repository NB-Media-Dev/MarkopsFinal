import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-designer-kpis',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './designer-kpis.component.html',
  styleUrl: './designer-kpis.component.scss',
})
export class DesignerKpisComponent {
  @Input() totalDesigners: number = 0;
  @Input() totalTasks: number = 0;
  @Input() totalPending: number = 0;
  @Input() totalCompleted: number = 0;
}
