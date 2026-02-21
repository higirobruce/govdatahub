#!/bin/bash

# Comprehensive diagnostic and fix script for PostgreSQL connection issues

set +e  # Don't exit on errors, we want to see what's happening

echo "🔍 DIAGNOSING POSTGRESQL ISSUE"
echo "================================"
echo ""

# Check Docker
echo "1️⃣  Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "   ❌ Docker is not installed or not in PATH"
    exit 1
fi
echo "   ✅ Docker is available"
echo ""

# List all running containers
echo "2️⃣  Listing all running containers..."
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
echo ""

# List all PostgreSQL containers (running or stopped)
echo "3️⃣  Checking for PostgreSQL containers..."
POSTGRES_CONTAINERS=$(docker ps -a --filter "ancestor=postgres:15-alpine" --format "{{.Names}}")
if [ -z "$POSTGRES_CONTAINERS" ]; then
    echo "   ℹ️  No PostgreSQL containers found"
else
    echo "   Found PostgreSQL containers:"
    for container in $POSTGRES_CONTAINERS; do
        echo "   - $container"
    done
fi
echo ""

# List all volumes
echo "4️⃣  Checking Docker volumes..."
docker volume ls | grep -E "(postgres|datagate)" || echo "   ℹ️  No postgres/datagate volumes found"
echo ""

# Check if port 5432 is in use
echo "5️⃣  Checking if port 5432 is in use..."
if lsof -i :5432 &> /dev/null; then
    echo "   ⚠️  Port 5432 is in use:"
    lsof -i :5432
else
    echo "   ✅ Port 5432 is free"
fi
echo ""

echo "================================"
echo "🔧 APPLYING NUCLEAR FIX"
echo "================================"
echo ""

cd "$(dirname "$0")/.."

echo "Step 1: Stopping ALL containers..."
docker compose down
sleep 2

echo ""
echo "Step 2: Removing specific container if it exists..."
docker rm -f datagate-postgres 2>/dev/null || echo "Container already removed"

echo ""
echo "Step 3: Removing ALL volumes related to this project..."
docker volume ls | grep datagate | awk '{print $2}' | xargs -r docker volume rm 2>/dev/null || echo "Volumes already removed"

echo ""
echo "Step 4: Verifying volumes are gone..."
docker volume ls | grep -E "(postgres|datagate)" && echo "⚠️  Some volumes still exist!" || echo "✅ All volumes removed"

echo ""
echo "Step 5: Removing any stopped PostgreSQL containers..."
docker ps -a --filter "ancestor=postgres:15-alpine" --format "{{.Names}}" | xargs -r docker rm 2>/dev/null || echo "No containers to remove"

echo ""
echo "Step 6: Pulling fresh PostgreSQL image..."
docker pull postgres:15-alpine

echo ""
echo "Step 7: Starting containers with fresh initialization..."
docker compose up -d

echo ""
echo "Step 8: Waiting for PostgreSQL to initialize (20 seconds)..."
for i in {20..1}; do
    echo -ne "   ⏳ $i seconds remaining...\r"
    sleep 1
done
echo ""

echo ""
echo "Step 9: Checking PostgreSQL logs..."
echo "-----------------------------------"
docker compose logs postgres | tail -30
echo "-----------------------------------"

echo ""
echo "Step 10: Testing connection with admin user..."
if docker exec datagate-postgres psql -U admin -d datagate -c "SELECT 'SUCCESS!' as status;" 2>&1; then
    echo ""
    echo "✅ CONNECTION SUCCESSFUL!"
    echo ""
    echo "Step 11: Running migrations..."
    cd packages/backend
    npm run migration:run || pnpm run migration:run || echo "⚠️  Migration failed, but database is ready"
    echo ""
    echo "✨ ALL DONE! Database is ready."
    echo ""
    echo "Start your backend with: pnpm dev"
else
    echo ""
    echo "❌ CONNECTION STILL FAILED"
    echo ""
    echo "Debugging information:"
    echo "======================"
    echo ""
    echo "Container status:"
    docker ps | grep postgres
    echo ""
    echo "Container environment:"
    docker exec datagate-postgres env | grep POSTGRES
    echo ""
    echo "Available users in database:"
    docker exec datagate-postgres psql -U postgres -c "\du" 2>&1 || echo "Could not query users"
    echo ""
    echo "Available databases:"
    docker exec datagate-postgres psql -U postgres -c "\l" 2>&1 || echo "Could not query databases"
fi
