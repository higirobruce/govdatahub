import { BadRequestException } from '@nestjs/common';
import { AiProvider } from '../../database/entities';
import { IDENT } from './blocking-sql';

/**
 * Asserts that the organization's AI provider is local-only.
 * Uses an allow-list (LOCAL, CUSTOM only) rather than a block-list, because
 * `organization_settings.ai_provider` is an unconstrained varchar(50) with no
 * database enum or CHECK constraint. A block-list would fail open on typos,
 * future additions to the enum, or hand-edited rows — violating the core
 * requirement that personal data must never leave the server.
 */
export function assertLocalProvider(settings: { aiProvider: AiProvider }): void {
  if (
    settings.aiProvider !== AiProvider.LOCAL &&
    settings.aiProvider !== AiProvider.CUSTOM
  ) {
    throw new BadRequestException(
      'Matching projects require a local AI provider — personal data must not leave the server',
    );
  }
}

/**
 * Asserts that the column is in the allow-list and passes IDENT validation.
 * Returns the column name if it passes both checks.
 * Throws BadRequestException if the column is not allowed or fails identifier validation.
 */
export function assertColumnAllowed(column: string, allowlist: string[]): string {
  if (!allowlist.includes(column)) {
    throw new BadRequestException(
      `Column "${column}" is not in the allow-list for this matching project`,
    );
  }
  if (!IDENT.test(column)) {
    throw new BadRequestException(
      `Column "${column}" is not a valid SQL identifier`,
    );
  }
  return column;
}
