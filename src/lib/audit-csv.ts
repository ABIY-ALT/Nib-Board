/**
 * CSV rendering for the administrative audit record.
 *
 * Kept out of the route module because a Next route file may only export its
 * handlers — and because the escaping below is the part worth being able to
 * test on its own.
 */

export interface AuditCsvRow {
  occurredAt: Date;
  event: string;
  emailAttempted: string | null;
  ip: string | null;
  userAgent: string | null;
  detail: string | null;
  user: { name: string; email: string; role: string } | null;
}

export const CSV_COLUMNS = [
  'Timestamp (UTC)',
  'Event',
  'Officer',
  'Officer Email',
  'Role',
  'Email Attempted',
  'Source IP',
  'User Agent',
  'Detail',
];

/**
 * One CSV field.
 *
 * The leading apostrophe on a value starting with `=`, `+`, `-` or `@` is not
 * cosmetic: Excel and Sheets treat such a cell as a formula, and audit details
 * carry text that came from a browser. An exported security log that executes
 * something when opened is a real problem, so the value is neutralised here
 * rather than trusted. Newlines are flattened so one event stays one row.
 */
export function csvCell(value: string | null | undefined): string {
  const raw = (value ?? '').replace(/\r?\n/g, ' ').trim();
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toAuditCsv(rows: readonly AuditCsvRow[]): string {
  const lines = [CSV_COLUMNS.map(csvCell).join(',')];

  for (const e of rows) {
    lines.push(
      [
        csvCell(e.occurredAt.toISOString()),
        csvCell(e.event),
        csvCell(e.user?.name ?? (e.emailAttempted ? '' : 'System Automated')),
        csvCell(e.user?.email),
        csvCell(e.user?.role),
        csvCell(e.emailAttempted),
        csvCell(e.ip),
        csvCell(e.userAgent),
        csvCell(e.detail),
      ].join(',')
    );
  }

  // The BOM is what makes Excel read the file as UTF-8 rather than the local
  // codepage, which otherwise mangles officer names.
  const BOM = '﻿';
  return BOM + lines.join('\r\n') + '\r\n';
}
