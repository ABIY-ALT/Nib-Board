import { DocumentCategory } from './types';

/**
 * Client-side document upload.
 *
 * Kept out of `lib/storage.ts` on purpose: that module reaches the file system
 * and must never be pulled into a browser bundle. This is the half the UI
 * needs — the request shape and the limits, so a form can reject an impossible
 * file before spending the officer's bandwidth on it.
 */

/** Mirrors ALLOWED_UPLOAD_TYPES in lib/storage.ts; the server is authoritative. */
export const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
];

/** For the file input's `accept` attribute. */
export const ACCEPT_ATTRIBUTE = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface UploadedDocument {
  id: string;
  name: string;
  category: DocumentCategory;
  fileSize: string;
  sha256: string;
}

/**
 * Sends one file to a matter's document endpoint.
 *
 * Throws with the server's own message on failure so callers can surface it
 * verbatim — an officer who picked the wrong file type should be told which
 * types are accepted, not "upload failed".
 */
export async function uploadDocument(
  matterId: string,
  file: File,
  fields: { category: DocumentCategory; name?: string; description?: string }
): Promise<UploadedDocument> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`
    );
  }

  const form = new FormData();
  form.append('file', file);
  form.append('category', fields.category);
  if (fields.name) form.append('name', fields.name);
  if (fields.description) form.append('description', fields.description);

  // No Content-Type header: the browser sets it with the multipart boundary.
  const res = await fetch(`/api/matters/${matterId}/documents`, { method: 'POST', body: form });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error ?? 'The document could not be uploaded.');
  return payload as UploadedDocument;
}

/** Where an attached document is downloaded from. */
export const documentUrl = (matterId: string, documentId: string) =>
  `/api/matters/${matterId}/documents/${documentId}`;
