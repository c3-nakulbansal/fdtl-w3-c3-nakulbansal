import { BlockerStatus } from '@/Interfaces';

export const STATUS_LABELS: Record<BlockerStatus, string> = {
  WaitingOnCustomer: 'Waiting on customer',
  WaitingOnC3: 'Waiting on C3',
  Resolved: 'Resolved',
};

export const STATUS_COLORS: Record<BlockerStatus, string> = {
  WaitingOnCustomer: '#d97706',
  WaitingOnC3: '#2563eb',
  Resolved: '#16a34a',
};

export const STATUSES = Object.keys(STATUS_LABELS) as BlockerStatus[];
export const WAITING_STATUSES = STATUSES.filter((status) => status !== 'Resolved');
