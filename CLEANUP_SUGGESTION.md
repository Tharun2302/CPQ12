# Files Cleanup Suggestion

## Files to DELETE (Unwanted/Test Files)

### Test HTML Files
- `test-email.html`
- `test-email-simple.html`
- `test-simple.html`
- `test-env.html`
- `test-hubspot-integration.html`
- `test-complete-client-flow.html`
- `test-docx-workflow.html`
- `debug-microsoft-auth.html`
- `debug-simple.html`
- `debug-test.html`
- `preview-test.html`
- `index.html` (if duplicate)

### Old PDF Files
- `final-complete-template.pdf`
- `final-template-for-preview.pdf`
- `final-template-with-signature.pdf`
- `slack-to-teams-basic.pdf`

### Duplicate/Redundant Documentation
- `ADD_PER_USER_TOKENS.md`
- `AUTO_SCROLL_IMPLEMENTATION.md`
- `BEFORE_AFTER_COMPARISON.txt`
- `branding-update-to-zenop-ai.md`
- `CHANGES_SUMMARY.txt`
- `combination-auto-selection-fix.md`
- `combination-fix-verification.md`
- `COMPLETE_CONTENT_TEMPLATES_SUCCESS.md`
- `COMPLETE_FIX_SUMMARY.md`
- `COMPLETE_IMPLEMENTATION_SUMMARY.md`
- `COMPLETE_SOLUTION_SUMMARY.md`
- `CONTACT_INFO_SYNC_FIX.md`
- `CONTENT_TEMPLATES_SUCCESS.md`
- `dropdown-positioning-fix.md`
- `dropdown-ui-enhancements.md`
- `email-config.md`
- `email-display-improvements.md`
- `email-setup-quick.md`
- `emailjs-setup.md`
- `fix-email-issues.md`
- `fix-email-now.md`
- `FIX_MICROSOFT_AUTH_PRODUCTION.md`
- `gmail-setup.md`
- `IMPLEMENTATION_CHANGES.md`
- `IMPLEMENTATION_COMPLETE.md`
- `IMPROVED_ALIGNMENT_FIX.md`
- `MESSAGING_ALIGNMENT_FIX.md`
- `MIGRATION_TYPE_CHANGE_FIX.md`
- `MIGRATION_TYPE_COMBINATIONS_FIX.md`
- `PER_USER_COST_TOKEN_FIX.md`
- `PLAN_ALIGNMENT_FIX.md`
- `QUICK_FIX_DEPLOYMENT.md`
- `QUICK_FIX_GUIDE.md`
- `README_IMPLEMENTATIONS.txt`
- `template-selection-fix-summary.md`
- `test-combination-fix.md`
- `test-template-fix-verification.md`
- `user-menu-blur-fix.md`

### Temporary Cleanup Scripts (Keep or Delete)
- `database-cleanup.js`
- `database-cleanup.ps1`
- `monitor-cpq.ps1`
- `monitor-cpq.sh`
- `setup-monitoring.sh`
- `restart-server.ps1`
- `check-mongodb-documents.cjs`

### Backup Files
- `server-backup.cjs`
- `server-mongodb-fixed.cjs`
- `package-server copy.json`

## Files to KEEP (Important)
- `README.md` - Main readme
- `package.json` - Dependencies
- `server.cjs` - Main backend
- All files in `src/` - Frontend code
- Configuration files (`.config.js`, `.json`)
- Docker files (`Dockerfile.libreoffice`, `docker-compose.yml`)
- Setup scripts that are still useful:
  - `setup-database.cjs`
  - `setup-mongodb.cjs`
  - `seed-templates.cjs`
- Documentation to keep:
  - `DEPLOYMENT_GUIDE.md`
  - `DEPLOYMENT_ENV_SETUP.md` (newly created)
  - `ALERTING_SETUP_GUIDE.md`
  - `CPQ12_MONITORING_SUMMARY.md`
  - `HEALTH_CHECK_DOCUMENTATION.md`
  - `SERVER_MONITORING_MAINTENANCE_GUIDE.md`
  - `EMAIL_SETUP_GUIDE.md`
  - `HUBSPOT_SETUP.md`
  - `MYSQL_SETUP.md`
  - Production guides

## Recommendation
Delete test files and old documentation, but keep:
1. Production documentation
2. Setup/deployment guides
3. Actual code and configuration files

