# GStack Agents Overview

CPQ12 now uses GStack - a specialized AI agent team where each agent has one focused job.

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
│   ├── new-feature.yaml     ← For new features
│   ├── bug-fix.yaml         ← For bug fixes
│   └── deployment.yaml      ← For deployments
│
├── GSTACK-GUIDE.md         ← How to use GStack
└── AGENTS_README.md        ← This file
```

## The 8 Agents

### 1. Architect Agent (`architect.md`)
**Role:** Designs features
**When to use:** Start of any new feature
**Output:** Complete design document

### 2. Backend Engineer Agent (`backend-engineer.md`)
**Role:** Codes backend
**When to use:** After Architect designs
**Output:** Backend code + tests

### 3. Frontend Engineer Agent (`frontend-engineer.md`)
**Role:** Codes frontend
**When to use:** In parallel with Backend Agent
**Output:** Frontend code + tests

### 4. QA Engineer Agent (`qa-engineer.md`)
**Role:** Tests features
**When to use:** After code is implemented
**Output:** Test report + bug list

### 5. Security Reviewer Agent (`security-reviewer.md`)
**Role:** Audits security
**When to use:** After code is implemented
**Output:** Security audit report

### 6. Code Reviewer Agent (`code-reviewer.md`)
**Role:** Reviews code quality
**When to use:** After code is implemented
**Output:** Code review with issues + recommendations

### 7. Documentation Engineer Agent (`documentation-engineer.md`)
**Role:** Writes documentation
**When to use:** After all code is done
**Output:** Updated documentation

### 8. DevOps Engineer Agent (`devops-engineer.md`)
**Role:** Handles deployment
**When to use:** Before production deployment
**Output:** Deployment scripts + CI/CD config

---

## Workflows

### New Feature Workflow (`new-feature.yaml`)
Full pipeline for new features (3-5 days)

### Bug Fix Workflow (`bug-fix.yaml`)
Streamlined pipeline for bug fixes (2-8 hours)

### Deployment Workflow (`deployment.yaml`)
Pipeline for deploying to production (1-2 hours)

---

## How to Use GStack

1. Choose your workflow
2. Invoke the first agent
3. Review each output
4. Approve or request changes
5. Proceed to next agent

---

**Happy building with GStack! 🚀**
