#!/bin/bash

# Script to completely reset the PostgreSQL database
# This is needed when the database was created without proper environment variables

set -e  # Exit on any error

echo "🔄 Resetting GovDataHub PostgreSQL database..."
echo ""

# Check if docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed or not in PATH"
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/.."

echo "1️⃣  Stopping containers..."
docker compose down

echo ""
echo "2️⃣  Removing PostgreSQL volume (this deletes all data)..."
docker volume rm govdatahub_postgres-data 2>/dev/null || echo "   Volume already removed or doesn't exist"

echo ""
echo "3️⃣  Starting containers with fresh volumes..."
docker compose up -d

echo ""
echo "4️⃣  Waiting for PostgreSQL to initialize (15 seconds)..."
sleep 15

echo ""
echo "5️⃣  Testing PostgreSQL connection..."
if docker exec govdatahub-postgres psql -U admin -d govdatahub -c "SELECT 'Connection successful!' as status;" > /dev/null 2>&1; then
    echo "   ✅ PostgreSQL is ready!"
    docker exec govdatahub-postgres psql -U admin -d govdatahub -c "SELECT version();"
else
    echo "   ❌ Failed to connect to PostgreSQL"
    echo ""
    echo "Checking logs..."
    docker compose logs postgres | tail -20
    exit 1
fi

echo ""
echo "6️⃣  Running database migrations..."
cd packages/backend
if command -v pnpm &> /dev/null; then
    pnpm run migration:run
else
    npm run migration:run
fi

echo ""
echo "✨ Database reset complete!"
echo ""
echo "You can now start your backend server with:"
echo "  pnpm dev"
echo ""
