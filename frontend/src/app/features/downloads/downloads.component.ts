import { Component } from '@angular/core';

@Component({
  selector: 'app-downloads',
  standalone: true,
  imports: [],
  templateUrl: './downloads.component.html',
  styleUrl: './downloads.component.scss',
})
export class DownloadsComponent {
  downloadReport(type: string) {
    window.open(`/api/exports/${type}`, '_blank');
  }
}
