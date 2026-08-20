'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { BODMatter, DocumentCategory } from '@/lib/types';
import { X, Upload, AlertCircle, ShieldCheck } from 'lucide-react';
import {
  Button,
  Field,
  FilePicker,
  inputClass,
  modalOverlayClass,
  selectClass,
  textareaClass,
} from '@/components/ui/primitives';
import { ACCEPT_ATTRIBUTE, uploadDocument } from '@/lib/documents';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  matter: BODMatter;
  onSuccess: () => void;
}

const CATEGORIES: Array<{ value: DocumentCategory; label: string }> = [
  { value: 'ORIGINAL_BOARD_DOC', label: 'Original Board Document / Minutes' },
  { value: 'RESOLUTION', label: 'Resolution Extract' },
  { value: 'SUPPORTING', label: 'Supporting Document' },
  { value: 'IMPLEMENTATION_EVIDENCE', label: 'Implementation Evidence' },
  { value: 'COMPLETION_REPORT', label: 'Completion Report' },
];

/**
 * Attaches a real file to a Board matter.
 *
 * The file goes to the document archive outside the application directory; the
 * matter keeps its key and checksum. Nothing here fabricates metadata — if
 * there is no file, there is no document.
 */
export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  matter,
  onSuccess,
}) => {
  const { refreshMatters } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('ORIGINAL_BOARD_DOC');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const reset = () => {
    setFile(null);
    setName('');
    setDescription('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Choose the file to attach.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await uploadDocument(matter.id, file, {
        category,
        // Falling back to the file's own name is almost always what is wanted;
        // the field is there for when the filename is not self-describing.
        name: name.trim() || file.name,
        description: description.trim(),
      });
      await refreshMatters();
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The document could not be uploaded.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className="bg-surface rounded-[--radius-card] shadow-overlay border border-line w-full max-w-md overflow-hidden">
        <div className="bg-nib-brown-800 text-nib-gold-100 px-6 py-4 flex items-center justify-between border-b border-nib-brown-700">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-nib-gold-500 text-nib-brown-900 flex items-center justify-center shadow-card">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Attach a document</h3>
              <p className="text-[11px] text-nib-gold-200/70">{matter.id}</p>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-st-late-bg text-st-late border border-st-late/30 text-[12px] flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Field label="File" htmlFor="doc-file" required>
            <FilePicker
              id="doc-file"
              file={file}
              onPick={(f) => {
                setFile(f);
                setError('');
              }}
              accept={ACCEPT_ATTRIBUTE}
              disabled={isSubmitting}
            />
          </Field>

          <Field label="Category" htmlFor="doc-category" required>
            <select
              id="doc-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              className={selectClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Reference title"
            htmlFor="doc-name"
            hint="Leave blank to use the file's own name."
          >
            <input
              id="doc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={file?.name ?? 'e.g. Board Minutes — 12 August 2026'}
              className={inputClass}
            />
          </Field>

          <Field label="Description" htmlFor="doc-desc">
            <textarea
              id="doc-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief context for what this document records…"
              className={textareaClass}
            />
          </Field>

          <p className="flex items-start gap-2 text-[11px] text-ink-3 leading-relaxed">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-nib-gold-600" />
            <span>
              Stored in the bank&apos;s document archive outside this application, and
              fingerprinted with SHA-256. The checksum is re-verified every time the file is
              downloaded, so an altered copy is never served as the Board&apos;s paper.
            </span>
          </p>

          <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting} disabled={!file}>
              Upload &amp; attach
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
