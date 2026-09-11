# Commit Logic Explainer

## What it is

A pair of git hooks that explain, in plain English, what behavior changed in
each commit you make locally — printed to your terminal and logged to disk.
When a push moves `main` forward, the same explanations for the pushed
commits are bundled into one Teams message.

This is informational only. It never blocks a commit or push, and it never
triggers a deploy — `main` has no CI/CD pipeline (see `CLAUDE.md`).

## Why it exists

- You get a quick "what did I just actually change" summary without reading
  your own diff back.
- Reviewers and the team see a plain-English digest of what landed on `main`,
  without needing to read every diff.

## Setup (one-time per clone)

```bash
node scripts/hooks/install.cjs
```

This points git at the repo's own hooks (`scripts/hooks`) instead of the
default `.git/hooks`. Safe to re-run any time.

That's enough to make the hooks run. Without the next step, they still run
on every commit/push — they just print **"explanation not available this
run"** instead of an AI explanation.

### Enable AI explanations

```bash
cp .env.commit-explain.example .env.commit-explain
```

Then edit `.env.commit-explain` (gitignored, never committed) and set at
least:

| Key | Description |
|---|---|
| `AI_PROVIDER` | `openai` or `anthropic`. Leave empty to disable the AI layer entirely. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Only the key matching `AI_PROVIDER` is read. Get an OpenAI key from `platform.openai.com/api-keys`, an Anthropic key from `console.anthropic.com`. |
| `AI_MODEL` | Must be a model your key can actually access, or calls fail (see Troubleshooting). |
| `TEAMS_WEBHOOK_URL` | Optional. Needed only if you want push-to-main explanations posted to Teams. Leave empty to keep everything local (terminal + `logs/commit-explain/`). |

The rest of the file (timeouts, retry counts, daily call cap, cache TTL) has
working defaults — only change them if you know you need to.

**Do not wrap the API key in quotes** — the loader passes it through as-is,
and a quoted key will 401 on every call.

## What you'll see

**On every local commit** (`post-commit` hook): a short explanation printed
to your terminal and appended to `logs/commit-explain/commit-explain-<date>.log`.

**On a push that moves `main` forward** (`pre-push` hook): the same
explanations for the commits in that push, bundled into one Teams message
(if `TEAMS_WEBHOOK_URL` is set) and labeled informational-only. Pushes to
any other branch, and pushes that don't move `main` forward, do nothing.

## Troubleshooting

**"Explanation skipped — commit contains sensitive content"**
Not an error. The redaction guard found something secret-shaped in the
commit (author, message, or diff) even after redaction and refused to send
it to the AI provider. The commit/push still completes normally.

**Commits stop showing AI explanations**

- Check `.env.commit-explain` exists in the repo root and `AI_PROVIDER` is
  set to a value you have a matching, valid API key for.
- Check you haven't hit the daily call budget (`AI_MAX_CALLS_PER_DAY`,
  default 40) — once reached, you'll see "daily AI call budget for commit
  explanations reached" until it resets the next day.
- Check `AI_MODEL` is a model your key can actually access — an invalid or
  inaccessible model name fails the call and falls back to "explanation not
  available this run".

**The hooks never block a commit or push.** Any failure inside this
feature — AI provider down, a timeout, a malformed response, a missing
config file — degrades to "explanation not available this run" and exits
cleanly. If a commit or push ever fails or hangs because of this feature,
that itself is a bug in the feature, not expected behavior.
