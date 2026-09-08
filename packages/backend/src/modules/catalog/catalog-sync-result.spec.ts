import * as fs from 'fs';
import * as path from 'path';

describe('Catalog sync persistence (SEC-06)', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'catalog.service.ts'),
    'utf8',
  );

  it('does not build jsonb_set SQL from interpolated strings', () => {
    expect(source).not.toContain('jsonb_set');
  });
});
