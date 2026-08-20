'use client';

import React, { useState } from 'react';
import { modalOverlayClass } from '@/components/ui/primitives';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { BODMatter, ClarificationThread } from '@/lib/types';
import { X, HelpCircle, Send, MessageSquare, AlertCircle } from 'lucide-react';

interface ClarificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  matter: BODMatter;
  replyThread?: ClarificationThread | null;
  onSuccess: () => void;
}

export const ClarificationModal: React.FC<ClarificationModalProps> = ({
  isOpen,
  onClose,
  matter,
  replyThread,
  onSuccess,
}) => {
  const { allUsers, refreshMatters } = useAuth();
  const currentUser = useAuthenticatedUser();
  
  const [requestedTo, setRequestedTo] = useState('');
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const isReplyMode = !!replyThread;

  // Eligible people to ask: Board Members, Secretariat, CEO, Chiefs, Directors
  const eligibleRecipients = allUsers.filter((u) => u.id !== currentUser.id && ['BOARD_SECRETARIAT', 'BOARD_MEMBER', 'CEO', 'CHIEF', 'DEPUTY_CHIEF', 'DIRECTOR', 'ADMIN'].includes(u.role));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReplyMode && (!requestedTo || !question)) {
      setError('Please select recipient and write question.');
      return;
    }
    if (isReplyMode && !response) {
      setError('Please provide written answer.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      let res;
      if (isReplyMode && replyThread) {
        res = await fetch(`/api/matters/${matter.id}/clarifications/${replyThread.id}/reply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ responseText: response }),
        });
      } else {
        res = await fetch(`/api/matters/${matter.id}/clarifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetUserId: requestedTo,
            question,
          }),
        });
      }

      if (res.ok) {
        await refreshMatters();
        onSuccess();
        onClose();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to submit clarification');
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
        
        <div className="bg-nib-gold-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-nib-gold-500 text-white font-bold flex items-center justify-center text-sm shadow-card">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">
                {isReplyMode ? 'Answer Clarification / Direction' : currentUser.role === 'BOARD_MEMBER' ? 'Issue Board Direction / Clarification' : 'Request Clarification / Direction'}
              </h3>
              <p className="text-[11px] opacity-80">
                {isReplyMode ? `Responding to ${replyThread?.requesterName}` : 'Official guidance recorded in immutable audit log'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-nib-gold-100 hover:text-white p-1 rounded-lg">
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

          {isReplyMode && replyThread ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-surface-2 border border-line">
                <span className="text-[10px] text-ink-3 font-bold uppercase block">
                  Question Asked by {replyThread.requesterName} ({replyThread.requesterTitle}):
                </span>
                <p className="text-ink mt-1 italic">
                 "{replyThread.question}"
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">
                  Your Official Clarification Answer *
                </label>
                <textarea
                  required
                  rows={4}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="Provide definitive guidance or scope boundary explanation..."
                  className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-nib-gold-500"
                ></textarea>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">
                  Direct Inquire To *
                </label>
                <select
                  required
                  value={requestedTo}
                  onChange={(e) => setRequestedTo(e.target.value)}
                  className="w-full bg-surface-2 border border-line-strong rounded-lg p-2 text-xs text-ink"
                >
                  <option value="">-- Select Recipient Official --</option>
                  {eligibleRecipients.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.title} - {u.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">
                  Specific Clarification Question / Ambiguity *
                </label>
                <textarea
                  required
                  rows={4}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Describe the specific clause, ambiguity, or operational constraint needing direction..."
                  className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-nib-gold-500"
                ></textarea>
              </div>
            </div>
          )}

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
              className="px-5 py-2 rounded-lg bg-nib-gold-600 hover:bg-nib-gold-700 text-white font-bold text-xs shadow-card transition disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : isReplyMode ? 'Transmit Official Answer' : 'Submit Inquire'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
