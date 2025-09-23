#!/bin/bash

# LibreOffice Docker Service Startup Script
echo "🚀 Starting LibreOffice Docker Service..."

# Create necessary directories
mkdir -p temp-files/input temp-files/output
mkdir -p onlyoffice-data postgres-data

# Set permissions
chmod -R 755 temp-files

# Start the LibreOffice converter service
echo "📦 Building and starting LibreOffice converter..."
docker-compose up --build -d libreoffice-converter

# Wait for service to be ready
echo "⏳ Waiting for LibreOffice service to be ready..."
sleep 10

# Check if service is running
if curl -f http://localhost:3002/health > /dev/null 2>&1; then
    echo "✅ LibreOffice service is running on http://localhost:3002"
    echo "📋 Health check: http://localhost:3002/health"
    echo "🔄 Convert endpoint: POST http://localhost:3002/convert"
else
    echo "❌ LibreOffice service failed to start"
    echo "📋 Check logs with: docker-compose logs libreoffice-converter"
fi

# Optional: Start OnlyOffice (alternative)
if [ "$1" = "--onlyoffice" ]; then
    echo "📦 Starting OnlyOffice Document Server..."
    docker-compose --profile onlyoffice up -d
    echo "✅ OnlyOffice running on http://localhost:3003"
fi

echo "🎉 Setup complete!"
echo ""
echo "Usage:"
echo "  - LibreOffice: http://localhost:3002"
echo "  - OnlyOffice: http://localhost:3003 (if started with --onlyoffice)"
echo ""
echo "To stop: docker-compose down"
echo "To view logs: docker-compose logs libreoffice-converter"
