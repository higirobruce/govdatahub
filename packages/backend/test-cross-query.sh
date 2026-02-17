#!/bin/bash

# Cross-Query API Test Script
# Usage: ./test-cross-query.sh

set -e

# Configuration
API_URL="http://localhost:3001/api"
JWT_TOKEN=""  # Set this after login

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "Cross-Query Backend Test Script"
echo "========================================="
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: jq not found. Install for better JSON formatting:${NC}"
    echo "  brew install jq  # macOS"
    echo "  apt-get install jq  # Ubuntu"
    echo ""
fi

# Function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3

    echo -e "${YELLOW}→ $method $endpoint${NC}"

    if [ -z "$data" ]; then
        curl -X $method \
            -H "Authorization: Bearer $JWT_TOKEN" \
            -H "Content-Type: application/json" \
            -s "$API_URL$endpoint" | jq '.' 2>/dev/null || cat
    else
        curl -X $method \
            -H "Authorization: Bearer $JWT_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data" \
            -s "$API_URL$endpoint" | jq '.' 2>/dev/null || cat
    fi

    echo ""
    echo ""
}

# Step 1: Login (update credentials)
echo -e "${GREEN}Step 1: Login${NC}"
echo "Update the credentials below and uncomment to test:"
echo ""
# LOGIN_RESPONSE=$(api_call POST /auth/login '{
#   "email": "your@email.com",
#   "password": "your_password"
# }')
# JWT_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.access_token')
# echo "JWT Token: $JWT_TOKEN"
echo ""

# Prompt for token if not set
if [ -z "$JWT_TOKEN" ]; then
    echo -e "${YELLOW}Please set JWT_TOKEN variable in this script or export it:${NC}"
    echo "export JWT_TOKEN='your_token_here'"
    echo ""
    read -p "Press Enter to continue with manual testing, or Ctrl+C to exit..."
    echo ""
fi

# Step 2: Add test connections
echo -e "${GREEN}Step 2: Create Test Connections${NC}"
echo ""
echo "Connection 1 (Users Database):"
CONN1_DATA='{
  "name": "Users Database",
  "type": "postgresql",
  "host": "localhost",
  "port": 5433,
  "database": "test_db_1",
  "username": "testuser",
  "password": "testpass",
  "ssl": false
}'

# Uncomment to create connection:
# CONN1_RESPONSE=$(api_call POST /connections "$CONN1_DATA")
# CONN1_ID=$(echo $CONN1_RESPONSE | jq -r '.id')
# echo "Connection 1 ID: $CONN1_ID"

echo "Example curl command:"
echo "curl -X POST $API_URL/connections \\"
echo "  -H 'Authorization: Bearer \$JWT_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '$CONN1_DATA'"
echo ""

echo "Connection 2 (Orders Database):"
CONN2_DATA='{
  "name": "Orders Database",
  "type": "postgresql",
  "host": "localhost",
  "port": 5434,
  "database": "test_db_2",
  "username": "testuser",
  "password": "testpass",
  "ssl": false
}'

# Uncomment to create connection:
# CONN2_RESPONSE=$(api_call POST /connections "$CONN2_DATA")
# CONN2_ID=$(echo $CONN2_RESPONSE | jq -r '.id')
# echo "Connection 2 ID: $CONN2_ID"

echo "Example curl command:"
echo "curl -X POST $API_URL/connections \\"
echo "  -H 'Authorization: Bearer \$JWT_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '$CONN2_DATA'"
echo ""

# Prompt for connection IDs
read -p "Enter Connection 1 ID (users): " CONN1_ID
read -p "Enter Connection 2 ID (orders): " CONN2_ID
echo ""

# Step 3: Test connections
echo -e "${GREEN}Step 3: Test Connections${NC}"
echo ""
echo "Testing Connection 1:"
echo "curl -X POST $API_URL/connections/$CONN1_ID/test \\"
echo "  -H 'Authorization: Bearer \$JWT_TOKEN'"
echo ""

echo "Testing Connection 2:"
echo "curl -X POST $API_URL/connections/$CONN2_ID/test \\"
echo "  -H 'Authorization: Bearer \$JWT_TOKEN'"
echo ""

# Step 4: Execute cross-database query
echo -e "${GREEN}Step 4: Execute Cross-Database Query (INNER JOIN)${NC}"
echo ""

QUERY_DATA="{
  \"queryDefinition\": {
    \"tables\": [
      {
        \"connectionId\": \"$CONN1_ID\",
        \"schemaName\": \"public\",
        \"tableName\": \"users\",
        \"alias\": \"u\"
      },
      {
        \"connectionId\": \"$CONN2_ID\",
        \"schemaName\": \"public\",
        \"tableName\": \"orders\",
        \"alias\": \"o\"
      }
    ],
    \"joins\": [
      {
        \"type\": \"INNER\",
        \"leftTable\": \"u\",
        \"rightTable\": \"o\",
        \"conditions\": [
          {
            \"leftColumn\": \"id\",
            \"operator\": \"=\",
            \"rightColumn\": \"user_id\"
          }
        ]
      }
    ],
    \"columns\": [
      { \"table\": \"u\", \"column\": \"name\" },
      { \"table\": \"u\", \"column\": \"email\" },
      { \"table\": \"o\", \"column\": \"total\" },
      { \"table\": \"o\", \"column\": \"status\" }
    ],
    \"limit\": 10
  }
}"

echo "curl -X POST $API_URL/cross-query/execute \\"
echo "  -H 'Authorization: Bearer \$JWT_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '$QUERY_DATA'"
echo ""

# Uncomment to execute:
# api_call POST /cross-query/execute "$QUERY_DATA"

# Step 5: Test with filters
echo -e "${GREEN}Step 5: Test Query with Filters${NC}"
echo ""

FILTER_QUERY="{
  \"queryDefinition\": {
    \"tables\": [
      {
        \"connectionId\": \"$CONN1_ID\",
        \"schemaName\": \"public\",
        \"tableName\": \"users\",
        \"alias\": \"u\"
      },
      {
        \"connectionId\": \"$CONN2_ID\",
        \"schemaName\": \"public\",
        \"tableName\": \"orders\",
        \"alias\": \"o\"
      }
    ],
    \"joins\": [
      {
        \"type\": \"INNER\",
        \"leftTable\": \"u\",
        \"rightTable\": \"o\",
        \"conditions\": [
          {
            \"leftColumn\": \"id\",
            \"operator\": \"=\",
            \"rightColumn\": \"user_id\"
          }
        ]
      }
    ],
    \"columns\": [
      { \"table\": \"u\", \"column\": \"name\" },
      { \"table\": \"o\", \"column\": \"total\" },
      { \"table\": \"o\", \"column\": \"status\" }
    ],
    \"filters\": [
      {
        \"table\": \"o\",
        \"column\": \"status\",
        \"operator\": \"=\",
        \"value\": \"completed\"
      }
    ],
    \"limit\": 10
  }
}"

echo "curl -X POST $API_URL/cross-query/execute \\"
echo "  -H 'Authorization: Bearer \$JWT_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '$FILTER_QUERY'"
echo ""

# Step 6: Save query
echo -e "${GREEN}Step 6: Save Query${NC}"
echo ""

SAVE_QUERY="{
  \"name\": \"User Orders Report\",
  \"description\": \"Join users with their orders\",
  \"queryDefinition\": {
    \"tables\": [
      {
        \"connectionId\": \"$CONN1_ID\",
        \"schemaName\": \"public\",
        \"tableName\": \"users\",
        \"alias\": \"u\"
      },
      {
        \"connectionId\": \"$CONN2_ID\",
        \"schemaName\": \"public\",
        \"tableName\": \"orders\",
        \"alias\": \"o\"
      }
    ],
    \"joins\": [
      {
        \"type\": \"INNER\",
        \"leftTable\": \"u\",
        \"rightTable\": \"o\",
        \"conditions\": [
          {
            \"leftColumn\": \"id\",
            \"operator\": \"=\",
            \"rightColumn\": \"user_id\"
          }
        ]
      }
    ],
    \"columns\": [
      { \"table\": \"u\", \"column\": \"name\" },
      { \"table\": \"o\", \"column\": \"total\" }
    ]
  }
}"

echo "curl -X POST $API_URL/cross-query/saved \\"
echo "  -H 'Authorization: Bearer \$JWT_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '$SAVE_QUERY'"
echo ""

# Step 7: List saved queries
echo -e "${GREEN}Step 7: List Saved Queries${NC}"
echo ""
echo "curl -X GET $API_URL/cross-query/saved \\"
echo "  -H 'Authorization: Bearer \$JWT_TOKEN'"
echo ""

# Summary
echo "========================================="
echo -e "${GREEN}Test Script Complete!${NC}"
echo "========================================="
echo ""
echo "To run actual tests:"
echo "1. Set JWT_TOKEN variable in this script"
echo "2. Uncomment API calls above"
echo "3. Run: ./test-cross-query.sh"
echo ""
echo "Or copy/paste the curl commands manually."
echo ""
