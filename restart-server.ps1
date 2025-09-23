# PowerShell script to restart the server and reload templates

Write-Host "🔄 Restarting CPQ Server to reload templates..." -ForegroundColor Yellow

# Stop existing Node.js processes for this project
Write-Host "🛑 Stopping existing Node.js processes..." -ForegroundColor Red
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    foreach ($process in $nodeProcesses) {
        try {
            # Check if this is our server process by checking the working directory
            $processInfo = Get-WmiObject Win32_Process -Filter "ProcessId = $($process.Id)"
            if ($processInfo.CommandLine -like "*server.cjs*" -or $processInfo.CommandLine -like "*CPQ*") {
                Write-Host "  Stopping CPQ server process: $($process.Id)" -ForegroundColor Yellow
                Stop-Process -Id $process.Id -Force
                Start-Sleep -Seconds 2
            }
        } catch {
            Write-Host "  Could not stop process $($process.Id): $($_.Exception.Message)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  No Node.js processes found" -ForegroundColor Gray
}

# Wait a moment for processes to stop
Write-Host "⏳ Waiting for processes to stop..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Start the server
Write-Host "🚀 Starting CPQ server..." -ForegroundColor Green
Start-Process -FilePath "node" -ArgumentList "server.cjs" -WindowStyle Hidden

# Wait for server to start
Write-Host "⏳ Waiting for server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check if server is running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/" -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Server started successfully!" -ForegroundColor Green
        Write-Host "🌐 Application available at: http://localhost:3001" -ForegroundColor Cyan
        Write-Host "🌐 Frontend available at: http://localhost:3000" -ForegroundColor Cyan
    }
} catch {
    Write-Host "⚠️ Server may still be starting. Check manually at http://localhost:3001" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Open http://localhost:3000 in your browser" -ForegroundColor White
Write-Host "2. Go to Template session to verify templates" -ForegroundColor White
Write-Host "3. Test Advanced plan auto-selection" -ForegroundColor White
Write-Host "4. Generate agreement to verify token replacement" -ForegroundColor White

Write-Host ""
Write-Host "🔍 To check server logs, run: Get-Process -Name node" -ForegroundColor Gray
