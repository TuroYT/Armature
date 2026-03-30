import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ─── Permissions ───────────────────────────────────────────────────────────
  const permissionDefs = [
    { name: 'users:read', description: 'Read user profiles' },
    { name: 'users:write', description: 'Create or update users' },
    { name: 'users:delete', description: 'Delete users' },
    { name: 'roles:manage', description: 'Manage roles and permissions' },
    { name: 'resources:read', description: 'Read resources' },
    { name: 'resources:write', description: 'Create or update resources' },
    { name: 'resources:delete', description: 'Delete resources' },
  ];

  const permissions = await Promise.all(
    permissionDefs.map((p) =>
      prisma.permission.upsert({
        where: { name: p.name },
        update: {},
        create: p,
      }),
    ),
  );

  const byName = Object.fromEntries(permissions.map((p) => [p.name, p]));

  // ─── Roles ─────────────────────────────────────────────────────────────────
  const userRole = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: {
      name: 'user',
      label: 'User',
      description: 'Standard authenticated user',
    },
  });

  const moderatorRole = await prisma.role.upsert({
    where: { name: 'moderator' },
    update: {},
    create: {
      name: 'moderator',
      label: 'Moderator',
      description: 'Can manage content and users',
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: {
      name: 'admin',
      label: 'Administrator',
      description: 'Full access to all resources',
    },
  });

  // ─── Role ↔ Permission assignments ────────────────────────────────────────
  const rolePermissions: Array<{ roleId: string; permissionId: string }> = [
    // user — read-only on resources
    { roleId: userRole.id, permissionId: byName['resources:read'].id },

    // moderator — read/write on resources + read users
    { roleId: moderatorRole.id, permissionId: byName['resources:read'].id },
    { roleId: moderatorRole.id, permissionId: byName['resources:write'].id },
    { roleId: moderatorRole.id, permissionId: byName['resources:delete'].id },
    { roleId: moderatorRole.id, permissionId: byName['users:read'].id },

    // admin — all permissions
    ...permissions.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
  ];

  for (const rp of rolePermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: rp.roleId,
          permissionId: rp.permissionId,
        },
      },
      update: {},
      create: rp,
    });
  }

  // ─── Admin user ────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin1234!', 12);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@armature.dev' },
    update: {},
    create: {
      email: 'admin@armature.dev',
      passwordHash,
      firstName: 'Admin',
      lastName: 'Armature',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  console.log('Seed completed.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
