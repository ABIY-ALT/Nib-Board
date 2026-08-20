'use client';

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck2,
  Gauge,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  KpiSkeleton,
  PageHeader,
  PriorityBadge,
  SlaPill,
  StatusBadge,
  TypeChip,
  cn,
} from '@/components/ui/primitives';
import { Column, DataTable } from '@/components/ui/DataTable';
import { BODMatter } from '@/lib/types';
import { ViewId } from '@/lib/navigation';
import {
  awaitsAction,
  daysOpen,
  formatDate,
  isDueSoon,
  isOpen,
  isOverdue,
  pipelineSummary,
} from '@/lib/matters';

interface DashboardProps {
  onSelectMatter: (m: BODMatter) => void;
  onNavigate: (v: ViewId) => void;
}

/* ────────────────────────────────────────────────────────── KPI card */

const KpiCard: React.FC<{
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'late' | 'review' | 'done';
  onClick?: () => void;
}> = ({ label, value, hint, icon, tone = 'default', onClick }) => {
  const toneClass = {
    default: 'text-ink',
    late: 'text-st-late',
    review: 'text-st-review',
    done: 'text-st-done',
  }[tone];

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'bg-surface border border-line rounded-[--radius-card] shadow-card p-3.5 text-left w-full',
        onClick && 'hover:border-nib-gold-500 hover:shadow-raised transition-all cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 leading-tight">
          {label}
        </p>
        <span className="text-ink-3 shrink-0">{icon}</span>
      </div>
      <p className={cn('text-[26px] font-bold leading-none tabular', toneClass)}>{value}</p>
      {hint && <p className="text-[11px] text-ink-3 mt-1.5 leading-tight">{hint}</p>}
    </Wrapper>
  );
};

/* ────────────────────────────────────────────────────────── Dashboard */

export const Dashboard: React.FC<DashboardProps> = ({ onSelectMatter, onNavigate }) => {
  const { matters, metrics, isLoading } = useAuth();
  const user = useAuthenticatedUser();

  const open = useMemo(() => matters.filter(isOpen), [matters]);
  const overdue = useMemo(() => matters.filter(isOverdue), [matters]);
  const dueSoon = useMemo(() => matters.filter(isDueSoon), [matters]);
  const mine = useMemo(() => matters.filter((m) => awaitsAction(m, user)), [matters, user]);
  const stages = useMemo(() => pipelineSummary(matters), [matters]);

  const closed = metrics?.closedCount ?? matters.filter((m) => m.status === 'Closed').length;
  const total = metrics?.totalMatters ?? matters.length;
  const inProgress = metrics?.inProgressCount ?? 0;
  const submitted = metrics?.implementationSubmittedCount ?? 0;
  const pendingImpl = open.filter((m) =>
    ['Received', 'Under Review', 'Assigned'].includes(m.status)
  ).length;

  const complianceRate = total > 0 ? Math.round((closed / total) * 100) : 0;

  /* Matters most in need of attention, worst first: overdue before at-risk,
     and within each, the least time remaining. */
  const attention = useMemo(
    () =>
      [...overdue, ...dueSoon]
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .slice(0, 5),
    [overdue, dueSoon]
  );

  const recent = useMemo(
    () =>
      [...matters]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
    [matters]
  );

  const recentColumns: Array<Column<BODMatter>> = [
    {
      key: 'ref',
      header: 'Reference',
      className: 'font-semibold tabular whitespace-nowrap',
      render: (m) => m.id,
    },
    {
      key: 'title',
      header: 'Matter',
      className: 'min-w-[14rem] max-w-[22rem]',
      render: (m) => (
        <div>
          <div className="font-medium text-ink line-clamp-1">{m.title}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <TypeChip type={m.matterType} />
            <PriorityBadge priority={m.priority} />
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Current Owner',
      secondary: true,
      render: (m) => (
        <div className="min-w-0">
          <div className="text-ink truncate">{m.currentOwnerName}</div>
          <div className="text-[11px] text-ink-3 truncate">{m.currentOwnerTitle}</div>
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      className: 'whitespace-nowrap',
      render: (m) => (
        <div>
          <div className="text-ink tabular">{formatDate(m.deadline)}</div>
          <SlaPill daysRemaining={m.daysRemaining} isOverdue={m.isOverdue} closed={m.status === 'Closed'} />
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Board Governance Dashboard"
        description="Overview of Board decisions, directives, resolutions and implementation status."
        actions={
          <Button variant="secondary" onClick={() => onNavigate('reports')}>
            Reports
          </Button>
        }
      />

      {/* Executive situation — the five-second answer */}
      <Card className="mb-5 border-l-[3px] border-l-nib-gold-500">
        <div className="flex items-start gap-3 p-4">
          <span className="w-8 h-8 rounded-lg bg-nib-gold-100 dark:bg-nib-brown-700/30 text-nib-brown-700 dark:text-nib-gold-200 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-3 mb-1">
              Executive Governance Situation
            </h2>
            {isLoading && matters.length === 0 ? (
              <p className="text-[14px] text-ink-3">Loading current position…</p>
            ) : (
              <p className="text-[14px] text-ink leading-relaxed">
                <strong className="tabular">{open.length}</strong> Board{' '}
                {open.length === 1 ? 'matter is' : 'matters are'} currently under monitoring.{' '}
                <strong className="tabular">{pendingImpl}</strong> require implementation action,{' '}
                <strong className={cn('tabular', overdue.length > 0 && 'text-st-late')}>
                  {overdue.length}
                </strong>{' '}
                {overdue.length === 1 ? 'is' : 'are'} overdue, and{' '}
                <strong className={cn('tabular', submitted > 0 && 'text-st-review')}>
                  {submitted}
                </strong>{' '}
                {submitted === 1 ? 'awaits' : 'await'} executive confirmation.
                {mine.length > 0 && (
                  <>
                    {' '}
                    <span className="text-nib-brown-700 dark:text-nib-gold-200 font-semibold">
                      {mine.length} {mine.length === 1 ? 'matter needs' : 'matters need'} your action.
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-5">
        {isLoading && matters.length === 0 ? (
          <KpiSkeleton count={8} />
        ) : (
          <>
            <KpiCard label="Total Matters" value={total} icon={<Layers className="w-4 h-4" />} hint="Within your scope" />
            <KpiCard
              label="Pending Implementation"
              value={pendingImpl}
              icon={<ClipboardList className="w-4 h-4" />}
              hint="Not yet in execution"
              onClick={() => onNavigate('decisions')}
            />
            <KpiCard label="In Progress" value={inProgress} icon={<Clock className="w-4 h-4" />} hint="Under execution" onClick={() => onNavigate('implementation')} />
            <KpiCard label="Completed" value={closed} tone="done" icon={<CheckCircle2 className="w-4 h-4" />} hint="Closed & reported" />
            <KpiCard
              label="Overdue"
              value={overdue.length}
              tone={overdue.length > 0 ? 'late' : 'default'}
              icon={<AlertTriangle className="w-4 h-4" />}
              hint="Past deadline"
              onClick={() => onNavigate('overdue')}
            />
            <KpiCard
              label="Due Soon"
              value={dueSoon.length}
              tone={dueSoon.length > 0 ? 'review' : 'default'}
              icon={<Clock className="w-4 h-4" />}
              hint="Within 7 days"
              onClick={() => onNavigate('sla')}
            />
            <KpiCard
              label="Awaiting Response"
              value={submitted}
              tone={submitted > 0 ? 'review' : 'default'}
              icon={<FileCheck2 className="w-4 h-4" />}
              hint="Reports to review"
            />
            <KpiCard label="Compliance Rate" value={`${complianceRate}%`} icon={<Gauge className="w-4 h-4" />} hint="Closed of total" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        {/* Decision pipeline */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Decision Pipeline"
            description="Where Board matters currently sit, and how long they have been there."
            icon={<Layers className="w-4 h-4" />}
          />
          <div className="p-4 space-y-1.5">
            {stages.map((s, i) => {
              const share = open.length > 0 ? (s.count / Math.max(1, matters.length)) * 100 : 0;
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 flex items-center gap-2">
                    <span
                      className={cn(
                        'w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 tabular',
                        s.count > 0
                          ? 'bg-nib-gold-100 border-nib-gold-500 text-nib-brown-800 dark:bg-nib-brown-700/30 dark:text-nib-gold-200'
                          : 'bg-surface-2 border-line text-ink-3'
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[12px] font-medium text-ink truncate">{s.label}</span>
                  </div>

                  <div className="flex-1 min-w-0 h-6 bg-surface-2 rounded overflow-hidden relative">
                    <div
                      className={cn(
                        'h-full transition-[width] duration-500',
                        s.overdue > 0 ? 'bg-st-late/25' : 'bg-nib-gold-200 dark:bg-nib-brown-600/40'
                      )}
                      style={{ width: `${Math.max(share, s.count > 0 ? 4 : 0)}%` }}
                    />
                    <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold text-ink tabular">
                      {s.count > 0 ? s.count : ''}
                    </span>
                  </div>

                  <div className="w-28 shrink-0 text-right">
                    {s.count > 0 ? (
                      <>
                        <span className="text-[11px] text-ink-2 tabular">avg {s.averageAge}d</span>
                        {s.overdue > 0 && (
                          <span className="block text-[10px] font-semibold text-st-late tabular">
                            {s.overdue} overdue
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-ink-3">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Management attention */}
        <Card>
          <CardHeader
            title="Management Attention"
            description="Overdue and approaching deadline."
            icon={<AlertTriangle className="w-4 h-4" />}
            action={
              overdue.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => onNavigate('overdue')}>
                  All
                  <ArrowRight className="w-3 h-3" />
                </Button>
              ) : undefined
            }
          />
          {attention.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-5 h-5" />}
              title="Nothing needs attention"
              message="No Board matter in your scope is overdue or approaching its deadline."
            />
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => onSelectMatter(m)}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors border-l-2',
                      m.isOverdue ? 'border-l-st-late' : 'border-l-st-review'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[12px] font-bold text-ink tabular">{m.id}</span>
                      <SlaPill daysRemaining={m.daysRemaining} isOverdue={m.isOverdue} />
                    </div>
                    <p className="text-[12px] text-ink-2 line-clamp-1 mb-1.5">{m.title}</p>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-ink-3">
                      <span className="truncate">{m.currentOwnerTitle}</span>
                      <span className="tabular shrink-0">{formatDate(m.deadline)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Recent Board Matters"
          description="Most recently updated within your scope."
          icon={<ClipboardList className="w-4 h-4" />}
          action={
            <Button size="sm" variant="ghost" onClick={() => onNavigate('decisions')}>
              View all
              <ArrowRight className="w-3 h-3" />
            </Button>
          }
        />
        <DataTable
          columns={recentColumns}
          rows={recent}
          rowKey={(m) => m.id}
          onRowClick={onSelectMatter}
          loading={isLoading && matters.length === 0}
          pageSize={8}
          rowAccent={(m) => (isOverdue(m) ? 'late' : null)}
          empty={
            <EmptyState
              title="No Board matters yet"
              message="Once the Board Secretariat registers a matter it will appear here."
            />
          }
        />
      </Card>
    </div>
  );
};
