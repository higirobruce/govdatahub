#!/bin/bash
set -e

# Navigate to project root regardless of where script is called from
cd "$(dirname "$0")/.."

echo "Setting up DataGate (local PostgreSQL + MySQL)..."
echo ""

# ── Detect OS ────────────────────────────────────────────────────────────────
OS="$(uname -s)"

# ── Helpers ──────────────────────────────────────────────────────────────────
need() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found. $2"; exit 1; }
}

pg_run() {
  # Run a psql command as the postgres superuser
  if [[ "$OS" == "Darwin" ]]; then
    psql -U "$(whoami)" -d postgres "$@"
  else
    sudo -u postgres psql "$@"
  fi
}

# ── Prerequisites ─────────────────────────────────────────────────────────────
need node  "Install Node.js 20+ from https://nodejs.org"
need psql  "Install PostgreSQL: brew install postgresql@15  (macOS) or apt install postgresql (Linux)"
need mysql "Install MySQL: brew install mysql  (macOS) or apt install mysql-server (Linux)"

command -v pnpm >/dev/null 2>&1 || { echo "Installing pnpm..."; npm install -g pnpm; }

# ── Start services ────────────────────────────────────────────────────────────
echo "Starting database services..."

if [[ "$OS" == "Darwin" ]]; then
  # macOS — try both versioned and unversioned brew service names
  if brew services list | grep -q "postgresql@15"; then
    brew services start postgresql@15 2>/dev/null || true
  elif brew services list | grep -q "postgresql"; then
    brew services start postgresql 2>/dev/null || true
  fi

  brew services start mysql 2>/dev/null || true

  echo "Waiting for PostgreSQL to be ready..."
  for i in $(seq 1 30); do
    pg_isready -U "$(whoami)" -d postgres >/dev/null 2>&1 && break
    sleep 1
  done

  echo "Waiting for MySQL to be ready..."
  for i in $(seq 1 30); do
    mysqladmin -h 127.0.0.1 -P 3306 -u root ping --silent 2>/dev/null && break
    sleep 1
  done
else
  # Linux — systemd
  sudo systemctl start postgresql 2>/dev/null || true
  sudo systemctl start mysql     2>/dev/null || true

  echo "Waiting for PostgreSQL to be ready..."
  for i in $(seq 1 30); do
    sudo -u postgres pg_isready >/dev/null 2>&1 && break
    sleep 1
  done

  echo "Waiting for MySQL to be ready..."
  for i in $(seq 1 30); do
    mysqladmin -h 127.0.0.1 -P 3306 -u root ping --silent 2>/dev/null && break
    sleep 1
  done
fi

echo "  Databases ready."
echo ""

# ── PostgreSQL: create user + database ───────────────────────────────────────
echo "Configuring PostgreSQL..."

# Read DB config from .env if present, otherwise use defaults
PG_DB=$(grep -E '^DB_DATABASE=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]' || echo "datagate")
PG_USER=$(grep -E '^DB_USERNAME=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]' || echo "admin")
PG_PASS=$(grep -E '^DB_PASSWORD=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]' || echo "admin123")

# Create role (ignore error if already exists)
pg_run -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$PG_USER') THEN
    CREATE ROLE $PG_USER LOGIN PASSWORD '$PG_PASS';
  END IF;
END \$\$;" >/dev/null

# Create database owned by the role (ignore if exists)
pg_run -tc "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" \
  | grep -q 1 \
  || pg_run -c "CREATE DATABASE $PG_DB OWNER $PG_USER;" >/dev/null

# Grant privileges
pg_run -c "GRANT ALL PRIVILEGES ON DATABASE $PG_DB TO $PG_USER;" >/dev/null

# Enable postgres_fdw as superuser (requires superuser privilege)
pg_run -d "$PG_DB" -c "CREATE EXTENSION IF NOT EXISTS postgres_fdw;" >/dev/null 2>&1 || true

echo "  PostgreSQL: database '$PG_DB', user '$PG_USER' ready."

# ── MySQL: create database + user ────────────────────────────────────────────
echo "Configuring MySQL..."

# Resolve MySQL root password.
# Accept via env var, script arg, or auto-detect.
MYSQL_ROOT_PASS="${MYSQL_ROOT_PASSWORD:-}"

mysql_try() {
  local pass="$1"; shift
  if [[ -n "$pass" ]]; then
    mysql -h 127.0.0.1 -P 3306 -u root -p"$pass" "$@"
  else
    mysql -h 127.0.0.1 -P 3306 -u root "$@"
  fi
}

if [[ -z "$MYSQL_ROOT_PASS" ]]; then
  # Try no password first (Homebrew default)
  if ! mysql_try "" -e "SELECT 1;" >/dev/null 2>&1; then
    # Try docker-compose default
    if mysql_try "rootpass" -e "SELECT 1;" >/dev/null 2>&1; then
      MYSQL_ROOT_PASS="rootpass"
    else
      read -rsp "  MySQL root password: " MYSQL_ROOT_PASS
      echo ""
    fi
  fi
fi

mysql_try "$MYSQL_ROOT_PASS" <<'SQL'
CREATE DATABASE IF NOT EXISTS sampledb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'testuser'@'%' IDENTIFIED BY 'testpass';
GRANT ALL PRIVILEGES ON sampledb.* TO 'testuser'@'%';
FLUSH PRIVILEGES;
SQL

echo "  MySQL: database 'sampledb', user 'testuser' ready."
echo ""

# ── .env file ────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "Generating .env..."
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 32)
  cp .env.example .env

  if [[ "$OS" == "Darwin" ]]; then
    sed -i '' "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
    sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
  else
    sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
  fi

  echo "  Created .env with fresh encryption key and JWT secret."
else
  echo ".env already exists, skipping."
fi
echo ""

# ── Install dependencies ──────────────────────────────────────────────────────
echo "Installing dependencies..."
pnpm install
echo ""

# ── Run migrations ────────────────────────────────────────────────────────────
echo "Running database migrations..."
cd packages/backend
pnpm run migration:run

echo "Seeding default data..."
pnpm run seed
cd ../..
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────
echo "Setup complete!"
echo ""
echo "  Login:    admin@datagate.dev"
echo "  Password: admin123"
echo ""
echo "Sample connections pre-configured in DataGate:"
echo "  PostgreSQL  host=localhost  port=5432  db=${PG_DB}   user=${PG_USER}     pass=${PG_PASS}"
echo "  MySQL       host=localhost  port=3306  db=sampledb   user=testuser  pass=testpass"
echo ""
echo "Start the dev servers:"
echo "  pnpm dev"
echo ""
echo "  Frontend:   http://localhost:3000"
echo "  Backend:    http://localhost:3001/api"
echo "  Swagger:    http://localhost:3001/api/docs"
echo ""
