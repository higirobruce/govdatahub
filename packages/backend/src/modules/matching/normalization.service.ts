import { Injectable } from '@nestjs/common';
import { FieldRole } from '../../database/entities';

@Injectable()
export class NormalizationService {
  normalizeText(raw: string | null | undefined): string {
    if (raw === null || raw === undefined) return '';
    return String(raw)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
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

  normalizeDate(raw: string | Date | null | undefined): string {
    if (raw === null || raw === undefined || raw === '') return '';
    const value = raw instanceof Date ? raw : new Date(String(raw).replace(/\//g, '-'));
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
