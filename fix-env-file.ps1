# Fix .env file - Remove duplicate DB_NAME entries
$envContent = Get-Content .env
$fixedContent = @()
$dbNameFound = $false

foreach ($line in $envContent) {
    if ($line -match '^DB_NAME=') {
        if (-not $dbNameFound) {
            # Keep first DB_NAME, skip MongoDB one
            if ($line -notmatch 'cpq_database$') {
                $fixedContent += $line
                $dbNameFound = $true
            }
        }
        # Skip all other DB_NAME entries
    } else {
        $fixedContent += $line
    }
}

# Ensure DB_NAME=lama exists
if (-not ($fixedContent -match '^DB_NAME=lama')) {
    # Remove any existing DB_NAME and add correct one
    $fixedContent = $fixedContent | Where-Object { $_ -notmatch '^DB_NAME=' }
    $fixedContent += 'DB_NAME=lama'
}

$fixedContent | Set-Content .env
Write-Host "✅ .env file fixed!"
Write-Host ""
Write-Host "Current DB settings:"
Get-Content .env | Select-String -Pattern '^DB_'

