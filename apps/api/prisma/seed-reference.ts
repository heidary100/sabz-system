import { PrismaClient } from '@prisma/client';

/**
 * Reference-data seed (SS-042, #90): partner tiers are required by partner
 * approval (a valid `tierId`), so a fresh environment must never start with
 * an empty `PartnerTier` table.
 *
 * Environment-agnostic and idempotent — safe on dev, test, and production:
 * inserts any of the three decided tiers that are missing by unique `name`
 * and never modifies existing rows. Only the tier NAMES are decided; the
 * values are neutral defaults (0% discount, minimum quantity 1) that the
 * client adjusts in the admin panel (/pricing → «پله‌های همکاری»). Note
 * that a renamed or deleted default tier will be re-added as a fresh
 * default on the next run. No `createdBy` — the seeder is not an operator.
 */
const prisma = new PrismaClient();

const REFERENCE_TIERS = [
  { name: 'Tier 1 – Distributor', discountPercent: '0', minOrderQuantity: 1 },
  { name: 'Tier 2 – Wholesaler', discountPercent: '0', minOrderQuantity: 1 },
  { name: 'Tier 3 – Retailer', discountPercent: '0', minOrderQuantity: 1 },
] as const;

async function main(): Promise<void> {
  for (const tier of REFERENCE_TIERS) {
    const existing = await prisma.partnerTier.findUnique({
      where: { name: tier.name },
      select: { id: true },
    });
    if (existing) {
      console.log(`= partner tier present: ${tier.name}`);
      continue;
    }
    await prisma.partnerTier.create({
      data: {
        name: tier.name,
        discountPercent: tier.discountPercent,
        minOrderQuantity: tier.minOrderQuantity,
      },
    });
    console.log(`+ partner tier seeded: ${tier.name}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
