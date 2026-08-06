# GStack — Multi-Agent Dev Workflow for Claude Code

GStack is a lightweight pattern for running Claude Code as a small "team" of specialized
subagents (architect, backend, frontend, QA, security, code review, docs, devops) instead of
one generalist doing everything. It's three pieces layered on top of a normal Claude Code
project:

1. **`CLAUDE.md`** — project standards + a "Workflow Selection" rule that tells Claude when to
   use the multi-agent pipeline vs. just editing directly.
2. **`.claude/agents/*.md`** — one file per specialist role, each a system prompt for that
   agent.
3. **`.claude/workflows/*.yaml`** — named pipelines (e.g. "new feature", "bug fix",
   "deployment") that define phases, which agent runs each phase, and — critically — explicit
   **human-approval gates** before anything is committed, merged, or deployed.

Nothing here is CPQ12-specific in structure; the agent/workflow files just encode *your*
team's stack and standards. Copy the shape, swap in your own tech stack, security rules, and
deployment process.

---

## 1. Set up `CLAUDE.md`

At minimum, your `CLAUDE.md` should cover: tech stack, directory structure, naming
conventions, security standards, testing standards, git workflow, and a hard-rules section
(never/always lists). Then add a **Workflow Selection** section like this (adapt the
size/risk thresholds to your project):

```markdown
## 🔀 Workflow Selection (GStack vs Direct)

**Default rule:** the size and risk of a task decides which flow Claude uses.

### Use a GStack workflow (`.claude/workflows/`) by default for:
- New features (any size) → `new-feature` workflow
- Bug fixes → `bug-fix` workflow
- Deployments → `deployment` workflow
- Any change touching [your high-risk areas: pricing logic, API endpoints, DB models, auth, CI/CD]

### Direct (normal) flow is allowed by default for:
- Trivial single-file cosmetic edits (UI text, styling tweaks)
- Documentation typos and comment fixes
- Answering questions / investigations with no code change

### User overrides (always win over the defaults):
- Prefix a request with **"use gstack"** → run the full GStack workflow regardless of size
- Prefix a request with **"quick fix"** or **"direct"** → skip the workflow and edit directly

### Always (regardless of flow):
- Borderline case? Ask the user which flow to use before starting
- Ask for explicit user confirmation before any commit, merge, or deploy. Commit gate is two
  steps: (1) whether to commit, (2) which branch — current, another existing, or new — never
  assume. Deploy gate is three steps: (1) whether to deploy at all, (2) which branch to deploy
  from, (3) target — dev or production. If no deploy, stop after the commit.
- Spell out explicitly whether merging to your main/production branch is wired to
  auto-deploy via CI/CD in your repo. If it is, merge-to-main and production-deploy are ONE
  action — never merge without an explicit production approval at the target gate.
- State which flow was used when reporting completed work.
```

---

## 2. Create the agent files (`.claude/agents/`)

Each file is a markdown file with YAML frontmatter (`name`, `description`) and a system
prompt body. Claude Code's `Agent` tool auto-discovers these by filename. Recommended roster
(trim or rename to fit your team):

| File | Role |
|---|---|
| `architect.md` | Turns a feature request into a design doc (schema, endpoints, components, sequence) *before* code is written. Always run first for non-trivial features. |
| `backend-engineer.md` | Implements backend code from an approved design: models, routes, business logic, validation, tests. |
| `frontend-engineer.md` | Implements UI components, routing, state, and backend integration from the same design doc. |
| `qa-engineer.md` | Runs the app and tests happy path, error cases, edge cases (and any domain-specific combinations, e.g. pricing matrices). Files bug reports with severity + repro steps. |
| `security-reviewer.md` | Audits for injection, auth/authz gaps, secret exposure, input validation, crypto. Rates issues Critical/High/Medium/Low; Critical blocks deployment. |
| `code-reviewer.md` | Checks style, naming, DRY/SOLID, performance (N+1s, re-renders, leaks), and test coverage. Produces Approve / Request Changes. |
| `documentation-engineer.md` | Writes API docs, component docs, README/CHANGELOG updates once a feature passes review. |
| `devops-engineer.md` | Prepares Docker/CI/CD/deployment scripts. **Only acts after explicit user approval to deploy** — this agent should never assume it's cleared to touch deploy config. |

**Each agent file should specify:**
- Its narrow responsibility (don't let agents overlap — e.g. only backend-engineer writes
  server code, only devops-engineer touches Docker/CI files)
- A concrete output format (checklist, report template, code standards) so results are
  consistent and reviewable
- Any hard guardrails specific to that role — e.g. the devops-engineer file in this repo has a
  standing "CI/CD Guard" paragraph forbidding it from wiring auto-deploy-on-push to the
  production branch without explicit, team-approved sign-off. Bake in whatever your team's
  equivalent invariant is.
- A closing "when you're done, return X/Y/Z" so the calling context knows what to expect back

This repo's actual agent files (`.claude/agents/architect.md`,
`backend-engineer.md`, `frontend-engineer.md`, `qa-engineer.md`, `security-reviewer.md`,
`code-reviewer.md`, `documentation-engineer.md`, `devops-engineer.md`) are usable as
line-by-line templates — copy them and replace the CPQ12-specific tech stack (React/Express/
MongoDB), domain checks (e.g. "test all 12 pricing combinations"), and deployment topology
with your own project's equivalents.

---

## 3. Create the workflow files (`.claude/workflows/`)

Workflows are markdown/YAML files describing an ordered pipeline of phases, each naming which
agent runs it. Three to start with:

- **`new-feature.yaml`** — full pipeline: requirements → architecture design (user approves) →
  backend → frontend → QA → security audit → code review → docs → **commit/release decision
  gate** → deployment prep → final deploy.
- **`bug-fix.yaml`** — same shape minus the design phase, plus an explicit **rollback-vs-fix-
  forward decision** up front (roll back immediately for critical regressions with a known-good
  prior commit; fix forward otherwise) and the same commit/release gate at the end.
- **`deployment.yaml`** — standalone pipeline for staging → verification → production, with a
  pre-deployment checklist, rollback criteria (what warrants a rollback vs. what doesn't), and
  post-deploy monitoring windows.

**The one non-negotiable pattern to copy exactly** is the multi-step approval gate at the end
of both `new-feature` and `bug-fix`:

```markdown
### Commit & Release Decision (requires user confirmation)
- Gate 1 — Ask user: commit and push? (never auto-commit)
  - If no: stop, nothing is saved
  - If yes: stage only relevant files, commit with a conventional message, push to the working branch
- Gate 2 — Ask user: deploy now, or stop here (commit only)?
  - If no deploy: workflow ends after commit — do not ask about environments
- Gate 3 (only if Gate 2 = yes) — Ask user: target environment (dev vs production)?
- IMPORTANT: if pushing to your main/production branch auto-triggers a deploy in your CI,
  say so explicitly here — merge-to-main and production-deploy become the SAME action, and the
  agent must never merge to main without an explicit production approval at this gate.
```

This is what prevents an agent from ever committing, merging, or deploying without a human
in the loop — copy it verbatim into any workflow that ends in a commit.

This repo's `.claude/workflows/new-feature.yaml`, `bug-fix.yaml`, and `deployment.yaml` are
directly reusable as templates; only the tech-stack-specific commands (build/test scripts,
Docker/deploy commands) need swapping.

---

## 4. Using it day-to-day

- Claude reads `CLAUDE.md` automatically at the start of every session in the repo — that's
  what makes the Workflow Selection rule "always on" without the user having to remind it.
- To run a role manually: use the `Agent` tool with `subagent_type` matching the agent's
  `name:` field (e.g. `gstack-architect`), or just describe the task and let Claude route it
  per the Workflow Selection rule.
- To force the full pipeline on a small change: prefix the request with "use gstack".
- To skip the pipeline on a large change you know is safe: prefix with "quick fix" or "direct".
- The commit/deploy gates apply **regardless of which flow was used** — they're a property of
  the workflow files, not a fallback behavior, so make sure your `deployment.yaml` and any
  custom workflow you add carries the same three-gate pattern.

## 5. Customization checklist for the receiving team

- [ ] Replace tech stack references (React/Express/MongoDB/PostgreSQL) with your own
- [ ] Replace domain-specific test requirements (e.g. "12 pricing combinations") with your
      own critical business logic that needs exhaustive coverage
- [ ] Replace deployment topology in `devops-engineer.md` and `deployment.yaml` with your
      actual infra (hosts, containers, health-check endpoints)
- [ ] Decide your own high-risk trigger list for "always use GStack" (pricing/auth/API/DB/CI
      was CPQ12's list — pick yours)
- [ ] Confirm whether your CI auto-deploys on push to main, and make sure that fact is spelled
      out in your `CLAUDE.md` and `deployment.yaml` exactly as above — this is the detail most
      likely to cause an accidental production deploy if skipped
</content>
