import { requireUser } from '@/lib/auth';
import { assertMatterAccess } from '@/lib/authz';
import { handle } from '@/lib/handler';
import { listAuditTrail } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertMatterAccess(user, id);
    return listAuditTrail(id);
  });
}
