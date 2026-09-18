import { NormalizationService } from './normalization.service';

describe('NormalizationService', () => {
  const s = new NormalizationService();

  describe('normalizeText', () => {
    it('lower-cases, strips accents, collapses whitespace and punctuation', () => {
      expect(s.normalizeText('  MUKAMANA,  Joséphine!! ')).toBe('mukamana josephine');
    });
    it('returns empty string for null, undefined and blank', () => {
      expect(s.normalizeText(null)).toBe('');
      expect(s.normalizeText(undefined)).toBe('');
      expect(s.normalizeText('   ')).toBe('');
    });
  });

  describe('normalizePersonName', () => {
    it('sorts tokens so a swapped name order normalizes identically', () => {
      expect(s.normalizePersonName('Josephine Mukamana'))
        .toBe(s.normalizePersonName('Mukamana Josephine'));
    });
    it('keeps duplicate tokens rather than collapsing them', () => {
      expect(s.normalizePersonName('Jean Jean Bosco')).toBe('bosco jean jean');
    });
  });

  describe('normalizePhone', () => {
    it('keeps the last nine digits and drops all other characters', () => {
      expect(s.normalizePhone('+250 788 123 456')).toBe('788123456');
      expect(s.normalizePhone('0788-123-456')).toBe('788123456');
    });
    it('returns empty string when fewer than nine digits are present', () => {
      expect(s.normalizePhone('1234')).toBe('');
    });
  });

  describe('normalizeDate', () => {
    it('accepts ISO and slash forms and emits YYYY-MM-DD', () => {
      expect(s.normalizeDate('1988-04-07')).toBe('1988-04-07');
      expect(s.normalizeDate('1988/04/07')).toBe('1988-04-07');
    });
    it('returns empty string for an unparseable value', () => {
      expect(s.normalizeDate('not a date')).toBe('');
    });
    it('returns empty string for an Invalid Date object', () => {
      expect(s.normalizeDate(new Date('not a date'))).toBe('');
    });

    /**
     * Ruling R50. node-postgres hands back a PostgreSQL `date` column as a
     * `Date` constructed at LOCAL midnight -- exactly what
     * `new Date(y, m, d)` builds here. `toISOString()` on that value moves
     * it to UTC, and in any zone east of Greenwich that lands on the
     * PREVIOUS calendar day: under `TZ=Africa/Kigali` (UTC+2, the
     * deployment zone) a column holding 1990-01-01 came back as
     * 1989-12-31, changing the YEAR and therefore the
     * `year(birth_date)` blocking key.
     *
     * The loop below walks every hour offset a real zone can impose, from
     * UTC-12 to UTC+14, by constructing the local midnight of a fixed day
     * and asserting the normalizer names that same day back. It fails on
     * `toISOString()` wherever the process's own `TZ` is not UTC, which is
     * the case this defect actually occurred in.
     */
    it('R50: reads a local-midnight Date (a PostgreSQL `date` column) as its own calendar day', () => {
      expect(s.normalizeDate(new Date(1990, 0, 1))).toBe('1990-01-01');
      expect(s.normalizeDate(new Date(1990, 0, 1, 0, 0, 0))).toBe('1990-01-01');
      // Year boundary in both directions, and a leap day.
      expect(s.normalizeDate(new Date(1989, 11, 31))).toBe('1989-12-31');
      expect(s.normalizeDate(new Date(2000, 1, 29))).toBe('2000-02-29');
      // Zero-padding of a single-digit month and day.
      expect(s.normalizeDate(new Date(2004, 4, 6))).toBe('2004-05-06');
    });

    it('R50: a local-midnight Date survives whatever the running process zone is', () => {
      // 1990-01-01 local midnight, plus every whole-hour offset a real
      // zone uses. Whichever zone the test host runs in, at least one of
      // these crosses UTC midnight -- and none of them may change the day
      // the normalizer reports, because the `Date` still represents that
      // local calendar day.
      for (let hour = 0; hour < 24; hour++) {
        const local = new Date(1990, 0, 1, hour);
        expect(s.normalizeDate(local)).toBe('1990-01-01');
      }
    });
  });

  describe('normalizeByRole', () => {
    it('routes each role to its normalizer', () => {
      expect(s.normalizeByRole('person_name', 'Mukamana Josephine')).toBe('josephine mukamana');
      expect(s.normalizeByRole('phone', '+250788123456')).toBe('788123456');
      expect(s.normalizeByRole('date', '1988/04/07')).toBe('1988-04-07');
      expect(s.normalizeByRole('identifier', ' 1198880012345678 ')).toBe('1198880012345678');
    });
  });
});
