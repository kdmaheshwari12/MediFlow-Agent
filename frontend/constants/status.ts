export type AppointmentStatus =
  | 'SCHEDULED'
  | 'WAITING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DONE'
  | 'CANCELLED'
  | 'scheduled'
  | 'waiting'
  | 'in_progress'
  | 'completed'
  | 'done'
  | 'cancelled';

export type FollowUpStatus = 'GENERATING' | 'READY' | 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';

export interface StatusConfig {
  label: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  bgClass: string;
  textClass: string;
  borderClass: string;
  iconName: string;
}

export const APPOINTMENT_STATUS_MAP: Record<AppointmentStatus, StatusConfig> = {
  SCHEDULED: {
    label: 'Scheduled',
    badgeVariant: 'outline',
    bgClass: 'bg-blue-50 dark:bg-blue-950/50',
    textClass: 'text-blue-700 dark:text-blue-300',
    borderClass: 'border-blue-200 dark:border-blue-800',
    iconName: 'Calendar',
  },
  WAITING: {
    label: 'Waiting',
    badgeVariant: 'secondary',
    bgClass: 'bg-amber-50 dark:bg-amber-950/50',
    textClass: 'text-amber-700 dark:text-amber-300',
    borderClass: 'border-amber-200 dark:border-amber-800',
    iconName: 'Clock',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    badgeVariant: 'default',
    bgClass: 'bg-violet-50 dark:bg-violet-950/50',
    textClass: 'text-violet-700 dark:text-violet-300',
    borderClass: 'border-violet-200 dark:border-violet-800',
    iconName: 'Stethoscope',
  },
  COMPLETED: {
    label: 'Completed',
    badgeVariant: 'default',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/50',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    iconName: 'CheckCircle2',
  },
  DONE: {
    label: 'Done',
    badgeVariant: 'default',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/50',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    iconName: 'CheckCircle2',
  },
  CANCELLED: {
    label: 'Cancelled',
    badgeVariant: 'destructive',
    bgClass: 'bg-rose-50 dark:bg-rose-950/50',
    textClass: 'text-rose-700 dark:text-rose-300',
    borderClass: 'border-rose-200 dark:border-rose-800',
    iconName: 'XCircle',
  },

  // Lowercase aliases
  scheduled: {
    label: 'Scheduled',
    badgeVariant: 'outline',
    bgClass: 'bg-blue-50 dark:bg-blue-950/50',
    textClass: 'text-blue-700 dark:text-blue-300',
    borderClass: 'border-blue-200 dark:border-blue-800',
    iconName: 'Calendar',
  },
  waiting: {
    label: 'Waiting',
    badgeVariant: 'secondary',
    bgClass: 'bg-amber-50 dark:bg-amber-950/50',
    textClass: 'text-amber-700 dark:text-amber-300',
    borderClass: 'border-amber-200 dark:border-amber-800',
    iconName: 'Clock',
  },
  in_progress: {
    label: 'In Progress',
    badgeVariant: 'default',
    bgClass: 'bg-violet-50 dark:bg-violet-950/50',
    textClass: 'text-violet-700 dark:text-violet-300',
    borderClass: 'border-violet-200 dark:border-violet-800',
    iconName: 'Stethoscope',
  },
  completed: {
    label: 'Completed',
    badgeVariant: 'default',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/50',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    iconName: 'CheckCircle2',
  },
  done: {
    label: 'Done',
    badgeVariant: 'default',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/50',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    iconName: 'CheckCircle2',
  },
  cancelled: {
    label: 'Cancelled',
    badgeVariant: 'destructive',
    bgClass: 'bg-rose-50 dark:bg-rose-950/50',
    textClass: 'text-rose-700 dark:text-rose-300',
    borderClass: 'border-rose-200 dark:border-rose-800',
    iconName: 'XCircle',
  },
};

export const FOLLOWUP_STATUS_MAP: Record<FollowUpStatus, StatusConfig> = {
  GENERATING: {
    label: 'Generating AI Message...',
    badgeVariant: 'secondary',
    bgClass: 'bg-violet-100/80 dark:bg-violet-950/60',
    textClass: 'text-violet-700 dark:text-violet-300',
    borderClass: 'border-violet-300 dark:border-violet-800',
    iconName: 'Sparkles',
  },
  READY: {
    label: 'Ready to Send',
    badgeVariant: 'outline',
    bgClass: 'bg-blue-50 dark:bg-blue-950/50',
    textClass: 'text-blue-700 dark:text-blue-300',
    borderClass: 'border-blue-200 dark:border-blue-800',
    iconName: 'Send',
  },
  PENDING: {
    label: 'Pending Queue',
    badgeVariant: 'secondary',
    bgClass: 'bg-amber-50 dark:bg-amber-950/50',
    textClass: 'text-amber-700 dark:text-amber-300',
    borderClass: 'border-amber-200 dark:border-amber-800',
    iconName: 'Clock',
  },
  SENT: {
    label: 'Sent (Carrier)',
    badgeVariant: 'default',
    bgClass: 'bg-teal-50 dark:bg-teal-950/50',
    textClass: 'text-teal-700 dark:text-teal-300',
    borderClass: 'border-teal-200 dark:border-teal-800',
    iconName: 'MessageSquare',
  },
  DELIVERED: {
    label: 'Delivered',
    badgeVariant: 'default',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/50',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    iconName: 'CheckCheck',
  },
  FAILED: {
    label: 'Delivery Failed',
    badgeVariant: 'destructive',
    bgClass: 'bg-red-50 dark:bg-red-950/50',
    textClass: 'text-red-700 dark:text-red-300',
    borderClass: 'border-red-200 dark:border-red-800',
    iconName: 'AlertTriangle',
  },
};
