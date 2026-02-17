import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { join, resolve } from 'path';

// Load .env from project root - try multiple possible locations
const possibleEnvPaths = [
  '/Users/brucehigiro/Documents/development/govdatahub/.env', // Absolute path - try first!
  resolve(__dirname, '../../../.env'),           // From dist/database/
  resolve(process.cwd(), '../../.env'),          // From packages/backend/
  resolve(process.cwd(), '.env'),                 // From root if run from there
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  try {
    const result = config({ path: envPath, override: true }); // override: true to replace any previous values
    // Check if we actually loaded the required DB variables
    if (result.parsed && process.env.DB_HOST && process.env.DB_USERNAME) {
      console.log(`✅ Loaded .env from: ${envPath}`);
      console.log(`   DB_HOST: ${process.env.DB_HOST}`);
      console.log(`   DB_USERNAME: ${process.env.DB_USERNAME}`);
      console.log(`   DB_DATABASE: ${process.env.DB_DATABASE}`);
      envLoaded = true;
      break;
    }
  } catch (e) {
    // Try next path
  }
}

if (!envLoaded) {
  console.error('⚠️  Warning: Could not load .env file with required DB variables');
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'admin',
  password: process.env.DB_PASSWORD || 'admin123',
  database: process.env.DB_DATABASE || 'govdatahub',
  entities: [join(__dirname, 'entities', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false, // Use migrations in production
  logging: process.env.NODE_ENV === 'development',
});
