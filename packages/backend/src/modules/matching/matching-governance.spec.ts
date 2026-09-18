import { BadRequestException } from '@nestjs/common';
import { AiProvider } from '../../database/entities';
import { assertLocalProvider, assertColumnAllowed } from './matching-governance';

describe('assertLocalProvider', () => {
  it.each([AiProvider.OPENAI, AiProvider.ANTHROPIC, AiProvider.AZURE])(
    'refuses %s because personal data must never leave the server', (provider) => {
      expect(() => assertLocalProvider({ aiProvider: provider } as any)).toThrow(BadRequestException);
    });

  it.each([AiProvider.LOCAL, AiProvider.CUSTOM])('allows %s', (provider) => {
    expect(() => assertLocalProvider({ aiProvider: provider } as any)).not.toThrow();
  });

  it('fails closed on unknown provider string (e.g. typo or future addition)', () => {
    // The ai_provider column is an unconstrained varchar, so a typo, future enum
    // addition, or hand-edited row could contain any string. A cast is appropriate
    // here to model that runtime reality, not to defeat the type system.
    expect(() => assertLocalProvider({ aiProvider: 'gemini' as AiProvider })).toThrow(
      BadRequestException,
    );
  });

  it('fails closed on empty string provider', () => {
    expect(() => assertLocalProvider({ aiProvider: '' as AiProvider })).toThrow(BadRequestException);
  });

  it('fails closed on undefined provider', () => {
    expect(() => assertLocalProvider({ aiProvider: undefined as unknown as AiProvider })).toThrow(
      BadRequestException,
    );
  });
});

describe('assertColumnAllowed', () => {
  it('returns a column that is on the allow-list', () => {
    expect(assertColumnAllowed('surname', ['surname', 'dob'])).toBe('surname');
  });
  it('refuses a column that is not on the allow-list', () => {
    expect(() => assertColumnAllowed('salary', ['surname', 'dob'])).toThrow(BadRequestException);
  });
  it('refuses an allow-listed column that is not a plain identifier', () => {
    expect(() => assertColumnAllowed('a"; --', ['a"; --'])).toThrow(BadRequestException);
  });
});
