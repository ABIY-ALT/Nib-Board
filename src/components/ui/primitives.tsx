'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AlertTriangle, FileCheck2, Inbox, Loader2, Paperclip, RefreshCw, X } from 'lucide-react';

export const cn = (...parts: Array<string | undefined | null | false>) =>
  twMerge(clsx(parts));

/* ───────────────────────────────────────────────────────── Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Gold is the single call-to-action colour across the application.
  primary:
    'bg-nib-gold-600 text-nib-brown-900 hover:bg-nib-gold-500 active:bg-nib-gold-700 ' +
    'disabled:bg-surface-3 disabled:text-ink-3 font-semibold shadow-card',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-surface-2 ' +
    'disabled:text-ink-3 disabled:hover:bg-surface font-medium',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink font-medium',
  // Restrained: outlined rather than a solid block of red.
  danger:
    'bg-surface text-st-late border border-st-late/40 hover:bg-st-late-bg font-medium',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-4 text-[13px] gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={cn(
      'inline-flex items-center justify-center rounded-[--radius-control] transition-colors',
      'disabled:cursor-not-allowed whitespace-nowrap',
      BUTTON_VARIANTS[variant],
      BUTTON_SIZES[size],
      className
    )}
  >
    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
    {children}
  </button>
);

/* ───────────────────────────────────────────────────────── Card */

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...rest
}) => (
  <div
    {...rest}
    className={cn(
      'bg-surface border border-line rounded-[--radius-card] shadow-card',
      className
    )}
  >
    {children}
  </div>
);

export const CardHeader: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ title, description, action, icon }) => (
  <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-line">
    <div className="flex items-start gap-2.5 min-w-0">
      {icon && <span className="text-nib-gold-600 mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink leading-tight">{title}</h2>
        {description && <p className="text-[12px] text-ink-3 mt-0.5">{description}</p>}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/* ───────────────────────────────────────────── Status & priority */

/**
 * One hue per state, resolved in a single place.
 *
 * Every screen renders a status through this map, so "In Progress" can never be
 * teal on one page and blue on another. Each badge also carries a dot, so state
 * is not communicated by colour alone.
 */
const STATUS_TONE: Record<string, string> = {
  Received: 'neutral',
  Draft: 'neutral',
  Cancelled: 'neutral',
  'Under Review': 'info',
  Assigned: 'info',
  Pending: 'review',
  'In Progress': 'active',
  'Clarification Required': 'wait',
  'Awaiting Response': 'wait',
  'Implementation Submitted': 'review',
  'Under Review / Confirmation': 'review',
  Completed: 'done',
  Closed: 'done',
  Overdue: 'late',
  Escalated: 'late',
};

const TONE_CLASS: Record<string, string> = {
  neutral: 'text-st-neutral bg-st-neutral-bg border-st-neutral/25',
  info: 'text-st-info bg-st-info-bg border-st-info/25',
  active: 'text-st-active bg-st-active-bg border-st-active/25',
  wait: 'text-st-wait bg-st-wait-bg border-st-wait/25',
  review: 'text-st-review bg-st-review-bg border-st-review/25',
  done: 'text-st-done bg-st-done-bg border-st-done/25',
  late: 'text-st-late bg-st-late-bg border-st-late/30',
};

const DOT_CLASS: Record<string, string> = {
  neutral: 'bg-st-neutral',
  info: 'bg-st-info',
  active: 'bg-st-active',
  wait: 'bg-st-wait',
  review: 'bg-st-review',
  done: 'bg-st-done',
  late: 'bg-st-late',
};

export const StatusBadge: React.FC<{ status: string; className?: string }> = ({
  status,
  className,
}) => {
  const tone = STATUS_TONE[status] ?? 'neutral';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border',
        'text-[11px] font-semibold whitespace-nowrap',
        TONE_CLASS[tone],
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', DOT_CLASS[tone])} />
      {status}
    </span>
  );
};

const PRIORITY_CLASS: Record<string, string> = {
  Urgent: 'text-st-late bg-st-late-bg border-st-late/30',
  High: 'text-st-review bg-st-review-bg border-st-review/25',
  Medium: 'text-st-info bg-st-info-bg border-st-info/25',
  Low: 'text-st-neutral bg-st-neutral-bg border-st-neutral/25',
};

export const PriorityBadge: React.FC<{ priority: string; className?: string }> = ({
  priority,
  className,
}) => (
  <span
    className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-semibold',
      PRIORITY_CLASS[priority] ?? PRIORITY_CLASS.Low,
      className
    )}
  >
    {priority}
  </span>
);

/** Matter type shown as a quiet brand-toned chip, never competing with status. */
export const TypeChip: React.FC<{ type: string; className?: string }> = ({ type, className }) => (
  <span
    className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-medium',
      'bg-nib-gold-100 text-nib-brown-700 border-nib-gold-200',
      'dark:bg-nib-brown-700/25 dark:text-nib-gold-200 dark:border-nib-brown-600/40',
      className
    )}
  >
    {type}
  </span>
);

/* ─────────────────────────────────────────── SLA / deadline pill */

/**
 * Deadline pressure, expressed in words as well as colour.
 *
 * `daysRemaining` comes from the API, which derives it from the deadline rather
 * than storing it, so this cannot show a stale figure.
 */
export const SlaPill: React.FC<{ daysRemaining: number; isOverdue: boolean; closed?: boolean }> = ({
  daysRemaining,
  isOverdue,
  closed,
}) => {
  if (closed) {
    return <span className="text-[12px] text-ink-3">—</span>;
  }
  if (isOverdue) {
    const late = Math.abs(daysRemaining);
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-st-late tabular">
        <AlertTriangle className="w-3 h-3" />
        {late} {late === 1 ? 'day' : 'days'} overdue
      </span>
    );
  }
  const soon = daysRemaining <= 7;
  return (
    <span
      className={cn(
        'text-[12px] font-medium tabular',
        soon ? 'text-st-review' : 'text-ink-2'
      )}
    >
      {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left
    </span>
  );
};

/* ───────────────────────────────────────────────── Page header */

export const PageHeader: React.FC<{
  title: string;
  description?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}> = ({ title, description, actions, meta }) => (
  <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
    <div className="min-w-0">
      <h1 className="text-[24px] leading-tight font-bold text-ink tracking-tight">{title}</h1>
      {description && <p className="text-[13px] text-ink-2 mt-1 max-w-2xl">{description}</p>}
      {meta && <div className="mt-2">{meta}</div>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </header>
);

/* ───────────────────────────────────────── Empty / loading / error */

export const EmptyState: React.FC<{
  title: string;
  message?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ title, message, action, icon }) => (
  <div className="flex flex-col items-center justify-center text-center px-6 py-14">
    <div className="w-11 h-11 rounded-full bg-surface-2 border border-line flex items-center justify-center text-ink-3 mb-3">
      {icon ?? <Inbox className="w-5 h-5" />}
    </div>
    <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
    {message && <p className="text-[13px] text-ink-3 mt-1 max-w-sm">{message}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
}> = ({ title = 'Unable to load this view', message, onRetry }) => (
  <div className="flex flex-col items-center justify-center text-center px-6 py-14">
    <div className="w-11 h-11 rounded-full bg-st-late-bg border border-st-late/25 flex items-center justify-center text-st-late mb-3">
      <AlertTriangle className="w-5 h-5" />
    </div>
    <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
    <p className="text-[13px] text-ink-3 mt-1 max-w-sm">
      {message ?? "We couldn't retrieve this information. Please try again."}
    </p>
    {onRetry && (
      <Button className="mt-4" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('skeleton rounded', className)} />
);

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 6,
  cols = 6,
}) => (
  <div className="divide-y divide-line">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex items-center gap-4 px-4 py-3">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton
            key={c}
            className={cn('h-3.5', c === 1 ? 'flex-[3]' : 'flex-1')}
          />
        ))}
      </div>
    ))}
  </div>
);

export const KpiSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} className="p-3.5">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-7 w-14 mb-2" />
        <Skeleton className="h-2.5 w-20" />
      </Card>
    ))}
  </>
);

/* ───────────────────────────────────────────────────────── Tabs */

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export const Tabs: React.FC<{
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
}> = ({ items, active, onChange }) => (
  <div role="tablist" className="flex items-center gap-1 border-b border-line overflow-x-auto">
    {items.map((t) => {
      const on = t.id === active;
      return (
        <button
          key={t.id}
          role="tab"
          aria-selected={on}
          onClick={() => onChange(t.id)}
          className={cn(
            'relative px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
            'border-b-2 -mb-px',
            on
              ? 'border-nib-gold-500 text-ink'
              : 'border-transparent text-ink-3 hover:text-ink-2'
          )}
        >
          {t.label}
          {typeof t.count === 'number' && (
            <span
              className={cn(
                'ml-1.5 px-1.5 py-0.5 rounded text-[11px] font-semibold tabular',
                on ? 'bg-nib-gold-100 text-nib-brown-700 dark:bg-nib-brown-700/30 dark:text-nib-gold-200' : 'bg-surface-3 text-ink-3'
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

/* ────────────────────────────────────────────── Progress bar */

export const ProgressBar: React.FC<{ value: number; className?: string }> = ({
  value,
  className,
}) => (
  <div
    className={cn('h-1.5 w-full rounded-full bg-surface-3 overflow-hidden', className)}
    role="progressbar"
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div
      className="h-full rounded-full bg-nib-gold-500 transition-[width] duration-500"
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
);

/* ────────────────────────────────────────────────── Form field */

export const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, error, htmlFor, children }) => (
  <div>
    <label
      htmlFor={htmlFor}
      className="block text-[12px] font-semibold text-ink-2 mb-1"
    >
      {label}
      {required && (
        <span className="text-st-late ml-0.5" aria-hidden="true">
          *
        </span>
      )}
      {required && <span className="sr-only"> (required)</span>}
    </label>
    {children}
    {error ? (
      <p className="text-[11px] text-st-late mt-1">{error}</p>
    ) : hint ? (
      <p className="text-[11px] text-ink-3 mt-1">{hint}</p>
    ) : null}
  </div>
);

/**
 * The backdrop every dialog sits on.
 *
 * A translucent scrim with a blur, never an opaque fill: the page the officer
 * was working on has to stay visible behind the dialog, so they can see which
 * matter they are acting on while they type. `items-start` with a top margin
 * rather than `items-center` keeps a tall form reachable on a short window —
 * centring one that is taller than the viewport clips its head off-screen.
 */
export const modalOverlayClass =
  'fixed inset-0 z-50 overflow-y-auto bg-scrim backdrop-blur-sm ' +
  'flex items-start sm:items-center justify-center p-4 sm:py-10';

export const inputClass = cn(
  'w-full h-9 px-3 rounded-[--radius-control] bg-surface text-ink text-[13px]',
  'border border-line-strong placeholder:text-ink-3',
  'focus:outline-none focus:border-nib-gold-500 focus:ring-2 focus:ring-nib-gold-500/20',
  'disabled:bg-surface-2 disabled:text-ink-3 transition-colors'
);

export const textareaClass = cn(inputClass, 'h-auto py-2 min-h-[80px] leading-relaxed');
export const selectClass = cn(inputClass, 'pr-8 cursor-pointer');

/* ────────────────────────────────────────────────────── FilePicker */

/**
 * A file input that shows what was chosen.
 *
 * The native control renders differently in every browser and says nothing
 * useful once a file is picked, so it is hidden behind a styled label and the
 * chosen file — with its real size — is echoed back. An officer attaching Board
 * minutes should be able to see they picked the right file before uploading it.
 */
export const FilePicker: React.FC<{
  id: string;
  file: File | null;
  onPick: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
}> = ({ id, file, onPick, accept, disabled }) => {
  const format = (bytes: number) =>
    bytes < 1024
      ? `${bytes} B`
      : bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(0)} KB`
        : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div>
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
      <label
        htmlFor={id}
        className={cn(
          'flex items-center gap-3 w-full rounded-[--radius-control] border border-dashed px-3 py-3',
          'transition-colors cursor-pointer',
          disabled && 'opacity-60 cursor-not-allowed',
          file
            ? 'border-nib-gold-500/60 bg-nib-gold-100/40 dark:bg-nib-brown-700/20'
            : 'border-line-strong bg-surface-2 hover:border-nib-gold-500/50'
        )}
      >
        <span
          className={cn(
            'w-9 h-9 rounded-md flex items-center justify-center shrink-0',
            file ? 'bg-nib-gold-500 text-nib-brown-900' : 'bg-surface-3 text-ink-3'
          )}
        >
          {file ? <FileCheck2 className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-ink truncate">
            {file ? file.name : 'Choose a file…'}
          </span>
          <span className="block text-[11px] text-ink-3">
            {file ? `${format(file.size)} · ${file.type || 'unknown type'}` : 'PDF, Word, Excel, PowerPoint, text, CSV, PNG or JPEG'}
          </span>
        </span>
        {file && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onPick(null);
            }}
            aria-label="Remove the chosen file"
            className="text-ink-3 hover:text-ink p-1 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </label>
    </div>
  );
};
