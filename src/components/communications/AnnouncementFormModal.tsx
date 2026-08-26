'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Megaphone, Send, Save, Users, X } from 'lucide-react';
import {
  Button,
  Field,
  FilePicker,
  cn,
  inputClass,
  modalOverlayClass,
  selectClass,
  textareaClass,
} from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES, formatBytes } from '@/lib/documents';
import {
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_TYPE_LABEL,
  type Announcement,
  type AnnouncementPriority,
  type AnnouncementType,
} from '@/lib/announcements';
import { PERMISSIONS } from '@/lib/permissions';

interface AudienceOptions {
  roles: Array<{ roleKey: string; label: string }>;
  departments: string[];
  businessAreas: string[];
  users: Array<{
    id: string;
    name: string;
    role: string;
    department: string | null;
    businessArea: string;
  }>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Absent when composing a new announcement. */
  editing?: Announcement | null;
  onSaved: () => void;
}

/** A `datetime-local` value from an ISO stamp, in the browser's own zone. */
function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Multi-select rendered as toggle chips: a native multiple select is unusable. */
const ChipPicker: React.FC<{
  options: Array<{ value: string; label: string; hint?: string }>;
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
  emptyMessage: string;
}> = ({ options, selected, onToggle, disabled, emptyMessage }) => {
  if (options.length === 0) {
    return <p className="text-[12px] text-ink-3">{emptyMessage}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(o.value)}
            aria-pressed={on}
            title={o.hint}
            className={cn(
              'px-2 py-1 rounded-md border text-[12px] font-medium transition-colors',
              disabled && 'opacity-50 cursor-not-allowed',
              on
                ? 'bg-nib-gold-500 border-nib-gold-500 text-nib-brown-900'
                : 'bg-surface border-line-strong text-ink-2 hover:border-nib-gold-500/60'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
};

/**
 * Compose or amend an announcement.
 *
 * The same form serves every type: choosing MEETING reveals the meeting fields
 * and nothing else changes, which is the whole point of meetings being a
 * category rather than a separate feature.
 *
 * Saving and publishing are separate buttons because they are separate
 * permissions. An officer who may draft but not publish sees only "Save draft",
 * and the API refuses the other regardless of what the form offers.
 */
export const AnnouncementFormModal: React.FC<Props> = ({ isOpen, onClose, editing, onSaved }) => {
  const { can, matters } = useAuth();
  const canPublish = can(PERMISSIONS.ANNOUNCEMENT_PUBLISH);

  const [options, setOptions] = useState<AudienceOptions | null>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<AnnouncementType>('GENERAL');
  const [priority, setPriority] = useState<AnnouncementPriority>('Normal');
  const [publishAt, setPublishAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const [targetAll, setTargetAll] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [businessAreas, setBusinessAreas] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [userQuery, setUserQuery] = useState('');

  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [location, setLocation] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [agenda, setAgenda] = useState('');
  const [participants, setParticipants] = useState('');

  const [relatedMatterId, setRelatedMatterId] = useState('');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the dialog opens, so a cancelled edit does not
  // bleed into the next composition.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setFile(null);
    setUserQuery('');

    setTitle(editing?.title ?? '');
    setMessage(editing?.message ?? '');
    setType(editing?.type ?? 'GENERAL');
    setPriority(editing?.priority ?? 'Normal');
    setPublishAt(toLocalInput(editing?.publishAt));
    setExpiresAt(toLocalInput(editing?.expiresAt));

    setTargetAll(editing ? editing.audience.all : true);
    setRoles(editing?.audience.roles ?? []);
    setDepartments(editing?.audience.departments ?? []);
    setBusinessAreas(editing?.audience.businessAreas ?? []);
    setUserIds(editing?.audience.userIds ?? []);

    setMeetingDate(editing?.meeting?.date ?? '');
    setMeetingTime(editing?.meeting?.time ?? '');
    setLocation(editing?.meeting?.location ?? '');
    setMeetingLink(editing?.meeting?.link ?? '');
    setAgenda(editing?.meeting?.agenda ?? '');
    setParticipants((editing?.meeting?.participants ?? []).join(', '));

    setRelatedMatterId(editing?.relatedMatterId ?? '');
    setReference(editing?.reference ?? '');
  }, [isOpen, editing]);

  useEffect(() => {
    if (!isOpen || options) return;
    void (async () => {
      const res = await fetch('/api/announcements/audience');
      if (res.ok) setOptions(await res.json());
    })();
  }, [isOpen, options]);

  const matchingUsers = useMemo(() => {
    const all = options?.users ?? [];
    const q = userQuery.trim().toLowerCase();
    // Anyone already chosen stays visible whatever the search says, so a
    // selection cannot be lost behind a filter.
    const chosen = all.filter((u) => userIds.includes(u.id));
    if (!q) return [...chosen, ...all.filter((u) => !userIds.includes(u.id))].slice(0, 40);
    const hits = all.filter(
      (u) =>
        !userIds.includes(u.id) &&
        [u.name, u.role, u.department ?? '', u.businessArea].some((f) =>
          f.toLowerCase().includes(q)
        )
    );
    return [...chosen, ...hits].slice(0, 40);
  }, [options, userQuery, userIds]);

  if (!isOpen) return null;

  const toggle = (list: string[], setList: (v: string[]) => void) => (value: string) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const hasAudience =
    targetAll ||
    roles.length > 0 ||
    departments.length > 0 ||
    businessAreas.length > 0 ||
    userIds.length > 0;

  const submit = async (mode: 'draft' | 'publish') => {
    setError(null);

    if (!title.trim() || !message.trim()) {
      setError('A title and a message are both required.');
      return;
    }
    if (!hasAudience) {
      setError('Choose who this announcement is for, or address it to everyone.');
      return;
    }
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setError(`${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      return;
    }

    const payload = {
      title: title.trim(),
      message: message.trim(),
      type,
      priority,
      publishAt: publishAt ? new Date(publishAt).toISOString() : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      targetAll,
      targetUserIds: targetAll ? [] : userIds,
      targetRoles: targetAll ? [] : roles,
      targetDepartments: targetAll ? [] : departments,
      targetBusinessAreas: targetAll ? [] : businessAreas,
      meetingDate: type === 'MEETING' ? meetingDate : null,
      meetingTime: type === 'MEETING' ? meetingTime : null,
      location: type === 'MEETING' ? location : null,
      meetingLink: type === 'MEETING' ? meetingLink : null,
      agenda: type === 'MEETING' ? agenda : null,
      participants:
        type === 'MEETING'
          ? participants.split(',').map((p) => p.trim()).filter(Boolean)
          : [],
      relatedMatterId: relatedMatterId || null,
      reference: reference.trim() || null,
      // Publishing an existing draft goes through its own endpoint, so this
      // only applies when the record is being created.
      publish: !editing && mode === 'publish',
    };

    setBusy(mode);
    try {
      const res = await fetch(editing ? `/api/announcements/${editing.id}` : '/api/announcements', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(saved.error ?? 'The announcement could not be saved.');
        return;
      }

      const id: string = saved.id ?? editing?.id;

      if (file && id) {
        const form = new FormData();
        form.append('file', file);
        const upload = await fetch(`/api/announcements/${id}/attachment`, {
          method: 'POST',
          body: form,
        });
        if (!upload.ok) {
          const problem = await upload.json().catch(() => ({}));
          // The announcement itself saved, so this is reported rather than
          // treated as a failure of the whole operation.
          setError(
            `The announcement was saved, but the attachment failed: ${problem.error ?? 'upload rejected'}.`
          );
          onSaved();
          return;
        }
      }

      // An existing draft is published through the publish endpoint, which is
      // where that permission is enforced.
      if (editing && mode === 'publish' && editing.status === 'DRAFT') {
        const published = await fetch(`/api/announcements/${editing.id}/publish`, {
          method: 'POST',
        });
        if (!published.ok) {
          const problem = await published.json().catch(() => ({}));
          setError(problem.error ?? 'The announcement was saved but could not be published.');
          onSaved();
          return;
        }
      }

      onSaved();
      onClose();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  const openMatters = matters.filter((m) => m.status !== 'Closed');

  return (
    <div className={modalOverlayClass}>
      <div className="bg-surface rounded-[--radius-card] shadow-overlay border border-line w-full max-w-3xl overflow-hidden">
        <div className="bg-nib-brown-800 text-nib-gold-100 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-nib-gold-500 text-nib-brown-900 flex items-center justify-center shrink-0">
              <Megaphone className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="font-bold text-[13px]">
                {editing ? 'Amend Announcement' : 'New Announcement'}
              </h3>
              <p className="text-[11px] text-nib-gold-200/80 truncate">
                {editing
                  ? `${editing.id} — ${editing.status.toLowerCase()}`
                  : 'General, meeting, notice, policy, event or urgent.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-nib-gold-200/70 hover:text-white p-1 rounded-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-[--radius-control] border border-st-late/30 bg-st-late-bg px-3 py-2">
              <AlertCircle className="w-4 h-4 text-st-late shrink-0 mt-0.5" />
              <p className="text-[12px] text-st-late">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <Field label="Title" required htmlFor="ann-title">
                <input
                  id="ann-title"
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What is this announcement about?"
                  maxLength={200}
                />
              </Field>
            </div>

            <Field label="Type" required htmlFor="ann-type">
              <select
                id="ann-type"
                className={selectClass}
                value={type}
                onChange={(e) => setType(e.target.value as AnnouncementType)}
              >
                {ANNOUNCEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ANNOUNCEMENT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Priority" required htmlFor="ann-priority">
              <select
                id="ann-priority"
                className={selectClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value as AnnouncementPriority)}
              >
                {ANNOUNCEMENT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Reference" hint="Optional — a paper or circular number." htmlFor="ann-ref">
              <input
                id="ann-ref"
                className={inputClass}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. NIB/CIRC/2026/014"
              />
            </Field>

            <div className="sm:col-span-3">
              <Field label="Message" required htmlFor="ann-message">
                <textarea
                  id="ann-message"
                  className={textareaClass}
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="The announcement as recipients will read it."
                />
              </Field>
            </div>

            <Field
              label="Publish from"
              hint="Leave empty to publish immediately. A future time appears in recipients' feeds then, without a notification."
              htmlFor="ann-publish"
            >
              <input
                id="ann-publish"
                type="datetime-local"
                className={inputClass}
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
              />
            </Field>

            <Field label="Expires" hint="Leave empty to keep it standing." htmlFor="ann-expires">
              <input
                id="ann-expires"
                type="datetime-local"
                className={inputClass}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </Field>

            <Field label="Related Board matter" hint="Optional." htmlFor="ann-matter">
              <select
                id="ann-matter"
                className={selectClass}
                value={relatedMatterId}
                onChange={(e) => setRelatedMatterId(e.target.value)}
              >
                <option value="">None</option>
                {openMatters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} — {m.title.slice(0, 50)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Meeting details — one announcement type, not a separate feature. */}
          {type === 'MEETING' && (
            <div className="rounded-[--radius-card] border border-line bg-surface-2 p-3 space-y-3">
              <h4 className="text-[12px] font-bold uppercase tracking-wide text-ink-3">
                Meeting details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Meeting date" htmlFor="ann-meeting-date">
                  <input
                    id="ann-meeting-date"
                    type="date"
                    className={inputClass}
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                  />
                </Field>
                <Field label="Meeting time" htmlFor="ann-meeting-time">
                  <input
                    id="ann-meeting-time"
                    className={inputClass}
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                    placeholder="e.g. 09:30 – 11:00"
                  />
                </Field>
                <Field label="Location" htmlFor="ann-location">
                  <input
                    id="ann-location"
                    className={inputClass}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Head Office Boardroom, 8th floor"
                  />
                </Field>
                <Field label="Meeting link" htmlFor="ann-link">
                  <input
                    id="ann-link"
                    className={inputClass}
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    placeholder="https://…"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Agenda" htmlFor="ann-agenda">
                    <textarea
                      id="ann-agenda"
                      className={textareaClass}
                      rows={3}
                      value={agenda}
                      onChange={(e) => setAgenda(e.target.value)}
                      placeholder="One item per line."
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label="Participants"
                    hint="Free text, comma separated — who is expected to attend."
                    htmlFor="ann-participants"
                  >
                    <input
                      id="ann-participants"
                      className={inputClass}
                      value={participants}
                      onChange={(e) => setParticipants(e.target.value)}
                      placeholder="Board Members, CEO, Chief Officers"
                    />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* Audience */}
          <div className="rounded-[--radius-card] border border-line p-3 space-y-3">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-nib-gold-600" />
              <h4 className="text-[12px] font-bold uppercase tracking-wide text-ink-3">
                Who receives this
              </h4>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={targetAll}
                onChange={(e) => setTargetAll(e.target.checked)}
                className="mt-0.5 accent-nib-gold-600"
              />
              <span>
                <span className="block text-[13px] font-medium text-ink">All authorized users</span>
                <span className="block text-[11px] text-ink-3">
                  Everyone whose role is permitted to view announcements.
                </span>
              </span>
            </label>

            <div className={cn('space-y-3', targetAll && 'opacity-50 pointer-events-none')}>
              <div>
                <p className="text-[12px] font-semibold text-ink-2 mb-1.5">Roles</p>
                <ChipPicker
                  options={(options?.roles ?? []).map((r) => ({ value: r.roleKey, label: r.label }))}
                  selected={roles}
                  onToggle={toggle(roles, setRoles)}
                  disabled={targetAll}
                  emptyMessage="No role currently holds the announcement view permission."
                />
              </div>

              <div>
                <p className="text-[12px] font-semibold text-ink-2 mb-1.5">
                  Departments &amp; directorates
                </p>
                <ChipPicker
                  options={(options?.departments ?? []).map((d) => ({ value: d, label: d }))}
                  selected={departments}
                  onToggle={toggle(departments, setDepartments)}
                  disabled={targetAll}
                  emptyMessage="No directorates are registered yet."
                />
              </div>

              <div>
                <p className="text-[12px] font-semibold text-ink-2 mb-1.5">
                  Business areas &amp; branches
                </p>
                <ChipPicker
                  options={(options?.businessAreas ?? []).map((b) => ({ value: b, label: b }))}
                  selected={businessAreas}
                  onToggle={toggle(businessAreas, setBusinessAreas)}
                  disabled={targetAll}
                  emptyMessage="No business areas are recorded yet."
                />
              </div>

              <div>
                <p className="text-[12px] font-semibold text-ink-2 mb-1.5">
                  Named officers
                  {userIds.length > 0 && (
                    <span className="ml-1 text-ink-3 font-normal">({userIds.length} selected)</span>
                  )}
                </p>
                <input
                  className={cn(inputClass, 'h-8 mb-2 text-[12px]')}
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Search by name, role, department or business area…"
                  disabled={targetAll}
                />
                <ChipPicker
                  options={matchingUsers.map((u) => ({
                    value: u.id,
                    label: u.name,
                    hint: `${u.role} · ${u.department ?? u.businessArea}`,
                  }))}
                  selected={userIds}
                  onToggle={toggle(userIds, setUserIds)}
                  disabled={targetAll}
                  emptyMessage="Nobody matches that search."
                />
              </div>
            </div>

            {!hasAudience && (
              <p className="text-[11px] text-st-late">
                An announcement with no audience reaches nobody and cannot be published.
              </p>
            )}
          </div>

          <Field
            label="Attachment"
            hint={
              editing?.attachment
                ? `Currently attached: ${editing.attachment.name}. Choosing a file replaces it.`
                : 'Optional — one file, up to 25 MB.'
            }
          >
            <FilePicker
              id="ann-file"
              file={file}
              onPick={setFile}
              accept={ACCEPT_ATTRIBUTE}
              disabled={busy !== null}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-line bg-surface-2">
          <p className="text-[11px] text-ink-3">
            {canPublish
              ? 'Publishing notifies every recipient immediately.'
              : 'You may draft this announcement; releasing it needs the publish permission.'}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" onClick={onClose} disabled={busy !== null}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              icon={<Save className="w-3.5 h-3.5" />}
              loading={busy === 'draft'}
              disabled={busy !== null}
              onClick={() => submit('draft')}
            >
              {editing ? 'Save changes' : 'Save draft'}
            </Button>
            {canPublish && (
              <Button
                variant="primary"
                icon={<Send className="w-3.5 h-3.5" />}
                loading={busy === 'publish'}
                disabled={busy !== null || !hasAudience}
                onClick={() => submit('publish')}
              >
                {editing && editing.status === 'PUBLISHED' ? 'Save changes' : 'Save & publish'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
