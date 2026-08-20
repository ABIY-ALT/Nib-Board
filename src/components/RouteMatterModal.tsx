'use client';

import React, { useState } from 'react';
import { modalOverlayClass } from '@/components/ui/primitives';
import { useAuth, useAuthenticatedUser } from '@/context/AuthContext';
import { BODMatter } from '@/lib/types';
import { X, Send, UserCheck, AlertCircle, ArrowRight } from 'lucide-react';

interface RouteMatterModalProps {
  isOpen: boolean;
  onClose: () => void;
  matter: BODMatter;
  onSuccess: () => void;
}

export const RouteMatterModal: React.FC<RouteMatterModalProps> = ({
  isOpen,
  onClose,
  matter,
  onSuccess,
}) => {
  const { allUsers, refreshMatters, refreshMetrics } = useAuth();
  const currentUser = useAuthenticatedUser();

  const [actionType, setActionType] = useState<'FORWARD' | 'ASSIGN'>('ASSIGN');
  const [recipientId, setRecipientId] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  // Filter valid potential recipients based on current role
  // NIB Hierarchy: Board Secretariat -> CEO -> Chief -> Deputy Chief -> Director
  // Note: Director cannot route downwards.
  const eligibleUsers = allUsers.filter((u) => {
    if (u.id === currentUser.id) return false;
    if (currentUser.role === 'BOARD_SECRETARIAT') {
      return ['CEO', 'CHIEF', 'DIRECTOR', 'ADMIN'].includes(u.role);
    }
    if (currentUser.role === 'CEO') {
      return ['CHIEF', 'DEPUTY_CHIEF', 'DIRECTOR', 'BOARD_SECRETARIAT'].includes(u.role);
    }
    if (currentUser.role === 'CHIEF') {
      return ['DEPUTY_CHIEF', 'DIRECTOR', 'CEO'].includes(u.role);
    }
    if (currentUser.role === 'DEPUTY_CHIEF') {
      return ['DIRECTOR', 'CHIEF'].includes(u.role);
    }
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientId || !comment) {
      setError('Please select a recipient and provide routing instructions / comments.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const res = await fetch(`/api/matters/${matter.id}/routing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actionType,
          recipientId,
          comment,
        }),
      });

      if (res.ok) {
        await refreshMatters();
        await refreshMetrics();
        onSuccess();
        onClose();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to route matter');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className="bg-surface rounded-[--radius-card] shadow-overlay border border-line w-full max-w-xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-nib-brown-800 text-nib-gold-100 px-6 py-4 flex items-center justify-between border-b border-[#1f426b]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500 text-white font-bold flex items-center justify-center text-sm shadow-card">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Route Board Matter</h3>
              <p className="text-[11px] text-ink-2">
                {matter.id} — {matter.title.substring(0, 45)}...
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          {error && (
            <div className="p-3 rounded-lg bg-st-late-bg text-st-late border border-st-late/30 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Type Selection (Forward vs Assign) */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider">
              Select Routing Action Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`p-3 rounded-[--radius-card] border cursor-pointer transition flex flex-col justify-between ${
 actionType === 'FORWARD'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-line bg-surface-2'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink">FORWARD</span>
                  <input
                    type="radio"
                    name="actionType"
                    value="FORWARD"
                    checked={actionType === 'FORWARD'}
                    onChange={() => setActionType('FORWARD')}
                    className="text-st-info focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-ink-3 mt-1">
                  Transfers custody for review / alignment. Recipient determines next action.
                </p>
              </label>

              <label
                className={`p-3 rounded-[--radius-card] border cursor-pointer transition flex flex-col justify-between ${
 actionType === 'ASSIGN'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                    : 'border-line bg-surface-2'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink">ASSIGN</span>
                  <input
                    type="radio"
                    name="actionType"
                    value="ASSIGN"
                    checked={actionType === 'ASSIGN'}
                    onChange={() => setActionType('ASSIGN')}
                    className="text-st-done focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-ink-3 mt-1">
                  Formally delegates operational implementation responsibility to designated level.
                </p>
              </label>
            </div>
          </div>

          {/* Destination Executive */}
          <div>
            <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">
              Select Recipient Official *
            </label>
            <select
              required
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-blue-500 font-semibold"
            >
              <option value="">-- Choose Recipient Officer --</option>
              {eligibleUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.title} ({u.role.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>

          {/* Routing Directives / Comment */}
          <div>
            <label className="block text-[11px] font-bold text-ink-2 uppercase tracking-wider mb-1">
              Executive Directives / Routing Notes *
            </label>
            <textarea
              required
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Please execute within 30 days and submit the structured implementation report with evidence..."
              className="w-full bg-surface-2 border border-line-strong rounded-lg p-2.5 text-xs text-ink focus:ring-2 focus:ring-blue-500"
            ></textarea>
          </div>

          {/* Footer */}
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
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-card transition disabled:opacity-50 flex items-center space-x-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Routing...' : 'Confirm & Transmit Matter'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
