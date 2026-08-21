'use client';

import React, { useState } from 'react';
import { modalOverlayClass } from '@/components/ui/primitives';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { BODMatter } from '@/lib/types';
import { X, Lock, ShieldCheck, AlertCircle } from 'lucide-react';

interface CloseMatterModalProps {
  isOpen: boolean;
  onClose: () => void;
  matter: BODMatter;
  onSuccess: () => void;
}

export const CloseMatterModal: React.FC<CloseMatterModalProps> = ({
  isOpen,
  onClose,
  matter,
  onSuccess,
}) => {
  const { refreshMatters, refreshMetrics } = useAuth();
  const currentUser = useAuthenticatedUser();
  const [closureNotes, setClosureNotes] = useState('All Board directives and reporting mandates fully executed, verified, and archived in NIB institutional governance records.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closureNotes) {
      setError('Please provide closure notes.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const res = await fetch(`/api/matters/${matter.id}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          closureNotes,
        }),
      });

      if (res.ok) {
        await refreshMatters();
        await refreshMetrics();
        onSuccess();
        onClose();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to close matter');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className="bg-surface rounded-[--radius-card] shadow-overlay border border-line w-full max-w-md overflow-hidden">
        
        <div className="bg-nib-brown-800 text-nib-gold-100 px-6 py-4 flex items-center justify-between border-b border-nib-brown-700">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-nib-gold-500 text-nib-brown-900 font-bold flex items-center justify-center text-sm shadow-card">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Formal Matter Closure</h3>
              <p className="text-[11px] text-ink-3">{matter.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-white p-1 rounded-lg">
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

          <div className="p-3 bg-st-done-bg dark:bg-emerald-950/30 rounded-lg border border-st-done/25 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200">
            <p className="font-semibold text-xs">GOVERNANCE ARCHIVAL NOTICE:</p>
            <p className="text-[11px] mt-0.5">
              Closing this matter locks the official state to <strong>Closed</strong> and archives the full audit ledger for Board of Directors review.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">
              Final Closure Notes &amp; Governance Remarks *
            </label>
            <textarea
              required
              rows={3}
              value={closureNotes}
              onChange={(e) => setClosureNotes(e.target.value)}
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-nib-gold-500"
            ></textarea>
          </div>

          <div className="pt-3 border-t border-line flex items-center justify-end space-x-3">
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
              className="px-5 py-2 rounded-lg bg-nib-brown-800 hover:bg-nib-brown-900 text-nib-gold-100 font-bold text-xs shadow-card transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Closing...' : 'Formally Close Matter'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
