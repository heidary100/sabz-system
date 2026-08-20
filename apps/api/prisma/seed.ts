import { PrismaClient, UserStatus } from '@prisma/client';
import { IRANIAN_MOBILE_REGEX } from '../src/modules/auth/dto/request-otp.dto';
import { bootstrap } from './bootstrap';

const prisma = new PrismaClient();

const ROLES = [
  { name: 'CUSTOMER', description: 'Retail customer' },
  { name: 'PARTNER', description: 'Approved business partner' },
  { name: 'OPERATOR', description: 'Platform operator' },
  { name: 'ADMIN', description: 'Super administrator' },
] as const;

const DEV_ADMIN_FIRST_NAME = 'مدیر';
const DEV_ADMIN_LAST_NAME = 'سامانه';

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'Seeding is development-only. Set NODE_ENV=development to run it.',
    );
  }

  const devAdminMobile = process.env.DEV_ADMIN_MOBILE;
  if (!devAdminMobile) {
    throw new Error('DEV_ADMIN_MOBILE must be set to seed the development admin.');
  }
  if (!IRANIAN_MOBILE_REGEX.test(devAdminMobile)) {
    throw new Error(
      'DEV_ADMIN_MOBILE must be a valid Iranian mobile number (e.g. +989123456789).',
    );
  }

  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'ADMIN' },
  });

  const adminUser = await prisma.user.upsert({
    where: { mobile: devAdminMobile },
    update: { status: UserStatus.ACTIVE },
    create: { mobile: devAdminMobile, status: UserStatus.ACTIVE },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
      assignedBy: adminUser.id,
    },
  });

  await prisma.userProfile.upsert({
    where: { userId: adminUser.id },
    update: { firstName: DEV_ADMIN_FIRST_NAME, lastName: DEV_ADMIN_LAST_NAME },
    create: {
      userId: adminUser.id,
      firstName: DEV_ADMIN_FIRST_NAME,
      lastName: DEV_ADMIN_LAST_NAME,
    },
  });

  await bootstrap(prisma);

  console.log(
    `Seeded ${ROLES.length} roles, the development admin (${devAdminMobile}), and bootstrapped inventory.`,
  );
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
