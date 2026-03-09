/**
 * DataGate seed script
 *
 * Creates:
 *  - Default organization
 *  - Admin user  (admin@datagate.dev / admin123)
 *  - Two sample connections: local PostgreSQL + local MySQL
 *
 * Idempotent — safe to run multiple times.
 * Run with: pnpm --filter backend seed
 */

import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from './data-source';

// ── Inline AES-256-GCM encryption (matches EncryptionService) ────────────────
function encrypt(text: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string in .env');
  }
  const keyBuffer = Buffer.from(key, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function encryptObject<T>(obj: T): string {
  return encrypt(JSON.stringify(obj));
}

// ── Seed data ─────────────────────────────────────────────────────────────────
const ORG = {
  name: 'Default Organization',
  subdomain: 'default',
};

const ADMIN_USER = {
  email: 'admin@datagate.dev',
  password: 'admin123',
  firstName: 'Admin',
  lastName: 'User',
  role: 'org_admin',
};

// These match what setup-local.sh creates
const SAMPLE_CONNECTIONS = [
  {
    name: 'Local PostgreSQL',
    type: 'postgresql',
    config: {
      host: 'localhost',
      port: 5432,
      username: process.env.DB_USERNAME || 'admin',
      password: process.env.DB_PASSWORD || 'admin123',
      database: process.env.DB_DATABASE || 'govdatahub',
      ssl: false,
    },
  },
  {
    name: 'Local MySQL (sample)',
    type: 'mysql',
    config: {
      host: '127.0.0.1',
      port: 3306,
      username: 'testuser',
      password: 'testpass',
      database: 'sampledb',
      ssl: false,
    },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('Connecting to database...');
  await AppDataSource.initialize();
  const db = AppDataSource.manager;

  // 1. Organization
  console.log('Seeding organization...');
  let org = await db.query(
    `SELECT id FROM organizations WHERE subdomain = $1 LIMIT 1`,
    [ORG.subdomain],
  );
  let orgId: string;
  if (org.length) {
    orgId = org[0].id;
    console.log(`  Organization already exists (id: ${orgId})`);
  } else {
    orgId = uuidv4();
    await db.query(
      `INSERT INTO organizations (id, name, subdomain, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, true, NOW(), NOW())`,
      [orgId, ORG.name, ORG.subdomain],
    );
    console.log(`  Created organization: ${ORG.name} (id: ${orgId})`);
  }

  // 2. Admin user
  console.log('Seeding admin user...');
  const existing = await db.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [ADMIN_USER.email],
  );
  if (existing.length) {
    console.log(`  User already exists: ${ADMIN_USER.email}`);
  } else {
    const passwordHash = await bcrypt.hash(ADMIN_USER.password, 10);
    const userId = uuidv4();
    await db.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, organization_id, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())`,
      [userId, ADMIN_USER.email, passwordHash, ADMIN_USER.firstName, ADMIN_USER.lastName, orgId, ADMIN_USER.role],
    );
    console.log(`  Created user: ${ADMIN_USER.email}`);
  }

  // 3. Sample connections
  console.log('Seeding sample connections...');
  for (const conn of SAMPLE_CONNECTIONS) {
    const exists = await db.query(
      `SELECT id FROM connections WHERE name = $1 AND organization_id = $2 LIMIT 1`,
      [conn.name, orgId],
    );
    if (exists.length) {
      console.log(`  Connection already exists: ${conn.name}`);
      continue;
    }
    const connId = uuidv4();
    const encryptedConfig = encryptObject(conn.config);
    await db.query(
      `INSERT INTO connections (id, name, type, config, organization_id, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [connId, conn.name, conn.type, encryptedConfig, orgId],
    );
    console.log(`  Created connection: ${conn.name}`);
  }

  await AppDataSource.destroy();

  console.log('');
  console.log('Seed complete!');
  console.log('');
  console.log('  Login:    admin@datagate.dev');
  console.log('  Password: admin123');
  console.log('');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
