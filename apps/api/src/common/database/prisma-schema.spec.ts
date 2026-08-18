import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';

describe('Prisma schema numeric precision (SS-031)', () => {
  const partnerTier = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === 'PartnerTier',
  );

  it('constrains discountPercent to NUMERIC(5,2) so percentages stay meaningful', () => {
    const field = partnerTier?.fields.find(
      (candidate) => candidate.name === 'discountPercent',
    );

    expect(field).toBeDefined();
    // NUMERIC(5,2) accepts 0.00-999.99: representative values such as 0,
    // 12.5 and 100.00 fit; values beyond the precision are rejected.
    expect(field!.type).toBe('Decimal');
    expect(field!.nativeType).toEqual(['Decimal', ['5', '2']]);
  });

  it('keeps minOrderQuantity as Int, which is sufficient for order quantities', () => {
    const field = partnerTier?.fields.find(
      (candidate) => candidate.name === 'minOrderQuantity',
    );

    expect(field).toBeDefined();
    expect(field!.type).toBe('Int');
    expect(field!.nativeType).toBeNull();
  });
});

describe('Partner lifecycle and BusinessDocument schema (SS-038)', () => {
  const partner = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === 'Partner',
  );
  const businessDocument = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === 'BusinessDocument',
  );
  const approvalStatusEnum = Prisma.dmmf.datamodel.enums.find(
    (candidate) => candidate.name === 'PartnerApprovalStatus',
  );
  const documentTypeEnum = Prisma.dmmf.datamodel.enums.find(
    (candidate) => candidate.name === 'PartnerDocumentType',
  );

  const ss038Migration = () => {
    const migrationsDir = join(__dirname, '..', '..', '..', 'prisma', 'migrations');
    const folder = readdirSync(migrationsDir).find((name) =>
      name.includes('ss_038_partner_lifecycle_and_business_documents'),
    );
    expect(folder).toBeDefined();
    return readFileSync(join(migrationsDir, folder!, 'migration.sql'), 'utf8');
  };

  it('includes DRAFT in PartnerApprovalStatus', () => {
    const values = approvalStatusEnum?.values.map((value) => value.name);
    expect(values).toEqual(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']);
  });

  it('defaults Partner.approvalStatus to DRAFT', () => {
    const field = partner?.fields.find(
      (candidate) => candidate.name === 'approvalStatus',
    );

    expect(field).toBeDefined();
    expect(field!.type).toBe('PartnerApprovalStatus');
    expect(field!.default).toBe('DRAFT');
  });

  it('keeps the lifecycle timestamps and review fields on Partner', () => {
    const expected = ['submittedAt', 'rejectedAt', 'rejectionReason', 'reviewNotes'];
    for (const name of expected) {
      const field = partner?.fields.find((candidate) => candidate.name === name);
      expect(field).toBeDefined();
      expect(field!.type).toBe(name.includes('At') ? 'DateTime' : 'String');
      expect(field!.isRequired).toBe(false);
    }
  });

  it('defines the BusinessDocument model', () => {
    expect(businessDocument).toBeDefined();
    const expected = [
      'id',
      'partnerId',
      'type',
      'originalName',
      'mimeType',
      'sizeBytes',
      'storageKey',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'createdBy',
      'updatedBy',
    ];
    const names = businessDocument!.fields.map((field) => field.name);
    expect(names).toEqual(expect.arrayContaining(expected));
  });

  it('links BusinessDocument to Partner via a cascading relation', () => {
    const partnerRelation = businessDocument?.fields.find(
      (candidate) => candidate.name === 'partner',
    );

    expect(partnerRelation).toBeDefined();
    expect(partnerRelation!.kind).toBe('object');
    expect(partnerRelation!.type).toBe('Partner');
    expect(partnerRelation!.relationFromFields).toEqual(['partnerId']);
    expect(partnerRelation!.relationOnDelete).toBe('Cascade');
  });

  it('makes BusinessDocument.storageKey unique', () => {
    const field = businessDocument?.fields.find(
      (candidate) => candidate.name === 'storageKey',
    );

    expect(field).toBeDefined();
    expect(field!.isUnique).toBe(true);
  });

  it('creates the BusinessDocument [partnerId, deletedAt] index', () => {
    expect(ss038Migration()).toContain(
      'CREATE INDEX "BusinessDocument_partnerId_deletedAt_idx" ON "BusinessDocument"("partnerId", "deletedAt");',
    );
  });

  it('creates the Partner [approvalStatus, submittedAt] index', () => {
    expect(ss038Migration()).toContain(
      'CREATE INDEX "Partner_approvalStatus_submittedAt_idx" ON "Partner"("approvalStatus", "submittedAt");',
    );
  });

  it('defines the PartnerDocumentType values', () => {
    const values = documentTypeEnum?.values.map((value) => value.name);
    expect(values).toEqual([
      'BUSINESS_LICENSE',
      'NATIONAL_ID',
      'TAX_REGISTRATION',
      'SUPPORTING',
    ]);
  });
});

describe('AuditLog query index (SS-064)', () => {
  const auditLog = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === 'AuditLog',
  );

  const ss064Migration = () => {
    const migrationsDir = join(__dirname, '..', '..', '..', 'prisma', 'migrations');
    const folder = readdirSync(migrationsDir).find((name) =>
      name.includes('ss_064_audit_query_indexes'),
    );
    expect(folder).toBeDefined();
    return readFileSync(join(migrationsDir, folder!, 'migration.sql'), 'utf8');
  };

  it('adds the [entity, createdAt] composite index for entity-scoped admin queries', () => {
    const index = auditLog?.fields.find((field) => field.name === 'createdAt');
    expect(index).toBeDefined();
    expect(ss064Migration()).toContain(
      'CREATE INDEX "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt");',
    );
  });
});
