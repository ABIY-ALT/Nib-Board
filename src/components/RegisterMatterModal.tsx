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

export const RegisterMatterModal: React.FC<RegisterMatterModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { allUsers, matterTypes, refreshMatters, refreshMetrics } = useAuth();
  const currentUser = useAuthenticatedUser();

  const [resolutionNumber, setResolutionNumber] = useState(`NIB/BOD/RES/${new Date().getFullYear()}/${Math.floor(100 + Math.random() * 900)}`);
  const [matterType, setMatterType] = useState<MatterType>('Directive');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [boardMeetingDate, setBoardMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [boardDecisionDate, setBoardDecisionDate] = useState(new Date().toISOString().split('T')[0]);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [priority, setPriority] = useState<Priority>('High');
  
  // Default deadline 30 days ahead
  const defaultDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [deadline, setDeadline] = useState(defaultDeadline);
  
  const [businessArea, setBusinessArea] = useState('Banking Operations');
  const [responsibleChiefId, setResponsibleChiefId] = useState('');
  const [responsibleDeputyChiefId, setResponsibleDeputyChiefId] = useState('');
  const [responsibleDirectorId, setResponsibleDirectorId] = useState('');
  const [initialRouteToCeo, setInitialRouteToCeo] = useState(true);
  const [comment, setComment] = useState('Official Board Direction registered into NIB Governance system.');
  
  // The Board paper itself. Optional at registration — the Secretariat
  // sometimes registers a decision before the signed minute is circulated — but
  // when one is chosen it is uploaded for real, not described.
  const [boardPaper, setBoardPaper] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  // Filter users by role
  const chiefs = allUsers.filter((u) => u.role === 'CHIEF');
  const deputyChiefs = allUsers.filter((u) => u.role === 'DEPUTY_CHIEF');
  const directors = allUsers.filter((u) => u.role === 'DIRECTOR');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionNumber || !title || !description) {
      setError('Please fill in all mandatory fields (Resolution #, Title, Description, Deadline).');
      return;
    }
    if (!initialRouteToCeo && !responsibleDirectorId) {
      setError('Please select a responsible Director when bypassing CEO workflow.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const res = await fetch('/api/matters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resolutionNumber,
          matterType,
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
              <h3 className="font-bold text-sm">Register Official Board Matter</h3>
              <p className="text-[11px] text-ink-2">Board Secretariat Governance Registration Engine</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-3 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
          
          {error && (
            <div className="p-3 rounded-lg bg-st-late-bg text-st-late border border-st-late/30 text-xs flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Identification Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div>
              <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">
                BOD Resolution / Ref Number *
              </label>
              <input
                type="text"
                required
                value={resolutionNumber}
                onChange={(e) => setResolutionNumber(e.target.value)}
                placeholder="e.g. NIB/BOD/DIR/2026/025"
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink font-mono focus:ring-2 focus:ring-nib-gold-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">
                Matter Type *
              </label>
              <select
                value={matterType}
                onChange={(e) => setMatterType(e.target.value as MatterType)}
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-nib-gold-500 font-semibold"
              >
                {matterTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

          </div>

          {/* Title */}
          <div>
            <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">
              Title / Official Subject *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implementation of New Customer Complaint Procedure & 48-Hour Resolution Framework"
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-nib-gold-500 font-medium"
            />
          </div>

          {/* Detailed Direction / Description */}
          <div>
            <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">
              Board Mandate & Implementation Scope Description *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide exact verbatim directive text from the Board resolution, specific execution parameters, and requirements..."
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-nib-gold-500"
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
            <h4 className="font-bold text-ink uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
              <Building className="w-3.5 h-3.5 text-nib-gold-600" />
              <span>Organizational Hierarchy & Destination Directorate</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              <div>
                <label className="block text-[10px] font-semibold text-ink-3 mb-1">
                  Responsible Business Area *
                </label>
                <select
                  value={businessArea}
                  onChange={(e) => setBusinessArea(e.target.value)}
                  className="w-full bg-surface border border-line-strong rounded-lg p-2 text-xs text-ink"
                >
                  <option value="Banking Operations">Banking Operations</option>
                  <option value="Retail Banking">Retail Banking</option>
                  <option value="Risk & Compliance">Risk & Compliance</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Human Capital & Administration">Human Capital & Administration</option>
                  <option value="Finance & Accounts">Finance & Accounts</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-ink-3 mb-1">
                  Responsible Chief (Optional / Staged Route)
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
                  Responsible Deputy Chief (Optional)
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

              <div>
                <label className="block text-[10px] font-semibold text-ink-3 mb-1">
                  Responsible Director {initialRouteToCeo ? '(Optional — Assignable by CEO)' : '*'}
                </label>
                <select
                  required={!initialRouteToCeo}
                  value={responsibleDirectorId}
                  onChange={(e) => setResponsibleDirectorId(e.target.value)}
                  className="w-full bg-surface border border-line-strong rounded-lg p-2 text-xs text-ink"
                >
                  <option value="">
                    {initialRouteToCeo
                      ? '-- Assign downstream via CEO workflow --'
                      : '-- Select Responsible Director * --'}
                  </option>
                  {directors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.title}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            <div className="pt-2 border-t border-line">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={initialRouteToCeo}
                  onChange={(e) => setInitialRouteToCeo(e.target.checked)}
                  className="rounded text-nib-gold-600 focus:ring-nib-gold-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-ink">
                  Follow standard Board workflow: Route to CEO for hierarchical review &amp; assignment (Default)
                </span>
              </label>
              <p className="text-[11px] text-ink-3 ml-6 mt-0.5">
                The matter is sent to the CEO Office first, where executive leadership reviews and assigns it down the chain.
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
