import {
  validateCreatePublicationBody,
  validateRollbackPublicationBody,
} from './homepage-publication-input';

describe('homepage publication input validation', () => {
  it('treats an empty body as immediate publication', () => {
    const result = validateCreatePublicationBody({});
    expect(result.result.valid).toBe(true);
    expect(result.value).toEqual({ publishAt: null, note: null });
  });

  it('accepts a future schedule timestamp and note', () => {
    const result = validateCreatePublicationBody({
      publishAt: '2030-01-01T00:00:00.000Z',
      note: 'انتشار زمستانه',
    });
    expect(result.result.valid).toBe(true);
    expect(result.value).toEqual({
      publishAt: '2030-01-01T00:00:00.000Z',
      note: 'انتشار زمستانه',
    });
  });

  it('rejects malformed dates, empty notes, and unknown fields', () => {
    const result = validateCreatePublicationBody({
      publishAt: 'not-a-date',
      note: '   ',
      mode: 'NOW',
    });
    expect(result.result.valid).toBe(false);
    expect(result.result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(['INVALID_DATE', 'INVALID_STRING', 'UNKNOWN_FIELD']),
    );
  });

  it('accepts an empty rollback body and validates notes', () => {
    expect(validateRollbackPublicationBody({}).result.valid).toBe(true);
    expect(validateRollbackPublicationBody({ note: null }).value).toEqual({
      note: null,
    });
    expect(validateRollbackPublicationBody({ note: 'x'.repeat(501) }).result.valid).toBe(
      false,
    );
  });
});
