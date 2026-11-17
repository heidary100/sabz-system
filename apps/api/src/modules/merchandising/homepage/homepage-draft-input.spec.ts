import {
  validateDraftValidationBody,
  validateDraftWriteBody,
} from './homepage-draft-input';

describe('homepage draft input validation', () => {
  it('accepts a valid replace payload', () => {
    const result = validateDraftWriteBody({
      revision: 3,
      schemaVersion: 1,
      sections: [],
    });
    expect(result.result.valid).toBe(true);
    expect(result.value).toEqual({ revision: 3, schemaVersion: 1, sections: [] });
  });

  it('requires revision and an array of sections', () => {
    const result = validateDraftWriteBody({ sections: {} });
    expect(result.result.valid).toBe(false);
    expect(result.result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(['draft.revision', 'draft.sections']),
    );
  });

  it('rejects unknown fields instead of dropping them', () => {
    const result = validateDraftWriteBody({
      revision: 0,
      sections: [],
      publishedAt: '2026-11-10T00:00:00.000Z',
    });
    expect(result.result.valid).toBe(false);
    expect(result.result.errors).toContainEqual(
      expect.objectContaining({ path: 'draft.publishedAt', code: 'UNKNOWN_FIELD' }),
    );
  });

  it('rejects unsupported schema versions', () => {
    const result = validateDraftWriteBody({
      revision: 0,
      schemaVersion: 2,
      sections: [],
    });
    expect(result.result.valid).toBe(false);
    expect(result.result.errors).toContainEqual(
      expect.objectContaining({ code: 'UNSUPPORTED_SCHEMA_VERSION' }),
    );
  });

  it('accepts an empty validation payload for the current draft', () => {
    const result = validateDraftValidationBody({});
    expect(result.result.valid).toBe(true);
    expect(result.value).toEqual({});
  });

  it('accepts submitted sections without a revision', () => {
    const result = validateDraftValidationBody({ sections: [] });
    expect(result.result.valid).toBe(true);
    expect(result.value.sections).toEqual([]);
  });

  it('rejects unknown validation fields and malformed revisions', () => {
    const result = validateDraftValidationBody({ revision: -1, note: 'x' });
    expect(result.result.valid).toBe(false);
    expect(result.result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['INVALID_INTEGER', 'UNKNOWN_FIELD']),
    );
  });
});
