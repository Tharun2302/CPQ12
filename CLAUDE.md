# CPQ12 — GStack Configuration & Project Standards

**Last Updated:** August 6, 2026  
**Version:** 1.1  
**Team:** CloudFuze Engineering  

---

## 📋 Project Overview

**CPQ12** = Configure, Price, Quote platform for enterprise sales teams

**Purpose:** Enable sales teams to quickly generate accurate quotes with dynamic pricing, e-signatures, and payment processing.

**Key Features:**
- Dynamic product configuration
- Real-time pricing calculations
- E-signature support
- Quote templates
- Payment processing
- Email notifications
- PDF exports
- Advanced reporting

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** React 18 + Vite 7
- **Language:** **TypeScript 5.5** — `src/` is 71 `.tsx` + 68 `.ts` files and contains **zero** `.jsx`/`.js` files. Write `.tsx`/`.ts`, never `.jsx`/`.js`
- **Types:** shared interfaces live in `src/types/` (e.g. `src/types/pricing.ts`). Do **not** use `prop-types` — it is not a dependency
- **Styling:** TailwindCSS 3.4
- **State Management:** React Context API + Hooks (`src/contexts/`)
- **Routing:** React Router 7 (`react-router-dom`)
- **Form Handling:** hand-rolled. **React Hook Form is NOT a dependency** — do not import it
- **Testing:** Vitest 4 + React Testing Library (Jest-compatible API; run with `npm test`)
- **Port:** 5173

### Backend
- **Framework:** Node.js 20 LTS + **Express 5.1** (Vite 7 requires Node ≥20.19). Express 5 changes async error propagation vs Express 4 — write handlers accordingly
- **Language:** JavaScript, CommonJS (`.cjs`). The backend is **not** TypeScript, unlike `src/`
- **Shape:** **single-file monolith** — `server.cjs` (~12,300 lines) plus `server-utils.cjs`, both at repo root. There is no `server/` directory; new backend work extends these files
- **Database:** **MongoDB only**
- **DB access:** Mongoose 8 **and** the native `mongodb` 6 driver are both in use. Match whichever the surrounding code uses — do not introduce a third pattern
- **Auth:** JWT Bearer tokens (`jsonwebtoken`, expiry set) + `bcryptjs` for hashing; Azure MSAL on the frontend
- **API Style:** RESTful and **unversioned** — all 133 routes are `/api/...`. There is no `/api/v1/...`; do not introduce one without a migration plan
- **Port:** **3001** (`server.cjs` default; Vite dev-proxies `/api` → `localhost:3001`)

### Deployment
- **Containerization:** Docker Compose for support services only — this repo's `docker-compose.yml` runs Gotenberg (`3004`) and an optional OnlyOffice profile (`3003` + `cpq-postgres`, which backs OnlyOffice, not the app). The app itself runs on the host via `node server.cjs`. **There is no root `Dockerfile`** — only `Dockerfile.libreoffice`
- **CI/CD:** GitHub Actions — `ci.yml` (PR quality gates) and `deploy-dev.yml` (push to `main` → dev server). See Deployment Standards below for the authoritative behaviour
- **Environments:** Development (`159.89.175.168:3001`) and Production (`zenop.ai`). **There is no staging environment**
- **Monitoring:** `GET /api/health` only. No metrics, alerting, or log aggregation — **known gap**

---

## 📂 Directory Structure

This is the **actual** layout. There is no `server/` directory and no `src/styles/` — do not create files in paths that are not listed here.

```
(repo root)
├── src/                     (frontend — TypeScript, .tsx/.ts only)
│   ├── components/          (React components, PascalCase .tsx)
│   ├── pages/               (Page components)
│   ├── hooks/               (Custom React hooks, .ts)
│   ├── contexts/            (React Context — global state)
│   ├── services/            (API calls, business logic)
│   ├── utils/               (Utilities, helpers — incl. pricing.ts, tierScenario.ts)
│   ├── types/               (Shared TypeScript interfaces — pricing.ts etc.)
│   ├── config/              (App configuration)
│   ├── data/                (Static/seed data — blockLibrary.ts)
│   ├── analytics/           (Analytics)
│   ├── assets/              (Static assets)
│   ├── index.css            (Global styles — there is NO src/styles/ directory)
│   ├── main.tsx             (Entry point)
│   ├── App.tsx              (Root component)
│   └── AppNew.tsx           (Second root component — legacy/parallel, verify before editing)
│
├── server.cjs               (ENTIRE backend — ~12,300 lines, CommonJS. No server/ dir exists)
├── server-utils.cjs         (Backend helpers)
├── server-backup.cjs        (DEAD — do not edit)
├── server-mongodb-fixed.cjs (DEAD — do not edit)
├── pricing-logic.js         (DEAD — imported nowhere. Live pricing is src/utils/pricing.ts)
│
├── tests/
│   ├── setup.ts             (Vitest setup)
│   └── unit/                (5 unit test files — no integration/E2E tests)
│
├── scripts/                 (~50 ONE-OFF data/template mutation scripts — these write to
│                             MongoDB and rewrite .docx templates. PRODUCTION DATA RISK.
│                             Contains NO deployment scripts. Also: qa-smoke.cjs, a
│                             Puppeteer UI smoke harness)
├── backend-templates/       (.docx quote/agreement templates)
├── backend-exhibits/        (360 exhibit .docx files, ~351 migration combinations)
│
├── .github/workflows/
│   ├── ci.yml               (PR-only quality gates)
│   └── deploy-dev.yml       (push to main → DEV server deploy)
│
├── docker-compose.yml       (SUPPORT SERVICES ONLY — Gotenberg + optional OnlyOffice.
│                             The app itself runs on the host via `node server.cjs`)
├── Dockerfile.libreoffice   (There is NO root Dockerfile)
├── vite.config.ts           (Vite config + dev proxy to :3001)
├── vitest.config.ts         (Test config + per-file coverage thresholds)
├── package.json
└── CLAUDE.md (this file)
```

**Production deployment lives outside this repo** — a separate Docker stack in the
`deploymentgigitaldocker` folder on each server (nginx + `cpq-application`). See
`.claude/agents/devops-engineer.md` for the authoritative deployment layout.

---

## 💻 Coding Conventions

### Naming Conventions

**Files & Folders:**
- React components: `PascalCase` **`.tsx`** (e.g., `PricingCalculator.tsx`)
- Hooks: `camelCase` with `use` prefix, **`.ts`** (e.g., `useQuoteData.ts`)
- Utils/helpers: `camelCase` **`.ts`** (e.g., `formatPrice.ts`)
- Services: `camelCase` **`.ts`** (e.g., `quoteService.ts`)
- Shared types: `camelCase` **`.ts`** in `src/types/` (e.g., `pricing.ts`)
- Backend: no per-model files — backend code lives in `server.cjs` / `server-utils.cjs` (CommonJS `.cjs`)

**Variables & Functions:**
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_ATTEMPTS`)
- Variables: `camelCase` (e.g., `isLoading`)
- Functions: `camelCase` (e.g., `calculateTotal()`)
- Classes: `PascalCase` (e.g., `QuoteManager`)

**Database:**
- MongoDB collections: `camelCase` (e.g., `quoteItems`)
- There is no SQL database in the application — ignore table/column naming conventions

### Code Style

**React Components** (TypeScript — props typed via an interface, no `prop-types`):
```tsx
// ✅ Functional components with hooks
interface PricingCalculatorProps {
  items: Array<{ price: number }>;
  onChange?: (total: number) => void;
}

function PricingCalculator({ items, onChange }: PricingCalculatorProps) {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setTotal(items.reduce((sum, item) => sum + item.price, 0));
  }, [items]);

  return (
    <div className="pricing-container">
      {/* JSX here */}
    </div>
  );
}

export default PricingCalculator;
```

**Styling:**
- Use TailwindCSS classes (no inline styles)
- Component-scoped styles when needed
- Mobile-first responsive design
- Dark mode support (if required)

**Backend:**
```javascript
// ✅ Express route with error handling
router.post('/quotes', async (req, res) => {
  try {
    const { items, clientId } = req.body;
    
    // Validate input
    if (!items || !clientId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Business logic
    const quote = await Quote.create({ items, clientId });
    
    // Response
    res.json({ 
      success: true, 
      data: quote 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
```

**Comments:**
- Only comment WHY, not WHAT
- Self-documenting code is preferred
- No multi-line comment blocks
- Maximum one short line comment

```javascript
// ✅ Good: Explains WHY
// Round to 2 decimal places to avoid floating-point precision issues
const total = Math.round(subtotal * 100) / 100;

// ❌ Bad: Just repeats code
// Add 10% tax
const taxed = total * 1.1;
```

---

## 🔐 Security Standards

**Legend:** ✅ = verified present in the codebase · 🚧 = **KNOWN GAP**, does not exist today · 🎯 = required standard for *new* code, not yet true repo-wide.

Treat 🚧 items as pre-existing gaps, **not** as regressions introduced by the change under review. Do not report them as new findings on unrelated work; do not assume the protection exists when reasoning about risk.

### Authentication
- ✅ JWT tokens for API authentication (`jsonwebtoken`, expiry set)
- ✅ Passwords hashed with `bcryptjs`
- 🎯 Tokens include userId, role, expiration
- 🚧 **Refresh tokens — not implemented** (no `refreshToken` anywhere in `server.cjs`)
- 🎯 No credentials in code or logs

### Input Validation
- 🎯 Validate all user inputs on backend
- 🎯 Sanitize inputs before database queries
- 🎯 Check file uploads (type, size)
- 🚧 **Rate limiting on sensitive endpoints — not implemented**

### Data Protection
- 🎯 Never log sensitive data (passwords, tokens, credit cards)
- ✅ HTTPS in production (nginx TLS termination on the prod stack)
- ✅ CORS configured (`cors` middleware in `server.cjs`)
- ✅ CSP headers — hand-rolled in `server.cjs`, **not** in nginx. Any CSP change belongs in `server.cjs`
- 🎯 Encrypt sensitive data at rest
- 🚧 **CSRF protection — not implemented** (no `csurf`/`csrf` dependency or usage)

### API Security
- 🚧 **Rate limiting — not implemented.** `express-rate-limit` is not a dependency; the "100 requests/minute per IP" figure was never in force
- 🚧 **API versioning — not implemented.** 0 of 133 routes are versioned
- 🚧 **`helmet` — not installed.** Security headers are hand-rolled in `server.cjs`
- ✅ Audit logging present for some operations (MongoDB-backed, not PostgreSQL)
- 🎯 Error messages don't leak system info

---

## 🧪 Testing Standards

### Coverage Targets

**Current reality:** `tests/unit/` holds 5 test files (`pricing`, `tierScenario`, `configDuration`, `helpers`, `approvalWorkflowDelete`). There are **no integration tests and no E2E tests** in the suite. `vitest.config.ts` enforces thresholds on **three files only** (`src/utils/pricing.ts`, `configDuration.ts`, `tierScenario.ts`) and explicitly defers the global 80% gate.

- 🎯 Unit tests: 80%+ coverage — **aspiration, not enforced.** Do not report untested pre-existing modules as new findings
- 🎯 Critical business logic: 100% coverage
- ✅ Enforced today: per-file thresholds on the three modules listed in `vitest.config.ts`
- 🚧 **API endpoint integration tests — none exist.** Required for *new* endpoints; absent for all 133 existing ones
- 🚧 **E2E suite — none.** A working browser smoke harness exists at `scripts/qa-smoke.cjs` (Puppeteer; screenshots each step, writes `tmp-e2e/qa-report.html`) but is not wired into `npm test`
- 🎯 Components: At least happy path + 1 error case

### Test Structure
```javascript
describe('PricingCalculator', () => {
  it('should calculate total price correctly', () => {
    // Arrange
    const items = [{ price: 100 }, { price: 50 }];
    
    // Act
    const total = calculateTotal(items);
    
    // Assert
    expect(total).toBe(150);
  });
  
  it('should handle empty items array', () => {
    expect(calculateTotal([])).toBe(0);
  });
});
```

### Test Types
- **Unit:** Individual functions/components
- **Integration:** API endpoints + database
- **E2E:** Complete workflows (if applicable)
- **Security:** Auth, injection, XSS

---

## 📝 Git Workflow

### Branch Naming
- Feature: `feature/short-description`
- Bug fix: `fix/short-description`
- Hotfix: `hotfix/critical-issue`
- Release: `release/1.0.0`

**Example:**
```
feature/add-email-notifications
fix/pricing-calculation-bug
hotfix/payment-processing-crash
```

### Commit Messages
```
<type>: <short description>

<optional detailed explanation>
```

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Code style (no logic change)
- `refactor:` Code restructuring
- `test:` Test additions/changes
- `chore:` Build, deps, config

**Examples:**
```
feat: Add email notification system
fix: Fix pricing calculation for multi-currency
test: Add tests for quote validation
docs: Update API documentation
```

### PR Requirements
- ✅ All tests passing
- ✅ Code reviewed (at least 1 approval)
- ✅ No security issues
- ✅ Documentation updated
- ✅ Merged from the working branch **directly into `main`**

**There is no `develop` branch** — it does not exist locally or on origin. The flow is
`feature/*` → `main`. (`.github/workflows/ci.yml` still lists `develop` as a PR target;
that half of the trigger is dead and is tracked separately.)

---

## 🚀 Deployment Standards

### Environment Variables

**Development (.env):**
```
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/cpq12
PORT=3001
JWT_SECRET=dev-secret-key
```

**Production (.env.production):**
```
NODE_ENV=production
MONGODB_URI=<production-mongodb-uri>
JWT_SECRET=<production-secret-key>
AZURE_CLIENT_ID=<your-azure-id>
AZURE_CLIENT_SECRET=<your-azure-secret>
```

`POSTGRES_URI` is **not** used by the application — the app is MongoDB-only. The
`cpq-postgres` container in `docker-compose.yml` backs OnlyOffice, not CPQ12.

### 🔴 Deployment Process — ACTUAL BEHAVIOUR

There are exactly two paths. Read this before answering any deploy question.

**Path 1 — DEV (automated).** `.github/workflows/deploy-dev.yml` triggers on **push to
`main`** (and manual `workflow_dispatch`). It SSHes to the dev server, pulls `main`,
runs `docker compose up -d --build` in `deploymentgigitaldocker/`, prunes images, and
polls `http://159.89.175.168:3001/api/health`.

> **Any push or merge to `main` automatically deploys to the DEV server.** There is no
> merge-to-`main`-without-deploying-to-dev path. `main` is not an inert integration branch.

**Path 2 — PRODUCTION (manual).** `zenop.ai` / `167.71.227.231` has **no pipeline**.
Deploying to production is a deliberate manual SSH procedure — see
`.claude/agents/devops-engineer.md`. Nothing about merging to `main` deploys to
production.

There is **no staging environment**, no image registry, and no `docker push` step.

### Rollback Procedure

`scripts/rollback.sh` does not exist. The real procedure is a manual sequence on the
target server — backup (Mongo) → stop containers → `git reset --hard <good-commit>` →
rebuild → health check. It is documented in `.claude/agents/devops-engineer.md` and in
the rollback play under `.claude/workflows/`.

> **Rollback does not move the branch tip.** After rolling back a server, the branch
> still points at the bad commit, so the next unrelated push re-deploys it and silently
> undoes the rollback. Either revert the commit on the branch or track it as an open risk.

---

## 🔍 Code Review Checklist

**Security:**
- [ ] No hardcoded secrets
- [ ] Input validation on all endpoints
- [ ] Authentication/authorization checks
- [ ] No **NoSQL** injection risk (MongoDB operator injection — there is no SQL database)
- [ ] No XSS vulnerabilities

**Quality:**
- [ ] Code is readable and well-named
- [ ] Functions under 50 lines (**new code only** — `server.cjs` is a ~12,300-line monolith)
- [ ] No code duplication (DRY)
- [ ] Follows project conventions
- [ ] Tests included for new logic (the global 80% gate is deferred — see Testing Standards)

**Performance:**
- [ ] No N+1 queries
- [ ] Efficient algorithms
- [ ] Bundle size impact acceptable
- [ ] No memory leaks
- [ ] Caching where appropriate

**Maintenance:**
- [ ] Documentation updated
- [ ] No hardcoded values
- [ ] Error handling comprehensive
- [ ] Dependencies up-to-date
- [ ] Backward compatibility maintained

---

## 📚 Hard Rules (Non-Negotiable)

These apply to **new and modified code**. The repo has pre-existing violations of rules 2, 5 and 10 at scale — see "Pre-existing violations" below. Do not report those as findings on unrelated work.

### 🔴 NEVER:
1. ❌ Commit secrets, API keys, or credentials
2. ❌ Use `any` type without justification (TypeScript)
3. ❌ Skip error handling in async functions
4. ❌ Deploy without running tests
5. ❌ Add `console.log` in code you write or modify
6. ❌ Trust user input without validation
7. ❌ Store passwords in plaintext
8. ❌ Skip database migrations
9. ❌ Force push to `main` branch
10. ❌ Commit commented-out code

### 📊 Pre-existing violations (do NOT report as new findings)

| Rule | Existing count | Notes |
|---|---|---|
| `console.log` | **271** in `server.cjs`, **2,093** in `src/` | Remove only from lines you touch. A codebase-wide cleanup is a separate, tracked task |
| ESLint | **1,267 errors** as of 2026-07-09 | `npm run lint` is deliberately **not** gated in `ci.yml` for this reason |
| Function/component length | `server.cjs` is ~12,300 lines | Apply the 50-line / 300-line guidance to new code; do not demand refactors of untouched code |

Scope reviews to the diff. Flagging pre-existing debt on every task buries the findings that matter.

### ✅ ALWAYS:
1. ✅ Write tests for new features
2. ✅ Validate input on backend
3. ✅ Handle errors gracefully
4. ✅ Use HTTPS in production
5. ✅ Log important business events (not sensitive data)
6. ✅ Review security implications
7. ✅ Update documentation
8. ✅ Use meaningful commit messages
9. ✅ Ask for code review before merge
10. ✅ Test locally before pushing

---

## 👥 Team & Responsibilities

### Roles
- **Product Owner:** Requirements, priorities, roadmap
- **Tech Lead:** Architecture, standards, reviews
- **Frontend Engineers:** React, UI, components
- **Backend Engineers:** APIs, databases, business logic
- **QA Engineers:** Testing, quality assurance
- **DevOps/Infra:** Deployment, CI/CD, infrastructure

### Using GStack Agents
All agents follow these standards automatically!

---

## 🔀 Workflow Selection (GStack vs Direct)

**Default rule:** the size and risk of a task decides which flow Claude uses.

### Use a GStack workflow (`.claude/workflows/`) by default for:
- New features (any size) → `new-feature` workflow
- Bug fixes → `bug-fix` workflow
- Deployments → `deployment` workflow
- Any change touching pricing logic, API endpoints, database models, auth, or CI/CD

### Direct (normal) flow is allowed by default for:
- Trivial single-file cosmetic edits (UI text, styling tweaks, removing static elements)
- Documentation typos and comment fixes
- Answering questions / investigations with no code change

### User overrides (always win over the defaults):
- Prefix a request with **"use gstack"** → run the full GStack workflow regardless of size
- Prefix a request with **"quick fix"** or **"direct"** → skip the workflow and edit directly

### Always (regardless of flow):
- Borderline case? Ask the user which flow to use before starting
- Ask for explicit user confirmation before any commit, merge, or deploy. The commit gate is two steps: first ask WHETHER to commit; then ask WHICH BRANCH to commit to — current, another existing, or a new branch (never assume the current one). The deploy gate is three steps: first ask WHETHER to deploy at all; if yes, ask WHICH BRANCH to deploy from; then ask the target — dev or production. If no deploy, stop after the commit
- **Deploy targets map as follows — this is the corrected mapping, read it carefully:**
  - **dev** = merge/push the working branch into `main`. `deploy-dev.yml` then auto-deploys `main` to the DEV server (159.89.175.168:3001). **Merging to `main` IS the dev deploy** — the two are one action, so never merge to `main` without dev-deploy approval at the target gate. Pushing a feature branch on its own deploys nothing
  - **production** = a deliberate **manual SSH deploy** to `zenop.ai`. It is NOT triggered by any branch operation, and merging to `main` does not cause it
- Adding a production deploy pipeline to `main` is a separate, team-approved change. If one is ever added, merge-to-`main` becomes a production deploy too and this rule must be rewritten before that lands
- State which flow was used when reporting the completed work

---

## 📞 Communication

### For Questions:
- Code questions → Code review/PR comments
- Architecture → Tech lead
- Bugs → Create issue in GitHub
- Deployment issues → DevOps team

### Response Time:
- Critical bugs: 1 hour
- Code review: 24 hours
- Other issues: 48 hours

---

## 🎯 Priority & Values

### Why We Build This Way
1. **Security First** — Prevent breaches, protect customer data
2. **Quality Over Speed** — Tests, reviews, standards matter
3. **Maintainability** — Code should be easy to understand
4. **Performance** — Fast response times, efficient queries
5. **User Experience** — Simple, intuitive, responsive

---

## 📊 Success Metrics

- ✅ 99.9% uptime
- ✅ <2 second response time
- ✅ Zero security vulnerabilities in production
- ✅ 80%+ test coverage
- ✅ 0 critical bugs in production
- ✅ <1 hour deployment rollback time

---

## 🔗 Related Files

- `.claude/agents/` — GStack agent instructions
- `.claude/workflows/` — Workflow definitions
- `package.json` — Dependencies, scripts

---

## 📝 Document Updates

| Date | Change | Author |
|------|--------|--------|
| 2026-07-06 | Initial CLAUDE.md creation | CloudFuze |
| 2026-07-07 | Added Workflow Selection rule (GStack vs Direct) | CloudFuze |
| 2026-08-06 | AI SDLC Phase 1 — corrected tech stack (TypeScript, no PostgreSQL, port 3001), replaced fictional `server/` tree with actual layout, corrected CI/CD facts (`main` auto-deploys to DEV; production is manual), restated unimplemented security/testing claims as known gaps | CloudFuze |

---

**Version:** 1.1  
**Last Updated:** August 6, 2026  
**Ready for GStack!** ✅
