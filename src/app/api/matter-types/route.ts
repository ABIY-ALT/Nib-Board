import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handle, readJson, badRequest, conflict } from '@/lib/handler';
import { listMatterTypes } from '@/lib/repo';
import { prisma } from '@/lib/prisma';
import { assertSameOrigin, recordAuthEvent, clientIp, userAgent } from '@/lib/security';
import { assertPermission } from '@/lib/permissions.server';
import { PERMISSIONS } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    await requireUser();
    return listMatterTypes();
  });
}

/**
 * Adds a matter type. The taxonomy is configuration rather than case data, so
 * it needs `configure_settings` (held by the Board Secretariat and administrators
 * out of the box; spec §3).
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    await assertPermission(
      user,
      PERMISSIONS.CONFIGURE_SETTINGS,
      'Access Denied: your role does not hold the "Governance Settings & Classifications" permission.'
    );

    const { name } = await readJson<{ name?: string }>(req);
    const trimmed = (name ?? '').trim();
    if (!trimmed) badRequest('Invalid matter type name');

    // Re-adding a type that was retired simply makes it available again,
    // rather than failing on the primary key.
    await prisma.matterType.upsert({
      where: { name: trimmed },
      create: { name: trimmed, sortOrder: 900 },
      update: { isActive: true },
    });

    await recordAuthEvent(prisma, {
      event: 'MATTER_TYPE_CREATED',
      userId: user.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      detail: `Configured new Board matter type classification: "${trimmed}".`,
    });

    return { matterTypes: await listMatterTypes() };
  });
}

/**
 * Retires or removes a matter type.
 *
 * If the matter type is in use by existing matters, it is soft-retired (isActive: false)
 * so it cannot be selected for new matters while preserving existing records.
 * If no matters use it, the record is removed.
 */
export async function DELETE(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    await assertPermission(
      user,
      PERMISSIONS.CONFIGURE_SETTINGS,
      'Access Denied: your role does not hold the "Governance Settings & Classifications" permission.'
    );

    const { name } = await readJson<{ name?: string }>(req);
    const trimmed = (name ?? '').trim();
    if (!trimmed) badRequest('Matter type name is required.');

    const inUseCount = await prisma.matter.count({
      where: { matterType: trimmed },
    });

    if (inUseCount > 0) {
      // Soft-retire to preserve relational integrity with historical Board records
      await prisma.matterType.update({
        where: { name: trimmed },
        data: { isActive: false },
      });
    } else {
      await prisma.matterType.delete({
        where: { name: trimmed },
      });
    }

    await recordAuthEvent(prisma, {
      event: 'MATTER_TYPE_DELETED',
      userId: user.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      detail: `${inUseCount > 0 ? 'Retired' : 'Deleted'} Board matter type classification: "${trimmed}" (${inUseCount} historical matters).`,
    });

    return {
      matterTypes: await listMatterTypes(),
      retired: inUseCount > 0,
      inUseCount,
    };
  });
}
