import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';

export interface TransactionItem {
  id: string;
  conversionId: string;
  leadId: string;
  customerName: string;
  amount: number;
  paymentStatus: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  paymentMethod: string;
  transactionRef: string;
  recordedBy: string;
  recorderName: string;
  transactionDate: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConversionTransactionService {
  private readonly http = inject(HttpClient);

  readonly transactions = signal<TransactionItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  loadTransactions() {
    this.loading.set(true);
    return this.http.get<TransactionItem[]>('/api/transactions').pipe(
      tap({
        next: (data) => {
          this.transactions.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to load transactions.');
          this.loading.set(false);
        },
      })
    );
  }
}
