import { requireUser } from '@/lib/auth';
import { assertMatterAccess } from '@/lib/authz';
import { handle } from '@/lib/handler';
import { getMatter } from '@/lib/repo';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * A single matter. The access guard runs before the record is returned, so a
 * matter outside the caller's scope yields 403 no matter what id is typed into
 * the URL.
 */
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertMatterAccess(user, id);
    return getMatter(prisma, id);
  });
}
