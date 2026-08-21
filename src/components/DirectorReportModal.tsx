'use client';

import React, { useState } from 'react';
import { ACCEPT_ATTRIBUTE, uploadDocument } from '@/lib/documents';
import { modalOverlayClass, FilePicker } from '@/components/ui/primitives';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { BODMatter } from '@/lib/types';
import { X, FileCheck, Upload, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface DirectorReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  matter: BODMatter;
  onSuccess: () => void;
}

export const DirectorReportModal: React.FC<DirectorReportModalProps> = ({
  isOpen,
  onClose,
  matter,
  onSuccess,
}) => {
  const { refreshMatters, refreshMetrics } = useAuth();
  const currentUser = useAuthenticatedUser();

  const [actionTaken, setActionTaken] = useState('');
  const [whatWasImplemented, setWhatWasImplemented] = useState('');
  const [implementationDate, setImplementationDate] = useState(new Date().toISOString().split('T')[0]);
  const [responsibleArea, setResponsibleArea] = useState(matter.businessArea || currentUser.businessArea);
  const [resultOutcome, setResultOutcome] = useState('');
  const [currentCondition, setCurrentCondition] = useState('');
  const [remainingIssues, setRemainingIssues] = useState('None');
  const [reasonForPartialNonImplementation, setReasonForPartial] = useState('');
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0]);
  const [completionStatus, setCompletionStatus] = useState<'Completed' | 'Partially Completed' | 'Ongoing Monitoring'>('Completed');
  const [comments, setComments] = useState('');

  // Proof that the work was actually done. Uploaded as a real file against the
  // matter before the report is submitted, so the report and its evidence
  // arrive together for the reviewer.
  const [evidence, setEvidence] = useState<File | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionTaken || !whatWasImplemented || !implementationDate || !resultOutcome || !currentCondition || !completionDate) {
      setError('Please provide complete answers to all mandatory implementation report questions.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      // Evidence first: the reviewer should never open a submitted report and
      // find the proof still missing. A failed upload stops the submission
      // rather than filing a report that claims evidence it does not have.
      if (evidence) {
        try {
          await uploadDocument(matter.id, evidence, {
            category: 'IMPLEMENTATION_EVIDENCE',
            description: 'Director sign-off and operational proof of implementation',
          });
        } catch (uploadErr) {
          setError(
            uploadErr instanceof Error
              ? `The evidence file could not be attached, so the report was not submitted: ${uploadErr.message}`
              : 'The evidence file could not be attached, so the report was not submitted.'
          );
          return;
        }
      }

      const res = await fetch(`/api/matters/${matter.id}/submit-implementation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actionTaken,
          whatWasImplemented,
          implementationDate,
          responsibleArea,
          resultOutcome,
          currentCondition,
          remainingIssues,
          reasonForPartialNonImplementation: completionStatus !== 'Completed' ? reasonForPartialNonImplementation : undefined,
          comments,
          completionDate,
          completionStatus,
        }),
      });

      if (res.ok) {
        await refreshMatters();
        await refreshMetrics();
        onSuccess();
        onClose();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to submit implementation report');
      }
    } catch (err: any) {
      setError(err.message || 'Network error submitting report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className="bg-surface rounded-[--radius-card] shadow-overlay border border-line w-full max-w-3xl overflow-hidden my-6">
        
        {/* Modal Header */}
        <div className="bg-nib-brown-800 text-nib-gold-100 px-6 py-4 flex items-center justify-between border-b border-nib-brown-700">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white font-bold flex items-center justify-center text-sm shadow-card">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Official Implementation Report</h3>
              <p className="text-[11px] text-emerald-200">
                Execution &amp; Operational Account for {matter.id} ({matter.matterType})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-2 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs max-h-[82vh] overflow-y-auto">
          
          <div className="p-3 bg-nib-gold-100 rounded-[--radius-card] border border-nib-gold-200 text-nib-brown-800 dark:text-nib-gold-200">
            <p className="font-semibold text-xs">
              MANDATORY GOVERNANCE QUESTION:
            </p>
            <p className="text-[11px] mt-0.5">
             "What was concretely done about this Board decision / directive / resolution / instruction?"
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-st-late-bg text-st-late border border-st-late/30 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Action Taken */}
          <div>
            <label className="block text-[11px] font-bold text-ink uppercase tracking-wider mb-1">
              1. Concrete Action Taken *
            </label>
            <textarea
              required
              rows={2}
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              placeholder="Detail the exact administrative, procedural, or operational steps initiated (e.g. Standard Operating Procedure drafted, system parameter hard limits enabled, staff training rolled out)..."
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-emerald-500"
            ></textarea>
          </div>

          {/* 2. What Was Implemented */}
          <div>
            <label className="block text-[11px] font-bold text-ink uppercase tracking-wider mb-1">
              2. What Was Implemented *
            </label>
            <textarea
              required
              rows={2}
              value={whatWasImplemented}
              onChange={(e) => setWhatWasImplemented(e.target.value)}
              placeholder="List specific operational components, systems, controls, or branch processes now active..."
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-emerald-500"
            ></textarea>
          </div>

          {/* 3. Result / Outcome Achieved */}
          <div>
            <label className="block text-[11px] font-bold text-ink uppercase tracking-wider mb-1">
              3. Measurable Result / Outcome *
            </label>
            <textarea
              required
              rows={2}
              value={resultOutcome}
              onChange={(e) => setResultOutcome(e.target.value)}
              placeholder="Explain the tangible business outcome, turnaround time drop, compliance audit clearance, error reduction rate, or client coverage achieved..."
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-emerald-500"
            ></textarea>
          </div>

          {/* 4. Current Condition */}
          <div>
            <label className="block text-[11px] font-bold text-ink uppercase tracking-wider mb-1">
              4. Current Operational Condition *
            </label>
            <input
              type="text"
              required
              value={currentCondition}
              onChange={(e) => setCurrentCondition(e.target.value)}
              placeholder="e.g. Fully operational across all 240+ branches with live dashboard surveillance enabled"
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Grid: Dates, Area, Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
                Implementation Date *
              </label>
              <input
                type="date"
                required
                value={implementationDate}
                onChange={(e) => setImplementationDate(e.target.value)}
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
                Completion Sign-Off Date *
              </label>
              <input
                type="date"
                required
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
                Completion Status *
              </label>
              <select
                value={completionStatus}
                onChange={(e) => setCompletionStatus(e.target.value as any)}
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs text-ink font-bold text-st-done"
              >
                <option value="Completed">Completed in Full</option>
                <option value="Partially Completed">Partially Completed (Staged)</option>
                <option value="Ongoing Monitoring">Ongoing Monitoring</option>
              </select>
            </div>
          </div>

          {/* Remaining Issues & Partial Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
                Remaining Issues (if any)
              </label>
              <input
                type="text"
                value={remainingIssues}
                onChange={(e) => setRemainingIssues(e.target.value)}
                placeholder="e.g. None or Minor IT ticket queue"
                className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs text-ink"
              />
            </div>

            {completionStatus !== 'Completed' && (
              <div>
                <label className="block text-[10px] font-bold text-nib-gold-600 uppercase mb-1">
                  Reason for Partial Implementation *
                </label>
                <input
                  type="text"
                  required
                  value={reasonForPartialNonImplementation}
                  onChange={(e) => setReasonForPartial(e.target.value)}
                  placeholder="Explain phase 2 milestones or vendor dependencies..."
                  className="w-full bg-surface-2 border border-nib-gold-400 rounded-lg p-2 text-xs text-ink"
                />
              </div>
            )}
          </div>

          {/* Evidence File Attachment */}
          <div className="p-3 bg-surface-2 rounded-[--radius-card] border border-line">
            <div className="flex items-center gap-2 mb-2">
              <Upload className="w-3.5 h-3.5 text-nib-gold-600" />
              <div>
                <span className="font-semibold text-ink text-xs">
                  Supporting Evidence / Attachments <span className="text-ink-3 font-normal">(Optional)</span>
                </span>
                <p className="text-[10px] text-ink-3">
                  Upload signed memos, audit sign-offs, or certificates if available. Written explanation above is mandatory.
                </p>
              </div>
            </div>
            <FilePicker
              id="report-evidence"
              file={evidence}
              onPick={setEvidence}
              accept={ACCEPT_ATTRIBUTE}
              disabled={isSubmitting}
            />
          </div>

          {/* General Officer Comments */}
          <div>
            <label className="block text-[10px] font-semibold text-ink-3 uppercase mb-1">
              Implementing Officer Remarks &amp; Conclusion
            </label>
            <input
              type="text"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="e.g. Directive fully satisfied ahead of deadline. Ready for executive confirmation."
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs text-ink"
            />
          </div>

          {/* Footer */}
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
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-card transition disabled:opacity-50 flex items-center space-x-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Submitting...' : 'Submit Implementation Report for Review'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
