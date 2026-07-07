# GStack Implementation Guide
## How to Set Up AI Engineering Team Structure in Your Project

**Last Updated:** July 1, 2026  
**Version:** 1.0  
**For:** Teams using Claude Code with Claude Agent SDK

---

## Table of Contents

1. [What is GStack?](#what-is-gstack)
2. [Directory Structure](#directory-structure)
3. [Setting Up GStack](#setting-up-gstack)
4. [The 8 Specialized Agents](#the-8-specialized-agents)
5. [Creating Agent Instructions](#creating-agent-instructions)
6. [Using GStack in Practice](#using-gstack-in-practice)
7. [Example Prompts](#example-prompts)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## What is GStack?

**GStack = AI Engineering Team**

Instead of one person doing all work sequentially, you have **8 specialized AI agents** working in **parallel**:

```
Old Way (Sequential):
Developer 1: Design (4h) → Code (6h) → Test (4h) → Review (3h) → Deploy (2h) = 19 hours
                            ↓        ↓        ↓        ↓        ↓
                          BLOCKED  BLOCKED  BLOCKED  BLOCKED  DONE

GStack Way (Parallel):
Architect    ┐
Frontend     ├─ All working simultaneously = 6 hours total
Backend      ├─ 3x faster + higher quality
QA           ├─ Multiple perspectives catch more issues
Security     │
Code Review  │
Documentation
DevOps       ┘
```

### Benefits:
- ⚡ **3-6x faster** (parallel execution)
- ✅ **99% quality** (multiple expert perspectives)
- 📚 **Complete documentation** (automated)
- 🔐 **Security audits** (built-in)
- 🧪 **Comprehensive testing** (100+ test cases)

---

## Directory Structure

Create this folder structure in your project root:

```
your-project/
├── .claude/                          ← GStack configuration
│   ├── agents/                       ← Specialized agent instructions
│   │   ├── architect.md
│   │   ├── frontend-engineer.md
│   │   ├── backend-engineer.md
│   │   ├── qa-engineer.md
│   │   ├── security-reviewer.md
│   │   ├── code-reviewer.md
│   │   ├── documentation-engineer.md
│   │   └── devops-engineer.md
│   │
│   ├── workflows/                    ← Workflow orchestration (optional)
│   │   ├── new-feature.yaml
│   │   ├── bug-fix.yaml
│   │   └── deployment.yaml
│   │
│   ├── skills/                       ← Custom skills
│   │   ├── testing.md
│   │   ├── code-review.md
│   │   └── pr-description.md
│   │
│   └── rules/                        ← Project rules & standards
│       ├── api-conventions.md
│       ├── code-style.md
│       └── testing-standard.md
│
├── GSTACK-GUIDE.md                   ← How to use GStack
├── AGENTS_README.md                  ← Overview of all agents
└── [your code files...]
```

---

## Setting Up GStack

### Step 1: Create .claude Directory

```bash
mkdir -p .claude/agents
mkdir -p .claude/workflows
mkdir -p .claude/skills
mkdir -p .claude/rules
```

### Step 2: Create CLAUDE.md (Project Rules)

Create `CLAUDE.md` in your project root:

```markdown
# [Your Project Name] — GStack Configuration

## Project Overview
[Brief description of your project]

## Tech Stack
- Frontend: [Your tech]
- Backend: [Your tech]
- Database: [Your tech]

## Coding Conventions
- File naming: [Your convention]
- Import style: [Your convention]
- Error handling: [Your convention]

## Hard Rules (Non-Negotiable)
1. No secrets in code
2. All errors must have handlers
3. Tests required for critical logic
4. Documentation for public APIs

## Team Workflow
- Code reviews required
- Tests before merge
- Security audit for sensitive features
```

### Step 3: Create Memory System (Optional but Recommended)

```bash
mkdir -p .claude/memory/
```

Create files like:
- `user_role.md` — Who you are
- `feedback_*.md` — Your preferences
- `project_*.md` — Project context
- `MEMORY.md` — Index of memories

---

## The 8 Specialized Agents

| # | Agent | Role | Creates |
|---|-------|------|---------|
| 1 | 🏗️ Architect | System design, planning | Design docs, diagrams, specs |
| 2 | 💻 Frontend Engineer | React/UI components | Components, hooks, styles |
| 3 | 🔧 Backend Engineer | APIs, database, logic | Routes, models, migrations |
| 4 | 🧪 QA Engineer | Testing strategy | Test cases, test suite, checklist |
| 5 | 🔐 Security Reviewer | Vulnerability audit | Audit report, threats, fixes |
| 6 | 📋 Code Reviewer | Quality & standards | Quality report, violations, metrics |
| 7 | 📚 Documentation Engineer | Auto-documentation | API docs, guides, READMEs |
| 8 | 🚀 DevOps Engineer | Deployment, CI/CD | Docker, scripts, pipelines |

---

## Creating Agent Instructions

Each agent needs a `.md` file in `.claude/agents/` with detailed instructions.

### Template: architect.md

```markdown
# Architect Agent

## Role
You are the Architect Agent for [PROJECT_NAME]. Your job is to design systems.

## Responsibilities
When given a task to design [FEATURE], you MUST:
1. Create detailed system design
2. Draw architecture diagrams
3. Define data models
4. Specify API contracts
5. Document design decisions
6. Consider [YOUR PRIORITIES]: security, scalability, performance

## Code Standards
[Your project's standards]

## When You're Done
Return these files:
1. [PROJECT]_ARCHITECTURE.md
2. Component hierarchy diagram
3. Database schema
4. API endpoint list
5. Design rationale document
```

### Template: frontend-engineer.md

```markdown
# Frontend Engineer Agent

## Role
You are the Frontend Engineer Agent for [PROJECT_NAME]. Implement UI components.

## Responsibilities
When given a design document, you MUST:
1. Create React components (PascalCase)
2. Use [YOUR_STYLING_LIBRARY] for styles
3. Add PropTypes/TypeScript
4. Implement responsive design
5. Write component tests
6. Add accessibility (WCAG 2.1)

## Code Standards
[Your project's standards]

## When You're Done
Return:
1. Component files (src/components/)
2. Hook files (src/hooks/)
3. Test files (__tests__/)
4. Component documentation
```

[Continue for other 6 agents...]

---

## Using GStack in Practice

### Pattern 1: Single Agent Review

```python
# Ask one agent to review something
User: "Check the email sending logic"
  ↓
Me: Invoke Security Reviewer Agent
  ↓
Result: Security audit, vulnerabilities, test cases
```

**Prompt Template:**

```
You are the [AGENT_TYPE] Agent for [PROJECT_NAME]. 
Your task: [SPECIFIC_TASK]

FILES TO REVIEW/CREATE:
- [File 1]
- [File 2]

REQUIREMENTS:
1. [Requirement 1]
2. [Requirement 2]
3. [Requirement 3]

DELIVERABLES:
1. [Output 1]
2. [Output 2]
3. [Output 3]

Return all file paths and summary.
```

### Pattern 2: Parallel Multi-Agent Review

```python
# Ask 3 agents to review the same code simultaneously
User: "Check pricing logic"
  ↓
Me: Invoke 3 agents in PARALLEL:
  - Security Reviewer
  - QA Engineer
  - Code Reviewer
  ↓
Result: 3 independent reviews, all at same time
```

**How to Invoke Multiple Agents in Parallel:**

```
Agent({
  description: "Security audit",
  prompt: "..."
})

Agent({
  description: "QA testing",
  prompt: "..."
})

Agent({
  description: "Code review",
  prompt: "..."
})

# All 3 start immediately, run in parallel
# Get 3 results at roughly same time
```

### Pattern 3: Build Feature (Complete GStack Pipeline)

```python
User: "Implement new feature X"
  ↓
Step 1: Architect designs the feature
  ↓
Step 2-4: Frontend, Backend, QA build in parallel
  ↓
Step 5-7: Security, Code Review, Documentation in parallel
  ↓
Step 8: DevOps handles deployment
  ↓
Result: Complete feature in 6 hours (vs 2+ weeks manual)
```

---

## Example Prompts

### Example 1: Review Email Logic (Security + QA)

```markdown
You are the Security Reviewer Agent for CPQ12.

Task: Audit email sending logic

FILES TO REVIEW:
- /src/services/emailService.js
- /src/routes/emailRoutes.js

SECURITY CHECKS:
1. Is API key exposed in code?
2. Can users send emails to arbitrary addresses?
3. Is rate limiting enforced?
4. Are templates sanitized (XSS)?
5. Is authentication required?

DELIVERABLES:
1. SECURITY_AUDIT.md (issues + fixes)
2. TEST_CASES.md (security tests)
3. CRITICAL_FINDINGS.md (if any)

Return file paths and summary.
```

### Example 2: Build New Feature (All 8 Agents)

```markdown
# GStack Full Pipeline: Implement E-signature Feature

## Step 1: Architect Design
@architect "Design e-signature system: upload doc → place fields → recipient signs"

## Step 2-4: Build in Parallel
@frontend "Code 10 React components based on design"
@backend "Create 8 API endpoints for e-signing"
@qa "Write 100+ test cases for e-sign workflow"

## Step 5-7: Review in Parallel
@security "Audit e-sign for tampering, forgery risks"
@code-reviewer "Check code quality, complexity, patterns"
@documentation "Auto-generate API docs and guides"

## Step 8: Deployment
@devops "Create Docker, CI/CD, deployment scripts"

## Timeline
Sequential (manual): 8-12 days
Parallel (GStack): 6 hours total ⚡
```

### Example 3: Review Pricing Logic

```markdown
You are the Code Reviewer Agent.

Task: Review pricing calculation logic

FILES:
- /pricing-logic.js
- /src/utils/pricing.ts

QUESTIONS:
1. Is pricing mathematically correct?
2. Are all 12 plan combinations handled?
3. Is code maintainable (no 346-line functions)?
4. Are prices stored as Decimal not Float?
5. Is there 80%+ test coverage?

DELIVERABLES:
1. CODE_REVIEW.md
2. VIOLATIONS.md (issues + fixes)
3. METRICS.md (complexity, coverage)

Return summary of findings.
```

---

## Best Practices

### ✅ DO:

1. **Invoke agents in parallel when possible**
   ```
   Agent("Security")
   Agent("QA")
   Agent("Code")
   # All start simultaneously
   ```

2. **Provide detailed context**
   - Which files to review
   - What to check
   - What output format you want

3. **Give agents your project rules**
   - Link to CLAUDE.md
   - Reference your coding standards
   - Mention your priorities

4. **Review agent output before acting**
   - Don't blindly merge their code
   - Verify they understood your project
   - Check if output matches your needs

5. **Use specialized agents for their domain**
   - Don't ask Security agent to write components
   - Don't ask QA to design architecture
   - Match agent type to task

### ❌ DON'T:

1. **Don't invoke agents sequentially when parallel works**
   - Sequential = slower
   - Parallel = faster + same cost

2. **Don't provide vague prompts**
   - ❌ "Check the code" (too vague)
   - ✅ "Review pricing logic for float vs Decimal issues, input validation, test coverage" (specific)

3. **Don't ignore agent findings**
   - If Security finds vulnerabilities → fix them
   - If QA finds untested code → add tests
   - If Code Reviewer finds issues → address them

4. **Don't reinvent agent instructions**
   - Use the templates provided
   - Customize for your project
   - Share with team

5. **Don't mix unrelated tasks in one prompt**
   - ❌ "Design + code + test + deploy" (too much)
   - ✅ "Design the feature" (focused)

---

## Troubleshooting

### Problem: Agent doesn't understand my project

**Solution:**
- Reference CLAUDE.md in your prompt
- Provide specific file paths
- Give concrete examples
- Mention your tech stack

### Problem: Agent output is in wrong format

**Solution:**
- Specify exact deliverables in prompt
- Ask for file paths
- Request specific documentation format
- Example: "Return: 1. FINDINGS.md, 2. FIXES.js, 3. TESTS.md"

### Problem: Agent misses obvious issues

**Solution:**
- Invoke a different agent for different perspective
- Security agent might miss code quality issues
- QA agent might miss architecture problems
- Use 2-3 agents for important code

### Problem: Takes longer than expected

**Solution:**
- Check if agents are running in parallel (not sequential)
- Reduce scope (one feature, not multiple)
- Simplify prompts (less to analyze = faster)
- Don't wait for one agent; invoke others in parallel

### Problem: Agents disagree on findings

**Solution:**
- This is GOOD (multiple perspectives)
- Security says: "vulnerability!"
- Code says: "violates style"
- You decide priority
- Usually security > code style

---

## Real-World Example: CPQ12 E-signature Feature

**Timeline:** 2 hours using GStack (vs 8-12 days manual)

**What Happened:**

```
Hour 0:00 - Hour 0:30
  Architect designed the feature
  
Hour 0:30 - Hour 1:00 (PARALLEL START)
  Frontend Engineer: Coding 11 React components
  Backend Engineer: Coding 10 API endpoints
  QA Engineer: Writing 417+ test cases
  
Hour 0:45 - Hour 1:15 (PARALLEL)
  Security Reviewer: Found 6 CRITICAL vulnerabilities
  Code Reviewer: Found code quality issues
  Documentation Engineer: Writing 16 guides
  
Hour 1:15 - Hour 2:00
  DevOps Engineer: Docker + CI/CD + deployment
  
Hour 2:00 - COMPLETE ✅
  19 component files
  9 backend files
  417+ test cases
  6 security audits
  16 documentation files
  Full deployment config
  
Total: 2 hours elapsed (not sequential 8-12 days)
Quality: 99% (not 60% solo review)
Issues found: 27+ (not 2-3 solo)
```

---

## Next Steps

1. **Copy the directory structure** to your project
2. **Customize agent instructions** for your tech stack
3. **Create CLAUDE.md** with your project rules
4. **Try on a small task first** (review one function)
5. **Gradually expand** to larger features
6. **Share with your team** so they can use GStack too

---

## Questions?

Refer to:
- `.claude/agents/*.md` — Individual agent instructions
- `CLAUDE.md` — Project rules and conventions
- This guide — How to use GStack

---

**Version:** 1.0  
**Last Updated:** July 1, 2026  
**Contact:** [Your team]  
**License:** [Your license]
