'use client';

import React, { useState } from 'react';
import { AlertCircle, Mail, UserPlus, UserCog, X } from 'lucide-react';
import { Button, Field, inputClass, selectClass, modalOverlayClass } from '@/components/ui/primitives';
import { ROLE_LABEL } from '@/lib/matters';
import { ASSIGNABLE_ROLES } from '@/lib/users';
import { Role, User } from '@/lib/types';

export interface UserFormResult {
  user: User;
  /** Whether an invitation email was sent to the officer. */
  emailSent?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Omitted to provision a new account; supplied to amend an existing one. */
  editing?: User | null;
  onSaved: (result: UserFormResult) => void;
}

const BLANK = {
  name: '',
  email: '',
  role: 'DIRECTOR' as Role,
  title: '',
  businessArea: '',
  department: '',
  phone: '',
};

/**
 * Provisioning and amending an officer account.
 *
 * The form collects the officer's details. On creation, the system sends an
 * invitation email with a one-time setup link — no temporary password is
 * generated or shown.
 */
export const UserFormModal: React.FC<Props> = ({ isOpen, onClose, editing, onSaved }) => {
  const isEdit = Boolean(editing);

  const [form, setForm] = useState(BLANK);
  const [availableRoles, setAvailableRoles] = useState<Array<{ roleKey: string; label: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/roles');
        if (res.ok) {
          const data = await res.json();
          if (data.roles?.length) {
            setAvailableRoles(data.roles.map((r: any) => ({ roleKey: r.roleKey, label: r.label })));
          }
        }
      } catch {
        // Fallback to ASSIGNABLE_ROLES
      }
    })();
  }, []);

  // Re-seed the fields whenever the modal is opened for a different subject.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const subject = editing?.id ?? 'new';
  if (isOpen && seededFor !== subject) {
    setSeededFor(subject);
    setForm(
      editing
        ? {
            name: editing.name,
            email: editing.email,
            role: editing.role,
            title: editing.title,
            businessArea: editing.businessArea,
            department: editing.department ?? '',
            phone: editing.phone ?? '',
          }
        : BLANK
    );
    setError(null);
  }

  if (!isOpen) return null;

  const set = (key: keyof typeof BLANK) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(isEdit ? `/api/users/${editing!.id}` : '/api/users', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          department: form.department || null,
          phone: form.phone || null,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? 'The account could not be saved.');
        return;
      }

      onSaved(payload as UserFormResult);
      onClose();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className="bg-surface rounded-[--radius-card] shadow-overlay border border-line w-full max-w-lg overflow-hidden">
        <div className="bg-nib-brown-800 text-nib-gold-100 px-6 py-4 flex items-center justify-between border-b border-nib-brown-700">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-nib-gold-500 text-nib-brown-900 flex items-center justify-center shadow-card">
              {isEdit ? <UserCog className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-bold text-sm">
                {isEdit ? 'Amend officer account' : 'Provision officer account'}
              </h3>
              <p className="text-[11px] text-nib-gold-200/70">
                {isEdit
                  ? editing!.email
                 : 'An invitation email will be sent to the officer\'s address.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-nib-gold-200/70 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-st-late-bg text-st-late border border-st-late/30 text-[12px] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name" htmlFor="u-name" required>
              <input
                id="u-name"
                required
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                placeholder="Rahel Solomon"
                className={inputClass}
              />
            </Field>

            <Field label="Institutional email" htmlFor="u-email" required>
              <input
                id="u-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => set('email')(e.target.value)}
                placeholder="name@nibbank.et"
                className={inputClass}
              />
            </Field>

            <Field
              label="Role"
              htmlFor="u-role"
              required
              hint={isEdit ? 'Changing a role signs the officer out.' : undefined}
            >
              <select
                id="u-role"
                value={form.role}
                onChange={(e) => set('role')(e.target.value)}
                className={selectClass}
              >
                {(availableRoles.length > 0
                  ? availableRoles
                  : ASSIGNABLE_ROLES.map((r) => ({ roleKey: r, label: ROLE_LABEL[r] ?? r }))
                ).map((r) => (
                  <option key={r.roleKey} value={r.roleKey}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Business area" htmlFor="u-area" required>
              <input
                id="u-area"
                required
                value={form.businessArea}
                onChange={(e) => set('businessArea')(e.target.value)}
                placeholder="Risk & Compliance"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Position / title" htmlFor="u-title" required>
            <input
              id="u-title"
              required
              value={form.title}
              onChange={(e) => set('title')(e.target.value)}
              placeholder="Director - Credit Assessment & Underwriting"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Department" htmlFor="u-dept">
              <input
                id="u-dept"
                value={form.department}
                onChange={(e) => set('department')(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Phone" htmlFor="u-phone">
              <input
                id="u-phone"
                value={form.phone}
                onChange={(e) => set('phone')(e.target.value)}
                placeholder="+251 11 550 0000"
                className={inputClass}
              />
            </Field>
          </div>

          {!isEdit && (
            <div className="p-3 rounded-lg bg-st-info-bg border border-st-info/20 text-[12px] text-st-info flex items-start gap-2">
              <Mail className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                An invitation email with a password setup link will be sent to the officer's
                institutional email address.
              </span>
            </div>
          )}

          <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {isEdit ? 'Save changes' : 'Create account'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
