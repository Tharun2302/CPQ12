# GStack Agents Overview

CPQ12 now uses GStack - a specialized AI agent team where each agent has one focused job.

> **Invocation:** the registered agent names are prefixed `gstack-` (e.g. `gstack-architect`).
> These are the names the Agent tool resolves; a bare `@architect` will not.
>
> **Stack facts (verified 2026-08-06):** frontend is TypeScript `.tsx`/`.ts`; backend is the
> single `server.cjs` CommonJS monolith at repo root (no `server/` directory); database is
> MongoDB only. See `CLAUDE.md` for the authoritative repo map.

## Directory Structure

```
.claude/
├── agents/                  ← Agent instruction files
│   ├── architect.md         ← Designs features
│   ├── backend-engineer.md  ← Codes backend
│   ├── frontend-engineer.md ← Codes frontend
│   ├── qa-engineer.md       ← Tests features
│   ├── security-reviewer.md ← Audits security
│   ├── code-reviewer.md     ← Reviews code quality
│   ├── documentation-engineer.md ← Writes docs
│   └── devops-engineer.md   ← Handles deployment
│
├── workflows/               ← Workflow definitions
│   ├── direct.yaml          ← Direct mode (fix already known)
│   ├── investigation.yaml   ← Investigation mode (cause unknown)
│   ├── new-feature.yaml     ← Feature mode (new functionality)
│   ├── deployment.yaml      ← Deploy runbook + rollback play (not a mode)
│   └── bug-fix.yaml         ← RETIRED stub
│
├── GSTACK-GUIDE.md         ← How to use GStack
└── AGENTS_README.md        ← This file
```

## The 8 Agents

### 1. Architect Agent (`architect.md`)
**Role:** Designs features
**Responsibilities:**
- Analyze requirements
- Design database schema
- Design API endpoints
- Design frontend components
- Create design document

**When to use:** Start of any new feature
**Output:** Complete design document

---

### 2. Backend Engineer Agent (`backend-engineer.md`)
**Role:** Codes backend
**Responsibilities:**
- Create database models
- Implement API endpoints
- Implement business logic
- Add error handling
- Write backend tests

**When to use:** After Architect designs
**Output:** Backend code + tests

---

### 3. Frontend Engineer Agent (`frontend-engineer.md`)
**Role:** Codes frontend
**Responsibilities:**
- Create React components
- Implement routing
- Create forms
- Add styling
- Write component tests

**When to use:** In parallel with Backend Agent
**Output:** Frontend code + tests

---

### 4. QA Engineer Agent (`qa-engineer.md`)
**Role:** Tests features
**Responsibilities:**
- Test happy path
- Test error cases
- Test edge cases
- Test all pricing combinations (if pricing-related)
- Report bugs with evidence

**When to use:** After code is implemented
**Output:** Test report + bug list

---

### 5. Security Reviewer Agent (`security-reviewer.md`)
**Role:** Audits security
**Responsibilities:**
- Identify injection vulnerabilities
- Check authentication/authorization
- Validate input handling
- Check for sensitive data exposure
- Review API security

**When to use:** After code is implemented
**Output:** Security audit report

---

### 6. Code Reviewer Agent (`code-reviewer.md`)
**Role:** Reviews code quality
**Responsibilities:**
- Check code style & conventions
- Identify bugs & logic errors
- Check code quality (DRY, SOLID)
- Review performance
- Check testing adequacy

**When to use:** After code is implemented
**Output:** Code review with issues + recommendations

---

### 7. Documentation Engineer Agent (`documentation-engineer.md`)
**Role:** Writes documentation
**Responsibilities:**
- Create API documentation
- Create component documentation
- Update architecture docs
- Create setup guides
- Update README and CHANGELOG

**When to use:** After all code is done
**Output:** Updated documentation

---

### 8. DevOps Engineer Agent (`devops-engineer.md`)
**Role:** Handles deployment
**Responsibilities:**
- Create Dockerfile
- Create docker-compose.yml
- Create deployment scripts
- Create CI/CD pipeline
- Manage deployments

**When to use:** Before production deployment
**Output:** Deployment scripts + CI/CD config

---

## Workflows

### New Feature Workflow (`new-feature.yaml`)
Full pipeline for new features:
1. Architect designs
2. Backend codes
3. Frontend codes
4. QA tests
5. Security audits
6. Code review
7. Documentation
8. DevOps deployment

**Use when:** Building a new feature
**Timeline:** 3-5 days

---

### Bug Fix Workflow (`bug-fix.yaml`)
Streamlined pipeline for bug fixes:
1. Analyze bug
2. Implement fix
3. QA tests
4. Security check (if applicable)
5. Code review
6. Documentation update
7. Deployment

**Use when:** Fixing a bug
**Timeline:** 2-8 hours

---

### Deployment Workflow (`deployment.yaml`)
Pipeline for deploying to production:
1. Build Docker image
2. Deploy to staging
3. Verify staging
4. Deploy to production
5. Verify production
6. Rollback (if needed)

**Use when:** Ready to deploy to production
**Timeline:** 1-2 hours

---

## How to Use GStack

### Step 1: Let the Router pick the mode
The **AI SDLC Router** in `CLAUDE.md` selects the mode from what you already know:
- You know the fix → **Direct** (`direct.yaml`)
- You know the symptom but not the cause → **Investigation** (`investigation.yaml`)
- It doesn't exist yet → **Feature** (`new-feature.yaml`)

It also sets the **High Risk flag** from the paths touched, which adds Security review
without changing the mode. `deployment.yaml` is the deploy runbook, invoked by the deploy
gate — not a mode.

### Step 2: Invoke the First Agent
For Feature mode:
```
gstack-architect "Design [feature name]. 
           Context: [requirements]"
```

For Direct mode (fix already known):
```
You: "Bug: [description]. 
      Fix: [solution approach]"

gstack-backend-engineer "Implement the fix"
```

### Step 3: Review Each Output
After each agent completes:
- Review their output
- Ask questions if unclear
- Approve or request changes

### Step 4: Proceed to Next Agent
Once approved, invoke next agent in workflow.

### Step 5: Monitor Production
After deployment:
- Monitor error logs
- Check performance
- Watch for customer issues

---

## Key Rules

✅ **DO:**
- Review Architect's design before proceeding
- Stop and fix if design is wrong
- Test thoroughly before deployment
- Document all decisions
- Monitor after deployment

❌ **DON'T:**
- Skip Architect phase (causes rework)
- Approve bad designs to move faster
- Use GStack for 15-minute fixes
- Skip code review
- Deploy without testing

---

## Example: Building "Bulk Discount" Feature

```
You: "Implement bulk discount tier. 
     50+ items = 25% discount."
     
↓ ARCHITECT PHASE
gstack-architect "Design bulk discount tier"
Architect: [Design document] 
You: "Looks good, proceed"

↓ BACKEND PHASE  
gstack-backend-engineer "Implement bulk discount based on design"
Backend: [Code + tests]
You: "Tests pass, looks good"

↓ QA PHASE
gstack-qa-engineer "Test bulk discount feature"
QA: [Test report - all pass]
You: "Great, no bugs"

↓ SECURITY PHASE
gstack-security-reviewer "Audit bulk discount logic"
Security: [Audit report - clear]
You: "No vulnerabilities, good"

↓ CODE REVIEW PHASE
gstack-code-reviewer "Review bulk discount code"
CodeReview: [Review - approved]
You: "Code quality good"

↓ DOCUMENTATION PHASE
gstack-documentation-engineer "Document bulk discount feature"
Documentation: [Updated docs]
You: "Documentation complete"

↓ DEPLOYMENT PHASE
gstack-devops-engineer "Deploy to production"
DevOps: [Deployed ✓]
You: "Monitoring... all good!"

TOTAL: 2-3 days, comprehensive coverage ✓
```

---

## When to Use Each Agent

| Task | Agent | When |
|---|---|---|
| Design new feature | Architect | Start of feature |
| Code backend | Backend Engineer | After design approved |
| Code frontend | Frontend Engineer | In parallel with backend |
| Test feature | QA Engineer | After code implemented |
| Audit security | Security Reviewer | After code implemented |
| Review code | Code Reviewer | After code implemented |
| Write docs | Documentation Engineer | Before deployment |
| Deploy | DevOps Engineer | After all reviews done |

---

## Checking an Agent's Instructions

Each agent file has:
- Role description
- Responsibilities
- When to use
- Code standards
- Output format
- Examples

Read the agent's `.md` file to understand their role better.

---

## Need Help?

Check the relevant agent instruction file:
- Design questions → `architect.md`
- Backend questions → `backend-engineer.md`
- Frontend questions → `frontend-engineer.md`
- Testing questions → `qa-engineer.md`
- Security questions → `security-reviewer.md`
- Code quality questions → `code-reviewer.md`
- Documentation questions → `documentation-engineer.md`
- Deployment questions → `devops-engineer.md`

For overall GStack usage → `GSTACK-GUIDE.md`

---

**Happy building with GStack! 🚀**
