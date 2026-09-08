import { createHash } from 'crypto';

/** SHA-256 hex digest. Used to store share tokens/API keys irreversibly. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
