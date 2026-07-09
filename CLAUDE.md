# CPQ12 — GStack Configuration & Project Standards

**Last Updated:** July 6, 2026  
**Version:** 1.0  
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
- **Framework:** React 18 + Vite
- **Styling:** TailwindCSS
- **State Management:** React Context API + Hooks
- **Form Handling:** React Hook Form
- **Testing:** Vitest + React Testing Library (Jest-compatible API; run with `npm test`)
- **Port:** 5173

### Backend
- **Framework:** Node.js 20 LTS + Express.js (Vite 7 requires Node ≥20.19)
- **Language:** JavaScript
- **Database:** 
  - MongoDB (primary data)
  - PostgreSQL (signatures, audit logs)
- **ORM:** Mongoose (MongoDB), Sequelize (PostgreSQL)
- **Auth:** JWT (Bearer tokens)
- **API Style:** RESTful
- **Port:** 3000

### Deployment
- **Containerization:** Docker + Docker Compose
- **CI/CD:** GitHub Actions
- **Environments:** Development, Staging, Production
- **Monitoring:** Health checks, Logging

---

## 📂 Directory Structure

```
(repo root)
├── src/
│   ├── components/          (React components)
│   ├── pages/               (Page components)
│   ├── hooks/               (Custom React hooks)
│   ├── contexts/            (React Context)
│   ├── services/            (API calls, business logic)
│   ├── utils/               (Utilities, helpers)
│   ├── styles/              (Global styles)
│   └── App.jsx
├── server/                  (Backend Express app)
│   ├── routes/              (API routes)
│   ├── controllers/         (Route handlers)
│   ├── models/              (Database models)
│   ├── middleware/          (Express middleware)
│   ├── services/            (Business logic)
│   └── server.js
├── tests/                   (Test files)
├── scripts/                 (Deployment scripts)
├── .github/workflows/       (GitHub Actions)
├── Dockerfile
├── docker-compose.yml
├── package.json
└── CLAUDE.md (this file)
```

---

## 💻 Coding Conventions

### Naming Conventions

**Files & Folders:**
- React components: `PascalCase` (e.g., `PricingCalculator.jsx`)
- Hooks: `camelCase` with `use` prefix (e.g., `useQuoteData.js`)
- Utils/helpers: `camelCase` (e.g., `formatPrice.js`)
- Services: `camelCase` (e.g., `quoteService.js`)
- Database models: `PascalCase` (e.g., `Quote.js`)

**Variables & Functions:**
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_ATTEMPTS`)
- Variables: `camelCase` (e.g., `isLoading`)
- Functions: `camelCase` (e.g., `calculateTotal()`)
- Classes: `PascalCase` (e.g., `QuoteManager`)

**Database:**
- Table names: `lowercase_with_underscores` (e.g., `quote_items`)
- Column names: `lowercase_with_underscores` (e.g., `created_at`)
- MongoDB collections: `camelCase` (e.g., `quoteItems`)

### Code Style

**React Components:**
```javascript
// ✅ Functional components with hooks
function PricingCalculator({ items, onChange }) {
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

### Authentication
- ✅ JWT tokens for API authentication
- ✅ Tokens include userId, role, expiration
- ✅ Refresh tokens for long-lived sessions
- ✅ No credentials in code or logs

### Input Validation
- ✅ Validate all user inputs on backend
- ✅ Sanitize inputs before database queries
- ✅ Check file uploads (type, size)
- ✅ Enforce rate limiting on sensitive endpoints

### Data Protection
- ✅ Never log sensitive data (passwords, tokens, credit cards)
- ✅ HTTPS only in production
- ✅ Encrypt sensitive data at rest
- ✅ CORS configured properly
- ✅ CSRF protection for forms

### API Security
- ✅ Rate limiting: 100 requests/minute per IP
- ✅ API versioning (e.g., `/api/v1/quotes`)
- ✅ Error messages don't leak system info
- ✅ Audit logging for sensitive operations

---

## 🧪 Testing Standards

### Coverage Targets
- ✅ Unit tests: 80%+ coverage
- ✅ Critical business logic: 100% coverage
- ✅ API endpoints: Integration tests required
- ✅ Components: At least Happy path + 1 error case

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
- ✅ Merged to `develop` first, then `main`

---

## 🚀 Deployment Standards

### Environment Variables

**Development (.env):**
```
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/cpq12
POSTGRES_URI=postgresql://cpq12:cpq12pass@localhost:5432/cpq12
JWT_SECRET=dev-secret-key
```

**Production (.env.production):**
```
NODE_ENV=production
MONGODB_URI=<production-mongodb-uri>
POSTGRES_URI=<production-postgres-uri>
JWT_SECRET=<production-secret-key>
AZURE_CLIENT_ID=<your-azure-id>
AZURE_CLIENT_SECRET=<your-azure-secret>
```

### Deployment Process
1. All tests must pass
2. Code review approved
3. Merge to `main` branch
4. GitHub Actions triggers
5. Docker image built
6. Deployed to staging first
7. Health checks pass
8. Manual approval for production
9. Deployed to production
10. Monitoring alerts configured

### Rollback Procedure
```bash
# Emergency rollback
bash scripts/rollback.sh production

# This reverts to previous version in ~30 seconds
```

---

## 🔍 Code Review Checklist

**Security:**
- [ ] No hardcoded secrets
- [ ] Input validation on all endpoints
- [ ] Authentication/authorization checks
- [ ] No SQL injection risk
- [ ] No XSS vulnerabilities

**Quality:**
- [ ] Code is readable and well-named
- [ ] Functions under 50 lines
- [ ] No code duplication (DRY)
- [ ] Follows project conventions
- [ ] Tests included (80%+ coverage)

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

### 🔴 NEVER:
1. ❌ Commit secrets, API keys, or credentials
2. ❌ Use `any` type without justification (TypeScript)
3. ❌ Skip error handling in async functions
4. ❌ Deploy without running tests
5. ❌ Use `console.log` in production code
6. ❌ Trust user input without validation
7. ❌ Store passwords in plaintext
8. ❌ Skip database migrations
9. ❌ Force push to `main` branch
10. ❌ Commit commented-out code

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
- Choosing **production** = merging the working branch into `main`. Once a CI/CD pipeline is configured on `main`, any push to `main` auto-triggers the production deploy, so merge-to-main and production-deploy are ONE action — never merge to `main` without an explicit production approval at the target gate. (NOTE: `main` has no CI/CD pipeline yet; adding one is a separate, team-approved change. The PR-only quality-gate workflow in `.github/workflows/ci.yml` — tests + build on pull requests, no push trigger, no deploy jobs — is NOT that pipeline and does not change this rule)
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

---

**Version:** 1.0  
**Last Updated:** July 6, 2026  
**Ready for GStack!** ✅
