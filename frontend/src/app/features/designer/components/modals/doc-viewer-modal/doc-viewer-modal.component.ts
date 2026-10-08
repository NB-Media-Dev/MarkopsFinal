import { Component, Input, Output, EventEmitter, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { getBackendBaseUrl } from '../../../../../core/utils/api-url.utils';

@Component({
  selector: 'app-doc-viewer-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './doc-viewer-modal.component.html',
  styleUrl: './doc-viewer-modal.component.scss',
})
export class DocViewerModalComponent {
  @Input() isOpen = false;
  @Input() docName = '';
  @Input() docUrl = '';
  @Input() docContent = '';

  @Output() closeModal = new EventEmitter<void>();

  private readonly sanitizer = inject(DomSanitizer);

  get activeIframeUrl(): SafeResourceUrl | null {
    let url = this.docUrl;
    if (!url || url === '#') return null;

    if (url.startsWith('/uploads/')) {
      url = `${getBackendBaseUrl()}${url}`;
    }

    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
    return null;
  }

  get rawDocDownloadUrl(): string {
    const url = this.docUrl;
    if (!url || url === '#') return '';
    if (url.startsWith('/uploads/')) {
      return `${getBackendBaseUrl()}${url}`;
    }
    return url;
  }

  get activeIframeSrcdoc(): string {
    const title = this.escapeHtml(this.docName || 'Document Preview');
    const rawContent = this.docContent || 'No text content available for this asset.';
    const content = this.escapeHtml(rawContent);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; margin: 0; line-height: 1.6; }
    .doc-header { font-size: 18px; font-weight: 700; color: #38bdf8; border-bottom: 1px solid #334155; padding-bottom: 12px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .doc-body { font-size: 14px; color: #e2e8f0; white-space: pre-wrap; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; line-height: 1.7; word-break: break-word; }
  </style>
</head>
<body>
  <div class="doc-header"><span class="material-symbols-outlined" style="font-size:20px;">description</span> ${title}</div>
  <div class="doc-body">${content}</div>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  onClose(): void {
    this.closeModal.emit();
  }
}
