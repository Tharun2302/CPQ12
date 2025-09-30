#!/bin/bash

# CPQ Application Deployment Script for DigitalOcean
# This script automates the deployment process

set -e

echo "🚀 Starting CPQ Application Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from example..."
    if [ -f env.example ]; then
        cp env.example .env
        print_warning "Please edit .env file with your actual configuration before continuing."
        print_warning "Press any key to continue after editing .env file..."
        read -n 1 -s
    else
        print_error "env.example file not found. Please create .env file manually."
        exit 1
    fi
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down || true

# Remove old images
print_status "Cleaning up old images..."
docker system prune -f || true

# Build and start the application
print_status "Building and starting the application..."
docker-compose up --build -d

# Wait for the application to start
print_status "Waiting for application to start..."
sleep 30

# Check if the application is running
if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
    print_status "✅ Application is running successfully!"
    print_status "🌐 Application URL: http://localhost:3001"
    print_status "📊 Health check: http://localhost:3001/api/health"
else
    print_error "❌ Application failed to start. Check logs with: docker-compose logs"
    exit 1
fi

# Show container status
print_status "Container status:"
docker-compose ps

print_status "🎉 Deployment completed successfully!"
print_status "📝 To view logs: docker-compose logs -f"
print_status "🛑 To stop: docker-compose down"
