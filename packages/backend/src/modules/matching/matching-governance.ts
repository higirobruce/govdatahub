import { BadRequestException } from '@nestjs/common';
import { AiProvider } from '../../database/entities';
import { IDENT } from './blocking-sql';

/**
 * Asserts that the organization's AI provider is local-only.
 * Throws BadRequestException for remote providers (OpenAI, Anthropic, Azure)
 * since personal data must never leave the server.
 */
export function assertLocalProvider(settings: { aiProvider: AiProvider }): void {
  if (
    settings.aiProvider === AiProvider.OPENAI ||
    settings.aiProvider === AiProvider.ANTHROPIC ||
    settings.aiProvider === AiProvider.AZURE
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
