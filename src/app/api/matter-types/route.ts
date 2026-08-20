import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { assertRole } from '@/lib/authz';
import { handle, readJson, badRequest, conflict } from '@/lib/handler';
import { listMatterTypes } from '@/lib/repo';
import { prisma } from '@/lib/prisma';
import { assertSameOrigin } from '@/lib/security';

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
 * it is restricted to the Board Secretariat and administrators (spec §3).
 */
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);

    const user = await requireUser();
    assertRole(
      user,
      ['BOARD_SECRETARIAT', 'ADMIN'],
      'Only Board Secretariat or an administrator may configure matter types.'
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
    assertRole(
      user,
      ['BOARD_SECRETARIAT', 'ADMIN'],
      'Only Board Secretariat or an administrator may retire matter types.'
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

    return {
      matterTypes: await listMatterTypes(),
      retired: inUseCount > 0,
      inUseCount,
    };
  });
}
