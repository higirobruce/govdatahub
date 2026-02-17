-- Setup script for Foreign Data Wrapper extensions
-- Run this as a PostgreSQL superuser

-- Connect to the govdatahub database
\c govdatahub

-- Create the postgres_fdw extension
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- Verify the extension was created
SELECT extname, extversion FROM pg_extension WHERE extname = 'postgres_fdw';

-- Grant necessary permissions to the application user
-- For development, making admin a superuser is simplest
-- For production, you'd want more granular permissions
ALTER USER admin WITH SUPERUSER;

-- Verify permissions
SELECT usename, usesuper FROM pg_user WHERE usename = 'admin';

-- Show current user for verification
SELECT current_user;

-- Done!
\echo 'postgres_fdw extension setup complete!'
\echo 'Admin user now has superuser privileges for FDW operations'
