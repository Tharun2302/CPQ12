# /deploy — Deployment Command

## Purpose
Build, test, and deploy the application to staging or production safely.

## Usage
```
/deploy [branch] to [environment]

Examples:
/deploy to staging                              ← Deploy main branch to staging
/deploy to production                           ← Deploy main branch to production
/deploy feature/loyalty-discount to staging     ← Deploy feature branch to staging
/deploy pricing hotfix to production            ← Emergency hotfix (main branch)
```

---

## Branch Deployment Strategy

### ✅ CORRECT: Feature Branch → Staging Only
```
Developer creates feature branch:
git checkout -b feature/loyalty-discount

After coding + local testing:
/deploy feature/loyalty-discount to staging
↓
QA tests on staging
↓
If approved: Merge to main
↓
/deploy to staging (from main)
↓
/deploy to production (from main)
```

### ❌ WRONG: Feature Branch → Production
```
/deploy feature/loyalty-discount to production  ← NEVER DO THIS!
Reason: Untested, unreviewed code goes live
Result: Customers affected by bugs
```

### ✅ CORRECT: Main Branch → Production
```
All feature branches merged to main
All tests pass
Code reviewed
↓
/deploy to production (from main)
↓
Deployed to live customers
```

### ❌ WRONG: Deploy Without Merge
```
Working on feature branch
/deploy to production (directly from branch) ← NEVER DO THIS!
Reason: Skips merge → Skips review → Bugs go live
```

---

## Branching Workflow (For Your Team)

## Pre-Deployment Checklist

### For Feature Branch → Staging
- [ ] All tests pass locally (`npm test`)
- [ ] No console.log() statements
- [ ] No TODO comments left
- [ ] Ready for QA to test
- [ ] Git branch is clean (no uncommitted changes)

### For Main Branch → Staging
- [ ] All tests pass locally (`npm test`)
- [ ] Code reviewed (`@code-reviewer` approved)
- [ ] QA testing passed on staging first
- [ ] No console.log() statements
- [ ] No TODO comments left
- [ ] Database migrations tested (if any)
- [ ] Environment variables set
- [ ] No breaking changes to API

### For Main Branch → Production
- [ ] All staging tests passed
- [ ] Code reviewed by Person B (`@code-reviewer`)
- [ ] QA approved on staging
- [ ] No breaking changes to pricing logic
- [ ] Database migrations tested (if any)
- [ ] Environment variables set correctly
- [ ] Backups configured
- [ ] Monitoring alerts active
- [ ] Team available to monitor (not Friday evening)

## Typical Team Workflow

```
Person A (Developer):
1. git checkout -b feature/loyalty-discount
2. Write feature code
3. npm test (local testing)
4. @qa-engineer test loyalty discount feature (local)
5. git push origin feature/loyalty-discount
6. /deploy feature/loyalty-discount to staging
   ↓
Person B (QA/Reviewer):
7. Test on staging: @qa-engineer test loyalty discount on staging
8. Code review: @code-reviewer review feature changes
9. Approve & merge: git merge feature/loyalty-discount into main
   ↓
Person A or B (Deployment):
10. /deploy to staging (from main, final check)
11. @qa-engineer final full test on staging
12. /deploy to production (from main, live customers!)
    ↓
Both:
13. Monitor logs for 5-10 minutes
14. Check customer feedback
```

---

## What /deploy Does

1. **Validates** all checks pass
2. **Identifies branch** (main or feature branch)
3. **Validates environment** (staging or production)
4. **Builds** the application (`npm run build`)
5. **Tests build** (ensures no build errors)
6. **Creates backup** of current state
7. **Deploys** new version
8. **Verifies** deployment successful
9. **Monitors** for errors (5-10 minutes)

## Deployment Process

### Feature Branch → Staging (Development Testing)
```
/deploy feature/loyalty-discount to staging

Usage: Testing a new feature before merging to main
Who: The developer who created the feature
When: After local testing, before PR review
Steps:
1. Detect branch: feature/loyalty-discount
2. Build app from that branch
3. Run quick tests
4. Deploy to staging server
5. Verify endpoints respond
6. QA tests the feature in browser

Result: Feature ready for review + approval
Next: Merge to main → deploy main to staging → deploy to production
```

### Main Branch → Staging (Pre-Production Testing)
```
/deploy to staging

Usage: Final testing before going live
Who: QA engineer or Person B
When: After PR approved and merged to main
Steps:
1. Detect branch: main (default)
2. Build app from main
3. Run full test suite
4. Deploy to staging server
5. Run smoke tests
6. Verify all endpoints respond
7. Check database migrations (if any)

Result: Ready for final QA before production
Next: /deploy to production (same command, from main)
```

### Main Branch → Production (Live Customers)
```
/deploy to production

Usage: Deploy to live customers
Who: Person B (or DevOps) - requires approval
When: After staging tests pass
Risk: HIGHEST - affects all users
Steps:
1. Detect branch: main (only!)
2. Build app from main
3. Run full test suite
4. Create production backup
5. Deploy to production
6. Run health checks
7. Monitor error logs (10 min minimum!)
8. Auto-rollback if critical issues detected

Result: Live for all customers
Next: Monitor + document deployment
```

### ❌ DON'T DO THIS
```
/deploy feature/loyalty-discount to production
Reason: Feature branch code hasn't been:
  - Merged to main
  - Reviewed by team
  - Tested on staging
Result: BROKEN CODE GOES LIVE!

/deploy to production (without staging test)
Reason: No pre-production testing
Result: Surprises in production

/deploy feature/xyz to production with hotfix flag
Reason: Hotfix is for emergencies only, not features
Result: Skips review + merge
```

## Output Format

```
🚀 Deployment: [target]
Status: SUCCESS / FAILED

Pre-Deployment Checks:
✅ Tests pass
✅ Code review passed
✅ No console.log() found
✅ Environment variables set

Build:
✅ Build successful (2.3MB)
✅ Build tests pass

Deployment:
✅ Backup created
✅ Files uploaded
✅ Database migrations applied
✅ Health checks pass

Monitoring (5 min):
✅ No errors detected
✅ Load times normal
✅ APIs responding

Status: LIVE ✅
Rollback plan: available for 24 hours
```

## When to Deploy (Decision Tree)

### Feature Ready to Test on Staging?
```
YES → /deploy feature/xyz to staging
       (QA tests on staging)
       If approved → Merge to main
       
NO → Keep coding, test locally with @qa-engineer
```

### Feature Merged to Main?
```
YES → /deploy to staging
       (Final pre-production test)
       If pass → /deploy to production
       
NO → Don't deploy yet, create PR first
```

### Deploy Scenarios

| Scenario | Command | Environment |
|---|---|---|
| **Testing new feature** | `/deploy feature/xyz to staging` | Staging |
| **Feature complete & merged** | `/deploy to staging` | Staging |
| **Staging tests passed** | `/deploy to production` | Production |
| **Bug fix ready** | `/deploy feature/fix-xyz to staging` | Staging |
| **Emergency hotfix (critical)** | `/deploy hotfix to production` | Production |

### ❌ Never Deploy If:

| Reason | Command | Why |
|---|---|---|
| Tests failing locally | Any | Will fail in production too |
| Code not reviewed | Any feature to production | No approval from team |
| QA didn't pass | Any to production | Risk of broken feature |
| Pricing logic changed | Any to production | Must test all 12 combinations |
| Database migrations untested | Any to production | Data corruption risk |
| Feature branch to production | `/deploy feature/xyz to production` | Skips review + merge |

## Rollback (If Something Goes Wrong)

```
/deploy rollback to [timestamp]

Example:
/deploy rollback to 2024-06-29T14:30:00Z

Steps:
1. Stop current deployment
2. Restore from backup
3. Verify old version works
4. Investigate what went wrong
5. Plan fix for next deploy
```

## After Deployment

### Monitor These Metrics
- Error rate (should be < 1%)
- API response time (should be < 500ms)
- Database performance
- User complaints in Slack

### Document What You Deployed
```
Deployed to Production at 2024-06-29 14:35 UTC
Branch: main
Commit: abc1234567890def (Feature branch merged)

Features:
✅ Pricing calculator redesign (feature/pricing-ui)
✅ 3-tier discount logic fix (feature/discount-fix)

Fixes:
✅ Mobile responsive issue
✅ Document upload race condition

Database Changes:
✅ Added exhibit.imageUrl field
✅ Migrated 5000 records

Approvals:
✅ Person B code review
✅ QA testing passed

Rollback: Available until 2024-06-30 14:35 UTC
Command: /deploy rollback to 2024-06-29T14:35:00Z
```

## Quick Reference Guide

### All Deployment Commands
```
Testing a feature branch:
  /deploy feature/[branch-name] to staging

Pre-production test:
  /deploy to staging

Live deployment:
  /deploy to production

Emergency only:
  /deploy hotfix to production

Rollback:
  /deploy rollback to [timestamp]

Check deployment status:
  /deploy status
```

### Key Rules
```
🚨 Feature branches → ONLY staging (never production)
🚨 Main branch → staging first, THEN production
🚨 Production → requires staging approval
🚨 Hotfix → requires written approval
🚨 Friday afternoon → NEVER deploy
```

---

## Tips

- **Deploy during low-traffic hours** (not 9 AM Monday)
- **Have an on-call person** (someone watching for errors)
- **Keep backups for 24 hours** (in case rollback needed)
- **Never deploy Friday afternoon** (support not available on weekend)
- **Document every deployment** (for audit trail)
- **Test on staging FIRST** (always, no exceptions)
- **Feature branches ONLY to staging** (production only after merge to main)
- **Monitor 10 minutes minimum** (catches 90% of issues)
- **Communicate before deploying** (let team know in Slack)

## Deployment Checklist

### Developer (Person A): Testing Feature Branch
```bash
# Local testing (feature branch)
git checkout -b feature/loyalty-discount
npm test                    # All tests pass?
npm run lint                # No style issues?
npm run build               # Build successful?
@qa-engineer test loyalty discount       # Local QA

# Deploy feature branch to staging
/deploy feature/loyalty-discount to staging
→ QA tests on staging
→ Person B reviews code
→ If approved, merge to main
```

### Reviewer (Person B): Pre-Production Testing
```bash
# After merge to main
git checkout main
git pull origin main

# Deploy main to staging (final check)
/deploy to staging
@qa-engineer final full test on staging
→ If all pass, proceed to production
```

### Deployment (Person A or B): Production Release
```bash
# Deploy to production (from main only)
/deploy to production

# Monitor
@monitor for 10 minutes     # Watch error logs
@alert if critical issues detected

# Document
Deployment successful: [timestamp]
Rollback available for 24 hours
```

### If Something Goes Wrong
```bash
# Rollback to previous version
/deploy rollback to [previous-timestamp]

# Investigate
@code-reviewer what went wrong?
@security-reviewer check for vulnerabilities

# Fix
Create new branch: feature/hotfix-xyz
Test locally
/deploy feature/hotfix-xyz to staging
Merge to main
/deploy to production
```

## Emergency Hotfix Deployment

### When to Use Hotfix
```
ONLY use for critical bugs affecting:
✅ Revenue (pricing calculation broken)
✅ Security (vulnerability exposed)
✅ Availability (system down)

Examples:
✅ Discount calculation giving negative prices
✅ SQL injection vulnerability found
✅ Database connection lost

NOT for:
❌ New features
❌ Style issues
❌ Minor bugs
❌ Wishlist items
```

### Hotfix Process
```
Critical bug detected:
1. Create branch: git checkout -b hotfix/critical-bug
2. Code reviewed (emergency review by Person B)
3. Test locally: npm test
4. Commit: git commit -m "HOTFIX: [bug]"
5. Merge to main: git merge hotfix/critical-bug

Deploy directly (skip staging):
/deploy hotfix to production

Requires: Written Slack approval from Person B
Safety: Heavy monitoring (15 minutes minimum!)
       @alert if any errors detected

After deployment:
- Investigate root cause
- Fix properly (not quick patch)
- Test thoroughly
- Deploy proper fix later
```

### Hotfix Template
```
HOTFIX APPROVAL

What: [Brief description]
Why: Critical impact - [revenue loss / security / availability]
Fix: [One-line explanation]
Tested: Yes / No (local testing done?)
Approved By: [Person B's name]
Time: [Current time]

Command: /deploy hotfix to production
Rollback: /deploy rollback to [previous-timestamp]
```

**Important:** Use sparingly. Most deployments should go through staging first.
