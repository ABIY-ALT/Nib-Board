'use client';

import React, { useMemo, useState } from 'react';
import { Gauge, Timer } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  SlaPill,
  StatusBadge,
  TypeChip,
  cn,
} from '@/components/ui/primitives';
import { Column, DataTable } from '@/components/ui/DataTable';
import { BODMatter } from '@/lib/types';
import { navItem } from '@/lib/navigation';
import { daysOpen, formatDate, isOpen, isOverdue } from '@/lib/matters';

/** Horizontal distribution bar used by the overview breakdowns. */
const Breakdown: React.FC<{
  title: string;
  entries: Array<{ label: string; count: number }>;
  total: number;
}> = ({ title, entries, total }) => (
  <Card>
    <CardHeader title={title} />
    <div className="p-4 space-y-2.5">
      {entries.length === 0 ? (
        <p className="text-[12px] text-ink-3">No data.</p>
      ) : (
        entries.map((e) => {
          const pct = total > 0 ? Math.round((e.count / total) * 100) : 0;
          return (
            <div key={e.label}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-[12px] text-ink-2 truncate">{e.label}</span>
                <span className="text-[12px] font-semibold text-ink tabular shrink-0">
                  {e.count}
                  <span className="text-ink-3 font-normal ml-1">({pct}%)</span>
                </span>
              </div>
              <ProgressBar value={pct} />
            </div>
          );
        })
      )}
    </div>
  </Card>
);

/* ─────────────────────────────────────────────── Decision Overview */

export const OverviewView: React.FC = () => {
  const { matters, metrics } = useAuth();
  const item = navItem('overview')!;

  const tally = (pick: (m: BODMatter) => string) => {
    const map = new Map<string, number>();
    matters.forEach((m) => map.set(pick(m), (map.get(pick(m)) ?? 0) + 1));
    return [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  };

  const total = matters.length;

  return (
    <div>
      <PageHeader title={item.title} description={item.description} />
      {total === 0 ? (
        <Card>
          <EmptyState
            icon={<Gauge className="w-5 h-5" />}
            title="No Board matters in scope"
            message="Distribution appears once matters are registered within your organizational scope."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Breakdown title="By Matter Type" entries={tally((m) => m.matterType)} total={total} />
          <Breakdown title="By Status" entries={tally((m) => m.status)} total={total} />
          <Breakdown title="By Priority" entries={tally((m) => m.priority)} total={total} />
          <Breakdown title="By Business Area" entries={tally((m) => m.businessArea)} total={total} />
          <Breakdown
            title="By Current Owner"
            entries={tally((m) => m.currentOwnerName).slice(0, 8)}
            total={total}
          />
          <Breakdown
            title="By Responsible Director"
            entries={tally((m) => m.responsibleDirectorName || 'Unassigned').slice(0, 8)}
            total={total}
          />
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────── SLA & Aging */

const AGE_BANDS = [
  { label: '0–7 days', test: (d: number) => d <= 7 },
  { label: '8–30 days', test: (d: number) => d > 7 && d <= 30 },
  { label: '31–60 days', test: (d: number) => d > 30 && d <= 60 },
  { label: '60+ days', test: (d: number) => d > 60 },
];

export const SlaView: React.FC<{ onSelectMatter: (m: BODMatter) => void }> = ({
  onSelectMatter,
}) => {
  const { matters, isLoading } = useAuth();
  const item = navItem('sla')!;

  const open = useMemo(() => matters.filter(isOpen), [matters]);

  const bands = useMemo(
    () =>
      AGE_BANDS.map((b) => ({
        label: b.label,
        count: open.filter((m) => b.test(daysOpen(m))).length,
      })),
    [open]
  );

  const withinSla = open.filter((m) => !m.isOverdue).length;
  const slaRate = open.length > 0 ? Math.round((withinSla / open.length) * 100) : 100;

  const columns: Array<Column<BODMatter>> = [
    {
      key: 'ref',
      header: 'Reference',
      sortValue: (m) => m.id,
      className: 'font-semibold tabular whitespace-nowrap',
      render: (m) => m.id,
    },
    {
      key: 'title',
      header: 'Matter',
      sortValue: (m) => m.title,
      className: 'min-w-[14rem] max-w-[22rem]',
      render: (m) => (
        <div>
          <div className="font-medium text-ink line-clamp-1">{m.title}</div>
          <TypeChip type={m.matterType} className="mt-1" />
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Pending With',
      sortValue: (m) => m.currentOwnerName,
      secondary: true,
      render: (m) => (
        <div className="min-w-0">
          <div className="text-ink truncate">{m.currentOwnerName}</div>
          <div className="text-[11px] text-ink-3 truncate">{m.currentOwnerTitle}</div>
        </div>
      ),
    },
    {
      key: 'age',
      header: 'Days Open',
      sortValue: (m) => daysOpen(m),
      className: 'tabular',
      render: (m) => `${daysOpen(m)}d`,
    },
    {
      key: 'due',
      header: 'Due Date',
      sortValue: (m) => m.deadline,
      className: 'whitespace-nowrap tabular',
      render: (m) => formatDate(m.deadline),
    },
    {
      key: 'sla',
      header: 'SLA',
      sortValue: (m) => m.daysRemaining,
      render: (m) => <SlaPill daysRemaining={m.daysRemaining} isOverdue={m.isOverdue} />,
    },
    { key: 'status', header: 'Status', sortValue: (m) => m.status, render: (m) => <StatusBadge status={m.status} /> },
  ];

  return (
    <div>
      <PageHeader title={item.title} description={item.description} />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
        <Card className="p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Open Matters</p>
          <p className="text-[22px] font-bold text-ink tabular leading-tight mt-1">{open.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Within SLA</p>
          <p
            className={cn(
              'text-[22px] font-bold tabular leading-tight mt-1',
              slaRate >= 90 ? 'text-st-done' : slaRate >= 70 ? 'text-st-review' : 'text-st-late'
            )}
          >
            {slaRate}%
          </p>
          <p className="text-[11px] text-ink-3 mt-0.5 tabular">
            {withinSla} of {open.length}
          </p>
        </Card>
        {bands.map((b) => (
          <Card key={b.label} className="p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{b.label}</p>
            <p className={cn('text-[22px] font-bold tabular leading-tight mt-1', b.count > 0 ? 'text-ink' : 'text-ink-3')}>
              {b.count}
            </p>
            <p className="text-[11px] text-ink-3 mt-0.5">open</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Open Matters by Age"
          description="Longest-running first. Age is measured from Board issuance."
          icon={<Timer className="w-4 h-4" />}
        />
        <DataTable
          columns={columns}
          rows={[...open].sort((a, b) => daysOpen(b) - daysOpen(a))}
          rowKey={(m) => m.id}
          onRowClick={onSelectMatter}
          loading={isLoading && matters.length === 0}
          rowAccent={(m) => (isOverdue(m) ? 'late' : null)}
          empty={
            <EmptyState
              title="No open matters"
              message="Every Board matter within your scope has been closed."
            />
          }
        />
      </Card>
    </div>
  );
};
