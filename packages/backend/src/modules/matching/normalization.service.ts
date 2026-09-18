import { Injectable } from '@nestjs/common';
import { FieldRole } from '../../database/entities';

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
   * Ruling R50: a `Date` is read by its LOCAL calendar components, never
   * through `toISOString()`.
   *
   * node-postgres materializes a PostgreSQL `date` column as a JavaScript
   * `Date` at LOCAL midnight -- a `date` has no time and no zone, so the
   * driver picks the running process's zone to put it in. `toISOString()`
   * then converts that instant to UTC, and every zone east of Greenwich
   * moves it back across midnight into the previous day. Under the
   * deployment zone (`TZ=Africa/Kigali`, UTC+2) a column holding
   * `1990-01-01` came back as `1989-12-31`: the YEAR changes, so the
   * `year(birth_date)` blocking key changes with it, so the duplicate is
   * never proposed and never scored. Silent corruption of a primary
   * matching field, invisible in any output -- the normalized value simply
   * names a different day than the register does.
   *
   * Reading `getFullYear()`/`getMonth()`/`getDate()` asks the `Date` for
   * the calendar day it was constructed to represent, in the same zone it
   * was constructed in, so the round trip is exact regardless of `TZ`.
   *
   * The string path is deliberately left on `toISOString()`: a bare
   * `'1990-01-01'` (and `'1990/01/01'` after the separator rewrite) is
   * parsed by the ECMAScript date-only grammar as UTC midnight, so
   * `toISOString()` returns it unchanged. Both paths, and the
   * unparseable-input path (`''`), are locked by tests.
   */
  normalizeDate(raw: string | Date | null | undefined): string {
    if (raw === null || raw === undefined || raw === '') return '';
    if (raw instanceof Date) {
      if (Number.isNaN(raw.getTime())) return '';
      const year = String(raw.getFullYear()).padStart(4, '0');
      const month = String(raw.getMonth() + 1).padStart(2, '0');
      const day = String(raw.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const value = new Date(String(raw).replace(/\//g, '-'));
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
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
