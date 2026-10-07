'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, TrendingUp, X } from 'lucide-react';
import {
  Button,
  Field,
  modalOverlayClass,
  selectClass,
  textareaClass,
} from '@/components/ui/primitives';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { BODMatter, User } from '@/lib/types';
import {
  ESCALATION_NOTE_MAX,
  ESCALATION_REASON_MAX,
  ESCALATION_REASON_MIN,
  ESCALATION_TARGET_ROLES,
  openEscalation,
} from '@/lib/escalations';
import { ROLE_LABEL, formatDateTime } from '@/lib/matters';

export type EscalationMode = 'escalate' | 'resolve';

interface EscalationModalProps {
  isOpen: boolean;
  mode: EscalationMode;
  onClose: () => void;
  matter: BODMatter;
}

/** CEO first, then the Secretariat, then Chiefs — the order an escalation climbs. */
const TARGET_RANK: Record<string, number> = { CEO: 1, BOARD_SECRETARIAT: 2, CHIEF: 3 };

/**
 * Who this matter can be escalated to.
 *
 * Mirrors the server's rule closely enough that the list does not offer people
 * the API will refuse: the CEO and Board Secretariat see every matter, while a
 * Chief can only take one that is in their business area or has passed through
 * them. The server still checks the chosen officer's scope for itself.
 */
function eligibleTargets(users: User[], matter: BODMatter, selfId: string): User[] {
  const routedThrough = new Set(matter.routingPath.map((n) => n.userId));
  return users
    .filter((u) => u.id !== selfId && ESCALATION_TARGET_ROLES.includes(u.role))
    .filter(
      (u) =>
        u.role !== 'CHIEF' ||
        u.businessArea === matter.businessArea ||
        u.id === matter.responsibleChiefId ||
        u.id === matter.currentOwnerId ||
        routedThrough.has(u.id)
    )
    .sort((a, b) => (TARGET_RANK[a.role] ?? 9) - (TARGET_RANK[b.role] ?? 9) || a.name.localeCompare(b.name));
}

export const EscalationModal: React.FC<EscalationModalProps> = ({ isOpen, mode, onClose, matter }) => {
  const { allUsers, refreshMatters, refreshNotifications } = useAuth();
  const user = useAuthenticatedUser();

  const targets = useMemo(() => eligibleTargets(allUsers, matter, user.id), [allUsers, matter, user.id]);
  const open = openEscalation(matter);

  const [targetId, setTargetId] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // A fresh form each time the dialog opens, defaulting to the most senior
  // officer on the list. Keyed on opening only: a background refresh of the
  // matters must not wipe a reason that is half typed.
  useEffect(() => {
    if (!isOpen) return;
    setTargetId(targets[0]?.id ?? '');
    setText('');
    setError('');
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const escalating = mode === 'escalate';
  const trimmed = text.trim();
  const tooShort = escalating && trimmed.length < ESCALATION_REASON_MIN;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (escalating && !targetId) {
      setError('Choose the officer to escalate this matter to.');
      return;
    }
    if (tooShort) {
      setError(`Give a reason of at least ${ESCALATION_REASON_MIN} characters.`);
      return;
    }
    if (!trimmed) {
      setError('Say how the escalation was resolved.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/matters/${matter.id}/escalation`, {
        method: escalating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(escalating ? { escalatedToId: targetId, reason: trimmed } : { note: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'The request failed.');
        return;
      }
      await Promise.all([refreshMatters(), refreshNotifications()]);
      onClose();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="escalation-title"
        className="bg-surface rounded-(--radius-card) shadow-overlay border border-line w-full max-w-lg overflow-hidden"
      >
        <div className="bg-nib-brown-800 text-nib-gold-100 px-6 py-4 flex items-center justify-between border-b border-nib-brown-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-nib-gold-500 text-nib-brown-900 flex items-center justify-center shadow-card">
              {escalating ? <TrendingUp className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            </div>
            <div>
              <h3 id="escalation-title" className="font-bold text-sm">
                {escalating ? 'Escalate Matter' : 'Resolve Escalation'}
              </h3>
              <p className="text-[11px] text-nib-gold-100/70">{matter.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-nib-gold-100/70 hover:text-white p-1 rounded-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-st-late-bg text-st-late border border-st-late/30 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {escalating ? (
            <>
              <p className="text-[12px] text-ink-2 leading-relaxed">
                Escalation raises this matter to a senior officer for management attention. It does
                not change who owns the matter or where it sits in the workflow. The officer you
                choose is notified and emailed, and the current owner and responsible executives are
                told it has been escalated.
              </p>

              <Field label="Escalate to" required htmlFor="escalate-to">
                {targets.length === 0 ? (
                  <p className="text-[12px] text-ink-3">
                    There is no active CEO, Chief or Board Secretariat officer who can take this
                    matter.
                  </p>
                ) : (
                  <select
                    id="escalate-to"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className={selectClass}
                  >
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.title || ROLE_LABEL[t.role]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field
                label="Reason for escalation"
                required
                htmlFor="escalate-reason"
                hint={`What is blocking the matter and what you need from them. At least ${ESCALATION_REASON_MIN} characters.`}
              >
                <textarea
                  id="escalate-reason"
                  rows={4}
                  maxLength={ESCALATION_REASON_MAX}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="e.g. Overdue by three weeks; the directorate is waiting on a budget decision that only the CEO can make."
                  className={textareaClass}
                />
              </Field>
            </>
          ) : (
            <>
              {open && (
                <div className="p-3 rounded-lg bg-surface-2 border border-line text-[12px] text-ink-2 space-y-1">
                  <p>
                    Escalated to <strong className="text-ink">{open.escalatedToName}</strong> by{' '}
                    {open.escalatedByName} on {formatDateTime(open.escalatedAt)}
                  </p>
                  <p className="text-ink-3 whitespace-pre-wrap">{open.reason}</p>
                </div>
              )}
              <Field
                label="How was it resolved?"
                required
                htmlFor="resolve-note"
                hint="Recorded on the matter's audit trail and sent to the officer who escalated it."
              >
                <textarea
                  id="resolve-note"
                  rows={4}
                  maxLength={ESCALATION_NOTE_MAX}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="e.g. Budget approved on 12 Oct; the directorate has resumed implementation."
                  className={textareaClass}
                />
              </Field>
            </>
          )}

          <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={escalating ? targets.length === 0 || tooShort : !trimmed}
              icon={escalating ? <TrendingUp className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            >
              {escalating ? 'Escalate' : 'Resolve escalation'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
