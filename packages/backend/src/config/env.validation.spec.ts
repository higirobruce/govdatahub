import { validateEnv } from './env.validation';

const prodEnv = {
  NODE_ENV: 'production',
  JWT_SECRET: 's3cret',
  ENCRYPTION_KEY: 'a'.repeat(64),
  DB_PASSWORD: 'pw',
};

describe('validateEnv (SEC-11)', () => {
  it('passes a complete production config through', () => {
    expect(validateEnv(prodEnv)).toEqual(prodEnv);
  });

  it.each(['JWT_SECRET', 'ENCRYPTION_KEY', 'DB_PASSWORD'])(
    'throws in production when %s is missing',
    (key) => {
      const env = { ...prodEnv } as Record<string, unknown>;
      delete env[key];
      expect(() => validateEnv(env)).toThrow(key);
    },
  );

  it('does not require secrets outside production', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
  });
});
