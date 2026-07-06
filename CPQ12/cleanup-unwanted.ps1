# Cleanup Unwanted Files Script
# Run this to remove test files, old documentation, and temporary files

Write-Host "Starting cleanup of unwanted files..." -ForegroundColor Yellow

# Test HTML files
$testFiles = @(
    "test-email.html",
    "test-email-simple.html",
    "test-simple.html",
    "test-env.html",
    "test-hubspot-integration.html",
    "test-complete-client-flow.html",
    "test-docx-workflow.html",
    "test-docx-system.js",
    "debug-microsoft-auth.html",
    "debug-simple.html",
    "debug-test.html",
    "preview-test.html"
)

# PDF files
$pdfFiles = @(
    "final-complete-template.pdf",
    "final-template-for-preview.pdf",
    "final-template-with-signature.pdf",
    "slack-to-teams-basic.pdf"
)

# Backup and temporary files
$tempFiles = @(
    "server-backup.cjs",
    "server-mongodb-fixed.cjs",
    "package-server copy.json",
    "restart-server.ps1"
)

# Old documentation (redundant)
$oldDocs = @(
    "ADD_PER_USER_TOKENS.md",
    "AUTO_SCROLL_IMPLEMENTATION.md",
    "BEFORE_AFTER_COMPARISON.txt",
    "branding-update-to-zenop-ai.md",
    "CHANGES_SUMMARY.txt",
    "combination-auto-selection-fix.md",
    "combination-fix-verification.md",
    "COMPLETE_CONTENT_TEMPLATES_SUCCESS.md",
    "COMPLETE_FIX_SUMMARY.md",
    "COMPLETE_IMPLEMENTATION_SUMMARY.md",
    "COMPLETE_SOLUTION_SUMMARY.md",
    "CONTACT_INFO_SYNC_FIX.md",
    "CONTENT_TEMPLATES_SUCCESS.md",
    "dropdown-positioning-fix.md",
    "dropdown-ui-enhancements.md",
    "email-config.md",
    "email-display-improvements.md",
    "email-setup-quick.md",
    "emailjs-setup.md",
    "fix-email-issues.md",
    "fix-email-now.md",
    "FIX_MICROSOFT_AUTH_PRODUCTION.md",
    "gmail-setup.md",
    "IMPLEMENTATION_CHANGES.md",
    "IMPLEMENTATION_COMPLETE.md",
    "IMPROVED_ALIGNMENT_FIX.md",
    "MESSAGING_ALIGNMENT_FIX.md",
    "MIGRATION_TYPE_CHANGE_FIX.md",
    "MIGRATION_TYPE_COMBINATIONS_FIX.md",
    "PER_USER_COST_TOKEN_FIX.md",
    "PLAN_ALIGNMENT_FIX.md",
    "QUICK_FIX_DEPLOYMENT.md",
    "QUICK_FIX_GUIDE.md",
    "README_IMPLEMENTATIONS.txt",
    "template-selection-fix-summary.md",
    "test-combination-fix.md",
    "test-template-fix-verification.md",
    "user-menu-blur-fix.md"
)

# Combine all files
$allFiles = $testFiles + $pdfFiles + $tempFiles + $oldDocs

$deletedCount = 0
$failedCount = 0

foreach ($file in $allFiles) {
    if (Test-Path $file) {
        try {
            Remove-Item $file -Force
            Write-Host "Deleted: $file" -ForegroundColor Green
            $deletedCount++
        }
        catch {
            Write-Host "Failed to delete: $file" -ForegroundColor Red
            $failedCount++
        }
    }
}

Write-Host "`nCleanup complete!" -ForegroundColor Yellow
Write-Host "Deleted: $deletedCount files" -ForegroundColor Green
Write-Host "Failed: $failedCount files" -ForegroundColor Red

