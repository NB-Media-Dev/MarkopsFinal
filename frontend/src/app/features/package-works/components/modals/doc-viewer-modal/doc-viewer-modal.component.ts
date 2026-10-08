import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SafeResourceUrl, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-doc-viewer-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './doc-viewer-modal.component.html',
  styleUrls: ['./doc-viewer-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocViewerModalComponent {
  @Input({ required: true }) isOpen = false;
  @Input() activeDocName: string = '';
  @Input() activeDocUrl: string = '';
  @Input() isImageDoc: boolean = false;
  @Input() activeImageUrl: string | SafeUrl = '';
  @Input() activeIframeUrl: SafeResourceUrl | null = null;
  @Input() activeIframeSrcdoc: string = '';

  @Output() close = new EventEmitter<void>();
  @Output() download = new EventEmitter<{ event: Event; url: string; fileName: string }>();

  onClose(): void {
    this.close.emit();
  }

  onDownload(event: Event): void {
    this.download.emit({ event, url: this.activeDocUrl, fileName: this.activeDocName });
  }
}
