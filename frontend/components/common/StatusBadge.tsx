'use client';

import React from 'react';
import { AppointmentStatus, FollowUpStatus, APPOINTMENT_STATUS_MAP, FOLLOWUP_STATUS_MAP } from '@/constants/status';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Clock,
  Stethoscope,
  CheckCircle2,
  XCircle,
  Sparkles,
  Send,
  MessageSquare,
  CheckCheck,
  AlertTriangle,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  Calendar,
  Clock,
  Stethoscope,
  CheckCircle2,
  XCircle,
  Sparkles,
  Send,
  MessageSquare,
  CheckCheck,
  AlertTriangle,
};

interface StatusBadgeProps {
  status: AppointmentStatus | FollowUpStatus;
  type?: 'appointment' | 'followup';
  className?: string;
}

export function StatusBadge({ status, type = 'appointment', className = '' }: StatusBadgeProps) {
  const config =
    type === 'appointment'
      ? APPOINTMENT_STATUS_MAP[status as AppointmentStatus] || APPOINTMENT_STATUS_MAP.SCHEDULED
      : FOLLOWUP_STATUS_MAP[status as FollowUpStatus] || FOLLOWUP_STATUS_MAP.PENDING;

  const IconComponent = ICON_MAP[config.iconName] || Clock;

  return (
    <Badge
      variant={config.badgeVariant}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${config.bgClass} ${config.textClass} ${config.borderClass} ${className}`}
    >
      <IconComponent className={`h-3.5 w-3.5 ${status === 'GENERATING' ? 'animate-spin' : ''}`} />
      <span>{config.label}</span>
    </Badge>
  );
}
