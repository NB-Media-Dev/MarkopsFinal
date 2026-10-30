export function formatLeadStatusLabel(status?: string): string {
  const s = (status || '').toUpperCase().trim();
  switch (s) {
    case 'PAID':
    case 'QUALIFIED':
    case 'CONVERTED':
      return 'Paid';
    case 'ASSIGNED':
    case 'NEW':
      return 'Assigned';
    case 'LINE_BUSY':
    case 'BUSY':
      return 'Line Busy';
    case 'NO_ANSWER':
      return 'No Answer';
    case 'WRONG_NUMBER':
      return 'Wrong Number';
    case 'FOLLOW_UP':
    case 'FOLLOW_UP_SCHEDULED':
      return 'Follow Up';
    case 'INTERESTED':
      return 'Interested';
    case 'NOT_INTERESTED':
      return 'Not Interested';
    case 'CONNECTED':
      return 'Connected';
    default:
      return s ? (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replaceAll('_', ' ')) : 'Assigned';
  }
}

export function getLeadStatusBadgeClass(status?: string): string {
  const s = (status || '').toUpperCase().trim();
  switch (s) {
    case 'QUALIFIED':
    case 'CONVERTED':
    case 'PAID':
    case 'INTERESTED':
    case 'CONNECTED':
      return 'badge-green';
    case 'FOLLOW_UP':
    case 'IN_PROGRESS':
      return 'badge-amber';
    case 'BUSY':
    case 'LINE_BUSY':
    case 'NO_ANSWER':
    case 'RETRY':
      return 'badge-purple';
    case 'NOT_INTERESTED':
    case 'LOST':
    case 'WRONG_NUMBER':
      return 'badge-danger';
    default:
      return 'badge-blue';
  }
}

