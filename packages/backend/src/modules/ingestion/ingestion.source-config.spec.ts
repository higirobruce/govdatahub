import * as fs from 'fs';
import * as path from 'path';

describe('Import job sourceConfig redaction (SEC-09b)', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'ingestion.service.ts'),
    'utf8',
  );

  it('never stores the raw auth object on the import job', () => {
    // the redacted form stores only auth.type
    expect(source).not.toMatch(/sourceConfig:[\s\S]{0,200}auth:\s*uploadDto\.auth\b/);
  });

  it('never stores raw header values on the import job', () => {
    expect(source).not.toMatch(/sourceConfig:[\s\S]{0,300}headers:\s*uploadDto\.headers\b/);
  });
});
