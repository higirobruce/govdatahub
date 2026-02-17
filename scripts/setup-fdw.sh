#!/bin/bash

# Setup Foreign Data Wrapper extensions for GovDataHub
# This script must be run with PostgreSQL superuser privileges

echo "=========================================="
echo "GovDataHub FDW Setup"
echo "=========================================="
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "Error: psql command not found. Please install PostgreSQL client."
    exit 1
fi

# Run the setup SQL file as postgres superuser
echo "Running FDW setup as postgres superuser..."
echo "You may be prompted for the postgres user password."
echo ""

psql -U postgres -d govdatahub -f "$(dirname "$0")/setup-fdw.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✓ FDW setup completed successfully!"
    echo "=========================================="
    echo ""
    echo "You can now restart your backend server and try creating cross-database queries."
else
    echo ""
    echo "=========================================="
    echo "✗ FDW setup failed!"
    echo "=========================================="
    echo ""
    echo "Troubleshooting tips:"
    echo "1. Make sure PostgreSQL is running"
    echo "2. Make sure you have the postgres superuser password"
    echo "3. Try running manually: psql -U postgres -d govdatahub -f scripts/setup-fdw.sql"
    exit 1
fi
