import * as fs from 'fs';
import * as path from 'path';

describe('IngestionController security (SEC-01)', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'ingestion.controller.ts'),
    'utf8',
  );

  it('contains no hardcoded organization UUID fallback', () => {
    expect(source).not.toContain('8498b154-4864-433b-8573-93ae7d2ee200');
  });

  it('uses the real CurrentUser decorator, not a placeholder', () => {
    expect(source).toContain(
      "from '../auth/decorators/current-user.decorator'",
    );
    expect(source).not.toContain('Placeholder');
  });

  it('declares user as required on every handler (no `user?: User`)', () => {
    expect(source).not.toMatch(/user\?\s*:\s*User/);
  });
});
