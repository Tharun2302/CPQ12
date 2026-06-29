# AGENTS.md — Team Structure & Claude Roles

## Human Team

### Person A (Frontend Developer)
- **Primary Responsibility:** React components, UI/UX, client-side logic
- **Tech Stack:** React, Vite, TailwindCSS, Tiptap editor, PDF rendering
- **Owns:**
  - Pricing calculator UI
  - Quote form workflows
  - Azure AD authentication flow
  - Document preview (HTML to PDF)
  - Responsive design & accessibility
  - Form validation & error display
- **Can Ask About:** Backend APIs, database schema, pricing logic
- **Communication:** Daily standup 10 AM, PR review priority

### Person B (Backend Developer)
- **Primary Responsibility:** API routes, database, document generation, cloud integrations
- **Tech Stack:** Node.js/Express, MongoDB, Mongoose, docxtemplater, puppeteer, cloud SDKs
- **Owns:**
  - REST API endpoints
  - Pricing calculation logic
  - Document generation (DOCX → PDF)
  - File uploads & cloud storage (Egnyte, SharePoint, Google Drive)
  - Database schema & migrations
  - Error handling & logging
- **Can Ask About:** React components, UI/UX, frontend performance
- **Communication:** Daily standup 10 AM, code review feedback

---

## Claude Subagents (AI Roles)

### @code-reviewer
**Purpose:** Review code for bugs, style violations, complexity, and best practices.

**When to Invoke:**
- `@code-reviewer review src/ folder for quality issues`
- `@code-reviewer check this function for bugs`
- `@code-reviewer audit pricing-logic.js`

**Scope:**
- Finds bugs and edge cases
- Checks coding convention compliance
- Suggests refactoring opportunities
- Identifies performance issues
- Checks for security issues (SQL injection, XSS, etc.)

**Tools Access:**
- Read code files
- Review git diffs
- Analyze logic flow

---

### @qa-engineer
**Purpose:** Test the application in a real browser, find UX issues, verify functionality.

**When to Invoke:**
- `@qa-engineer test the pricing calculator with 3-tier discounts`
- `@qa-engineer run full app test (quote generation to download)`
- `@qa-engineer check for regressions after pricing change`

**Scope:**
- Manual browser testing
- End-to-end workflows
- Edge case testing (empty fields, large numbers, special characters)
- UI/UX verification
- Document download validation
- Cross-browser compatibility (if relevant)

**Tools Access:**
- Run the app (npm run dev:all)
- Screenshot evidence
- Manual testing flows

---

### @security-reviewer
**Purpose:** Audit code for security vulnerabilities, data exposure, and compliance issues.

**When to Invoke:**
- `@security-reviewer audit API endpoints for vulnerabilities`
- `@security-reviewer check for SQL injection risks in queries`
- `@security-reviewer review Azure AD integration for security gaps`

**Scope:**
- Identify injection vulnerabilities
- Check authentication/authorization
- Verify API endpoint security
- Review error messages (no sensitive data leaks)
- Check for hardcoded secrets
- Validate input sanitization
- Audit database query safety

**Tools Access:**
- Read code files
- Review security-related code
- Check environment variables (no exposure)

---

### @research
**Purpose:** Investigate questions, understand patterns, research solutions.

**When to Invoke:**
- `@research how to optimize MongoDB queries for large datasets`
- `@research best practices for document generation in Node.js`
- `@research how to handle concurrent file uploads safely`

**Scope:**
- Deep dives into technical problems
- Best practices research
- Architecture questions
- Performance optimization
- Integration approaches
- Technology comparisons

**Tools Access:**
- Search knowledge base
- Review existing code
- Analyze patterns

---

## Agent Interaction Matrix

| Scenario | Use Agent | Why |
|---|---|---|
| "Does my code have bugs?" | @code-reviewer | Comprehensive code quality check |
| "Is this pricing calculation correct?" | @qa-engineer | Functional testing with test data |
| "Are my API endpoints secure?" | @security-reviewer | Security-focused audit |
| "How do I handle X?" | @research | Deep investigation & guidance |
| "Quick style check" | @code-reviewer | Style compliance |
| "Full end-to-end test" | @qa-engineer | Real browser testing |

---

## How to Invoke Agents

### Syntax
```
@agent-name Your specific request

Examples:
@code-reviewer Review src/pricing-logic.js for calculation bugs
@qa-engineer Test quote generation with 3-tier discount
@security-reviewer Audit API endpoints for SQL injection
@research How to optimize MongoDB aggregate queries
```

### What Happens
1. Agent loads in isolated context
2. Reads relevant files
3. Performs focused analysis
4. Returns detailed findings
5. No impact on main chat

---

## Response Format

Agents return findings as:
- **Issues Found:** [List of bugs/problems]
- **Severity:** Critical / High / Medium / Low
- **Location:** File path and line number
- **Suggested Fix:** How to resolve
- **Evidence:** Code snippet or test case

---

## Escalation Rules

### If Issue is Unclear
- Ask the agent to clarify with specific context
- Example: `@code-reviewer explain the null pointer risk in line 142`

### If Multiple Issues
- Agent lists them prioritized by severity
- You can ask: `@code-reviewer just the critical issues`

### If Disagreement
- Get second opinion from another agent
- Example: `@security-reviewer check if @code-reviewer's suggestion is secure`

---

## Agent Limitations

**Agents CANNOT:**
- Push code to git
- Deploy to production
- Modify database directly
- Send emails or notifications
- Access external APIs (except through code review)

**You must:**
- Review agent findings before acting
- Make final decisions on code changes
- Handle deployments manually
- Verify fixes work in real browser

---

## Best Practices

1. **Be Specific:** Agents work better with clear, focused requests
2. **Provide Context:** Link to files or describe the problem
3. **Use Together:** Combine agents for comprehensive review
4. **Trust but Verify:** Review findings before committing
5. **Document Decisions:** Update CLAUDE.md if agent suggests rule changes
