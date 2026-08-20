'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { documentUrl } from '@/lib/documents';
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Circle,
  FileText,
  Forward,
  HelpCircle,
  Lock,
  MapPin,
  MessageSquare,
  Paperclip,
  Send,
  ShieldCheck,
  Upload,
  UserCheck,
  Download,
} from 'lucide-react';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PriorityBadge,
  ProgressBar,
  SlaPill,
  StatusBadge,
  TableSkeleton,
  Tabs,
  TypeChip,
  cn,
} from '@/components/ui/primitives';
import { AuditLogEntry, BODMatter, ClarificationThread } from '@/lib/types';
import { ROLE_LABEL, daysOpen, formatDate, formatDateTime } from '@/lib/matters';

interface MatterDetailProps {
  matter: BODMatter;
  onBack: () => void;
  onOpenRouteModal: () => void;
  onOpenDirectorReportModal: () => void;
  onOpenClarificationModal: () => void;
  onOpenConfirmModal: () => void;
  onOpenCloseModal: () => void;
  onOpenUploadModal: () => void;
  onOpenClarificationReplyModal: (thread: ClarificationThread) => void;
}

const DOC_LABEL: Record<string, string> = {
  ORIGINAL_BOARD_DOC: 'Original Board Document',
  RESOLUTION: 'Resolution',
  SUPPORTING: 'Supporting Document',
  IMPLEMENTATION_EVIDENCE: 'Implementation Evidence',
  COMPLETION_REPORT: 'Completion Report',
};

/** One labelled fact. Used throughout the detail panels for a uniform rhythm. */
const Fact: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label,
  children,
  className,
}) => (
  <div className={className}>
    <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</dt>
    <dd className="text-[13px] text-ink mt-0.5 leading-snug">{children}</dd>
  </div>
);

export const MatterDetail: React.FC<MatterDetailProps> = ({
  matter,
  onBack,
  onOpenRouteModal,
  onOpenDirectorReportModal,
  onOpenClarificationModal,
  onOpenConfirmModal,
  onOpenCloseModal,
  onOpenUploadModal,
  onOpenClarificationReplyModal,
}) => {
  const { refreshMatters, refreshMetrics } = useAuth();
  const user = useAuthenticatedUser();

  const [tab, setTab] = useState('overview');
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFailed, setAuditFailed] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditFailed(false);
    try {
      const res = await fetch(`/api/matters/${matter.id}/audit-trail`);
      if (!res.ok) throw new Error();
      setAudit(await res.json());
    } catch {
      setAuditFailed(true);
    } finally {
      setAuditLoading(false);
    }
  }, [matter.id]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit, matter.updatedAt]);

  /* ── Permissions. The API is authoritative; these only decide what to offer ── */
  const isOwner = matter.currentOwnerId === user.id;
  const isClosed = matter.status === 'Closed';
  const needsAccept =
    isOwner && !isClosed && ['Received', 'Under Review', 'Assigned'].includes(matter.status);
  const canRoute = isOwner && !isClosed && user.role !== 'DIRECTOR';
  const canReport =
    !isClosed &&
    user.role === 'DIRECTOR' &&
    matter.responsibleDirectorId === user.id &&
    matter.status === 'In Progress';
  const canConfirm =
    !isClosed &&
    matter.status === 'Implementation Submitted' &&
    ['CEO', 'CHIEF', 'DEPUTY_CHIEF', 'BOARD_SECRETARIAT', 'ADMIN'].includes(user.role);
  const canClose =
    !isClosed &&
    matter.status === 'Under Review / Confirmation' &&
    ['BOARD_SECRETARIAT', 'CEO', 'ADMIN'].includes(user.role);

  const accept = async () => {
    setAccepting(true);
    try {
      await fetch(`/api/matters/${matter.id}/accept-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await refreshMatters();
      await refreshMetrics();
    } finally {
      setAccepting(false);
    }
  };

  const openThreads = matter.clarifications.filter((c) => c.status === 'OPEN');
  const myThread = openThreads.find((c) => c.requestedTo === user.id);
  const report = matter.implementationReport;

  return (
    <div>
      {/* ── Identity bar ── */}
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft className="w-3.5 h-3.5" />}>
          Back to matters
        </Button>
      </div>

      <Card className="mb-5">
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[15px] font-bold text-ink tabular">{matter.id}</span>
            <TypeChip type={matter.matterType} />
            <PriorityBadge priority={matter.priority} />
            <StatusBadge status={matter.status} />
            {matter.isOverdue && !isClosed && (
              <span className="text-[11px] font-bold text-st-late uppercase tracking-wide">
                Overdue
              </span>
            )}
          </div>

          <h1 className="text-[22px] font-bold text-ink leading-tight tracking-tight">
            {matter.title}
          </h1>
          <p className="text-[12px] text-ink-3 mt-1 tabular">
            Resolution {matter.resolutionNumber} · Board decision {formatDate(matter.boardDecisionDate)}
          </p>

          {/* Actions available to this user right now */}
          {(needsAccept || canRoute || canReport || canConfirm || canClose || !isClosed) && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-line">
              {needsAccept && (
                <Button variant="primary" loading={accepting} onClick={accept} icon={<UserCheck className="w-3.5 h-3.5" />}>
                  Accept ownership
                </Button>
              )}
              {canRoute && (
                <Button variant={needsAccept ? 'secondary' : 'primary'} onClick={onOpenRouteModal} icon={<Forward className="w-3.5 h-3.5" />}>
                  Forward / Assign
                </Button>
              )}
              {canReport && (
                <Button variant="primary" onClick={onOpenDirectorReportModal} icon={<Send className="w-3.5 h-3.5" />}>
                  Submit implementation report
                </Button>
              )}
              {canConfirm && (
                <Button variant="primary" onClick={onOpenConfirmModal} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
                  Review &amp; confirm
                </Button>
              )}
              {canClose && (
                <Button variant="primary" onClick={onOpenCloseModal} icon={<Lock className="w-3.5 h-3.5" />}>
                  Formally close
                </Button>
              )}
              {!isClosed && (
                <>
                  <Button variant="secondary" onClick={onOpenClarificationModal} icon={<HelpCircle className="w-3.5 h-3.5" />}>
                    {user.role === 'BOARD_MEMBER' ? 'Give Board Direction / Query' : 'Request clarification'}
                  </Button>
                  <Button variant="secondary" onClick={onOpenUploadModal} icon={<Upload className="w-3.5 h-3.5" />}>
                    Attach document
                  </Button>
                </>
              )}
            </div>
          )}

          {myThread && (
            <div className="mt-3 flex items-start gap-2.5 bg-st-wait-bg border border-st-wait/25 rounded-[--radius-control] px-3 py-2.5">
              <MessageSquare className="w-4 h-4 text-st-wait shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-ink">
                  {myThread.requesterName} asked you for clarification
                </p>
                <p className="text-[12px] text-ink-2 mt-0.5">{myThread.question}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onOpenClarificationReplyModal(myThread)}>
                Respond
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* ── WHERE IS THIS MATTER NOW? The system's primary question. ── */}
      <Card className="mb-5 border-l-[3px] border-l-nib-gold-500 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-nib-gold-100/60 dark:bg-nib-brown-700/20 border-b border-line">
          <MapPin className="w-4 h-4 text-nib-brown-700 dark:text-nib-gold-200" />
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-nib-brown-800 dark:text-nib-gold-200">
            Where is this matter now?
          </h2>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 divide-x divide-y xl:divide-y-0 divide-line">
          <div className="p-4 col-span-2 md:col-span-1">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Current owner</dt>
            <dd className="mt-1">
              <p className="text-[14px] font-semibold text-ink leading-snug">
                {matter.currentOwnerName}
              </p>
              <p className="text-[11px] text-ink-2 leading-snug">{matter.currentOwnerTitle}</p>
              <p className="text-[10px] text-ink-3 mt-0.5">
                {ROLE_LABEL[matter.currentOwnerRole] ?? matter.currentOwnerRole}
              </p>
            </dd>
          </div>

          <Fact label="Current stage" className="p-4">
            <span className="text-[12px]">{matter.currentStage || '—'}</span>
          </Fact>

          <Fact label="Days open" className="p-4">
            <span className="text-[18px] font-bold tabular">{daysOpen(matter)}</span>
            <span className="text-[11px] text-ink-3 ml-1">days</span>
          </Fact>

          <Fact label="Due date" className="p-4">
            <span className="tabular">{formatDate(matter.deadline)}</span>
          </Fact>

          <div className="p-4">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-3">SLA</dt>
            <dd className="mt-1">
              <SlaPill daysRemaining={matter.daysRemaining} isOverdue={matter.isOverdue} closed={isClosed} />
            </dd>
          </div>

          <Fact label="Pending with" className="p-4">
            <span className="text-[12px]">
              {isClosed ? '—' : ROLE_LABEL[matter.nextActionRole] ?? matter.nextActionRole ?? '—'}
            </span>
          </Fact>
        </dl>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line border-t border-line bg-surface-2/50">
          <Fact label="Last action" className="p-4">
            <span className="text-[12px]">{matter.lastAction || '—'}</span>
            {matter.lastActionDate && (
              <span className="block text-[11px] text-ink-3 mt-0.5 tabular">
                {formatDateTime(matter.lastActionDate)}
              </span>
            )}
          </Fact>
          <Fact label="Next required action" className="p-4">
            <span className="text-[12px] font-medium">{matter.nextRequiredAction || '—'}</span>
            <span className="block text-[11px] text-ink-3 mt-0.5">{matter.overallStatus}</span>
          </Fact>
        </div>

        {!isClosed && (
          <div className="px-4 py-3 border-t border-line">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-ink-2">Implementation progress</span>
              <span className="text-[11px] font-bold text-ink tabular">{matter.progress}%</span>
            </div>
            <ProgressBar value={matter.progress} />
          </div>
        )}
      </Card>

      {/* ── Detail tabs ── */}
      <Tabs
        items={[
          { id: 'overview', label: 'Overview' },
          { id: 'timeline', label: 'Timeline', count: matter.routingPath.length },
          { id: 'implementation', label: 'Implementation' },
          { id: 'documents', label: 'Documents', count: matter.documents.length },
          { id: 'clarifications', label: 'Clarifications', count: matter.clarifications.length },
          { id: 'audit', label: 'Audit Trail', count: audit.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-5">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-2">
              <CardHeader title="Board Direction" icon={<FileText className="w-4 h-4" />} />
              <div className="p-4">
                <p className="text-[13px] text-ink-2 leading-relaxed whitespace-pre-wrap">
                  {matter.description}
                </p>
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 border-t border-line">
                <Fact label="Board meeting">{formatDate(matter.boardMeetingDate)}</Fact>
                <Fact label="Decision date">{formatDate(matter.boardDecisionDate)}</Fact>
                <Fact label="Effective date">{formatDate(matter.effectiveDate)}</Fact>
                <Fact label="Matter type">{matter.matterType}</Fact>
                <Fact label="Priority">{matter.priority}</Fact>
                <Fact label="Registered by">{matter.createdByName}</Fact>
              </dl>
            </Card>

            <Card>
              <CardHeader title="Accountability" icon={<ShieldCheck className="w-4 h-4" />} />
              <dl className="divide-y divide-line">
                {[
                  ['Responsible business area', matter.businessArea],
                  ['Responsible Chief', matter.responsibleChiefName],
                  ['Responsible Deputy Chief', matter.responsibleDeputyChiefName],
                  ['Responsible Director', matter.responsibleDirectorName],
                  ['Accountable executive', matter.accountableExecutiveName],
                ].map(([label, value]) => (
                  <div key={label} className="px-4 py-2.5">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-3">
                      {label}
                    </dt>
                    <dd className="text-[13px] text-ink mt-0.5">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        )}

        {tab === 'timeline' && (
          <Card>
            <CardHeader
              title="Implementation Timeline"
              description="Only the organizational levels that actually handled this matter appear."
            />
            <ol className="p-5">
              {matter.routingPath.map((node, i) => {
                const last = i === matter.routingPath.length - 1;
                const done = node.status === 'COMPLETED';
                const activeNode = node.status === 'ACTIVE';
                return (
                  <li key={node.id} className="relative pl-8 pb-6 last:pb-0">
                    {!last && (
                      <span
                        className={cn(
                          'absolute left-[9px] top-5 bottom-0 w-px',
                          done ? 'bg-st-done/40' : 'bg-line'
                        )}
                        aria-hidden="true"
                      />
                    )}
                    <span className="absolute left-0 top-0.5" aria-hidden="true">
                      {done ? (
                        <CheckCircle2 className="w-[19px] h-[19px] text-st-done" />
                      ) : activeNode ? (
                        <CircleDot className="w-[19px] h-[19px] text-nib-gold-500" />
                      ) : (
                        <Circle className="w-[19px] h-[19px] text-ink-3" />
                      )}
                    </span>

                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[13px] font-semibold text-ink">{node.label}</span>
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-wide',
                          done ? 'text-st-done' : activeNode ? 'text-nib-gold-700' : 'text-ink-3'
                        )}
                      >
                        {node.status}
                      </span>
                    </div>
                    <p className="text-[12px] text-ink-2 mt-0.5">
                      {node.userName}
                      <span className="text-ink-3"> · {node.userTitle}</span>
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[11px] text-ink-3 tabular">
                      <span>Received {formatDateTime(node.assignedAt)}</span>
                      {node.actedAt && <span>Acted {formatDateTime(node.actedAt)}</span>}
                      {node.actedAt && (
                        <span>
                          Held{' '}
                          {Math.max(
                            0,
                            Math.round(
                              (new Date(node.actedAt).getTime() -
                                new Date(node.assignedAt).getTime()) /
                                86_400_000
                            )
                          )}
                          d
                        </span>
                      )}
                    </div>
                    {node.actionTaken && (
                      <p className="text-[12px] text-ink-2 mt-1.5">{node.actionTaken}</p>
                    )}
                    {node.comment && (
                      <p className="text-[12px] text-ink-2 mt-1.5 bg-surface-2 border border-line rounded-md px-2.5 py-1.5">
                        {node.comment}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>
        )}

        {tab === 'implementation' && (
          <Card>
            <CardHeader
              title="Director's Implementation Report"
              description="What was actually done about this Board direction."
            />
            {!report ? (
              <EmptyState
                title="No implementation report yet"
                message="The responsible Director has not yet reported what was done. A Board matter is never complete merely because it reached the Director."
              />
            ) : (
              <div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border-b border-line">
                  <Fact label="Submitted by">
                    {report.directorName}
                    <span className="block text-[11px] text-ink-3">{report.directorTitle}</span>
                  </Fact>
                  <Fact label="Submitted on">{formatDateTime(report.submissionDate)}</Fact>
                  <Fact label="Implementation date">{formatDate(report.implementationDate)}</Fact>
                  <Fact label="Completion date">{formatDate(report.completionDate)}</Fact>
                  <Fact label="Responsible area">{report.responsibleArea || '—'}</Fact>
                  <Fact label="Completion status">
                    <StatusBadge status={report.completionStatus} />
                  </Fact>
                </dl>

                <div className="divide-y divide-line">
                  {[
                    ['Action taken', report.actionTaken],
                    ['What was implemented', report.whatWasImplemented],
                    ['Result / outcome', report.resultOutcome],
                    ['Current condition', report.currentCondition],
                    ['Remaining issues', report.remainingIssues || 'None'],
                    ['Reason for partial / non-implementation', report.reasonForPartialNonImplementation],
                    ['Comments', report.comments],
                  ]
                    .filter(([, v]) => Boolean(v))
                    .map(([label, value]) => (
                      <div key={label as string} className="px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-1">
                          {label}
                        </p>
                        <p className="text-[13px] text-ink-2 leading-relaxed whitespace-pre-wrap">
                          {value}
                        </p>
                      </div>
                    ))}
                </div>

                {report.reviewedBy && (
                  <div className="p-4 border-t border-line bg-surface-2/50">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-1.5">
                      Executive review
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <StatusBadge
                        status={report.reviewDecision === 'Approved' ? 'Completed' : 'Pending'}
                      />
                      <span className="text-[12px] text-ink">
                        {report.reviewDecision} by {report.reviewedBy}
                      </span>
                      {report.reviewDate && (
                        <span className="text-[11px] text-ink-3 tabular">
                          {formatDateTime(report.reviewDate)}
                        </span>
                      )}
                    </div>
                    {report.reviewNotes && (
                      <p className="text-[12px] text-ink-2 leading-relaxed">{report.reviewNotes}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {tab === 'documents' && (
          <Card>
            <CardHeader
              title="Documents"
              description="Board papers, supporting material and implementation evidence."
              icon={<Paperclip className="w-4 h-4" />}
              action={
                !isClosed ? (
                  <Button size="sm" variant="secondary" onClick={onOpenUploadModal}>
                    Attach
                  </Button>
                ) : undefined
              }
            />
            {matter.documents.length === 0 ? (
              <EmptyState
                title="No documents attached"
                message="Board papers and implementation evidence will appear here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {matter.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-8 h-8 rounded-md bg-surface-2 border border-line flex items-center justify-center text-ink-3 shrink-0">
                      <FileText className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink truncate">{d.name}</p>
                      <p className="text-[11px] text-ink-3">
                        {DOC_LABEL[d.category] ?? d.category} · {d.uploadedBy} ·{' '}
                        <span className="tabular">{formatDate(d.uploadedAt)}</span>
                        {d.fileSize && <span className="tabular"> · {d.fileSize}</span>}
                      </p>
                      {d.sha256 ? (
                        // The leading bytes are enough to compare a download
                        // against the record by eye; the full digest is on the
                        // element for anyone who needs to verify it properly.
                        <p
                          className="text-[10px] text-ink-3 font-mono truncate mt-0.5"
                          title={`SHA-256 ${d.sha256}`}
                        >
                          SHA-256 {d.sha256.slice(0, 24)}…
                        </p>
                      ) : (
                        <p className="text-[10px] text-ink-3 mt-0.5">
                          Recorded before file upload — no stored file
                        </p>
                      )}
                    </div>
                    {d.hasFile ? (
                      <a
                        href={documentUrl(matter.id, d.id)}
                        className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-medium text-nib-gold-700 hover:underline"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                    ) : (
                      <span className="shrink-0 text-[11px] text-ink-3">Not stored</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'clarifications' && (
          <Card>
            <CardHeader
              title="Clarifications"
              description="Questions raised on this matter and the answers given."
              icon={<MessageSquare className="w-4 h-4" />}
              action={
                !isClosed ? (
                  <Button size="sm" variant="secondary" onClick={onOpenClarificationModal}>
                    Request
                  </Button>
                ) : undefined
              }
            />
            {matter.clarifications.length === 0 ? (
              <EmptyState
                title="No clarifications raised"
                message="Nobody has needed further information on this matter."
              />
            ) : (
              <ul className="divide-y divide-line">
                {matter.clarifications.map((c) => (
                  <li key={c.id} className="px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[12px] font-semibold text-ink">
                        {c.requesterName} → {c.recipientName}
                      </span>
                      <StatusBadge status={c.status === 'OPEN' ? 'Pending' : 'Completed'} />
                    </div>
                    <p className="text-[13px] text-ink-2 leading-relaxed">{c.question}</p>
                    <p className="text-[11px] text-ink-3 mt-1 tabular">
                      {formatDateTime(c.requestedAt)}
                    </p>

                    {c.response ? (
                      <div className="mt-2.5 pl-3 border-l-2 border-st-done/40">
                        <p className="text-[13px] text-ink-2 leading-relaxed">{c.response}</p>
                        <p className="text-[11px] text-ink-3 mt-1">
                          {c.responseByName} ·{' '}
                          <span className="tabular">{formatDateTime(c.resolvedAt ?? '')}</span>
                        </p>
                      </div>
                    ) : (
                      c.requestedTo === user.id && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-2.5"
                          onClick={() => onOpenClarificationReplyModal(c)}
                        >
                          Respond
                        </Button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'audit' && (
          <Card>
            <CardHeader
              title="Audit Trail"
              description="Immutable record — events can never be edited or deleted."
              icon={<ShieldCheck className="w-4 h-4" />}
            />
            {auditLoading ? (
              <TableSkeleton rows={5} cols={3} />
            ) : auditFailed ? (
              <ErrorState
                title="Unable to load the audit trail"
                message="We couldn't retrieve the history for this matter."
                onRetry={loadAudit}
              />
            ) : audit.length === 0 ? (
              <EmptyState title="No events recorded" />
            ) : (
              <ol className="p-4">
                {audit.map((e, i) => (
                  <li key={e.id} className="relative pl-6 pb-5 last:pb-0">
                    {i < audit.length - 1 && (
                      <span className="absolute left-[5px] top-3 bottom-0 w-px bg-line" aria-hidden="true" />
                    )}
                    <span
                      className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full bg-nib-gold-500 ring-2 ring-surface"
                      aria-hidden="true"
                    />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[13px] font-semibold text-ink">{e.action}</span>
                      <span className="text-[11px] text-ink-3 tabular">
                        {formatDateTime(e.timestamp)}
                      </span>
                    </div>
                    <p className="text-[12px] text-ink-2 mt-0.5">
                      {e.userName}
                      <span className="text-ink-3"> · {ROLE_LABEL[e.userRole] ?? e.userRole}</span>
                    </p>
                    {(e.previousStatus || e.newStatus) && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {e.previousStatus && <StatusBadge status={e.previousStatus} />}
                        {e.previousStatus && e.newStatus && (
                          <span className="text-ink-3 text-[11px]">→</span>
                        )}
                        {e.newStatus && <StatusBadge status={e.newStatus} />}
                      </div>
                    )}
                    {e.comment && (
                      <p className="text-[12px] text-ink-2 mt-1.5 bg-surface-2 border border-line rounded-md px-2.5 py-1.5 leading-relaxed">
                        {e.comment}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};
