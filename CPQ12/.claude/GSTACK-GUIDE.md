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

---

## Key Rules

✅ **DO:**
- Review Architect's design before proceeding
- Stop if design is wrong (tell Architect to redo)
- Let agents do their work without interrupting
- Approve outputs from each agent before next phase
- Use for complex features (high value)

❌ **DON'T:**
- Skip the Architect phase (causes rework)
- Use for simple 15-minute fixes (overkill)
- Interrupt agents mid-work
- Approve bad designs just to move forward
- Use agents to bypass code review

---

## Next Steps

1. Read AGENTS_README.md for overview of all agents
2. Read each agent's instruction file to understand their role
3. Use new-feature.yaml for your next feature
4. Use bug-fix.yaml for quick bug fixes
5. Use deployment.yaml when ready to deploy

---

**Welcome to GStack! 🚀**
