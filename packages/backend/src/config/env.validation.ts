const REQUIRED_IN_PRODUCTION = ['JWT_SECRET', 'ENCRYPTION_KEY', 'DB_PASSWORD'] as const;

/**
 * ConfigModule validate hook. In production, refuse to boot without the
 * secrets that otherwise silently fall back to dev defaults.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (config.NODE_ENV === 'production') {
    const missing = REQUIRED_IN_PRODUCTION.filter(
      (key) => !config[key] || String(config[key]).trim() === '',
    );
    if (missing.length > 0) {
      throw new Error(
        `Refusing to start in production without required env vars: ${missing.join(', ')}`,
      );
    }
  }
  return config;
}
