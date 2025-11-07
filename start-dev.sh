#!/usr/bin/env bash

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is in use
port_in_use() {
    lsof -i :"$1" >/dev/null 2>&1
}

# Check if Docker is installed
if ! command_exists docker; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if pnpm is installed
if ! command_exists pnpm; then
    echo "Error: pnpm is not installed. Please install pnpm first."
    exit 1
fi

# Start Meilisearch if not already running
if ! port_in_use 7700; then
    echo "Starting Meilisearch..."
    docker run -d -p 7700:7700 --name karakeep-meilisearch getmeili/meilisearch:v1.13.3
else
    echo "Meilisearch is already running on port 7700"
fi

# Start Chrome if not already running
if ! port_in_use 9222; then
    echo "Starting headless Chrome..."
    docker run -d -p 9222:9222 --name karakeep-chrome gcr.io/zenika-hub/alpine-chrome:124 \
        --no-sandbox \
        --disable-gpu \
        --disable-dev-shm-usage \
        --remote-debugging-address=0.0.0.0 \
        --remote-debugging-port=9222 \
        --hide-scrollbars
else
    echo "Chrome is already running on port 9222"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi

# Get DATA_DIR from environment or .env file
if [ -z "$DATA_DIR" ] && [ -f ".env" ]; then
    DATA_DIR=$(grep "^DATA_DIR=" .env | cut -d'=' -f2)
fi

# Create DATA_DIR if it doesn't exist
if [ -n "$DATA_DIR" ] && [ ! -d "$DATA_DIR" ]; then
    echo "Creating DATA_DIR at $DATA_DIR..."
    mkdir -p "$DATA_DIR"
fi

echo "Running database migrations..."
pnpm run db:migrate

echo "Starting web app and workers..."
pnpm web & WEB_PID=$!
pnpm workers & WORKERS_PID=$!

# Function to handle script termination
cleanup() {
    echo "Shutting down services..."
    kill $WEB_PID $WORKERS_PID 2>/dev/null
    docker stop karakeep-meilisearch karakeep-chrome 2>/dev/null
    docker rm karakeep-meilisearch karakeep-chrome 2>/dev/null
    exit 0
}

# Wait for web app to be ready (max 30 seconds)
echo "Waiting for web app to start..."
ATTEMPT=0
while [ $ATTEMPT -lt 30 ]; do
    if nc -z localhost 3000 2>/dev/null; then
        break
    fi
    sleep 1
    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq 30 ]; then
        echo "Warning: Web app may not have started properly after 30 seconds"
    fi
done

# Set up trap to catch termination signals
trap cleanup SIGINT SIGTERM

echo "Development environment is running!"
echo "Web app: http://localhost:3000"
echo "Meilisearch: http://localhost:7700"
echo "Chrome debugger: http://localhost:9222"
echo "Press Ctrl+C to stop all services"

# Wait for user interrupt
wait 
