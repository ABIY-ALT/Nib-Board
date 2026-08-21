'use client';

import React, { useEffect, useState } from 'react';
import {
  Building2,
  Plus,
  UserCheck,
  UserX,
  Trash2,
  Edit3,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  X,
  Building,
  ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, Button, Field, inputClass, selectClass, modalOverlayClass, cn } from '@/components/ui/primitives';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { DepartmentItem } from '@/lib/departments';
import { User } from '@/lib/types';

export const DepartmentsManager: React.FC = () => {
  const user = useAuthenticatedUser();
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [directors, setDirectors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State: Create Department
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newBusinessArea, setNewBusinessArea] = useState('Banking Operations');
  const [newDirectorId, setNewDirectorId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Modal State: Assign/Edit Director
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null);
  const [selectedDirectorId, setSelectedDirectorId] = useState('');
  const [updating, setUpdating] = useState(false);

  const canEdit = user.role === 'BOARD_SECRETARIAT' || user.role === 'ADMIN';

  const { allUsers } = useAuth();

  const loadData = async () => {
    setLoading(true);
    try {
      const [deptRes, usersRes] = await Promise.all([
        fetch('/api/departments'),
        fetch('/api/users'),
      ]);

      if (deptRes.ok) {
        const deptData = await deptRes.json();
        setDepartments(deptData.departments || []);
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        const rawUsers: User[] = Array.isArray(usersData) ? usersData : (usersData.users || allUsers || []);
        const dirs = rawUsers.filter(
          (u: User) => u.role === 'DIRECTOR' || u.role === 'CHIEF' || u.role === 'DEPUTY_CHIEF'
        );
        setDirectors(dirs.length > 0 ? dirs : allUsers.filter((u) => u.role === 'DIRECTOR' || u.role === 'CHIEF' || u.role === 'DEPUTY_CHIEF'));
      } else if (allUsers?.length) {
        setDirectors(allUsers.filter((u) => u.role === 'DIRECTOR' || u.role === 'CHIEF' || u.role === 'DEPUTY_CHIEF'));
      }
    } catch {
      if (allUsers?.length) {
        setDirectors(allUsers.filter((u) => u.role === 'DIRECTOR' || u.role === 'CHIEF' || u.role === 'DEPUTY_CHIEF'));
      }
      setFeedback({ type: 'error', message: 'Failed to load departments.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newBusinessArea.trim()) return;

    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          code: newCode.trim(),
          businessArea: newBusinessArea.trim(),
          directorId: newDirectorId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Could not create department.');
        return;
      }

      setDepartments(data.departments || []);
      setIsCreateOpen(false);
      setNewName('');
      setNewCode('');
      setNewDirectorId('');
      setFeedback({
        type: 'success',
        message: `Department "${newName}" created successfully.`,
      });
    } catch {
      setCreateError('Network error creating department.');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateDirector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept) return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/departments/${editingDept.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directorId: selectedDirectorId || null }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error || 'Failed to update Director assignment.' });
        return;
      }

      setDepartments(data.departments || []);
      setEditingDept(null);
      setFeedback({
        type: 'success',
        message: `Director assignment for "${editingDept.name}" updated successfully.`,
      });
    } catch {
      setFeedback({ type: 'error', message: 'Network error updating department.' });
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (dept: DepartmentItem) => {
    if (!canEdit) return;
    if (!confirm(`Are you sure you want to delete "${dept.name}"?`)) return;

    try {
      const res = await fetch(`/api/departments/${dept.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error || 'Failed to delete department.' });
        return;
      }

      setDepartments(data.departments || []);
      setFeedback({ type: 'success', message: `Department "${dept.name}" deleted successfully.` });
    } catch {
      setFeedback({ type: 'error', message: 'Network error deleting department.' });
    }
  };

  const businessAreas = [
    'Banking Operations',
    'Retail Banking',
    'Risk & Compliance',
    'Information Technology',
    'Human Capital & Administration',
    'Finance & Accounts',
    'Strategic Planning & Business Development',
    'Board Secretariat',
    'Bank-Wide / Executive Management'
  ];

  const grouped = businessAreas.reduce<Record<string, DepartmentItem[]>>((acc, ba) => {
    acc[ba] = departments.filter((d) => d.businessArea === ba);
    return acc;
  }, {});

  const availableForCreate = directors.filter((d) => {
    const isAssigned = departments.some((dept) => dept.directorId === d.id);
    return !isAssigned;
  });

  const availableForEdit = directors.filter((d) => {
    if (editingDept && editingDept.directorId === d.id) return true;
    const isAssignedToOther = departments.some(
      (dept) => dept.id !== editingDept?.id && dept.directorId === d.id
    );
    return !isAssignedToOther;
  });

  return (
    <Card className="overflow-hidden border border-line">
      <CardHeader
        title="Directorate & Department Registry"
        description="Configure operational directorates and assign designated Director heads for each branch of the bank."
        icon={<Building2 className="w-4 h-4 text-nib-gold-600" />}
        action={
          canEdit ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => setIsCreateOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Directorate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={loading}
                onClick={loadData}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                aria-label="Refresh departments"
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

      <div className="divide-y divide-line">
        {businessAreas.map((ba) => {
          const clusterChief = allUsers?.find(
            (u) => u.businessArea === ba && u.role === 'CHIEF'
          );
          const clusterDeputy = allUsers?.find(
            (u) => u.businessArea === ba && u.role === 'DEPUTY_CHIEF'
          );

          return (
            <div key={ba} className="p-4 bg-surface-2/20">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 pb-2 border-b border-line/60">
                <div>
                  <h4 className="text-[12px] font-bold uppercase tracking-wider text-nib-gold-600 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5" />
                    <span>{ba}</span>
                    <span className="text-[10px] text-ink-3 font-normal font-mono">
                      ({grouped[ba]?.length || 0} directorates)
                    </span>
                  </h4>
                </div>

                <div className="flex items-center gap-3 text-[11px]">
                  <div className="flex items-center gap-1 text-ink-2">
                    <span className="text-ink-3 font-semibold">Chief Officer:</span>
                    {clusterChief ? (
                      <span className="font-semibold text-ink">{clusterChief.name}</span>
                    ) : (
                      <span className="text-ink-3 italic">Unassigned in Roster</span>
                    )}
                  </div>
                  {clusterDeputy && (
                    <div className="flex items-center gap-1 text-ink-2">
                      <span className="text-ink-3 font-semibold">Deputy:</span>
                      <span className="font-semibold text-ink">{clusterDeputy.name}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {grouped[ba]?.map((dept) => (
                  <div
                    key={dept.id}
                    className="bg-surface border border-line rounded-lg p-3.5 shadow-xs flex flex-col justify-between space-y-3 hover:border-line-strong transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[13px] text-ink">{dept.name}</span>
                          {dept.code && (
                            <span className="text-[10px] font-mono bg-surface-2 px-1.5 py-0.5 rounded text-ink-3 font-bold border border-line">
                              {dept.code}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-ink-3">
                          {dept.officersCount || 0} active officer(s) assigned
                        </span>
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingDept(dept);
                              setSelectedDirectorId(dept.directorId || '');
                            }}
                            className="p-1 rounded text-ink-3 hover:text-nib-gold-600 hover:bg-surface-2 transition"
                            title="Assign or Change Director"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(dept)}
                            className="p-1 rounded text-ink-3 hover:text-st-late hover:bg-surface-2 transition"
                            title="Delete Directorate"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-line/60 flex items-center justify-between">
                      <span className="text-[11px] text-ink-3 font-medium">Head Director:</span>
                      {dept.director ? (
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-st-done bg-st-done-bg border border-st-done/20 px-2 py-0.5 rounded-full">
                          <UserCheck className="w-3 h-3" />
                          <span>{dept.director.name}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (canEdit) {
                              setEditingDept(dept);
                              setSelectedDirectorId('');
                            }
                          }}
                          className={cn(
                            'flex items-center gap-1 text-[11px] text-st-wait bg-st-wait-bg border border-st-wait/20 px-2 py-0.5 rounded-full',
                            canEdit && 'hover:bg-st-wait-bg/80 cursor-pointer'
                          )}
                        >
                          <UserX className="w-3 h-3" />
                          <span>Unassigned {canEdit ? '(Click to assign)' : ''}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Create Directorate */}
      {isCreateOpen && (
        <div className={modalOverlayClass}>
          <div className="bg-surface rounded-xl shadow-overlay border border-line w-full max-w-lg overflow-hidden my-8">
            <div className="bg-nib-brown-800 text-nib-gold-100 px-6 py-4 flex items-center justify-between border-b border-nib-brown-700">
              <div>
                <h3 className="font-bold text-sm">Add New Directorate / Department</h3>
                <p className="text-[11px] text-nib-gold-200/70">Register a new department in the NIB governance structure</p>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="text-nib-gold-200/70 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {createError && (
                <div className="p-3 bg-st-late-bg border border-st-late/30 rounded-lg text-xs text-st-late flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <Field label="Directorate / Department Name" htmlFor="dept-name" required hint="e.g. Risk Analytics Directorate">
                <input
                  id="dept-name"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Digital Innovation & FinTech Directorate"
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Code / Acronym" htmlFor="dept-code" hint="Optional short abbreviation">
                  <input
                    id="dept-code"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    placeholder="e.g. DIFD"
                    className={cn(inputClass, 'font-mono uppercase')}
                  />
                </Field>

                <Field label="Parent Business Area" htmlFor="dept-ba" required>
                  <select
                    id="dept-ba"
                    value={newBusinessArea}
                    onChange={(e) => setNewBusinessArea(e.target.value)}
                    className={selectClass}
                  >
                    {businessAreas.map(ba => <option key={ba} value={ba}>{ba}</option>)}
                  </select>
                </Field>
              </div>

              <Field
                label="Designated Director (Head)"
                htmlFor="dept-director"
                hint="Only unassigned directors/chiefs are shown"
              >
                <select
                  id="dept-director"
                  value={newDirectorId}
                  onChange={(e) => setNewDirectorId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">-- No Director Assigned (Unassigned) --</option>
                  {availableForCreate.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.title})
                    </option>
                  ))}
                </select>
              </Field>

              <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={creating}>
                  Create Directorate
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Assign/Change Director */}
      {editingDept && (
        <div className={modalOverlayClass}>
          <div className="bg-surface rounded-xl shadow-overlay border border-line w-full max-w-md overflow-hidden my-8">
            <div className="bg-nib-brown-800 text-nib-gold-100 px-6 py-4 flex items-center justify-between border-b border-nib-brown-700">
              <div>
                <h3 className="font-bold text-sm">Assign Designated Director</h3>
                <p className="text-[11px] text-nib-gold-200/70">{editingDept.name}</p>
              </div>
              <button onClick={() => setEditingDept(null)} className="text-nib-gold-200/70 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateDirector} className="p-6 space-y-4">
              <Field
                label="Designated Director"
                htmlFor="assign-director"
                hint="Only available unassigned directors are shown"
              >
                <select
                  id="assign-director"
                  value={selectedDirectorId}
                  onChange={(e) => setSelectedDirectorId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">-- No Director Assigned (Unassigned) --</option>
                  {availableForEdit.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.title})
                    </option>
                  ))}
                </select>
              </Field>

              <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setEditingDept(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={updating}>
                  Save Assignment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
};
