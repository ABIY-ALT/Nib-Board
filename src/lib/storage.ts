import { createHash, timingSafeEqual } from 'crypto';
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import path from 'path';
import { HttpError } from './auth';

/**
 * Where uploaded Board papers actually live.
 *
 * Deliberately outside the application directory. Board minutes are records the
 * bank has to keep for years; the code they are viewed through is something you
 * redeploy, `git clean`, or delete and re-clone. Keeping the two in the same
 * folder means a routine deployment can destroy the archive, and it puts
 * confidential papers inside anything that packages or copies the project.
 *
 * Override with NIB_STORAGE_ROOT. The default is a sibling of nothing — a
 * top-level folder chosen so it is obvious what it is when someone finds it.
 */
const DEFAULT_ROOT = process.platform === 'win32' ? 'C:\\NibBoardStorage' : '/var/lib/nibboard';

/** Nothing larger is accepted. Board papers are documents, not media. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * What may be uploaded, by declared content type.
 *
 * An allow-list rather than a block-list: the store hands these back with the
 * recorded type, so anything executable or scriptable that got in here would be
 * served back to a browser under the bank's own origin.
 */
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

/**
 * Whether a declared type is on the allow-list.
 *
 * An own-property check, not `ALLOWED_UPLOAD_TYPES[type]`: the type is
 * whatever the client wrote on the multipart part, and a plain lookup of
 * "constructor" or "__proto__" finds an inherited member and passes.
 */
export function isAllowedUploadType(contentType: string): boolean {
  return Object.hasOwn(ALLOWED_UPLOAD_TYPES, contentType);
}

// ------------------------------------------------------------ content checks

const startsWith = (bytes: Buffer, signature: readonly number[]) =>
  bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b);

const isZip = (b: Buffer) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]); // OOXML containers
const isOle2 = (b: Buffer) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // legacy Office
const isRtf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '{\\rtf';

/**
 * What the bytes of each accepted type must look like.
 *
 * The declared type is whatever the browser — or a script — chose to send, so
 * on its own it lets HTML, script or an executable through as "a PNG" or "a
 * PDF". Legacy Excel, plain text and CSV have no entry: there is no single
 * signature for them (Excel's own ".xls" is often an HTML or XML export), and
 * the forced download extension below keeps them inert.
 */
const CONTENT_SIGNATURES: Record<string, Array<(b: Buffer) => boolean>> = {
  // The PDF header may legally be preceded by up to 1 KB of junk.
  'application/pdf': [(b) => b.subarray(0, 1024).includes('%PDF-')],
  'image/png': [(b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  'image/jpeg': [(b) => startsWith(b, [0xff, 0xd8, 0xff])],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [isZip],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [isZip],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [isZip],
  // Word saves RTF under .doc, and a renamed .docx still opens in Word.
  'application/msword': [isOle2, isZip, isRtf],
  'application/vnd.ms-powerpoint': [isOle2, isZip],
};

/** A Windows PE or ELF executable, whatever type it was declared as. */
function isExecutable(bytes: Buffer): boolean {
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return true;
  if (!startsWith(bytes, [0x4d, 0x5a]) || bytes.length < 0x40) return false;
  // "MZ" alone could begin a text file; a PE image also carries "PE\0\0" at
  // the offset stored at 0x3C.
  const peOffset = bytes.readUInt32LE(0x3c);
  return peOffset + 4 <= bytes.length && bytes.readUInt32BE(peOffset) === 0x50450000;
}

function assertContentMatchesType(bytes: Buffer, contentType: string): void {
  const signatures = Object.hasOwn(CONTENT_SIGNATURES, contentType)
    ? CONTENT_SIGNATURES[contentType]
    : undefined;
  if (isExecutable(bytes) || (signatures && !signatures.some((test) => test(bytes)))) {
    throw new HttpError(
      400,
      `The file's contents do not match its type (${contentType}). Upload the original document rather than a renamed file.`
    );
  }
}

/**
 * The Content-Disposition for a stored file being handed back.
 *
 * The display name is whatever the uploader typed, so "update.exe" stored as a
 * PNG used to download as `update.exe` from the bank's own portal. The name is
 * kept, but its extension is forced to the one its verified type maps to, and
 * the RFC 6266 `filename*` form carries non-ASCII names intact.
 */
export function attachmentDisposition(name: string, contentType: string): string {
  const extension = isAllowedUploadType(contentType) ? ALLOWED_UPLOAD_TYPES[contentType] : '.bin';
  const base = name.replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, '_').trim() || 'document';
  const lower = base.toLowerCase();
  const hasExtension = lower.endsWith(extension) || (extension === '.jpg' && lower.endsWith('.jpeg'));
  const filename = hasExtension ? base : `${base}${extension}`;

  const ascii = filename.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Boundaries, part headers and the small text fields around the file itself. */
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

/**
 * Refuses an upload by its declared length, before `req.formData()` parses it.
 *
 * `req.formData()` takes the whole body into memory, so checking the file's
 * size afterwards meant an arbitrarily large request had already been buffered
 * by the time it was refused. src/proxy.ts makes the same check first; this one
 * still holds if the proxy is ever not picked up.
 */
export function assertUploadLength(req: Request): void {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
    throw new HttpError(
      413,
      `The file is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`
    );
  }
}

// -------------------------------------------------------------------- store

let cachedRoot: string | null = null;

/**
 * The resolved storage root, checked once.
 *
 * The check that it sits outside the project is not decoration: the whole point
 * of the setting is that the archive survives the code, and a root that has
 * been pointed back inside the repository — by a stray `.env`, by a relative
 * path resolving somewhere unexpected — would quietly undo that. Failing loudly
 * at the first upload is much better than discovering it after a deployment
 * takes the minutes with it.
 */
export function storageRoot(): string {
  if (cachedRoot) return cachedRoot;

  const configured = process.env.NIB_STORAGE_ROOT?.trim() || DEFAULT_ROOT;

  // turbopackIgnore on every path built from this root, here and below.
  //
  // The bundler traces filesystem calls to decide what to ship, and a path it
  // cannot resolve statically makes it pull the entire project — sources and
  // the public folder — into the server output "just in case". That is exactly
  // backwards here: the root is deliberately outside the project and is only
  // known at run time, so there is nothing for it to trace and nothing it
  // should bundle.
  const resolved = path.resolve(/*turbopackIgnore: true*/ configured);
  const project = path.resolve(/*turbopackIgnore: true*/ process.cwd());

  const relative = path.relative(project, resolved);
  const insideProject = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  if (insideProject) {
    throw new Error(
      `NIB_STORAGE_ROOT (${resolved}) is inside the application directory (${project}). ` +
        'Uploaded Board documents must be stored outside it so a redeployment cannot destroy them.'
    );
  }

  cachedRoot = resolved;
  return resolved;
}

/**
 * The path a storage key names, with traversal refused.
 *
 * Keys are generated here and never taken from a request, but they do round
 * trip through the database, so this re-derives the path from the root and
 * refuses anything that escapes it rather than trusting the stored value.
 */
export function objectPath(storageKey: string): string {
  const root = storageRoot();
  const resolved = path.resolve(/*turbopackIgnore: true*/ root, storageKey);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new HttpError(500, 'Refusing to read a document from outside the storage root.');
  }
  return resolved;
}

export interface StoredObject {
  storageKey: string;
  sha256: string;
  byteSize: number;
}

const exists = async (p: string) =>
  access(/*turbopackIgnore: true*/ p).then(
    () => true,
    () => false
  );

/**
 * Writes bytes into the store, keyed by their own digest.
 *
 * Content-addressed, so the same paper attached to two matters is stored once
 * and the digest in the database is both the name and the integrity check. The
 * two-level fan-out keeps any one directory from collecting every file in the
 * bank's history, which is what makes a plain directory listing usable.
 *
 * Writing is skipped when the object is already there: identical bytes under an
 * identical digest are the same object, so re-uploading is idempotent.
 */
export async function putObject(bytes: Buffer, contentType: string): Promise<StoredObject> {
  if (!isAllowedUploadType(contentType)) {
    throw new HttpError(400, `Files of type '${contentType}' cannot be attached to a Board matter.`);
  }
  if (bytes.byteLength === 0) {
    throw new HttpError(400, 'The uploaded file is empty.');
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new HttpError(
      413,
      `The file is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`
    );
  }
  assertContentMatchesType(bytes, contentType);

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const storageKey = path.join(
    'objects',
    sha256.slice(0, 2),
    sha256.slice(2, 4),
    sha256
  );

  const target = objectPath(storageKey);
  if (!(await exists(target))) {
    await mkdir(/*turbopackIgnore: true*/ path.dirname(target), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ target, bytes, { flag: 'wx' }).catch(async (err: NodeJS.ErrnoException) => {
      // Two uploads of the same file can race to create it. Losing that race is
      // not a failure — the winner wrote exactly the same bytes.
      if (err.code !== 'EEXIST') throw err;
    });
  }

  return { storageKey, sha256, byteSize: bytes.byteLength };
}

/**
 * Reads an object back and re-verifies it against the digest recorded when it
 * was stored.
 *
 * The check is the reason the digest is in the database at all. The store is a
 * plain directory on a file share that other people and other processes can
 * reach; verifying on read means bytes that no longer match what was uploaded
 * are refused rather than served as if they were the Board's paper. Comparison
 * is constant-time out of habit, not necessity.
 */
export async function getObject(storageKey: string, expectedSha256: string): Promise<Buffer> {
  let bytes: Buffer | null = null;
  const primaryPath = objectPath(storageKey);

  try {
    bytes = await readFile(/*turbopackIgnore: true*/ primaryPath);
  } catch {
    // Fallback: try extensionless path if storageKey had an extension, or vice-versa.
    // Through objectPath, so the alternative is held to the same traversal check.
    const cleanKey = storageKey.replace(/\.[^/.]+$/, '');
    const altPath = objectPath(cleanKey);
    try {
      bytes = await readFile(/*turbopackIgnore: true*/ altPath);
    } catch {
      throw new HttpError(
        410,
        'The stored file is missing from the document archive. Report this to the administrator.'
      );
    }
  }

  const actual = Buffer.from(createHash('sha256').update(bytes).digest('hex'));
  const expected = Buffer.from(expectedSha256);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new HttpError(
      409,
      'The stored file does not match its recorded checksum and will not be served. Report this to the administrator.'
    );
  }

  return bytes;
}

/** Human-readable size, for the fileSize column the UI already displays. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
