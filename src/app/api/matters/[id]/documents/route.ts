import { requireUser, HttpError } from '@/lib/auth';
import { assertMatterAccess } from '@/lib/authz';
import { handle, badRequest } from '@/lib/handler';
import { transaction } from '@/lib/prisma';
import { appendAudit, generateId } from '@/lib/repo';
import { assertSameOrigin } from '@/lib/security';
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  formatBytes,
  putObject,
} from '@/lib/storage';
import { DocumentCategory } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const VALID_CATEGORIES: DocumentCategory[] = [
  'ORIGINAL_BOARD_DOC',
  'RESOLUTION',
  'SUPPORTING',
  'IMPLEMENTATION_EVIDENCE',
  'COMPLETION_REPORT',
];

/**
 * Attaches a document to a matter.
 *
 * Takes the file itself, as multipart/form-data. The bytes go to the store
 * outside the application directory and the row keeps the key, the SHA-256 and
 * the true length — so what is recorded against a Board matter is a retrievable,
 * verifiable paper rather than a claim that one exists.
 *
 * Being able to see a matter is not the same as being able to add to its
 * record: only parties accountable for it may attach evidence, and a closed
 * matter's document set is final.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    const { id } = await params;
    await assertMatterAccess(user, id);

    if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
      badRequest('Attach the document as multipart/form-data with a "file" part.');
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, 'The upload could not be read. It may have been truncated.');
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      badRequest('No file was attached.');
    }

    const category = String(form.get('category') ?? '') as DocumentCategory;
    const name = String(form.get('name') ?? '').trim() || (file as File).name;
    const description = String(form.get('description') ?? '').trim();

    if (!name) badRequest('Document name required');
    if (!VALID_CATEGORIES.includes(category)) {
      badRequest(
        `Unknown document category '${category}'. Expected one of: ${VALID_CATEGORIES.join(', ')}.`
      );
    }

    const contentType = (file as File).type || 'application/octet-stream';
    if (!ALLOWED_UPLOAD_TYPES[contentType]) {
      badRequest(
        `Files of type '${contentType}' cannot be attached. Accepted: PDF, Word, Excel, PowerPoint, text, CSV, PNG and JPEG.`
      );
    }
    // Checked before reading the body into memory as well as inside putObject,
    // so an oversized upload is refused without being buffered first.
    if ((file as File).size > MAX_UPLOAD_BYTES) {
      throw new HttpError(
        413,
        `The file is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`
      );
    }

    const bytes = Buffer.from(await (file as File).arrayBuffer());

    // Written to the store before the transaction opens: the store is
    // content-addressed, so an object left behind by a transaction that later
    // rolls back is unreferenced and harmless, whereas a committed row pointing
    // at bytes that were never written would be a broken record.
    const stored = await putObject(bytes, contentType);

    return transaction(async (tx) => {
      const matter = await tx.matter.findUnique({ where: { id } });
      if (!matter) throw new HttpError(404, 'BOD Matter not found');

      if (matter.status === 'Closed') {
        throw new HttpError(409, 'This BOD matter is closed; its document set is final.');
      }

      const isAccountableParty =
        user.role === 'BOARD_SECRETARIAT' ||
        user.role === 'ADMIN' ||
        matter.currentOwnerId === user.id ||
        matter.responsibleDirectorId === user.id ||
        matter.responsibleChiefId === user.id ||
        matter.responsibleDeputyChiefId === user.id;

      if (!isAccountableParty) {
        throw new HttpError(
          403,
          'Access Denied: only the current owner or a responsible party may attach documents to this matter.'
        );
      }

      const docId = generateId('doc');
      await tx.document.create({
        data: {
          id: docId,
          matterId: id,
          name,
          category,
          fileType: contentType,
          fileSize: formatBytes(stored.byteSize),
          uploadedById: user.id,
          uploadedByRole: user.role,
          description: description || null,
          storageKey: stored.storageKey,
          sha256: stored.sha256,
          byteSize: stored.byteSize,
        },
      });

      await appendAudit(tx, {
        matterId: id,
        user,
        action: 'Progress Updated',
        comment: `Uploaded document: ${name} (${category}) · SHA-256 ${stored.sha256.slice(0, 16)}…`,
        supportingDocName: name,
      });

      return {
        id: docId,
        name,
        category,
        fileSize: formatBytes(stored.byteSize),
        sha256: stored.sha256,
      };
    });
  });
}
