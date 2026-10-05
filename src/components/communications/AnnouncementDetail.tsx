'use client';

import React from 'react';
import { Download, ExternalLink, Paperclip, X } from 'lucide-react';
import { Button, cn, modalOverlayClass } from '@/components/ui/primitives';
import { formatBytes } from '@/lib/documents';
import type { Announcement } from '@/lib/announcements';
import {
  AnnouncementPriorityBadge,
  AnnouncementStatusBadge,
  AnnouncementTypeChip,
  MeetingDetailsCard,
  formatStamp,
  TYPE_ICON,
} from './shared';

interface Props {
  announcement: Announcement | null;
  onClose: () => void;
  /** Only offered to a reader who can act on the related Board matter. */
  onOpenMatter?: (matterId: string) => void;
  /** Management actions, drawn only when the reader holds the permission. */
  actions?: React.ReactNode;
}

/**
 * The full announcement.
 *
 * The attachment is fetched through the announcement's own endpoint, which
 * authorizes the download exactly as it authorizes the announcement — the bytes
 * are never reachable by URL on their own.
 */
export const AnnouncementDetail: React.FC<Props> = ({
  announcement: a,
  onClose,
  onOpenMatter,
  actions,
}) => {
  if (!a) return null;
  const Icon = TYPE_ICON[a.type];

  return (
    <div className={modalOverlayClass}>
      <div className="bg-surface rounded-(--radius-card) shadow-overlay border border-line w-full max-w-2xl overflow-hidden">
        <div
          className={cn(
            'px-5 py-3.5 flex items-start justify-between gap-3 border-b',
            a.priority === 'Urgent'
              ? 'bg-st-late-bg border-st-late/30'
              : 'bg-surface-2 border-line'
          )}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                a.priority === 'Urgent'
                  ? 'bg-st-late text-on-late'
                  : 'bg-nib-gold-100 text-nib-brown-700 dark:bg-nib-brown-700/30 dark:text-nib-gold-200'
              )}
            >
              <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold text-ink leading-snug">{a.title}</h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <AnnouncementTypeChip type={a.type} />
                <AnnouncementPriorityBadge priority={a.priority} />
                <AnnouncementStatusBadge a={a} />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-ink p-1 rounded-lg shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-5 space-y-4">
          <p className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap">{a.message}</p>

          <MeetingDetailsCard a={a} />

          {a.attachment && (
            <a
              href={`/api/announcements/${a.id}/attachment`}
              className="flex items-center gap-3 rounded-(--radius-control) border border-line-strong bg-surface-2 px-3 py-2.5 hover:border-nib-gold-500 transition-colors"
            >
              <span className="w-9 h-9 rounded-md bg-surface-3 text-ink-3 flex items-center justify-center shrink-0">
                <Paperclip className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink truncate">
                  {a.attachment.name}
                </span>
                <span className="block text-[11px] text-ink-3">
                  {formatBytes(a.attachment.byteSize)} · verified on download
                </span>
              </span>
              <Download className="w-4 h-4 text-ink-3 shrink-0" />
            </a>
          )}

          {a.relatedMatterId && (
            <div className="rounded-(--radius-control) border border-line bg-surface-2 px-3 py-2.5">
              <p className="text-[11px] text-ink-3 mb-0.5">Related Board matter</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] text-ink truncate">
                  <span className="font-semibold tabular">{a.relatedMatterId}</span>
                  {a.relatedMatterTitle ? ` — ${a.relatedMatterTitle}` : ''}
                </p>
                {onOpenMatter && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onOpenMatter(a.relatedMatterId!)}
                  >
                    Open
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          )}

          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1.5 pt-2 border-t border-line">
            <dt className="text-[12px] text-ink-3">Issued by</dt>
            <dd className="text-[12px] text-ink">
              {a.createdByName}
              {a.createdByTitle ? `, ${a.createdByTitle}` : ''}
            </dd>

            <dt className="text-[12px] text-ink-3">Audience</dt>
            <dd className="text-[12px] text-ink">{a.audienceSummary}</dd>

            <dt className="text-[12px] text-ink-3">Published</dt>
            <dd className="text-[12px] text-ink tabular">{formatStamp(a.publishAt)}</dd>

            {a.expiresAt && (
              <>
                <dt className="text-[12px] text-ink-3">Expires</dt>
                <dd className="text-[12px] text-ink tabular">{formatStamp(a.expiresAt)}</dd>
              </>
            )}

            {a.reference && (
              <>
                <dt className="text-[12px] text-ink-3">Reference</dt>
                <dd className="text-[12px] text-ink">{a.reference}</dd>
              </>
            )}

            {typeof a.readCount === 'number' && (
              <>
                <dt className="text-[12px] text-ink-3">Read receipts</dt>
                <dd className="text-[12px] text-ink tabular">
                  {a.readCount} of {a.recipientCount} recipient(s)
                </dd>
              </>
            )}

            {a.cancelledByName && (
              <>
                <dt className="text-[12px] text-ink-3">Withdrawn by</dt>
                <dd className="text-[12px] text-ink">
                  {a.cancelledByName} · {formatStamp(a.cancelledAt)}
                </dd>
              </>
            )}
          </dl>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-line bg-surface-2">
          <div className="flex items-center gap-2">{actions}</div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
