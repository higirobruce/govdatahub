import { Injectable } from '@nestjs/common';
import { FieldRole } from '../../database/entities';

/**
 * A leading `YYYY-M-D` in an already-separator-normalized string, with
 * whatever follows it ignored -- a time, a `T`, an offset, trailing
 * text. `(?!\d)` stops a longer run of digits (`'1990-01-015'`) from
 * being silently truncated to a plausible-looking day.
 */
const LEADING_CALENDAR_DAY = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/;

/**
 * Whether these components name a real day, checked arithmetically so no
 * `Date` -- and therefore no timezone -- is involved. A leading match
 * that fails this normalizes to `''`: the input names a day that does
 * not exist, and `''` is exactly what the workspace stores for a missing
 * date.
 */
function isRealCalendarDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= lengths[month - 1];
}

@Injectable()
export class NormalizationService {
  normalizeText(raw: string | null | undefined): string {
    if (raw === null || raw === undefined) return '';
    return String(raw)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizePersonName(raw: string | null | undefined): string {
    const text = this.normalizeText(raw);
    if (!text) return '';
    return text.split(' ').sort().join(' ');
  }

  normalizePhone(raw: string | null | undefined): string {
    if (raw === null || raw === undefined) return '';
    const digits = String(raw).replace(/\D/g, '');
    return digits.length >= 9 ? digits.slice(-9) : '';
  }

  /**
   * `YYYY-MM-DD`, read from the calendar day the input NAMES -- never by
   * round-tripping an instant through `toISOString()` (Rulings R50 and
   * R59b).
   *
   * `toISOString()` converts to UTC, and in every zone east of Greenwich
   * a value sitting at local midnight moves back across midnight into the
   * previous day. For a January 1st the YEAR changes with it, so the
   * `year(birth_date)` blocking key changes, so the duplicate is never
   * proposed and never scored. Nothing reports an error; the normalized
   * value simply names a different day than the register does. That is
   * the worst shape a defect can take in a matching field, and both
   * inputs below could produce it:
   *
   *  - **A `Date` (Ruling R50).** node-postgres materializes a PostgreSQL
   *    `date` column as a `Date` at LOCAL midnight -- a `date` has no time
   *    and no zone, so the driver picks the running process's. Under the
   *    deployment zone (`TZ=Africa/Kigali`, UTC+2) a column holding
   *    `1990-01-01` came back as `1989-12-31`. Read by
   *    `getFullYear()`/`getMonth()`/`getDate()` the calendar day survives
   *    whatever `TZ` is.
   *
   *  - **A string carrying a time (Ruling R59b).** A bare `'1990-01-01'`
   *    parses under the ECMAScript date-only grammar as UTC midnight, so
   *    `toISOString()` happened to return it unchanged -- which is why the
   *    original fix stopped there, and why the tests that existed did not
   *    notice. Add a time and the grammar switches to LOCAL: both
   *    `'1990-01-01 00:00:00'` and `'1990-01-01T00:00:00'` became
   *    `1989-12-31` under UTC+2. This is not hypothetical -- SQLite is one
   *    of the five connection types phase 1 supports, `better-sqlite3`
   *    returns TEXT verbatim, and `'YYYY-MM-DD HH:MM:SS'` is SQLite's
   *    canonical date storage. A text column holding an ISO timestamp is
   *    also the ordinary shape of a CSV-imported register on PostgreSQL
   *    and MySQL alike.
   *
   * So a string is matched for a leading `YYYY-M-D` and those components
   * are taken literally, whatever follows them. No instant is constructed,
   * so no zone can be applied and nothing can shift. `'1990/01/01'` still
   * works (separators are rewritten first), and components that do not
   * name a real day normalize to `''` rather than being rolled forward by
   * a zone-dependent amount.
   *
   * Anything that leading match does not cover -- `'Apr 7, 1988'`, a
   * string with an explicit offset -- still goes through `Date`, and is
   * then read by the same local-calendar rule as the `Date` branch rather
   * than through `toISOString()`, so the two paths cannot disagree.
   * Unparseable input returns `''`, which is what the workspace stores for
   * a missing date.
   *
   * Every branch here is locked by tests, and those tests only mean
   * anything in a non-UTC zone -- under `TZ=UTC` local midnight IS UTC
   * midnight and the buggy implementation passes all of them. The zone is
   * pinned for that reason in `test/pin-timezone.js` (Ruling R59), and
   * `normalization.service.spec.ts` asserts the offset is non-zero so the
   * gate cannot silently become a no-op again.
   */
  normalizeDate(raw: string | Date | null | undefined): string {
    if (raw === null || raw === undefined || raw === '') return '';

    if (raw instanceof Date) {
      if (Number.isNaN(raw.getTime())) return '';
      return this.calendarDay(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
    }

    const text = String(raw).replace(/\//g, '-');
    const leading = LEADING_CALENDAR_DAY.exec(text);
    if (leading) {
      const year = Number(leading[1]);
      const month = Number(leading[2]);
      const day = Number(leading[3]);
      // A string that names a day which does not exist (`'1990-02-30'`)
      // is missing data, not a date to be guessed at. Handing it to
      // `Date` instead rolls it forward -- and by a zone-dependent amount
      // (March 2nd under UTC+2, March 1st under UTC-5), which is the
      // whole class of defect this function exists to eliminate.
      return isRealCalendarDay(year, month, day) ? this.calendarDay(year, month, day) : '';
    }

    const value = new Date(text);
    if (Number.isNaN(value.getTime())) return '';
    return this.calendarDay(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  /** `YYYY-MM-DD` from already-resolved calendar components. */
  private calendarDay(year: number, month: number, day: number): string {
    return (
      `${String(year).padStart(4, '0')}-` +
      `${String(month).padStart(2, '0')}-` +
      `${String(day).padStart(2, '0')}`
    );
  }

  normalizeByRole(role: FieldRole, raw: unknown): string {
    switch (role) {
      case 'person_name': return this.normalizePersonName(raw as string);
      case 'phone':       return this.normalizePhone(raw as string);
      case 'date':        return this.normalizeDate(raw as string);
      case 'org_name':
      case 'address':
      case 'identifier':
      case 'text':
      default:            return this.normalizeText(raw as string);
    }
  }
}
