'use client';

import React, { useMemo, useState } from 'react';
import { Download, FilePlus2, Inbox, TrendingUp } from 'lucide-react';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  PriorityBadge,
  ProgressBar,
  SlaPill,
  StatusBadge,
  TypeChip,
  cn,
} from '@/components/ui/primitives';
import { Column, DataTable, FilterBar } from '@/components/ui/DataTable';
import { BODMatter } from '@/lib/types';
import { ViewId, navItem } from '@/lib/navigation';
import {
  AGING_BUCKETS,
  daysOpen,
  formatDate,
  isOverdue,
  matchesQuery,
  mattersForView,
  overdueBucket,
} from '@/lib/matters';

interface MattersViewProps {
  view: ViewId;
  onSelectMatter: (m: BODMatter) => void;
  onRegister: () => void;
}

const ALL = 'ALL';

/**
 * One list surface behind most of the navigation.
 *
 * Board Decisions, Directives, Resolutions, Incoming, My Tasks, Pending Actions,
 * Overdue and Implementation Tracking are all projections of the same scoped
 * matter set, so they share filtering, sorting, pagination and column design
 * rather than each drifting into its own table.
 */
export const MattersView: React.FC<MattersViewProps> = ({ view, onSelectMatter, onRegister }) => {
  const { matters, isLoading, matterTypes } = useAuth();
  const user = useAuthenticatedUser();
  const item = navItem(view);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [area, setArea] = useState(ALL);

  /**
   * The date bound differs by view, and it has to: on Overdue and Implementation
   * Tracking the question is always "due when", while on the register views it
   * is "decided when". Filtering the wrong field would quietly answer a
   * different question than the one on screen.
   */
  const dateField: keyof Pick<BODMatter, 'deadline' | 'boardDecisionDate'> =
    view === 'overdue' || view === 'implementation' || view === 'my-tasks'
      ? 'deadline'
      : 'boardDecisionDate';
  const dateLabel = dateField === 'deadline' ? 'Deadline' : 'Board decision date';
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const scoped = useMemo(() => mattersForView(view, matters, user), [view, matters, user]);

  const rows = useMemo(
    () =>
      scoped.filter((m) => {
        // Both bounds are inclusive. The values are 'YYYY-MM-DD' on both sides,
        // so a string comparison is the date comparison — no parsing, and no
        // time zone to shift the boundary day.
        const on = m[dateField];
        return (
          matchesQuery(m, query) &&
          (status === ALL || m.status === status) &&
          (priority === ALL || m.priority === priority) &&
          (type === ALL || m.matterType === type) &&
          (area === ALL || m.businessArea === area) &&
          (!dateFrom || (on && on >= dateFrom)) &&
          (!dateTo || (on && on <= dateTo))
        );
      }),
    [scoped, query, status, priority, type, area, dateField, dateFrom, dateTo]
  );

  const areas = useMemo(
    () => Array.from(new Set(matters.map((m) => m.businessArea))).sort(),
    [matters]
  );

  const reset = () => {
    setQuery('');
    setStatus(ALL);
    setPriority(ALL);
    setType(ALL);
    setArea(ALL);
    setDateFrom('');
    setDateTo('');
  };

  // The type filter is redundant on views that are already one type.
  const isTypeView = view === 'decisions' || view === 'directives' || view === 'resolutions';
  const showProgress = view === 'implementation';

  const columns: Array<Column<BODMatter>> = [
    {
      key: 'ref',
      header: 'Reference',
      sortValue: (m) => m.id,
      className: 'font-semibold tabular whitespace-nowrap',
      render: (m) => (
        <div>
          <div className="text-ink">{m.id}</div>
          <div className="text-[11px] text-ink-3 font-normal">{m.resolutionNumber}</div>
        </div>
      ),
    },
    {
      key: 'title',
      header: isTypeView ? 'Decision' : 'Matter',
      sortValue: (m) => m.title,
      className: 'min-w-[16rem] max-w-[26rem]',
      render: (m) => (
        <div>
          <div className="font-medium text-ink line-clamp-1">{m.title}</div>
          <div className="flex items-center gap-1.5 mt-1">
            {!isTypeView && <TypeChip type={m.matterType} />}
            <PriorityBadge priority={m.priority} />
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Current Owner',
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
      key: 'area',
      header: 'Department',
      sortValue: (m) => m.businessArea,
      secondary: true,
      className: 'text-ink-2',
      render: (m) => m.businessArea,
    },
    ...(showProgress
      ? [
          {
            key: 'progress',
            header: 'Completion',
            sortValue: (m: BODMatter) => m.progress,
            className: 'w-32',
            render: (m: BODMatter) => (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-ink tabular">{m.progress}%</span>
                  <span className="text-[10px] text-ink-3">
                    {m.documents.filter((d) => d.category === 'IMPLEMENTATION_EVIDENCE').length} evid.
                  </span>
                </div>
                <ProgressBar value={m.progress} />
              </div>
            ),
          } as Column<BODMatter>,
        ]
      : []),
    {
      key: 'due',
      header: 'Due Date',
      sortValue: (m) => m.deadline,
      className: 'whitespace-nowrap',
      render: (m) => (
        <div>
          <div className="text-ink tabular">{formatDate(m.deadline)}</div>
          <SlaPill
            daysRemaining={m.daysRemaining}
            isOverdue={m.isOverdue}
            closed={m.status === 'Closed'}
          />
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (m) => m.status,
      render: (m) => <StatusBadge status={m.status} />,
    },
    {
      key: 'action',
      header: '',
      className: 'text-right',
      render: (m) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            onSelectMatter(m);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  /* Overdue gets an aging summary above the table — the point of that view is
     understanding how late things are, not just that they are late. */
  const agingSummary = useMemo(() => {
    if (view !== 'overdue') return null;
    return AGING_BUCKETS.map((bucket) => ({
      bucket,
      count: scoped.filter((m) => overdueBucket(m) === bucket).length,
    }));
  }, [view, scoped]);

  const criticalCount = scoped.filter((m) => m.priority === 'Urgent').length;
  const highCount = scoped.filter((m) => m.priority === 'High').length;

  const canRegister = user.role === 'BOARD_SECRETARIAT' || user.role === 'ADMIN';

  return (
    <div>
      <PageHeader
        title={item?.title ?? 'Board Matters'}
        description={item?.description}
        actions={
          <>
            {canRegister && isTypeView && (
              <Button variant="primary" icon={<FilePlus2 className="w-3.5 h-3.5" />} onClick={onRegister}>
                New Decision
              </Button>
            )}
            <Button variant="secondary" icon={<Download className="w-3.5 h-3.5" />} onClick={() => exportCsv(rows, view)}>
              Export
            </Button>
          </>
        }
      />

      {agingSummary && scoped.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
          <Card className="p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Total Overdue</p>
            <p className="text-[22px] font-bold text-st-late tabular leading-tight mt-1">{scoped.length}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Urgent / High</p>
            <p className="text-[22px] font-bold text-ink tabular leading-tight mt-1">
              {criticalCount + highCount}
            </p>
            <p className="text-[11px] text-ink-3 mt-0.5 tabular">
              {criticalCount} urgent · {highCount} high
            </p>
          </Card>
          {agingSummary.map((a) => (
            <Card key={a.bucket} className="p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{a.bucket}</p>
              <p
                className={cn(
                  'text-[22px] font-bold tabular leading-tight mt-1',
                  a.count > 0 ? 'text-ink' : 'text-ink-3'
                )}
              >
                {a.count}
              </p>
              <p className="text-[11px] text-ink-3 mt-0.5">past deadline</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <FilterBar
          search={query}
          onSearch={setQuery}
          searchPlaceholder="Search reference, title, owner…"
          onReset={reset}
          dateRange={{
            label: dateLabel,
            field: dateLabel.toLowerCase(),
            from: dateFrom,
            to: dateTo,
            onFrom: setDateFrom,
            onTo: setDateTo,
          }}
          filters={[
            {
              id: 'status',
              label: 'Status',
              value: status,
              onChange: setStatus,
              options: [
                { value: ALL, label: 'All statuses' },
                ...Array.from(new Set(scoped.map((m) => m.status))).sort().map((s) => ({ value: s, label: s })),
              ],
            },
            ...(isTypeView
              ? []
              : [
                  {
                    id: 'type',
                    label: 'Type',
                    value: type,
                    onChange: setType,
                    options: [
                      { value: ALL, label: 'All types' },
                      ...matterTypes.map((t) => ({ value: t, label: t })),
                    ],
                  },
                ]),
            {
              id: 'priority',
              label: 'Priority',
              value: priority,
              onChange: setPriority,
              options: [
                { value: ALL, label: 'All priorities' },
                ...['Urgent', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p })),
              ],
            },
            {
              id: 'area',
              label: 'Department',
              value: area,
              onChange: setArea,
              options: [
                { value: ALL, label: 'All departments' },
                ...areas.map((a) => ({ value: a, label: a })),
              ],
            },
          ]}
        />

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(m) => m.id}
          onRowClick={onSelectMatter}
          loading={isLoading && matters.length === 0}
          rowAccent={(m) =>
            isOverdue(m) ? 'late' : m.status === 'Implementation Submitted' ? 'review' : null
          }
          empty={
            <EmptyState
              icon={view === 'incoming' ? <Inbox className="w-5 h-5" /> : undefined}
              title={emptyTitle(view, scoped.length > 0)}
              message={emptyMessage(view, scoped.length > 0)}
              action={
                scoped.length > 0 ? (
                  <Button onClick={reset}>Clear filters</Button>
                ) : undefined
              }
            />
          }
        />
      </Card>
    </div>
  );
};

function emptyTitle(view: ViewId, filtered: boolean): string {
  if (filtered) return 'No matters match these filters';
  switch (view) {
    case 'incoming':
      return 'No incoming matters';
    case 'my-tasks':
      return 'No matters assigned to you';
    case 'pending-actions':
      return 'Nothing awaiting your action';
    case 'overdue':
      return 'Nothing is overdue';
    case 'decisions':
      return 'No Board decisions registered';
    case 'directives':
      return 'No directives registered';
    case 'resolutions':
      return 'No resolutions registered';
    default:
      return 'No Board matters';
  }
}

function emptyMessage(view: ViewId, filtered: boolean): string {
  if (filtered) return 'Try widening or clearing the filters above.';
  switch (view) {
    case 'incoming':
      return 'Nothing has been routed to you for acceptance.';
    case 'pending-actions':
      return 'Every matter you own is progressing; none is waiting on you.';
    case 'overdue':
      return 'All Board matters within your scope are inside their deadlines.';
    default:
      return 'Nothing within your organizational scope matches this view yet.';
  }
}

/** Client-side CSV of exactly the rows on screen — no extra data is fetched. */
function exportCsv(rows: BODMatter[], view: string) {
  const header = [
    'Reference', 'Resolution Number', 'Type', 'Title', 'Board Date', 'Priority',
    'Current Owner', 'Department', 'Stage', 'Due Date', 'Days Open', 'Status',
  ];
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = rows.map((m) =>
    [
      m.id, m.resolutionNumber, m.matterType, m.title, m.boardDecisionDate, m.priority,
      m.currentOwnerName, m.businessArea, m.currentStage, m.deadline, daysOpen(m), m.status,
    ].map(escape).join(',')
  );
  const blob = new Blob([[header.map(escape).join(','), ...body].join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nib-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Escalation is not part of the implemented workflow: there is no escalation
 * status, actor or reason anywhere in the schema or API. Rather than invent a
 * red badge with nothing behind it, this states the position and points at the
 * view that does carry real overdue data.
 */
export const EscalatedView: React.FC<{ onNavigateOverdue: () => void }> = ({
  onNavigateOverdue,
}) => {
  const item = navItem('escalated');
  return (
    <div>
      <PageHeader title={item!.title} description={item!.description} />
      <Card>
        <EmptyState
          icon={<TrendingUp className="w-5 h-5" />}
          title="Escalation is not yet part of the workflow"
          message="No escalation status, reason or escalating officer exists in the governance model, so there is nothing authentic to list here. Overdue matters are tracked and actionable today."
          action={<Button variant="primary" onClick={onNavigateOverdue}>View overdue matters</Button>}
        />
      </Card>
    </div>
  );
};
