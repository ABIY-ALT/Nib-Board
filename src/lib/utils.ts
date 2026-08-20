import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MatterStatus, MatterType, Priority, Role } from '@/lib/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString?: string): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString?: string): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function getMatterTypeBadge(type: MatterType | string): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  switch (type) {
    case 'Directive':
      return {
        bg: 'bg-amber-500/10',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-500/30',
        label: 'DIRECTIVE',
      };
    case 'Decision':
      return {
        bg: 'bg-blue-500/10',
        text: 'text-blue-700 dark:text-blue-400',
        border: 'border-blue-500/30',
        label: 'DECISION',
      };
    case 'Resolution':
      return {
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-700 dark:text-emerald-400',
        border: 'border-emerald-500/30',
        label: 'RESOLUTION',
      };
    case 'Instruction':
      return {
        bg: 'bg-purple-500/10',
        text: 'text-purple-700 dark:text-purple-400',
        border: 'border-purple-500/30',
        label: 'INSTRUCTION',
      };
    case 'Policy / Rule':
      return {
        bg: 'bg-indigo-500/10',
        text: 'text-indigo-700 dark:text-indigo-400',
        border: 'border-indigo-500/30',
        label: 'POLICY / RULE',
      };
    default:
      return {
        bg: 'bg-slate-500/10',
        text: 'text-slate-700 dark:text-slate-300',
        border: 'border-slate-500/30',
        label: (type || 'BOARD DIRECTION').toUpperCase(),
      };
  }
}

export function getStatusBadge(status: MatterStatus): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (status) {
    case 'Received':
      return {
        bg: 'bg-sky-50',
        text: 'text-sky-800',
        border: 'border-sky-300',
        dot: 'bg-sky-500',
      };
    case 'Under Review':
      return {
        bg: 'bg-indigo-50',
        text: 'text-indigo-800',
        border: 'border-indigo-300',
        dot: 'bg-indigo-500',
      };
    case 'Assigned':
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-800',
        border: 'border-blue-300',
        dot: 'bg-blue-500',
      };
    case 'In Progress':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-900',
        border: 'border-amber-300',
        dot: 'bg-amber-500 animate-pulse',
      };
    case 'Clarification Required':
      return {
        bg: 'bg-rose-50',
        text: 'text-rose-900',
        border: 'border-rose-300',
        dot: 'bg-rose-600 animate-ping',
      };
    case 'Implementation Submitted':
      return {
        bg: 'bg-teal-50',
        text: 'text-teal-900',
        border: 'border-teal-300',
        dot: 'bg-teal-600',
      };
    case 'Under Review / Confirmation':
      return {
        bg: 'bg-purple-50',
        text: 'text-purple-900',
        border: 'border-purple-300',
        dot: 'bg-purple-600',
      };
    case 'Closed':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-800',
        border: 'border-emerald-300',
        dot: 'bg-emerald-600',
      };
    default:
      return {
        bg: 'bg-slate-50',
        text: 'text-slate-800',
        border: 'border-slate-300',
        dot: 'bg-slate-500',
      };
  }
}

export function getPriorityBadge(priority: Priority): {
  bg: string;
  text: string;
  border: string;
} {
  switch (priority) {
    case 'Urgent':
      return {
        bg: 'bg-red-50 text-red-700 border-red-200',
        text: 'text-red-700',
        border: 'border-red-200',
      };
    case 'High':
      return {
        bg: 'bg-orange-50 text-orange-700 border-orange-200',
        text: 'text-orange-700',
        border: 'border-orange-200',
      };
    case 'Medium':
      return {
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
        text: 'text-blue-700',
        border: 'border-blue-200',
      };
    case 'Low':
      return {
        bg: 'bg-slate-50 text-slate-700 border-slate-200',
        text: 'text-slate-700',
        border: 'border-slate-200',
      };
  }
}

export function getRoleDisplayName(role: Role): string {
  switch (role) {
    case 'BOARD_SECRETARIAT':
      return 'Board Secretariat';
    case 'BOARD_MEMBER':
      return 'Board of Directors Member';
    case 'CEO':
      return 'Chief Executive Officer (CEO)';
    case 'CHIEF':
      return 'Chief Officer';
    case 'DEPUTY_CHIEF':
      return 'Deputy Chief';
    case 'DIRECTOR':
      return 'Director (Final Operational Level)';
    case 'ADMIN':
      return 'System Administrator';
  }
}
