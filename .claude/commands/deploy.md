# /deploy — Deploy to Production

## Purpose
Build, test, and deploy the application to production safely.

## Usage
```
/deploy [target]

Examples:
/deploy to staging
/deploy to production
/deploy pricing hotfix
```

## Pre-Deployment Checklist

Before deploying, ensure:
- [ ] All tests pass locally (`npm test`)
- [ ] Code is reviewed (`/review` passes)
- [ ] QA testing passed (`/qa` full test)
- [ ] No console.log() statements
- [ ] No TODO comments left
- [ ] Database migrations tested (if any)
- [ ] Environment variables set
- [ ] No breaking changes to API

## What /deploy Does

1. **Validates** all checks pass
2. **Builds** the application (`npm run build`)
3. **Tests build** (ensures no build errors)
4. **Creates backup** of current production state
5. **Deploys** new version
6. **Verifies** deployment successful
7. **Monitors** for errors in first 5 minutes

## Deployment Process

### Staging Deployment (Safe to Test)
```
/deploy to staging

Steps:
1. Build app
2. Run tests
3. Deploy to staging server
4. Run smoke tests
5. Verify endpoints respond
6. Check database migrations (if any)

Result: Ready for final QA before production
```

### Production Deployment (Live Users)
```
/deploy to production

Steps:
1. Build app
2. Run full test suite
3. Create production backup
4. Deploy to production
5. Run health checks
6. Monitor error logs (5 min)
7. Rollback if issues detected

Result: Live for all users
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

## When to Deploy

| Scenario | Deploy |
|---|---|
| New feature completed & tested | ✅ YES |
| Bug fix verified | ✅ YES |
| Pricing logic change | ✅ YES (after all tests) |
| Emergency hotfix | ✅ YES (with approval) |
| Code not tested | ❌ NO |
| Tests failing | ❌ NO |
| QA didn't pass | ❌ NO |

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

Features:
✅ Pricing calculator redesign
✅ 3-tier discount logic fix

Fixes:
✅ Mobile responsive issue
✅ Document upload race condition

Database Changes:
✅ Added exhibit.imageUrl field
✅ Migrated 5000 records

Rollback: Available until 2024-06-30 14:35 UTC
```

## Tips

- **Deploy during low-traffic hours** (not 9 AM Monday)
- **Have an on-call person** (someone watching for errors)
- **Keep backups for 24 hours** (in case rollback needed)
- **Never deploy Friday afternoon** (support not available on weekend)
- **Document every deployment** (for audit trail)

## Deployment Checklist

```bash
# Before deployment
npm test                    # All tests pass?
npm run lint                # No style issues?
npm run build               # Build successful?

# During deployment
/deploy to staging          # Test on staging first
/qa test full flow          # QA tests on staging
/deploy to production       # Deploy to live

# After deployment
/monitor for 5 min          # Watch for errors
```

## Emergency Hotfix Deployment

```
For critical bugs (revenue loss, security), deploy with:

/deploy hotfix to production

Bypasses: Staging deployment
Requires: Written approval from team
Process:
1. Code reviewed (emergency review)
2. Minimal testing
3. Direct to production
4. Heavy monitoring (10 min, not 5)
```

**Use sparingly.** Most deployments should go through staging first.
