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
  const project = path.resolve(process.cwd());

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
  const extension = ALLOWED_UPLOAD_TYPES[contentType];
  if (!extension) {
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
    // Fallback: try extensionless path if storageKey had an extension, or vice-versa
    const root = storageRoot();
    const cleanKey = storageKey.replace(/\.[^/.]+$/, '');
    const altPath = path.resolve(/*turbopackIgnore: true*/ root, cleanKey);
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
