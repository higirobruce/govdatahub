const { Client } = require('pg');
require('dotenv').config({ path: '../../.env' });

console.log('Environment variables:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_USERNAME:', process.env.DB_USERNAME);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***' : 'undefined');
console.log('DB_DATABASE:', process.env.DB_DATABASE);
console.log('');

async function testConnection() {
  // Test 1: Try with 'admin' user
  console.log('Test 1: Connecting with admin user...');
  const adminClient = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'admin',
    password: process.env.DB_PASSWORD || 'admin123',
    database: process.env.DB_DATABASE || 'govdatahub',
  });

  try {
    await adminClient.connect();
    const result = await adminClient.query('SELECT current_user, version()');
    console.log('✅ SUCCESS with admin user!');
    console.log('Current user:', result.rows[0].current_user);
    console.log('');
    await adminClient.end();
  } catch (error) {
    console.log('❌ FAILED with admin user');
    console.log('Error:', error.message);
    console.log('');
  }

  // Test 2: Try with 'postgres' superuser
  console.log('Test 2: Connecting with postgres superuser...');
  const postgresClient = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: 'postgres',
    password: process.env.DB_PASSWORD || 'admin123',
    database: 'postgres',
  });

  try {
    await postgresClient.connect();

    // List all users
    const users = await postgresClient.query('SELECT usename FROM pg_user');
    console.log('✅ Connected as postgres superuser');
    console.log('Available users:', users.rows.map(r => r.usename).join(', '));
    console.log('');

    // Check if admin user exists
    const adminExists = users.rows.some(r => r.usename === 'admin');
    if (!adminExists) {
      console.log('⚠️  admin user does NOT exist! Creating it...');
      await postgresClient.query(`
        CREATE USER admin WITH PASSWORD 'admin123';
        ALTER USER admin CREATEDB;
      `);
      console.log('✅ Created admin user');

      // Create govdatahub database if it doesn't exist
      const dbCheck = await postgresClient.query(`
        SELECT 1 FROM pg_database WHERE datname = 'govdatahub'
      `);
      if (dbCheck.rows.length === 0) {
        await postgresClient.query('CREATE DATABASE govdatahub OWNER admin');
        console.log('✅ Created govdatahub database');
      }
    } else {
      console.log('✅ admin user exists');
    }

    await postgresClient.end();
  } catch (error) {
    console.log('❌ FAILED with postgres user');
    console.log('Error:', error.message);
    console.log('');
  }
}

testConnection().catch(console.error);
