#!/bin/bash

# Define the root directory and data directory
ROOT_DIR=$(pwd)
DATA_DIR="$ROOT_DIR/dev-data" # Or choose another path

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Generate NEXTAUTH_SECRET
NEXTAUTH_SECRET=$(openssl rand -base64 36)

# Create the .env file
cat << EOF > .env
# Karakeep Development Environment Variables
DATA_DIR=$DATA_DIR
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
MEILI_ADDR=http://127.0.0.1:7700
BROWSER_WEB_URL=http://localhost:9222
# OPENAI_API_KEY=your_key_here # Uncomment and add your key if needed
EOF

echo ".env file created in root."

# Create symlinks
mkdir -p "$ROOT_DIR/apps/web"
mkdir -p "$ROOT_DIR/apps/workers"
mkdir -p "$ROOT_DIR/packages/db"

ln -sf "$ROOT_DIR/.env" "$ROOT_DIR/apps/web/.env"
ln -sf "$ROOT_DIR/.env" "$ROOT_DIR/apps/workers/.env"
ln -sf "$ROOT_DIR/.env" "$ROOT_DIR/packages/db/.env"

echo "Symlinks created for apps/web, apps/workers, and packages/db."

echo "Setup complete. Remember to run 'pnpm install' and 'pnpm run db:migrate'." 
