import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handle } from '@/lib/handler';
import { prisma } from '@/lib/prisma';
import { toAuditCsv } from '@/lib/audit-csv';
import type { Prisma } from '@/generated/prisma/client';
import { assertPermission } from '@/lib/permissions.server';
import { PERMISSIONS } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Page sizes the screen offers; anything else is clamped into this range. */
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 100;

/**
 * The ceiling on a single CSV export.
 *
 * An export is one streamed response held in memory, so it is bounded — but far
 * above any realistic filtered slice of the administrative record, and the
 * response says when it was reached rather than silently truncating.
 */
const CSV_MAX_ROWS = 50_000;

/**
 * The filter, built once and applied identically to the page query, the total
 * count and the CSV export.
 *
 * Sharing it is the point: an export that used a different predicate from the
 * table would hand somebody a file that does not match what they were looking
 * at, which is worse than no export at all.
 */
function buildWhere(event: string | null, q: string | null): Prisma.AuthEventWhereInput {
  const clauses: Prisma.AuthEventWhereInput[] = [];

  if (event && event !== 'ALL') clauses.push({ event });

  const term = (q ?? '').trim();
  if (term) {
    const contains = { contains: term, mode: 'insensitive' } as const;
    clauses.push({
      OR: [
        { event: contains },
        { detail: contains },
        { emailAttempted: contains },
        { ip: contains },
        { user: { name: contains } },
        { user: { email: contains } },
      ],
    });
  }

  return clauses.length === 0 ? {} : { AND: clauses };
}

const EVENT_INCLUDE = {
  user: { select: { id: true, name: true, email: true, role: true, title: true } },
} satisfies Prisma.AuthEventInclude;

type EventRow = Prisma.AuthEventGetPayload<{ include: typeof EVENT_INCLUDE }>;

/** `id` is a BigInt, which JSON cannot carry; every response goes through this. */
function serialize(e: EventRow) {
  return {
    id: String(e.id),
    event: e.event,
    occurredAt: e.occurredAt.toISOString(),
    userId: e.userId,
    emailAttempted: e.emailAttempted,
    ip: e.ip,
    userAgent: e.userAgent,
    detail: e.detail,
    user: e.user,
  };
}

/**
 * The institution-wide administrative record.
 *
 * Paged on the server rather than in the browser: the log only grows, and a
 * screen that fetched the newest few hundred rows and paginated those would
 * quietly stop showing the rest — a gap in an audit log nobody would notice.
 * The filter, the count and the export all run against the same predicate.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await assertPermission(
      user,
      PERMISSIONS.VIEW_AUDIT_TRAIL,
      'Access Denied: your role does not hold the "Global Institutional Audit Trail" permission.'
    );

    const url = new URL(req.url);
    const where = buildWhere(url.searchParams.get('event'), url.searchParams.get('q'));

    // A CSV export is the filtered set in full, not the page being viewed:
    // exporting only what happens to be on screen is the kind of half-answer
    // that gets noticed after the file has been sent on.
    if (url.searchParams.get('format') === 'csv') {
      const rows = await prisma.authEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: CSV_MAX_ROWS,
        include: EVENT_INCLUDE,
      });

      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(toAuditCsv(rows), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="nib-board-audit-log-${stamp}.csv"`,
          'Cache-Control': 'no-store',
          'X-Export-Rows': String(rows.length),
          'X-Export-Truncated': String(rows.length === CSV_MAX_ROWS),
        },
      });
    }

    const pageSize = Math.min(
      Math.max(Number(url.searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const requestedPage = Math.max(Number(url.searchParams.get('page')) || 1, 1);

    // Counted first so a page beyond the end — reachable by deleting a filter,
    // or by a page number held in the URL — lands on the last real page instead
    // of an empty table that looks like a failure.
    const total = await prisma.authEvent.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);

    const [events, eventTypes] = await Promise.all([
      prisma.authEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: EVENT_INCLUDE,
      }),
      // The event types actually present, so the filter cannot offer a category
      // the log has never recorded or omit one it has.
      prisma.authEvent.groupBy({ by: ['event'], _count: { event: true } }),
    ]);

    return {
      events: events.map(serialize),
      total,
      page,
      pageSize,
      totalPages,
      eventTypes: eventTypes
        .map((t) => ({ event: t.event, count: t._count.event }))
        .sort((a, b) => a.event.localeCompare(b.event)),
    };
  });
}
