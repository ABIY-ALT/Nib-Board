import { NextResponse } from 'next/server';
import { requireUser, HttpError } from '@/lib/auth';
import { handle, badRequest } from '@/lib/handler';
import { prisma } from '@/lib/prisma';
import { assertPermission, getPermissions } from '@/lib/permissions.server';
import { PERMISSIONS, hasAnyPermission, hasPermission } from '@/lib/permissions';
import { ANNOUNCEMENT_INCLUDE, auditAnnouncement, inAudience } from '@/lib/announcements.server';
import { assertSameOrigin } from '@/lib/security';
import {
  MAX_UPLOAD_BYTES,
  assertUploadLength,
  attachmentDisposition,
  formatBytes,
  getObject,
  isAllowedUploadType,
  putObject,
} from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The one optional file an announcement may carry.
 *
 * It goes into the same content-addressed store as Board papers, under the same
 * limits and the same allow-list, and comes back out through the same
 * verify-on-read path. There is no second file store and no second upload
 * pipeline: an announcement's attachment is a document like any other, it just
 * hangs off a different record.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    const { id } = await params;

    const row = await prisma.announcement.findUnique({
      where: { id },
      select: { id: true, status: true, createdById: true },
    });
    if (!row) throw new HttpError(404, 'Announcement not found');

    // Attaching to your own draft needs only the permission that let you write
    // it; touching somebody else's needs the permission to edit theirs.
    const permissions = await getPermissions(user);
    const ownDraft =
      row.createdById === user.id && hasPermission(permissions, PERMISSIONS.ANNOUNCEMENT_CREATE);
    if (!ownDraft) {
      await assertPermission(
        user,
        PERMISSIONS.ANNOUNCEMENT_EDIT,
        'You do not have permission to attach a file to this announcement.'
      );
    }

    if (row.status === 'CANCELLED') {
      throw new HttpError(409, 'This announcement has been withdrawn.');
    }

    assertUploadLength(req);
    if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
      badRequest('Attach the file as multipart/form-data with a "file" part.');
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, 'The upload could not be read. It may have been truncated.');
    }

    const file = form.get('file');
    if (!(file instanceof File)) badRequest('No file was attached.');

    const upload = file as File;
    const name = String(form.get('name') ?? '').trim() || upload.name;
    const contentType = upload.type || 'application/octet-stream';

    if (!isAllowedUploadType(contentType)) {
      badRequest(
        `Files of type '${contentType}' cannot be attached. Accepted: PDF, Word, Excel, PowerPoint, text, CSV, PNG and JPEG.`
      );
    }
    if (upload.size > MAX_UPLOAD_BYTES) {
      throw new HttpError(
        413,
        `The file is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`
      );
    }

    const stored = await putObject(Buffer.from(await upload.arrayBuffer()), contentType);

    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        attachmentName: name,
        attachmentType: contentType,
        attachmentSize: stored.byteSize,
        attachmentKey: stored.storageKey,
        attachmentSha: stored.sha256,
        updatedAt: new Date(),
      },
      include: ANNOUNCEMENT_INCLUDE,
    });

    await auditAnnouncement(req, user, updated, 'ANNOUNCEMENT_UPDATED', {
      note: `Attached '${name}' · SHA-256 ${stored.sha256.slice(0, 16)}…`,
    });

    return {
      name,
      fileType: contentType,
      byteSize: stored.byteSize,
      fileSize: formatBytes(stored.byteSize),
      sha256: stored.sha256,
    };
  });
}

/**
 * Downloads the attachment.
 *
 * Authorized exactly like the announcement it belongs to: a recipient it is
 * live for, its author, or somebody who manages announcements. The bytes are
 * re-verified against the digest recorded at upload before they are served.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const user = await requireUser();
    const permissions = await getPermissions(user);

    const row = await prisma.announcement.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'Announcement not found');

    const now = new Date();
    const start = row.publishAt ?? row.publishedAt;
    const live =
      row.status === 'PUBLISHED' &&
      (!start || start <= now) &&
      (!row.expiresAt || row.expiresAt > now);

    const manages = hasAnyPermission(permissions, [
      PERMISSIONS.ANNOUNCEMENT_EDIT,
      PERMISSIONS.ANNOUNCEMENT_PUBLISH,
      PERMISSIONS.ANNOUNCEMENT_DELETE,
    ]);
    const isAuthor =
      row.createdById === user.id && hasPermission(permissions, PERMISSIONS.ANNOUNCEMENT_CREATE);
    const isRecipient =
      hasPermission(permissions, PERMISSIONS.ANNOUNCEMENT_VIEW) && live && inAudience(row, user);

    if (!manages && !isAuthor && !isRecipient) {
      throw new HttpError(403, 'Access Denied: this announcement is not addressed to you.');
    }

    if (!row.attachmentKey || !row.attachmentSha) {
      throw new HttpError(404, 'This announcement has no attachment.');
    }

    const bytes = await getObject(row.attachmentKey, row.attachmentSha);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': row.attachmentType ?? 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
        // `attachment` rather than `inline`: an uploaded file is never rendered
        // in the bank's own origin, whatever its declared type.
        'Content-Disposition': attachmentDisposition(
          row.attachmentName ?? 'attachment',
          row.attachmentType ?? 'application/octet-stream'
        ),
        ETag: `"${row.attachmentSha}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api] announcement attachment download failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
