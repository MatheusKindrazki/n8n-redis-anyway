#!/bin/bash

# Function to check if pnpm is installed
check_pnpm() {
    if ! command -v pnpm &> /dev/null; then
        echo "pnpm is not installed. Installing..."
        npm install -g pnpm
    fi
}

# Function to check if Docker is running
check_docker() {
    if ! docker info &> /dev/null; then
        echo "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to build the plugin
build_plugin() {
    echo "Installing dependencies..."
    pnpm install

    echo "Building plugin..."
    pnpm build
}

# Function to start the environment
start_environment() {
    echo "Starting n8n and Redis..."
    docker-compose up -d

    echo "Waiting for services to be ready..."
    sleep 5

    echo "Environment is ready!"
    echo "Access n8n at http://localhost:5678"
    echo ""
    echo "Redis credentials for n8n:"
    echo "- Host: redis"
    echo "- Port: 6379"
    echo "- Password: (leave empty)"
}

# Function to stop the environment
stop_environment() {
    echo "Stopping services..."
    docker-compose down
}

# Main script
case "$1" in
    "start")
        check_pnpm
        check_docker
        build_plugin
        start_environment
        ;;
    "stop")
        stop_environment
        ;;
    "rebuild")
        build_plugin
        ;;
    *)
        echo "Usage: $0 {start|stop|rebuild}"
        echo "  start   - Build plugin and start the test environment"
        echo "  stop    - Stop the test environment"
        echo "  rebuild - Rebuild the plugin only"
        exit 1
        ;;
esac 