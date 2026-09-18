import { NormalizationService } from './normalization.service';
import { PINNED_TZ } from '../../../test/pin-timezone';

describe('NormalizationService', () => {
  const s = new NormalizationService();

  /**
   * Ruling R59. Every date assertion below is a NO-OP under `TZ=UTC`:
   * local midnight is UTC midnight there, so `toISOString()` returns the
   * correct day and the pre-fix implementation passes all of them. The
   * re-review measured it -- UTC: 0 failures with the bug restored,
   * Africa/Kigali: 7, Asia/Tokyo: 14.
   *
   * `test/pin-timezone.js` is wired into both jest configs to stop that,
   * and this is the assertion that notices if it is ever dropped. It
   * fails the suite rather than letting the date gate quietly stop
   * testing anything.
   */
  it('R59: runs in a pinned non-UTC zone, or the date assertions below prove nothing', () => {
    expect(process.env.TZ).toBe(PINNED_TZ);
    // The offset is what actually matters -- a zone name with a zero
    // offset would satisfy the line above and still make every
    // toISOString() assertion vacuous.
    expect(new Date(1990, 0, 1).getTimezoneOffset()).not.toBe(0);
  });

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

    it('R50: a local-midnight Date survives every hour of the day it names', () => {
      // 1990-01-01 at every hour, local. None may change the day the
      // normalizer reports, because each `Date` still represents that
      // local calendar day.
      //
      // Ruling R59 corrected this comment: it used to claim "whichever
      // zone the test host runs in, at least one of these crosses UTC
      // midnight", which is false for UTC itself -- the most likely CI
      // zone, and the one in which this loop passes with the bug
      // restored. What makes the loop meaningful is not the loop, it is
      // the pinned non-UTC zone asserted at the top of this file.
      for (let hour = 0; hour < 24; hour++) {
        const local = new Date(1990, 0, 1, hour);
        expect(s.normalizeDate(local)).toBe('1990-01-01');
      }
    });

    /**
     * Ruling R59b. The original R50 fix repaired the `Date` branch and
     * left the string branch on `toISOString()`. A bare `'1990-01-01'`
     * parses under the ECMAScript DATE-ONLY grammar as UTC midnight and
     * round-tripped unchanged, which is why the tests that existed did
     * not notice -- but add a time and the grammar switches to LOCAL, and
     * the same day-earlier shift came straight back:
     *
     *     '1990-01-01 00:00:00'  ->  1989-12-31   (UTC+2, pre-fix)
     *     '1990-01-01T00:00:00'  ->  1989-12-31   (UTC+2, pre-fix)
     *
     * Reachable today: SQLite is one of the five connection types phase 1
     * supports, `better-sqlite3` returns TEXT verbatim, and
     * `'YYYY-MM-DD HH:MM:SS'` is SQLite's canonical date storage. A text
     * column holding an ISO timestamp is also the ordinary shape of a
     * CSV-imported register on PostgreSQL and MySQL.
     */
    describe('R59b: a string carrying a time', () => {
      it('keeps the calendar day the string names, space-separated or T-separated', () => {
        expect(s.normalizeDate('1990-01-01 00:00:00')).toBe('1990-01-01');
        expect(s.normalizeDate('1990-01-01T00:00:00')).toBe('1990-01-01');
        expect(s.normalizeDate('1990-01-01T00:00:00.000')).toBe('1990-01-01');
        // The other end of the same day, which shifts FORWARD under a
        // western zone if an instant is ever constructed.
        expect(s.normalizeDate('1990-01-01 23:59:59')).toBe('1990-01-01');
        expect(s.normalizeDate('1990-01-01T23:59:59')).toBe('1990-01-01');
      });

      it('keeps the year, which is what the blocking key is derived from', () => {
        // The reason this defect is worse than a one-day error: the
        // `surname|year(birth_date)` pass never proposes the pair at all.
        expect(s.normalizeDate('1990-01-01 00:00:00').slice(0, 4)).toBe('1990');
        expect(s.normalizeDate('1989-12-31 23:00:00').slice(0, 4)).toBe('1989');
      });

      it('handles the SQLite storage shape verbatim, including a trailing zone marker', () => {
        expect(s.normalizeDate('1990-01-01 00:00:00.000')).toBe('1990-01-01');
        expect(s.normalizeDate('1990-01-01T00:00:00Z')).toBe('1990-01-01');
        expect(s.normalizeDate('1990-01-01T00:00:00+05:00')).toBe('1990-01-01');
      });

      it('still accepts the slash form and pads single-digit components', () => {
        expect(s.normalizeDate('1990/01/01 00:00:00')).toBe('1990-01-01');
        expect(s.normalizeDate('1990-1-5')).toBe('1990-01-05');
        expect(s.normalizeDate('1990/1/5')).toBe('1990-01-05');
      });

      it('normalizes a day that does not exist to the empty string, not to a rolled-forward guess', () => {
        // `Date` rolls 1990-02-30 to March 2nd under UTC+2 and March 1st
        // under UTC-5 -- a zone-dependent invention. Missing is the
        // honest answer, and it is the value the workspace already
        // stores for a missing date.
        expect(s.normalizeDate('1990-02-30')).toBe('');
        expect(s.normalizeDate('1990-13-01')).toBe('');
        expect(s.normalizeDate('1990-00-10')).toBe('');
        // A real leap day is not swept up by that rule.
        expect(s.normalizeDate('2000-02-29')).toBe('2000-02-29');
        expect(s.normalizeDate('1900-02-29')).toBe('');
      });

      it('does not truncate a longer digit run into a plausible-looking day', () => {
        // `'1990-01-015'` must not silently become the 1st.
        expect(s.normalizeDate('1990-01-015')).not.toBe('1990-01-01');
      });
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
