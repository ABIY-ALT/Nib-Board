'use client';

import React, { useState } from 'react';
import { modalOverlayClass } from '@/components/ui/primitives';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { BODMatter } from '@/lib/types';
import { X, ShieldCheck, AlertCircle, RotateCcw, CheckCircle2 } from 'lucide-react';

interface ConfirmCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  matter: BODMatter;
  onSuccess: () => void;
}

export const ConfirmCompletionModal: React.FC<ConfirmCompletionModalProps> = ({
  isOpen,
  onClose,
  matter,
  onSuccess,
}) => {
  const { refreshMatters, refreshMetrics } = useAuth();
  const currentUser = useAuthenticatedUser();

  const [decision, setDecision] = useState<'Approved' | 'Revision Requested'>('Approved');
  const [reviewNotes, setReviewNotes] = useState('Implementation report verified against Board parameters and certified complete.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewNotes) {
      setError('Please provide review notes / rationale for your decision.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const res = await fetch(`/api/matters/${matter.id}/confirm-completion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reviewNotes,
          decision,
        }),
      });

      if (res.ok) {
        await refreshMatters();
        await refreshMetrics();
        onSuccess();
        onClose();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to review implementation');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className="bg-surface rounded-[--radius-card] shadow-overlay border border-line w-full max-w-lg overflow-hidden">
        
        {/* Header */}
        <div className="bg-teal-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500 text-white font-bold flex items-center justify-center text-sm shadow-card">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Review & Confirm Implementation</h3>
              <p className="text-[11px] text-teal-200">{matter.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-teal-200 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-st-late-bg text-st-late border border-st-late/30 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Decision */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider">
              Executive Review Decision *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`p-3 rounded-[--radius-card] border cursor-pointer transition flex flex-col justify-between ${
 decision === 'Approved'
                    ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/30'
                    : 'border-line bg-surface-2'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink flex items-center space-x-1 text-teal-700 dark:text-teal-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve & Confirm</span>
                  </span>
                  <input
                    type="radio"
                    name="decision"
                    value="Approved"
                    checked={decision === 'Approved'}
                    onChange={() => setDecision('Approved')}
                    className="text-teal-600 focus:ring-teal-500"
                  />
                </div>
                <p className="text-[11px] text-ink-3 mt-1">
                  Confirms operational fulfillment and routes to Board Secretariat for formal archiving.
                </p>
              </label>

              <label
                className={`p-3 rounded-[--radius-card] border cursor-pointer transition flex flex-col justify-between ${
 decision === 'Revision Requested'
                    ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30'
                    : 'border-line bg-surface-2'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink flex items-center space-x-1 text-rose-700 dark:text-rose-400">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Request Revision</span>
                  </span>
                  <input
                    type="radio"
                    name="decision"
                    value="Revision Requested"
                    checked={decision === 'Revision Requested'}
                    onChange={() => setDecision('Revision Requested')}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                </div>
                <p className="text-[11px] text-ink-3 mt-1">
                  Reopens matter back to Director with detailed instructions for missing items.
                </p>
              </label>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">
              Executive Evaluation Notes *
            </label>
            <textarea
              required
              rows={3}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Provide constructive feedback, verification notes, or approval remarks..."
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-teal-500"
            ></textarea>
          </div>

          <div className="pt-3 border-t border-line flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-line-strong text-ink-2 text-xs font-medium hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-card transition disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Save Executive Review'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
