'use client';

import React, { useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { BODMatter } from '@/lib/types';
import { 
  getMatterTypeBadge, 
  getStatusBadge, 
  formatDate 
} from '@/lib/utils';
import { 
  FileSpreadsheet, 
  PieChart, 
  BarChart3, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Building2, 
  UserCheck, 
  Calendar, 
  Layers 
} from 'lucide-react';

interface ReportsViewProps {
  onSelectMatter: (matter: BODMatter) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ onSelectMatter }) => {
  const { matters } = useAuth();
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('ALL');

  /**
   * The reporting period, bounded on the Board decision date.
   *
   * A Board report is always "for a period" — a quarter, a financial year, the
   * span since the last Board meeting — so the whole page narrows to it,
   * headline figures included. Deriving every number from this one set rather
   * than mixing filtered tables with unfiltered totals is the point: a report
   * whose header disagrees with its own tables cannot be taken to the Board.
   */
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  const inPeriod = useMemo(
    () =>
      matters.filter(
        (m) =>
          (!periodFrom || (m.boardDecisionDate && m.boardDecisionDate >= periodFrom)) &&
          (!periodTo || (m.boardDecisionDate && m.boardDecisionDate <= periodTo))
      ),
    [matters, periodFrom, periodTo]
  );

  /** Headline figures, over the reporting period rather than over everything. */
  const totals = useMemo(() => {
    const open = inPeriod.filter((m) => m.status !== 'Closed');
    return {
      total: inPeriod.length,
      closed: inPeriod.filter((m) => m.status === 'Closed').length,
      inProgress: inPeriod.filter((m) => m.status === 'In Progress').length,
      overdue: open.filter((m) => m.isOverdue).length,
      clarifications: inPeriod.reduce((acc, m) => acc + m.clarifications.length, 0),
    };
  }, [inPeriod]);

  // Share of Board matters carried all the way through to formal closure.
  const closureRate = totals.total ? Math.round((totals.closed / totals.total) * 100) : 0;

  // Breakdown by Matter Type
  const typeStats = useMemo(() => {
    const map: Record<string, { total: number; closed: number; overdue: number }> = {};
    inPeriod.forEach((m) => {
      if (!map[m.matterType]) {
        map[m.matterType] = { total: 0, closed: 0, overdue: 0 };
      }
      map[m.matterType].total += 1;
      if (m.status === 'Closed') map[m.matterType].closed += 1;
      if (m.isOverdue && m.status !== 'Closed') map[m.matterType].overdue += 1;
    });
    return map;
  }, [inPeriod]);

  // Breakdown by Business Area & Directorate
  const areaStats = useMemo(() => {
    const map: Record<string, { total: number; closed: number; inProgress: number; overdue: number; matters: BODMatter[] }> = {};
    inPeriod.forEach((m) => {
      const area = m.businessArea || 'General Banking';
      if (!map[area]) {
        map[area] = { total: 0, closed: 0, inProgress: 0, overdue: 0, matters: [] };
      }
      map[area].total += 1;
      map[area].matters.push(m);
      if (m.status === 'Closed') map[area].closed += 1;
      else map[area].inProgress += 1;
      if (m.isOverdue && m.status !== 'Closed') map[area].overdue += 1;
    });
    return map;
  }, [inPeriod]);

  // Director Accountability League
  const directorStats = useMemo(() => {
    const map: Record<string, { directorName: string; title: string; area: string; total: number; completed: number; pending: number; overdue: number }> = {};
    inPeriod.forEach((m) => {
      const dirId = m.responsibleDirectorId || 'unassigned';
      if (!map[dirId]) {
        map[dirId] = {
          directorName: m.responsibleDirectorName || 'Unassigned (CEO / In Routing)',
          title: m.responsibleDirectorTitle || 'Pending downstream assignment',
          area: m.businessArea,
          total: 0,
          completed: 0,
          pending: 0,
          overdue: 0,
        };
      }
      map[dirId].total += 1;
      if (m.status === 'Closed' || m.status === 'Under Review / Confirmation') {
        map[dirId].completed += 1;
      } else {
        map[dirId].pending += 1;
      }
      if (m.isOverdue && m.status !== 'Closed') {
        map[dirId].overdue += 1;
      }
    });
    return Object.values(map);
  }, [inPeriod]);

  const handleExportCSV = () => {
    const headers = ['Business Area', 'Director', 'Total Directives', 'Completed', 'In Progress', 'Overdue', 'Completion Rate'];
    const rows = directorStats.map((d) => [
      `"${d.area}"`,
      `"${d.directorName}"`,
      d.total,
      d.completed,
      d.pending,
      d.overdue,
      `${Math.round((d.completed / d.total) * 100)}%`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `NIB_BOD_Governance_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface p-4 rounded-[--radius-card] shadow-card border border-line">
        <div>
          <h1 className="text-lg font-bold text-ink dark:text-white flex items-center space-x-2">
            <span>Executive Governance & Compliance Intelligence</span>
          </h1>
          <p className="text-xs text-ink-3 mt-0.5">
            Audit compliance rates, implementation turnaround velocity, and Directorate accountability.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <span className="block text-[11px] font-semibold text-ink-3 mb-1">
              Reporting period — Board decision date
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                aria-label="Reporting period from"
                value={periodFrom}
                max={periodTo || undefined}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="bg-surface-2 border border-line-strong rounded-lg px-2 py-1.5 text-xs text-ink tabular"
              />
              <span className="text-ink-3 text-[12px]">to</span>
              <input
                type="date"
                aria-label="Reporting period to"
                value={periodTo}
                min={periodFrom || undefined}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="bg-surface-2 border border-line-strong rounded-lg px-2 py-1.5 text-xs text-ink tabular"
              />
              {(periodFrom || periodTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setPeriodFrom('');
                    setPeriodTo('');
                  }}
                  className="px-2 py-1.5 text-[11px] text-ink-2 hover:text-ink underline"
                >
                  All time
                </button>
              )}
            </div>
          </div>

            <button
            onClick={handleExportCSV}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg border border-line-strong hover:bg-surface-2 text-xs font-semibold text-ink transition shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-st-done" />
            <span>Export Analytics</span>
          </button>
        </div>
      </div>

      {/* High-Level Stat Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-surface p-4 rounded-[--radius-card] shadow-card border border-line">
          <span className="text-[11px] font-semibold text-ink-3 uppercase">Overall Fulfillment Rate</span>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-2xl font-black text-st-done font-mono">
              {closureRate}%
            </span>
            <span className="text-[10px] text-ink-3">
              ({totals.closed} of {totals.total} matters closed)
            </span>
          </div>
          <div className="w-full bg-surface-2 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${closureRate}%` }}></div>
          </div>
        </div>

        <div className="bg-surface p-4 rounded-[--radius-card] shadow-card border border-line">
          <span className="text-[11px] font-semibold text-ink-3 uppercase">Active Operational Queue</span>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-2xl font-black text-nib-gold-600 font-mono">
              {totals.inProgress}
            </span>
            <span className="text-[10px] text-ink-3">in execution path</span>
          </div>
          <p className="text-[10px] text-ink-3 mt-2">
            Under active execution by designated Directors
          </p>
        </div>

        <div className="bg-surface p-4 rounded-[--radius-card] shadow-card border border-line">
          <span className="text-[11px] font-semibold text-ink-3 uppercase">Overdue Risk Exposure</span>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-2xl font-black text-st-late font-mono">
              {totals.overdue}
            </span>
            <span className="text-[10px] text-red-500 font-semibold">past deadline</span>
          </div>
          <p className="text-[10px] text-ink-3 mt-2">
            Requires immediate executive escalation
          </p>
        </div>

        <div className="bg-surface p-4 rounded-[--radius-card] shadow-card border border-line">
          <span className="text-[11px] font-semibold text-ink-3 uppercase">Clarifications Handled</span>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-2xl font-black text-st-info font-mono">
              {totals.clarifications}
            </span>
            <span className="text-[10px] text-ink-3">governance queries</span>
          </div>
          <p className="text-[10px] text-ink-3 mt-2">
            Resolved without operational delays
          </p>
        </div>
      </div>

      {/* Grid: Type Breakdown & Directorate Scorecard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Matter Type Breakdown Table */}
        <div className="lg:col-span-5 bg-surface rounded-[--radius-card] p-5 shadow-card border border-line space-y-4">
          <h2 className="text-xs font-bold text-ink dark:text-white uppercase tracking-wider flex items-center space-x-2">
            <Layers className="w-4 h-4 text-nib-gold-500" />
            <span>Fulfillment by Board Matter Type</span>
          </h2>

          <div className="divide-y divide-line text-xs">
            {(Object.entries(typeStats) as [string, { total: number; closed: number; overdue: number }][]).map(([type, stat]) => {
              const rate = Math.round((stat.closed / (stat.total || 1)) * 100);
              const badge = getMatterTypeBadge(type);

              return (
                <div key={type} className="py-3 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.bg} ${badge.text} ${badge.border}`}>
                      {type.toUpperCase()}
                    </span>
                    <div className="text-[10px] text-ink-3">
                      {stat.closed} of {stat.total} closed ({stat.overdue} overdue)
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-ink">
                      {rate}%
                    </span>
                    <div className="w-20 bg-surface-2 h-1.5 rounded-full overflow-hidden mt-1">
                      <div className="bg-nib-gold-500 h-full rounded-full" style={{ width: `${rate}%` }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Responsible Director Accountability League */}
        <div className="lg:col-span-7 bg-surface rounded-[--radius-card] p-5 shadow-card border border-line space-y-4">
          <h2 className="text-xs font-bold text-ink dark:text-white uppercase tracking-wider flex items-center space-x-2">
            <UserCheck className="w-4 h-4 text-st-done" />
            <span>Director Operational Performance Scorecard</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-surface-2 text-ink-3 border-b border-line text-[10px] uppercase font-bold">
                  <th className="py-2.5 px-3">Director & Area</th>
                  <th className="py-2.5 px-2 text-center">Assigned</th>
                  <th className="py-2.5 px-2 text-center">Completed</th>
                  <th className="py-2.5 px-2 text-center">Overdue</th>
                  <th className="py-2.5 px-3 text-right">Fulfillment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {directorStats.map((d) => {
                  const rate = Math.round((d.completed / (d.total || 1)) * 100);

                  return (
                    <tr key={d.directorName} className="hover:bg-surface-2 ">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-ink">{d.directorName}</div>
                        <div className="text-[10px] text-ink-3">{d.title} • {d.area}</div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-bold">{d.total}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-st-done font-bold">{d.completed}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-st-late font-bold">{d.overdue}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="font-mono font-bold text-ink">{rate}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Business Area Directorate Detailed Breakdown */}
      <div className="bg-surface rounded-[--radius-card] p-5 shadow-card border border-line space-y-4">
        <h2 className="text-xs font-bold text-ink dark:text-white uppercase tracking-wider flex items-center space-x-2">
          <Building2 className="w-4 h-4 text-st-info" />
          <span>Directorate Compliance Matrix</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.entries(areaStats) as [string, { total: number; closed: number; inProgress: number; overdue: number; matters: BODMatter[] }][]).map(([area, data]) => {
            const completionRate = Math.round((data.closed / (data.total || 1)) * 100);

            return (
              <div
                key={area}
                className="p-4 rounded-[--radius-card] border border-line bg-surface-2 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-ink">{area}</h4>
                    <span className="text-[10px] text-ink-3 font-mono">{data.total} Board Matters Total</span>
                  </div>
                  <span className="font-mono font-bold text-xs bg-surface px-2 py-0.5 rounded border border-line">
                    {completionRate}%
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[10px] pt-1">
                  <div className="bg-st-done-bg dark:bg-emerald-950/40 p-1.5 rounded border border-st-done/25 dark:border-emerald-800">
                    <span className="text-ink-3 block">Closed</span>
                    <strong className="text-st-done dark:text-emerald-300 text-xs font-mono">{data.closed}</strong>
                  </div>
                  <div className="bg-nib-gold-100 p-1.5 rounded border border-nib-gold-200 ">
                    <span className="text-ink-3 block">Active</span>
                    <strong className="text-nib-gold-700 text-xs font-mono">{data.inProgress}</strong>
                  </div>
                  <div className="bg-st-late-bg dark:bg-red-950/40 p-1.5 rounded border border-st-late/30 dark:border-red-800">
                    <span className="text-ink-3 block">Overdue</span>
                    <strong className="text-st-late text-xs font-mono">{data.overdue}</strong>
                  </div>
                </div>

                {/* List recent matters in area */}
                <div className="pt-2 border-t border-line space-y-1.5">
                  <span className="text-[10px] font-bold text-ink-3 uppercase">Recent Directives:</span>
                  {data.matters.slice(0, 2).map((m) => (
                    <div
                      key={m.id}
                      onClick={() => onSelectMatter(m)}
                      className="text-[11px] text-ink-2 hover:text-nib-gold-600 cursor-pointer truncate flex items-center justify-between"
                    >
                      <span className="truncate">{m.title}</span>
                      <span className="text-[10px] text-ink-3 font-mono ml-2 shrink-0">{m.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
