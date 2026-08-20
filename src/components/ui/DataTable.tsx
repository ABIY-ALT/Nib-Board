'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, X } from 'lucide-react';
import { cn, Button, EmptyState, TableSkeleton, inputClass, selectClass } from './primitives';

/* ─────────────────────────────────────────────────────── DataTable */

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. Keep cells compact — this is a records table. */
  render: (row: T) => React.ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  className?: string;
  headerClassName?: string;
  /** Hidden below `lg`, so narrow screens keep the columns that matter. */
  secondary?: boolean;
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: React.ReactNode;
  pageSize?: number;
  /** Highlights rows needing attention without relying on colour alone. */
  rowAccent?: (row: T) => 'late' | 'review' | null;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  pageSize = 15,
  rowAccent,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }, [rows, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, totalPages);
  const paged = sorted.slice((current - 1) * pageSize, current * pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  if (loading) return <TableSkeleton rows={6} cols={Math.min(columns.length, 7)} />;
  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="Nothing to show" message="No records match this view." />}</>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface-2 border-b border-line">
              {columns.map((c) => {
                const sortable = Boolean(c.sortValue);
                const on = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={on ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'text-left font-semibold text-[11px] uppercase tracking-wide text-ink-3',
                      'px-3 py-2 whitespace-nowrap',
                      c.secondary && 'hidden lg:table-cell',
                      c.headerClassName
                    )}
                  >
                    {sortable ? (
                      <button
                        onClick={() => toggleSort(c.key)}
                        className="inline-flex items-center gap-1 hover:text-ink transition-colors"
                      >
                        {c.header}
                        {on ? (
                          sortDir === 'asc' ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )
                        ) : (
                          <ChevronDown className="w-3 h-3 opacity-25" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {paged.map((row) => {
              const accent = rowAccent?.(row) ?? null;
              return (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-nib-gold-100/40 dark:hover:bg-surface-2',
                    accent === 'late' && 'border-l-2 border-l-st-late',
                    accent === 'review' && 'border-l-2 border-l-st-review'
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-2.5 text-[13px] text-ink align-middle',
                        c.secondary && 'hidden lg:table-cell',
                        c.className
                      )}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <Pagination
          page={current}
          totalPages={totalPages}
          total={sorted.length}
          pageSize={pageSize}
          onChange={setPage}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── Pagination */

export const Pagination: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}> = ({ page, totalPages, total, pageSize, onChange }) => {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-line"
    >
      <p className="text-[12px] text-ink-3 tabular">
        Showing <span className="font-semibold text-ink-2">{from}</span>–
        <span className="font-semibold text-ink-2">{to}</span> of{' '}
        <span className="font-semibold text-ink-2">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
          icon={<ChevronLeft className="w-3.5 h-3.5" />}
        >
          Prev
        </Button>
        <span className="text-[12px] text-ink-2 px-2 tabular">
          {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </nav>
  );
};

/* ─────────────────────────────────────────────────────── FilterBar */

export interface SelectFilter {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}

/**
 * An inclusive from/to range over one date field.
 *
 * `field` names what is being bounded, because on a Board matter the honest
 * answer is never just "date" — a Secretariat officer looking for what the
 * Board decided in Q3 means the decision date, while someone chasing overdue
 * work means the deadline. Saying which one is being filtered is the difference
 * between a useful control and a misleading one.
 */
export interface DateRangeFilter {
  label: string;
  field: string;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}

export const FilterBar: React.FC<{
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  filters?: SelectFilter[];
  dateRange?: DateRangeFilter;
  onReset?: () => void;
  right?: React.ReactNode;
}> = ({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  filters = [],
  dateRange,
  onReset,
  right,
}) => {
  const active =
    filters.filter((f) => f.value !== 'ALL').length +
    (search ? 1 : 0) +
    (dateRange?.from ? 1 : 0) +
    (dateRange?.to ? 1 : 0);

  return (
    <div className="flex flex-col lg:flex-row lg:items-end gap-3 px-4 py-3 border-b border-line bg-surface-2/60">
      <div className="relative flex-1 min-w-0 lg:max-w-xs">
        <label htmlFor="table-search" className="sr-only">
          {searchPlaceholder}
        </label>
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
        <input
          id="table-search"
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className={cn(inputClass, 'pl-8')}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        {filters.map((f) => (
          <div key={f.id} className="min-w-[140px]">
            <label
              htmlFor={`filter-${f.id}`}
              className="block text-[11px] font-semibold text-ink-3 mb-1"
            >
              {f.label}
            </label>
            <select
              id={`filter-${f.id}`}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className={selectClass}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {dateRange && (
          <div>
            <span className="block text-[11px] font-semibold text-ink-3 mb-1">
              {dateRange.label}
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                aria-label={`${dateRange.field} from`}
                value={dateRange.from}
                max={dateRange.to || undefined}
                onChange={(e) => dateRange.onFrom(e.target.value)}
                className={cn(inputClass, 'w-[9.5rem] tabular')}
              />
              <span className="text-ink-3 text-[12px]">to</span>
              <input
                type="date"
                aria-label={`${dateRange.field} to`}
                value={dateRange.to}
                min={dateRange.from || undefined}
                onChange={(e) => dateRange.onTo(e.target.value)}
                className={cn(inputClass, 'w-[9.5rem] tabular')}
              />
            </div>
          </div>
        )}

        {onReset && active > 0 && (
          <Button size="sm" variant="ghost" onClick={onReset} icon={<X className="w-3.5 h-3.5" />}>
            Clear ({active})
          </Button>
        )}
      </div>

      {right && <div className="lg:ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
};
