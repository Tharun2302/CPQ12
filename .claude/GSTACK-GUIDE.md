# GStack Implementation Guide for CPQ12

## What is GStack?

GStack is an AI engineering team architecture where specialized AI agents handle different roles in the software development lifecycle.

Instead of one AI doing everything, we have:
- **Architect Agent** (designs)
- **Backend Engineer Agent** (codes backend)
- **Frontend Engineer Agent** (codes frontend)
- **QA Engineer Agent** (tests)
- **Security Reviewer Agent** (audits security)
- **Code Reviewer Agent** (reviews code quality)
- **Documentation Engineer Agent** (writes docs)
- **DevOps Engineer Agent** (handles deployment)

Each agent has specialized instructions and expertise for their role.

---

## When to Use GStack

### ✅ Use GStack When:

- Building a new major feature (not a quick bug fix)
- Feature has security implications
- Feature requires comprehensive documentation
- You want full coverage: design → code → test → review → deploy
- You have time for thorough implementation

### ❌ Don't Use GStack When:

- Fixing a quick bug (use bug-fix.yaml instead)
- Making a simple UI tweak
- Need something done in 30 minutes
- Low-risk, low-complexity change

---

## How to Use GStack

### Step 1: Ask for the Feature

```
You: "Implement currency converter feature. 
     Users should see USD/EUR/GBP options,
     rates should update every hour,
     need to integrate with OpenExchangeRates API"
```

### Step 2: Architect Agent Designs

Architect Agent reads: `.claude/agents/architect.md`

Output:
- Feature design document
- Database schema
- API endpoint specifications
- Frontend component list
- Implementation sequence

```
You MUST review the design. If wrong, ask Architect to redo BEFORE proceeding.
```

### Step 3: Implementation Phase

Backend Engineer Agent codes backend (based on design)
Frontend Engineer Agent codes frontend (based on design)

### Step 4: Testing & Review

- QA Engineer tests the feature
- Security Reviewer audits for vulnerabilities
- Code Reviewer checks code quality
- Documentation Engineer creates docs

### Step 5: Deployment

DevOps Engineer prepares and executes deployment.

---

## Agent Instructions Location

All agent instructions are in `.claude/agents/`:

```
.claude/agents/
├── architect.md              ← Design Agent
├── backend-engineer.md       ← Backend Agent
├── frontend-engineer.md      ← Frontend Agent
├── qa-engineer.md            ← QA Agent
├── security-reviewer.md      ← Security Agent
├── code-reviewer.md          ← Code Review Agent
├── documentation-engineer.md ← Documentation Agent
└── devops-engineer.md        ← DevOps Agent
```

Each file contains:
- Agent's role
- Responsibilities
- Workflow
- Specific instructions for CPQ12
- Code standards
- Output format

---

## Workflow Definitions

Workflows are defined in `.claude/workflows/`:

```
.claude/workflows/
├── new-feature.yaml   ← For new features (full pipeline)
├── bug-fix.yaml       ← For bug fixes (skip design)
└── deployment.yaml    ← For production deployment
```

### New Feature Workflow (new-feature.yaml)

Full pipeline from design to deployment:
1. Requirements analysis
2. Architecture design
3. Backend implementation
4. Frontend implementation
5. Testing
6. Security audit
7. Code review
8. Documentation
9. Deployment preparation
10. Final review & deployment

**Timeline:** 3-5 days for medium feature

### Bug Fix Workflow (bug-fix.yaml)

Streamlined pipeline (skip design phase):
1. Bug analysis
2. Fix implementation
3. Testing
4. Security check
5. Code review
6. Documentation update
7. Deployment

**Timeline:** 2-8 hours depending on complexity

### Deployment Workflow (deployment.yaml)

Pipeline for deploying to staging and production:
1. Build
2. Staging deployment
3. Staging verification
4. Production deployment
5. Post-deployment verification
6. Rollback (if needed)

---

## Team Roles in GStack

### Your Role (Person A & B)

**What you do:**
- ✅ Decide WHAT to build (product decisions)
- ✅ Review agent outputs
- ✅ Approve/reject designs
- ✅ Make final deployment decisions
- ✅ Monitor production

**What agents do:**
- ✅ Design the HOW
- ✅ Code the implementation
- ✅ Test thoroughly
- ✅ Review code quality
- ✅ Audit security
- ✅ Write documentation
- ✅ Prepare deployment

**You don't code anymore:**
- Agents handle implementation
- You focus on decisions and reviews

---

## Example: Build New Feature with GStack

### Feature Request
"Add bulk discount tier. If customer buys 50+ items, they get 25% discount. This should work with existing 3-tier discount system."

### What Happens

**Step 1: You Request Feature**
```
You: "Implement bulk discount tier.
     50+ items = 25% discount.
     Should work with existing 3-tier system.
     Update pricing-logic.js and test all 12 combinations."
```

**Step 2: Architect Designs**
```
Architect Agent:
  - Analyzes bulk discount logic
  - Designs how it fits with 3-tier system
  - Updates database schema (discount tiers table)
  - Updates API response format
  - Lists components to update
  - Specifies all 12 combination tests

Output: Design document with:
  - Database schema update
  - API endpoint changes
  - Pricing calculation logic
  - Test cases (all 12 combinations)
```

**Step 3: You Review Design**
```
You: "Design looks good, but confirm:
     - Does bulk discount apply before or after 3-tier?
     - What if customer qualifies for both?"

Architect: "Bulk applies AFTER 3-tier discount,
           customer gets whichever is higher."

You: "Perfect, proceed."
```

**Step 4: Backend Engineer Implements**
```
Backend Engineer:
  - Updates pricing-logic.js
  - Adds bulk discount calculation
  - Tests all 12 combinations
  - Ensures bulk + 3-tier logic works
  - Handles edge cases

Output: Code + passing tests
```

**Step 5: QA Tests**
```
QA Engineer:
  - Tests single item (no bulk discount)
  - Tests 49 items (no bulk discount)
  - Tests 50 items (bulk discount applies)
  - Tests 100 items (bulk discount applies)
  - Tests with 3-tier discount
  - Tests edge cases

Output: Test report (all pass ✓)
```

**Step 6: Security Reviews**
```
Security Reviewer:
  - Check discount calculation can't be exploited
  - Check input validation
  - No SQL injection in queries
  - No exposure of discount tiers

Output: Security audit (clear ✓)
```

**Step 7: Code Review**
```
Code Reviewer:
  - Check code quality
  - Check naming conventions
  - Check error handling
  - Check test coverage

Output: Code review (approved ✓)
```

**Step 8: Documentation**
```
Documentation Engineer:
  - Update API docs with new discount tier
  - Update README with bulk discount feature
  - Create user guide for bulk discounts
  - Update CHANGELOG

Output: Updated docs
```

**Step 9: Deployment**
```
DevOps Engineer:
  - Create deployment script
  - Deploy to staging
  - Test in staging
  - Deploy to production
  - Monitor

Output: Feature live in production ✓
```

**Total time: 2-3 days**

---

## Comparing Workflows

### Quick Bug Fix (bug-fix.yaml)

```
Bug: "Pricing shows $0 for large orders"

You: "Fix the calculation"
     ↓
Backend Engineer: Code fix (1 hour)
     ↓
QA: Test fix (30 min)
     ↓
Code Review: Approve (15 min)
     ↓
Deploy (15 min)
     ↓
TOTAL: ~2 hours
```

### New Feature (new-feature.yaml)

```
Feature: "Add bulk discount tier"

You: "Implement bulk discounts"
     ↓
Architect: Design (4 hours) ← YOU REVIEW
     ↓
Backend: Code (6 hours)
     ↓
Frontend: Code (not needed for pricing)
     ↓
QA: Test (2 hours)
     ↓
Security: Audit (1 hour)
     ↓
Code Review: Approve (1 hour)
     ↓
Documentation: Docs (1 hour)
     ↓
DevOps: Deploy (1 hour)
     ↓
TOTAL: ~16 hours over 2-3 days
```

---

## Key Differences from Current Model

| Aspect | Current Model | GStack |
|---|---|---|
| **Design phase** | You decide | Architect Agent designs |
| **Implementation** | Claude codes | Backend + Frontend Agents code |
| **Testing** | You test | QA Agent tests |
| **Security** | Manual | Security Agent audits |
| **Code Review** | You review | Code Review Agent reviews |
| **Documentation** | Manual | Documentation Agent writes |
| **DevOps** | Manual | DevOps Agent handles |
| **Speed** | Fast (10-20 min) | Slower (4-12 hours) |
| **Completeness** | Basic | Comprehensive |

---

## How to Invoke GStack Agents

### Via Agent Tool

```
@architect "Design a new discount tier feature. 
           Bulk discount: 50+ items = 25% off"

@backend-engineer "Implement based on Architect's design"

@qa-engineer "Test the bulk discount feature"

@security-reviewer "Audit the discount logic for vulnerabilities"
```

### Via Workflow Files

You can also create a workflow script that orchestrates all agents:

```javascript
// Run all agents in sequence
const design = await agent("Architect", architectPrompt);
const backend = await agent("Backend", designFromArchitect);
const qa = await agent("QA", backendCode);
const security = await agent("Security", backendCode);
const review = await agent("CodeReview", backendCode);
const docs = await agent("Documentation", allChanges);
const deploy = await agent("DevOps", allChanges);
```

---

## Rules for Using GStack

✅ **DO:**
- Review Architect's design before proceeding
- Stop if design is wrong (tell Architect to redo)
- Let agents do their work without interrupting
- Approve outputs from each agent before next phase
- Use for complex features (high value)
- Document decisions in CLAUDE.md

❌ **DON'T:**
- Skip the Architect phase (causes rework)
- Use for simple 15-minute fixes (overkill)
- Interrupt agents mid-work
- Approve bad designs just to move forward
- Use agents to bypass code review

---

## When Design is Wrong

**Scenario:** Architect designs discount logic incorrectly.

**Right approach:**
1. You review design
2. You catch the error
3. You tell Architect: "This is wrong because..."
4. Architect redesigns (15 min)
5. You approve redesign
6. Backend Agent codes correct design
7. **TOTAL WASTED TIME: 0 minutes** ✓

**Wrong approach:**
1. You approve bad design
2. Backend codes wrong implementation (6 hours)
3. QA tests wrong feature (2 hours)
4. Code Review catches error (1 hour)
5. Everything needs to be redone
6. **TOTAL WASTED TIME: 9 hours** ✗

---

## GStack Success Checklist

- [ ] You understand GStack model
- [ ] All agent instruction files exist in `.claude/agents/`
- [ ] All workflow files exist in `.claude/workflows/`
- [ ] You've read architect.md
- [ ] You've read backend-engineer.md
- [ ] You've read qa-engineer.md
- [ ] You know when to use GStack (complex features)
- [ ] You know when NOT to use GStack (quick fixes)
- [ ] You understand the review checkpoints
- [ ] You're ready to start with a new feature

---

## Next Steps

### To Use GStack for Your Next Feature:

1. Define the feature clearly
2. Invoke Architect Agent to design
3. You review the design thoroughly
4. If design is correct, invoke Backend Agent
5. If design is wrong, loop back to step 2
6. Follow the new-feature.yaml workflow
7. Monitor each phase's output

### To Gradually Adopt GStack:

**Phase 1 (Now):** Use GStack for major features only
**Phase 2 (Month 1):** Use GStack for all new features
**Phase 3 (Month 2):** Add Designer skill for medium features
**Phase 4 (Month 3):** Full GStack adoption

---

## Questions?

Each agent has detailed instructions. Check:
- `.claude/agents/architect.md` - for design questions
- `.claude/agents/backend-engineer.md` - for backend questions
- `.claude/agents/qa-engineer.md` - for testing questions
- `.claude/agents/security-reviewer.md` - for security questions
- `.claude/agents/code-reviewer.md` - for code quality questions
- `.claude/agents/documentation-engineer.md` - for docs questions
- `.claude/agents/devops-engineer.md` - for deployment questions

---

**Welcome to GStack! 🚀**
