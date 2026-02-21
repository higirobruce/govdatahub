#!/bin/bash
set -e

echo "🚀 Setting up GovDataHub MVP..."

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required. Please install Node.js 20+"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "📦 Installing pnpm..."; npm install -g pnpm; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required. Please install Docker"; exit 1; }

# Generate encryption key and create .env if not exists
if [ ! -f .env ]; then
    echo "🔐 Generating encryption key..."
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    cp .env.example .env

    # Use different sed syntax based on OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
    else
        sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
    fi

    echo "✅ Created .env file with encryption key"
else
    echo "⚠️  .env file already exists, skipping..."
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Start PostgreSQL and MySQL
echo "🐳 Starting PostgreSQL and MySQL..."
docker compose up -d

# Wait for PostgreSQL
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker compose exec -T postgres pg_isready -U admin -d datagate >/dev/null 2>&1; do
    sleep 1
done

# Wait for MySQL
echo "⏳ Waiting for MySQL to be ready..."
until docker compose exec -T mysql mysqladmin ping -h localhost -u root -prootpass >/dev/null 2>&1; do
    sleep 1
done

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'pnpm dev' to start development servers"
echo "  2. Frontend: http://localhost:3000"
echo "  3. Backend API: http://localhost:3001/api"
echo "  4. Swagger docs: http://localhost:3001/api/docs"
echo ""
