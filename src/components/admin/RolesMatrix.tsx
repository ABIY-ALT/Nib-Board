'use client';

import React, { useEffect, useState } from 'react';
import {
  Check,
  Minus,
  ShieldCheck,
  Plus,
  Trash2,
  Edit3,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  X,
  Lock,
} from 'lucide-react';
import { Card, CardHeader, Button, Field, inputClass, modalOverlayClass, cn } from '@/components/ui/primitives';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { AppRole, PermissionAction, ALL_PERMISSION_ACTIONS } from '@/lib/roles';

export const RolesMatrix: React.FC = () => {
  const user = useAuthenticatedUser();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Add Role Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const canEdit = user.role === 'BOARD_SECRETARIAT' || user.role === 'ADMIN';

  const loadRoles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/roles');
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles || []);
        setDirty(false);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to load roles from server.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRoles();
  }, []);

  const togglePermission = (roleKey: string, permKey: string) => {
    if (!canEdit) return;
    setRoles((prev) =>
      prev.map((r) => {
        if (r.roleKey !== roleKey) return r;
        const exists = r.permissions.includes(permKey);
        const updated = exists
          ? r.permissions.filter((p) => p !== permKey)
          : [...r.permissions, permKey];
        return { ...r, permissions: updated };
      })
    );
    setDirty(true);
    setFeedback(null);
  };

  const handleSaveAll = async () => {
    if (!canEdit || !dirty) return;
    setSaving(true);
    setFeedback(null);

    try {
      // Save each role's permissions
      for (const r of roles) {
        await fetch('/api/roles', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roleKey: r.roleKey,
            permissions: r.permissions,
          }),
        });
      }
      setDirty(false);
      setFeedback({ type: 'success', message: 'Role permissions updated successfully.' });
    } catch {
      setFeedback({ type: 'error', message: 'Failed to save role permissions.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleKey.trim() || !newRoleLabel.trim()) return;

    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleKey: newRoleKey.trim(),
          label: newRoleLabel.trim(),
          description: newRoleDesc.trim(),
          permissions: newRolePermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Failed to create role.');
        return;
      }

      setRoles(data.roles || []);
      setIsAddOpen(false);
      setNewRoleKey('');
      setNewRoleLabel('');
      setNewRoleDesc('');
      setNewRolePermissions([]);
      setFeedback({ type: 'success', message: `Role "${newRoleLabel}" created successfully.` });
    } catch {
      setCreateError('Network error creating role.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRole = async (roleKey: string, roleLabel: string) => {
    if (!window.confirm(`Are you sure you want to delete custom role "${roleLabel}"?`)) return;

    try {
      const res = await fetch('/api/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error || 'Failed to delete role.' });
        return;
      }

      setRoles(data.roles || []);
      setFeedback({ type: 'success', message: `Role "${roleLabel}" removed.` });
    } catch {
      setFeedback({ type: 'error', message: 'Could not delete role.' });
    }
  };

  // Group permission actions by category
  const categories = Array.from(new Set(ALL_PERMISSION_ACTIONS.map((a) => a.category)));

  return (
    <Card className="overflow-hidden border border-line">
      <CardHeader
        title="Roles & Permissions Configuration"
        description="Configure institutional roles and customize operational permissions."
        icon={<ShieldCheck className="w-4 h-4 text-nib-gold-600" />}
        action={
          canEdit ? (
            <div className="flex items-center gap-2">
              {dirty && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={saving}
                  onClick={handleSaveAll}
                  icon={<Save className="w-3.5 h-3.5" />}
                >
                  Save Changes
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsAddOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Create New Role
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={loading}
                onClick={loadRoles}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                aria-label="Refresh roles"
              />
            </div>
          ) : undefined
        }
      />

      {feedback && (
        <div
          className={cn(
            'mx-4 my-3 p-3 rounded-lg text-[12px] flex items-center justify-between border',
            feedback.type === 'success'
              ? 'bg-st-done-bg text-st-done border-st-done/30'
              : 'bg-st-late-bg text-st-late border-st-late/30'
          )}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-ink-3 hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Permissions Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-line bg-surface-2/70">
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3 min-w-[18rem]">
                Permission / Action
              </th>
              {roles.map((r) => (
                <th
                  key={r.roleKey}
                  className="px-3 py-3 text-[11px] font-bold text-ink text-center whitespace-nowrap min-w-[8rem]"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{r.label}</span>
                    <div className="flex items-center gap-1">
                      {r.isSystem ? (
                        <span className="text-[9px] font-normal uppercase tracking-wider text-ink-3 bg-surface border border-line px-1 rounded">
                          System
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-nib-gold-600 bg-nib-gold-100/50 border border-nib-gold-300 px-1 rounded flex items-center gap-1">
                          Custom
                          {canEdit && (
                            <button
                              onClick={() => handleDeleteRole(r.roleKey, r.label)}
                              title="Delete Role"
                              className="text-st-late hover:opacity-80 ml-0.5"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const actions = ALL_PERMISSION_ACTIONS.filter((a) => a.category === cat);
              return (
                <React.Fragment key={cat}>
                  {/* Category Header Row */}
                  <tr className="bg-surface-2/40 border-y border-line">
                    <td
                      colSpan={roles.length + 1}
                      className="px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-nib-gold-600 bg-nib-gold-100/30 dark:bg-nib-brown-700/20"
                    >
                      {cat}
                    </td>
                  </tr>
                  {actions.map((action, i) => (
                    <tr
                      key={action.key}
                      className={cn(
                        'border-b border-line hover:bg-surface-2/30 transition',
                        i % 2 === 1 && 'bg-surface-2/10'
                      )}
                    >
                      <th scope="row" className="px-4 py-2.5 font-normal align-top">
                        <span className="block text-[12px] font-semibold text-ink">
                          {action.label}
                        </span>
                        <span className="block text-[11px] text-ink-3 leading-relaxed mt-0.5">
                          {action.description}
                        </span>
                      </th>
                      {roles.map((r) => {
                        const granted = r.permissions.includes(action.key);
                        return (
                          <td
                            key={r.roleKey}
                            className="px-3 py-2.5 text-center align-middle cursor-pointer"
                            onClick={() => canEdit && togglePermission(r.roleKey, action.key)}
                          >
                            <div className="flex items-center justify-center">
                              {granted ? (
                                <span
                                  className={cn(
                                    'inline-flex items-center justify-center w-6 h-6 rounded-md transition shadow-xs',
                                    canEdit
                                      ? 'bg-st-done text-white hover:bg-st-done/90 ring-2 ring-st-done/20'
                                      : 'bg-st-done-bg text-st-done border border-st-done/30'
                                  )}
                                  title={canEdit ? 'Click to toggle permission' : 'Granted'}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </span>
                              ) : (
                                <span
                                  className={cn(
                                    'inline-flex items-center justify-center w-6 h-6 rounded-md transition',
                                    canEdit
                                      ? 'bg-surface-2 hover:bg-line text-ink-3'
                                      : 'text-ink-3 opacity-40'
                                  )}
                                  title={canEdit ? 'Click to grant permission' : 'Not Granted'}
                                >
                                  <Minus className="w-3 h-3" />
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-line bg-surface-2/50 flex flex-wrap items-center justify-between gap-3 text-[11px] text-ink-3">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-st-done text-white text-[9px]">
              <Check className="w-3 h-3" />
            </span>
            Permission Granted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-surface-2 text-ink-3 text-[9px]">
              <Minus className="w-2.5 h-2.5" />
            </span>
            Permission Refused
          </span>
        </div>
        {canEdit && (
          <span className="text-nib-gold-600 font-medium">
            💡 Click any checkbox above to toggle permissions and click Save Changes.
          </span>
        )}
      </div>

      {/* Modal: Create New Role */}
      {isAddOpen && (
        <div className={modalOverlayClass}>
          <div className="bg-surface rounded-xl shadow-overlay border border-line w-full max-w-lg overflow-hidden my-8">
            <div className="bg-nib-brown-800 text-nib-gold-100 px-6 py-4 flex items-center justify-between border-b border-nib-brown-700">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-nib-gold-500 text-nib-brown-900 font-bold flex items-center justify-center text-sm shadow-card">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Create New Institutional Role</h3>
                  <p className="text-[11px] text-nib-gold-200/70">Define custom role and assign permissions</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-nib-gold-200/70 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="p-6 space-y-4">
              {createError && (
                <div className="p-3 rounded-lg bg-st-late-bg text-st-late border border-st-late/30 text-[12px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}

              <Field
                label="Role Code / Identifier"
                htmlFor="new-role-key"
                required
                hint="Unique system key, e.g. COMMITTEE_CHAIR, AUDIT_HEAD"
              >
                <input
                  id="new-role-key"
                  required
                  value={newRoleKey}
                  onChange={(e) => setNewRoleKey(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  placeholder="e.g. AUDIT_COMMITTEE_MEMBER"
                  className={cn(inputClass, 'font-mono uppercase')}
                />
              </Field>

              <Field
                label="Role Display Label"
                htmlFor="new-role-label"
                required
                hint="Human-readable title shown across the portal"
              >
                <input
                  id="new-role-label"
                  required
                  value={newRoleLabel}
                  onChange={(e) => setNewRoleLabel(e.target.value)}
                  placeholder="e.g. Board Audit Committee Member"
                  className={inputClass}
                />
              </Field>

              <Field label="Description" htmlFor="new-role-desc">
                <textarea
                  id="new-role-desc"
                  rows={2}
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="Brief description of role responsibilities..."
                  className={cn(inputClass, 'resize-none')}
                />
              </Field>

              <div>
                <label className="block text-[11px] font-semibold text-ink-2 mb-2">
                  Initial Permissions Grant
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-line rounded-lg p-3 bg-surface-2/30">
                  {ALL_PERMISSION_ACTIONS.map((a) => {
                    const isChecked = newRolePermissions.includes(a.key);
                    return (
                      <label
                        key={a.key}
                        className="flex items-center gap-2 text-[12px] text-ink cursor-pointer hover:text-nib-gold-600 transition"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            setNewRolePermissions((prev) =>
                              e.target.checked
                                ? [...prev, a.key]
                                : prev.filter((k) => k !== a.key)
                            );
                          }}
                          className="rounded text-nib-gold-600 focus:ring-nib-gold-500"
                        />
                        <span>{a.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={creating}>
                  Create Role
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
};
