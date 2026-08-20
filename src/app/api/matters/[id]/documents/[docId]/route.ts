import { NextResponse } from 'next/server';
import { requireUser, HttpError } from '@/lib/auth';
import { assertMatterAccess } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { getObject } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; docId: string }> };

/**
 * Downloads an attached document.
 *
 * Authorized exactly like the matter it belongs to — the same organizational
 * scope check, before anything touches the file system. Nothing under the
 * storage root is reachable by URL: it lives outside the application directory
 * precisely so it is never statically served, and this is the only route that
 * can produce its contents.
 *
 * The bytes are re-verified against the SHA-256 recorded at upload, so a file
 * that has been altered on the share is refused rather than handed over as if
 * it were the Board's paper.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id, docId } = await params;

  try {
    const user = await requireUser();
    await assertMatterAccess(user, id);

    // Scoped by matter as well as id, so a document id from another matter
    // cannot be fetched through a matter the caller happens to have access to.
    const doc = await prisma.document.findFirst({
      where: { id: docId, matterId: id },
      select: {
        name: true,
        fileType: true,
        storageKey: true,
        sha256: true,
        byteSize: true,
      },
    });

    if (!doc) throw new HttpError(404, 'Document not found on this matter.');
    if (!doc.storageKey || !doc.sha256) {
      throw new HttpError(
        404,
        'This entry records a document that was registered before file upload existed, so there is no file to download.'
      );
    }

    const bytes = await getObject(doc.storageKey, doc.sha256);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': doc.fileType,
        'Content-Length': String(bytes.byteLength),
        // `attachment` rather than `inline`: an uploaded file is never rendered
        // in the bank's own origin, whatever its declared type.
        'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.name)}"`,
        // The digest is the identity of the content, so it is an exact ETag.
        ETag: `"${doc.sha256}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[api] document download failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
