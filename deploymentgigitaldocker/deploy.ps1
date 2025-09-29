# CPQ Application Deployment Script for DigitalOcean (PowerShell)
# This script automates the deployment process on Windows

param(
    [switch]$SkipEnvCheck
)

Write-Host "🚀 Starting CPQ Application Deployment..." -ForegroundColor Green

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if Docker is installed
try {
    docker --version | Out-Null
    Write-Status "Docker is installed"
} catch {
    Write-Error "Docker is not installed. Please install Docker Desktop first."
    exit 1
}

# Check if Docker Compose is installed
try {
    docker-compose --version | Out-Null
    Write-Status "Docker Compose is installed"
} catch {
    Write-Error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
}

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Warning ".env file not found. Creating from example..."
    if (Test-Path "env.example") {
        Copy-Item "env.example" ".env"
        Write-Warning "Please edit .env file with your actual configuration before continuing."
        Write-Warning "Press any key to continue after editing .env file..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    } else {
        Write-Error "env.example file not found. Please create .env file manually."
        exit 1
    }
}

# Stop existing containers
Write-Status "Stopping existing containers..."
try {
    docker-compose down
} catch {
    Write-Warning "No existing containers to stop"
}

# Remove old images
Write-Status "Cleaning up old images..."
try {
    docker system prune -f
} catch {
    Write-Warning "Failed to clean up old images"
}

# Build and start the application
Write-Status "Building and starting the application..."
docker-compose up --build -d

# Wait for the application to start
Write-Status "Waiting for application to start..."
Start-Sleep -Seconds 30

# Check if the application is running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Status "✅ Application is running successfully!"
        Write-Status "🌐 Application URL: http://localhost:3001"
        Write-Status "📊 Health check: http://localhost:3001/api/health"
    } else {
        throw "Health check failed"
    }
} catch {
    Write-Error "❌ Application failed to start. Check logs with: docker-compose logs"
    exit 1
}

# Show container status
Write-Status "Container status:"
docker-compose ps

Write-Status "🎉 Deployment completed successfully!"
Write-Status "📝 To view logs: docker-compose logs -f"
Write-Status "🛑 To stop: docker-compose down"
