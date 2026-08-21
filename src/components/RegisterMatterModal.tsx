'use client';

import React, { useState } from 'react';
import { ACCEPT_ATTRIBUTE, uploadDocument } from '@/lib/documents';
import { modalOverlayClass, FilePicker } from '@/components/ui/primitives';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { MatterType, Priority } from '@/lib/types';
import { X, Plus, Upload, Building, Calendar, Layers, ShieldAlert, FileText } from 'lucide-react';

interface RegisterMatterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (matterId: string) => void;
}

function getRefPrefix(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('directive')) return 'DIR';
  if (t.includes('resolution')) return 'RES';
  if (t.includes('decision')) return 'DEC';
  if (t.includes('instruction')) return 'INS';
  if (t.includes('policy') || t.includes('rule')) return 'POL';
  return 'REF';
}

function generateRef(type: string): string {
  const code = getRefPrefix(type);
  const year = new Date().getFullYear();
  const rand = Math.floor(100 + Math.random() * 900);
  return `NIB/BOD/${code}/${year}/${rand}`;
}

export const RegisterMatterModal: React.FC<RegisterMatterModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { allUsers, matterTypes, refreshMatters, refreshMetrics } = useAuth();
  const currentUser = useAuthenticatedUser();

  const [matterType, setMatterType] = useState<MatterType>('Directive');
  const [resolutionNumber, setResolutionNumber] = useState(generateRef('Directive'));
  const [customMatterType, setCustomMatterType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [boardMeetingDate, setBoardMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [boardDecisionDate, setBoardDecisionDate] = useState(new Date().toISOString().split('T')[0]);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [priority, setPriority] = useState<Priority>('High');
  
  // Default deadline 30 days ahead
  const defaultDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [deadline, setDeadline] = useState(defaultDeadline);
  
  const [businessArea, setBusinessArea] = useState('Bank-Wide / Executive Management');
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; businessArea: string; directorId?: string | null }>>([]);
  const [responsibleChiefId, setResponsibleChiefId] = useState('');
  const [responsibleDeputyChiefId, setResponsibleDeputyChiefId] = useState('');
  const [responsibleDirectorId, setResponsibleDirectorId] = useState('');
  const [initialRouteToCeo, setInitialRouteToCeo] = useState(true);
  const [directCeoExecution, setDirectCeoExecution] = useState(false);
  const [comment, setComment] = useState('Official Board Direction registered into NIB Governance system.');

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/departments');
        if (res.ok) {
          const data = await res.json();
          if (data.departments?.length) setDepartments(data.departments);
        }
      } catch {
        // Ignored
      }
    })();
  }, []);
  
  // The Board paper itself. Optional at registration — the Secretariat
  // sometimes registers a decision before the signed minute is circulated — but
  // when one is chosen it is uploaded for real, not described.
  const [boardPaper, setBoardPaper] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  // Filter users by role
  const ceoUser = allUsers.find((u) => u.role === 'CEO');
  const chiefs = allUsers.filter((u) => u.role === 'CHIEF');
  const deputyChiefs = allUsers.filter((u) => u.role === 'DEPUTY_CHIEF');
  const directors = allUsers.filter((u) => u.role === 'DIRECTOR');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionNumber || !title || !description) {
      setError('Please fill in all mandatory fields (Resolution #, Title, Description, Deadline).');
      return;
    }
    if (matterType === 'Other Board Direction' && !customMatterType.trim()) {
      setError('Please specify the written name for the custom Board Direction / Matter Type.');
      return;
    }
    if (!initialRouteToCeo && !directCeoExecution && !responsibleDirectorId && !responsibleDeputyChiefId && !responsibleChiefId) {
      setError('Please select at least one responsible recipient (CEO Direct Execution, Chief, Deputy Chief, or Director) when bypassing standard CEO review.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const effectiveMatterType =
        matterType === 'Other Board Direction' && customMatterType.trim()
          ? customMatterType.trim()
          : matterType;

      const res = await fetch('/api/matters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resolutionNumber,
          matterType: effectiveMatterType,
          title,
          description,
          boardMeetingDate,
          boardDecisionDate,
          effectiveDate,
          priority,
          deadline,
          businessArea,
          responsibleChiefId: responsibleChiefId || undefined,
          responsibleDeputyChiefId: responsibleDeputyChiefId || undefined,
          responsibleDirectorId: responsibleDirectorId || undefined,
          initialRouteToCeo,
          directCeoExecution,
          comment,
        }),
      });

      if (res.ok) {
        const created = await res.json();

        // The document endpoint is matter-scoped, so the paper can only be
        // attached once the matter exists. A failure here leaves a registered
        // matter with no attachment rather than losing the registration —
        // which is why it is reported as its own message.
        if (boardPaper) {
          try {
            await uploadDocument(created.id, boardPaper, {
              category: 'ORIGINAL_BOARD_DOC',
              description: 'Signed Board extract / minute registered with the matter',
            });
          } catch (uploadErr) {
            await refreshMatters();
            setError(
              `${created.id} was registered, but the Board paper could not be attached: ${
                uploadErr instanceof Error ? uploadErr.message : 'upload failed'
              } You can attach it from the matter's Documents tab.`
            );
            return;
          }
        }

        await refreshMatters();
        await refreshMetrics();
        onSuccess(created.id);
        onClose();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to register BOD matter');
      }
    } catch (err: any) {
      setError(err.message || 'Network error registering matter');
    } finally {
      setIsSubmitting(false);
    }
  };

  const directTargetUser = !initialRouteToCeo
    ? (directCeoExecution
        ? ceoUser
        : (directors.find((d) => d.id === responsibleDirectorId) ||
           deputyChiefs.find((d) => d.id === responsibleDeputyChiefId) ||
           chiefs.find((c) => c.id === responsibleChiefId)))
    : null;

  return (
    <div className={modalOverlayClass}>
      <div className="bg-surface rounded-[--radius-card] shadow-overlay border border-line w-full max-w-3xl overflow-hidden my-8">
        
        {/* Modal Header */}
        <div className="bg-nib-brown-800 text-nib-gold-100 px-6 py-4 flex items-center justify-between border-b border-[#1f426b]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-nib-gold-500 text-nib-brown-900 font-extrabold flex items-center justify-center text-sm shadow-card">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Register Board Matter</h3>
              <p className="text-[11px] text-nib-gold-200/80">
                Official Governance Directive / Resolution from Board of Directors
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-nib-gold-200/80 hover:text-white transition p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-lg text-red-200 text-xs flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Reference and Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
                Matter Type *
              </label>
              <select
                value={matterType}
                onChange={(e) => {
                  const newType = e.target.value as MatterType;
                  const currentPrefix = getRefPrefix(matterType);
                  const newPrefix = getRefPrefix(newType);
                  setMatterType(newType);
                  if (resolutionNumber.startsWith(`NIB/BOD/${currentPrefix}/`)) {
                    setResolutionNumber(
                      resolutionNumber.replace(`NIB/BOD/${currentPrefix}/`, `NIB/BOD/${newPrefix}/`)
                    );
                  } else if (resolutionNumber.startsWith('NIB/BOD/')) {
                    setResolutionNumber(generateRef(newType));
                  }
                }}
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs font-semibold text-ink"
              >
                {matterTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
                {matterType === 'Policy / Rule'
                  ? 'Policy / Rule Ref # *'
                  : matterType === 'Directive'
                  ? 'Directive Ref # *'
                  : matterType === 'Resolution'
                  ? 'Resolution Ref # *'
                  : matterType === 'Decision'
                  ? 'Decision Ref # *'
                  : matterType === 'Instruction'
                  ? 'Instruction Ref # *'
                  : 'Official Document Ref # *'}
              </label>
              <input
                type="text"
                required
                value={resolutionNumber}
                onChange={(e) => setResolutionNumber(e.target.value)}
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs font-mono text-ink"
              />
            </div>
          </div>

          {matterType === 'Other Board Direction' && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <label className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase mb-1">
                Specify Custom Written Matter Type / Category *
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Board Special Recommendation, Audit Inquiry, Circular Mandate..."
                value={customMatterType}
                onChange={(e) => setCustomMatterType(e.target.value)}
                className="w-full bg-surface-2 border border-amber-500/40 rounded-lg p-2 text-xs font-medium text-ink focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
              Title / Subject *
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Enhancement of Core Banking Infrastructure Security"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs font-medium text-ink"
            />
          </div>

          {/* Detailed Direction / Description */}
          <div>
            <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
              Resolution Detail / Directive Scope *
            </label>
            <textarea
              required
              rows={3}
              placeholder="Extract verbatim directives or specific executive mandates..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs text-ink resize-none"
            ></textarea>
          </div>

          {/* Dates & Priority Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            
            <div>
              <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
                Meeting Date
              </label>
              <input
                type="date"
                value={boardMeetingDate}
                onChange={(e) => setBoardMeetingDate(e.target.value)}
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
                Decision Date *
              </label>
              <input
                type="date"
                required
                value={boardDecisionDate}
                onChange={(e) => setBoardDecisionDate(e.target.value)}
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs text-ink"
              >
                <option value="Urgent">Urgent</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
                Target Deadline *
              </label>
              <input
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs text-ink font-semibold text-nib-gold-600"
              />
            </div>

          </div>

          {/* Organizational Routing & Assignment */}
          <div className="p-4 bg-surface-2 rounded-[--radius-card] border border-line space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-ink uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                <Building className="w-3.5 h-3.5 text-nib-gold-600" />
                <span>Organizational Hierarchy &amp; Destination Assignment</span>
              </h4>
              {!initialRouteToCeo && (
                <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold px-2 py-0.5 rounded border border-amber-500/30">
                  Direct Assignment Mode (CEO Step Bypassed)
                </span>
              )}
            </div>

            {!initialRouteToCeo && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={directCeoExecution}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setDirectCeoExecution(val);
                      if (val) {
                        setResponsibleDirectorId('');
                        setResponsibleDeputyChiefId('');
                        setResponsibleChiefId('');
                      }
                    }}
                    className="rounded text-nib-gold-600 focus:ring-nib-gold-500 w-4 h-4"
                  />
                  <span className="text-xs font-bold text-ink">
                    Assign directly to CEO for Personal Executive Execution (Self-Owned Directive)
                  </span>
                </label>
                <p className="text-[11px] text-ink-3 ml-6">
                  Check this for high-level bank directives (e.g. strategic initiatives, governance, Board policies) where the CEO directly executes and submits the final Implementation Report to the Board Secretariat.
                </p>
              </div>
            )}

            {!directCeoExecution && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                <div>
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">
                    Target Directorate (Auto-selects Area &amp; Director)
                  </label>
                  <select
                    value={targetDepartmentId}
                    onChange={(e) => {
                      const dId = e.target.value;
                      setTargetDepartmentId(dId);
                      const found = departments.find((d) => d.id === dId);
                      if (found) {
                        setBusinessArea(found.businessArea);
                        if (found.directorId) {
                          setResponsibleDirectorId(found.directorId);
                        }
                      }
                    }}
                    className="w-full bg-surface border border-line-strong rounded-lg p-2 text-xs text-ink"
                  >
                    <option value="">-- Direct / Unspecified Directorate --</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name} ({dept.businessArea})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">
                    Responsible Business Area
                  </label>
                  <select
                    value={businessArea}
                    onChange={(e) => setBusinessArea(e.target.value)}
                    className="w-full bg-surface border border-line-strong rounded-lg p-2 text-xs text-ink"
                  >
                    <option value="Bank-Wide / Executive Management">Bank-Wide / Executive Management</option>
                    <option value="Board Secretariat">Board Secretariat</option>
                    <option value="Banking Operations">Banking Operations</option>
                    <option value="Retail Banking">Retail Banking</option>
                    <option value="Risk & Compliance">Risk & Compliance</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Human Capital & Administration">Human Capital & Administration</option>
                    <option value="Finance & Accounts">Finance & Accounts</option>
                    <option value="Strategic Planning & Business Development">Strategic Planning &amp; Business Development</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">
                    Responsible Chief {!initialRouteToCeo && !responsibleDirectorId && !responsibleDeputyChiefId && responsibleChiefId ? '(Direct Assignee)' : '(Optional / Executive Oversight)'}
                  </label>
                  <select
                    value={responsibleChiefId}
                    onChange={(e) => setResponsibleChiefId(e.target.value)}
                    className="w-full bg-surface border border-line-strong rounded-lg p-2 text-xs text-ink"
                  >
                    <option value="">-- Direct / Unassigned Chief --</option>
                    {chiefs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.title})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">
                    Responsible Deputy Chief {!initialRouteToCeo && !responsibleDirectorId && responsibleDeputyChiefId ? '(Direct Assignee)' : '(Optional)'}
                  </label>
                  <select
                    value={responsibleDeputyChiefId}
                    onChange={(e) => setResponsibleDeputyChiefId(e.target.value)}
                    className="w-full bg-surface border border-line-strong rounded-lg p-2 text-xs text-ink"
                  >
                    <option value="">-- None / Skip Deputy Chief --</option>
                    {deputyChiefs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.title})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-ink-3 mb-1">
                    Responsible Director {!initialRouteToCeo && responsibleDirectorId ? '(Direct Assignee)' : initialRouteToCeo ? '(Optional — Assignable by CEO)' : '(Optional if Chief/Deputy assigned)'}
                  </label>
                  <select
                    value={responsibleDirectorId}
                    onChange={(e) => setResponsibleDirectorId(e.target.value)}
                    className="w-full bg-surface border border-line-strong rounded-lg p-2 text-xs text-ink"
                  >
                    <option value="">
                      {initialRouteToCeo
                        ? '-- Assign downstream via CEO workflow --'
                        : '-- Select Responsible Director (or leave blank if assigning to Chief/Deputy) --'}
                    </option>
                    {directors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {d.title}
                      </option>
                    ))}
                  </select>
                </div>

              </div>
            )}

            {!initialRouteToCeo && directTargetUser && (
              <div className="p-2.5 bg-surface rounded-lg border border-line flex items-center justify-between text-xs">
                <span className="text-ink-3 text-[11px]">Immediate Direct Assignee:</span>
                <span className="font-semibold text-nib-gold-600">
                  {directTargetUser.name} ({directTargetUser.title})
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-line">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={initialRouteToCeo}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setInitialRouteToCeo(val);
                    if (val) setDirectCeoExecution(false);
                  }}
                  className="rounded text-nib-gold-600 focus:ring-nib-gold-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-ink">
                  Follow standard Board workflow: Route to CEO for hierarchical review &amp; assignment (Default)
                </span>
              </label>
              <p className="text-[11px] text-ink-3 ml-6 mt-0.5">
                {initialRouteToCeo
                  ? 'The matter is sent to the CEO Office first, where executive leadership reviews and assigns it down the chain.'
                  : 'Unchecked: The matter bypasses the standard CEO review-and-assign queue and is assigned directly to the chosen executive/director above.'}
              </p>
            </div>
          </div>

          {/* The signed Board paper */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Upload className="w-3.5 h-3.5 text-ink-3" />
              <span className="text-[12px] font-semibold text-ink-2">
                Board extract / minute
              </span>
              <span className="text-[11px] text-ink-3">optional</span>
            </div>
            <FilePicker
              id="register-board-paper"
              file={boardPaper}
              onPick={setBoardPaper}
              accept={ACCEPT_ATTRIBUTE}
              disabled={isSubmitting}
            />
            <p className="text-[11px] text-ink-3 mt-1">
              Filed in the bank&apos;s document archive and fingerprinted with SHA-256. It can
              also be attached later from the matter&apos;s Documents tab.
            </p>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-line flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-line-strong text-ink-2 text-xs font-medium hover:bg-surface-2 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-nib-gold-500 hover:bg-nib-gold-600 text-nib-brown-900 font-bold text-xs shadow-card transition disabled:opacity-50"
            >
              {isSubmitting ? 'Registering...' : 'Register Official BOD Matter'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
