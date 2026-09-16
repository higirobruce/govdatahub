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
      expect(s.normalizeDate(new Date('1988-04-07T10:00:00Z'))).toBe('1988-04-07');
    });
    it('returns empty string for an unparseable value', () => {
      expect(s.normalizeDate('not a date')).toBe('');
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
