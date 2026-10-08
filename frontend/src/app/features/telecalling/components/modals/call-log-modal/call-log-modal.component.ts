import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeadItem } from '../../../../../core/services/lead-telecalling.service';

@Component({
  selector: 'app-call-log-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './call-log-modal.component.html',
  styleUrl: './call-log-modal.component.scss',
})
export class CallLogModalComponent {
  @Input() lead: LeadItem | null = null;
  @Input() callOutcome = 'CONNECTED';
  @Input() callDuration = 120;
  @Input() callRemarks = '';
  @Input() enableReminder = false;
  @Input() followUpDate = '';
  @Input() followUpTime = '10:00';
  @Input() todayDate = '';

  @Output() callOutcomeChange = new EventEmitter<string>();
  @Output() callDurationChange = new EventEmitter<number>();
  @Output() callRemarksChange = new EventEmitter<string>();
  @Output() enableReminderChange = new EventEmitter<boolean>();
  @Output() followUpDateChange = new EventEmitter<string>();
  @Output() followUpTimeChange = new EventEmitter<string>();
  @Output() closeModal = new EventEmitter<void>();
  @Output() saveCallLog = new EventEmitter<void>();

  onCallOutcomeChange() {
    this.callOutcomeChange.emit(this.callOutcome);
    if (
      this.callOutcome === 'BUSY' ||
      this.callOutcome === 'LINE_BUSY' ||
      this.callOutcome === 'NO_ANSWER' ||
      this.callOutcome === 'WRONG_NUMBER'
    ) {
      this.callDuration = 0;
      this.callDurationChange.emit(0);
    } else if (this.callDuration === 0) {
      this.callDuration = 120;
      this.callDurationChange.emit(120);
    }

    if (
      this.callOutcome === 'FOLLOW_UP' ||
      this.callOutcome === 'NO_ANSWER' ||
      this.callOutcome === 'BUSY' ||
      this.callOutcome === 'LINE_BUSY' ||
      this.callOutcome === 'INTERESTED'
    ) {
      this.toggleReminder(true);
    } else if (
      this.callOutcome === 'QUALIFIED' ||
      this.callOutcome === 'NOT_INTERESTED' ||
      this.callOutcome === 'CONVERTED' ||
      this.callOutcome === 'LOST'
    ) {
      this.clearFollowUpSchedule();
    }
  }

  setDurationPreset(seconds: number) {
    this.callDuration = seconds;
    this.callDurationChange.emit(seconds);
  }

  toggleReminder(forceState?: boolean) {
    if (forceState !== undefined) {
      this.enableReminder = forceState;
    } else {
      this.enableReminder = !this.enableReminder;
    }
    this.enableReminderChange.emit(this.enableReminder);

    if (this.enableReminder) {
      if (!this.followUpDate) {
        const now = new Date();
        const future = new Date(now.getTime() + 30 * 60000);
        this.followUpDate = now.toISOString().split('T')[0];
        this.followUpDateChange.emit(this.followUpDate);
        const hrs = String(future.getHours()).padStart(2, '0');
        const mins = String(future.getMinutes()).padStart(2, '0');
        this.followUpTime = `${hrs}:${mins}`;
        this.followUpTimeChange.emit(this.followUpTime);
      }
    } else {
      this.followUpDate = '';
      this.followUpTime = '';
      this.followUpDateChange.emit('');
      this.followUpTimeChange.emit('');
    }
  }

  clearFollowUpSchedule() {
    this.enableReminder = false;
    this.followUpDate = '';
    this.followUpTime = '';
    this.enableReminderChange.emit(false);
    this.followUpDateChange.emit('');
    this.followUpTimeChange.emit('');
  }

  shouldShowDuration(): boolean {
    return (
      this.callOutcome !== 'BUSY' &&
      this.callOutcome !== 'LINE_BUSY' &&
      this.callOutcome !== 'NO_ANSWER' &&
      this.callOutcome !== 'WRONG_NUMBER'
    );
  }

  setFollowUpPresetMinutes(minutes: number) {
    this.enableReminder = true;
    this.enableReminderChange.emit(true);
    const target = new Date(Date.now() + minutes * 60000);
    this.followUpDate = target.toISOString().split('T')[0];
    this.followUpDateChange.emit(this.followUpDate);
    const hrs = String(target.getHours()).padStart(2, '0');
    const mins = String(target.getMinutes()).padStart(2, '0');
    this.followUpTime = `${hrs}:${mins}`;
    this.followUpTimeChange.emit(this.followUpTime);
  }

  setFollowUpPresetTomorrow(hour = 10) {
    this.enableReminder = true;
    this.enableReminderChange.emit(true);
    const target = new Date(Date.now() + 86400000);
    this.followUpDate = target.toISOString().split('T')[0];
    this.followUpDateChange.emit(this.followUpDate);
    this.followUpTime = `${String(hour).padStart(2, '0')}:00`;
    this.followUpTimeChange.emit(this.followUpTime);
  }

  getRemarksPlaceholder(): string {
    switch (this.callOutcome) {
      case 'LINE_BUSY':
      case 'BUSY':
        return 'e.g. Line busy / on another call, will retry later...';
      case 'NO_ANSWER':
        return 'e.g. Ringing but no answer / call disconnected without response...';
      case 'WRONG_NUMBER':
        return 'e.g. Person answered and stated wrong person / invalid number...';
      case 'FOLLOW_UP':
        return 'e.g. Customer requested callback later / scheduled follow-up time...';
      case 'INTERESTED':
        return 'e.g. Highly interested, syllabus & fee details shared on WhatsApp...';
      case 'NOT_INTERESTED':
        return 'e.g. Budget constraint / already enrolled elsewhere / not looking now...';
      case 'QUALIFIED':
        return 'e.g. Verified eligibility, high intent lead, ready for onboarding...';
      case 'CONNECTED':
      default:
        return 'e.g. Discussion completed, shared product details...';
    }
  }

  getRemarksQuickTemplates(): string[] {
    switch (this.callOutcome) {
      case 'LINE_BUSY':
      case 'BUSY':
        return ['Line busy, retry later', 'Customer on another call', 'Network busy tone'];
      case 'NO_ANSWER':
        return ['Ringing, not answered', 'Call disconnected without answer', 'Switched off / out of reach'];
      case 'WRONG_NUMBER':
        return ['Wrong person answered', 'Number does not belong to lead', 'Invalid contact'];
      case 'FOLLOW_UP':
        return ['Requested callback later', 'Need to discuss with family', 'Asked to call tomorrow', 'Send details on WhatsApp first'];
      case 'INTERESTED':
        return ['Very interested, brochure sent', 'Asked for fee structure & discount', 'Ready for demo session', 'Requested syllabus PDF'];
      case 'NOT_INTERESTED':
        return ['Budget constraint', 'Already joined another institute', 'Not looking right now', 'Location too far'];
      case 'QUALIFIED':
        return ['High intent lead, ready to pay', 'All prerequisites verified', 'Scheduled enrollment meet', 'Direct conversion lead'];
      case 'CONNECTED':
      default:
        return ['Detailed discussion held', 'Provided course overview', 'Customer requested follow-up'];
    }
  }

  insertQuickRemark(template: string) {
    if (!this.callRemarks || this.callRemarks.trim() === '') {
      this.callRemarks = template;
    } else {
      this.callRemarks = `${this.callRemarks.trim()}, ${template}`;
    }
    this.callRemarksChange.emit(this.callRemarks);
  }

  onRemarksChange(value: string) {
    this.callRemarks = value;
    this.callRemarksChange.emit(value);
  }

  onDurationChange(value: number) {
    this.callDuration = value;
    this.callDurationChange.emit(value);
  }

  onDateChange(value: string) {
    this.followUpDate = value;
    this.followUpDateChange.emit(value);
  }

  onTimeChange(value: string) {
    this.followUpTime = value;
    this.followUpTimeChange.emit(value);
  }

  onClose() {
    this.closeModal.emit();
  }

  onSubmit() {
    this.saveCallLog.emit();
  }
}
