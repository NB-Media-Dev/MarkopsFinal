import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ConversionTransactionService } from '../../core/services/conversion-transaction.service';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './transactions.component.html',
  styleUrl: './transactions.component.scss',
})
export class TransactionsComponent implements OnInit {
  readonly txnService = inject(ConversionTransactionService);

  ngOnInit() {
    this.txnService.loadTransactions().subscribe();
  }

  get totalRevenue(): number {
    return this.txnService.transactions().reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }
}
