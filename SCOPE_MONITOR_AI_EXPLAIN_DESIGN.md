# Feature Design: AI Explanation Layer for the CPQ12 Log Monitor

**Status:** Design — no code written
**Author:** GStack Architect
**Date:** 2026-09-10 (rev 2 — provider-switchable)
**Target files:** `monitor-user-logs.cjs` (edited), `monitor-ai-explain.cjs` (new), `monitor-ai-providers.cjs` (new), `.env.monitor.example` (edited), `tests/unit/monitorAiExplain.test.ts` (new), `tests/unit/monitorAiProviders.test.ts` (new)
**Flow used:** GStack `new-feature` — design stage only

**Revision history**

| Rev | Date | Change |
|---|---|---|
| 1 | 2026-09-09 | Initial design, Anthropic-only. |
| 2 | 2026-09-10 | AI provider is switchable at runtime (`openai` default, `anthropic` optional). Model and base URL are config. Adapter boundary added (§4.5, §5.3). Decisions recorded in §15, replacing open questions. `❌ Errors: 0` added to `NOISE_PATTERNS`. |
| 2a | 2026-09-10 | **Implementation verification (Backend Engineer).** Step 2 of §13 carried out; findings recorded in §16 below. Two design corrections applied in code: the §5.1 system prompt no longer contains a literal email address, and §7.2 rule 12 gained a `(?!\[)` guard. |

---

## 1. Summary

Add an AI explanation layer to the existing 15-minute cron log monitor so the Teams alert says *what broke, why, which part of CPQ12 it affects, how serious it is, and what to do next* — instead of pasting raw log lines under a heading that says "(why)".

The layer calls an LLM once per scan, only when the scan is dirty, on a deduplicated and redacted set of errors. **The provider is chosen at runtime by config** — OpenAI (the default, matching the key CloudFuze holds) or Anthropic — behind a thin adapter, so everything else in the pipeline is provider-agnostic. Every failure path degrades to today's exact raw-line message. The cron job cannot be broken by this feature.

---

## 2. Requirements

### 2.1 Functional

| # | Requirement |
|---|---|
| F1 | When the scan finds eligible errors, the Teams message explains each distinct error in plain English. |
| F2 | Each explanation states: what broke, likely cause, affected CPQ12 area, severity, suggested next step. |
| F3 | Identical repeated errors are collapsed into one explanation with an occurrence count. |
| F4 | When the AI layer is unavailable for any reason, the Teams message is byte-identical to today's output. |
| F5 | The clean-scan heartbeat message is unchanged and costs nothing. |
| F6 | The dated report in `logs/monitor/` gains the AI explanation when available, and is otherwise unchanged. |
| F7 | The existing Power Automate flow keeps working with no edits. |
| **F8** | **The AI provider is selected at runtime by `AI_PROVIDER` (`openai` \| `anthropic`). Unset or empty turns the AI layer off entirely.** |
| **F9** | **The Teams footer names the provider and model that actually ran, so the team can compare them.** |

### 2.2 Non-functional

| # | Requirement |
|---|---|
| N1 | Script always exits 0 on an AI failure and always posts to Teams. |
| N2 | No secret ever leaves the server. `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` live only in `/root/.cpq-monitor/monitor.env`. Only the key matching `AI_PROVIDER` is read. |
| N3 | Log content is redacted before the API call; a post-redaction guard aborts the call if anything secret-shaped survives. |
| N4 | Worst-case added wall-clock per run is bounded and far below the 15-minute cron gap. |
| N5 | No new npm dependencies. CommonJS `.cjs`, Node 20, Node builtins only. |
| N6 | Monthly API spend is predictable and hard-capped, identically for both providers. |
| **N7** | **Provider differences are confined to one module. Grouping, fingerprinting, dedup, redaction, the guard, budget caps, the cache, validation and Teams rendering are shared and provider-agnostic.** |

### 2.3 Acceptance criteria

1. With `AI_PROVIDER` unset or empty, the script produces exactly today's message, makes no network call to any LLM, and exits 0.
2. With `AI_PROVIDER=openai` and `OPENAI_API_KEY` missing or empty, the script logs a clear warning naming the missing variable, falls back to the raw-line message, does **not** try Anthropic, and exits 0. Same for `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` missing.
3. With an unknown `AI_PROVIDER` value (e.g. `gemini`), the script logs a clear warning listing the valid values, falls back, and exits 0.
4. With a clean scan window, no LLM request is made and the heartbeat message is unchanged.
5. With a fixture response for **either** provider, the Teams message contains one explanation block per distinct error group, each with all five fields, and the resulting internal object is identical regardless of which provider produced it.
6. Feeding `logs/cpq-2026-09-09.log` through the monitor in file mode yields exactly **4 AI-eligible groups** across its two dirty windows (see §4.3) and **excludes** the `❌ Errors: 0` info lines.
7. `AI_DRY_RUN=1` prints the exact outbound payload for the configured provider and makes no network call.
8. A payload containing `mongodb+srv://user:hunter2@host` is transformed so `hunter2` does not appear, and a payload where redaction fails is skipped with `aiStatus: "failed_redaction_guard"`.
9. For **each** provider: a timeout, a 401, a 429, a malformed JSON body, and a prose-instead-of-JSON reply each result in the raw-line message, exit code 0, and a successful Teams post.
10. `bugCount` no longer counts `❌ Errors: 0` lines.
11. `npm test` passes, with no test making a network call.

---

## 3. Current-state analysis of `monitor-user-logs.cjs`

### 3.1 What it does today

| Lines | Behaviour |
|---|---|
| 20–26 | Loads `/root/.cpq-monitor/monitor.env`; existing `process.env` wins. Regex `^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$` — no quote stripping, no `#` comment handling. |
| 28–34 | Config constants. |
| 37–48 | `GENERIC_PATTERNS` (12 regexes) and `USER_ACTIVITY_PATTERNS` (10 regexes). |
| 51–53 | `NOISE_PATTERNS` — one entry, the zenop.ai CORS line. |
| 58–62 | `classify(line)` — substring regex test against the **whole raw line**, including the JSON envelope. |
| 64–78 | `getContainerLogs()` — `docker logs --since 16m cpq-application`, split on newlines. Returns `[]` on failure. |
| 80–108 | `postToTeams(payload)` — plain `https`/`http`, resolves `false` on any error. Never rejects. Good model to copy. |
| **110–131** | **`buildMessage()` — the gap.** Prints raw lines under `USER-ACTIVITY (why):` and `GENERIC ERRORS (why):`. There is no "why" anywhere in this function. |
| 135–189 | `main()` — scan, write report, build message, post. |
| 186 | Payload: `{ message, bugCount, userCount, generatedAt, healthy }`. |
| 191 | `main().catch(e => { console.error('FATAL', e); process.exit(1); })`. |

### 3.2 Findings from the real logs

I ran the live classifier logic against `logs/cpq-2026-09-08.log` (418 lines) and `logs/cpq-2026-09-09.log` (298 lines).

**Finding 1 — the logs are structured JSON, and the code does not know it.**
Every line is one JSON object:

```json
{"timestamp":"2026-09-09T05:12:13.514Z","level":"error","source":"server","message":"❌ E-sign expiry reminder job failed: getaddrinfo ENOTFOUND ac-u35fwfp-shard-00-00.zycf9g5.mongodb.net"}
```

`server/logger.cjs` mirrors every line to stdout (its comment at `server/logger.cjs:177-179` names this monitor script explicitly), so `docker logs` emits exactly this shape. The comment at `monitor-user-logs.cjs:65-68` says *"Container log lines have NO leading timestamps, so incremental-by-time tracking on the line itself is impossible."* That is wrong for the current logger — there is a precise `timestamp` and a precise `level` in every line. This design uses both.

**Finding 2 — 60% of what the monitor flags as a bug is a false positive.**
Levels present: 09-08 = 417 info + 1 error. 09-09 = 293 info + 4 error + 1 warn.
Lines the current `GENERIC_PATTERNS` flag as bugs, grouped by message:

| Count | Level | Message |
|---|---|---|
| **9** | info | `   ❌ Errors: 0` |
| 1 | error | `❌ E-sign agreement-status error: {"errno":-4077,"code":"ECONNRESET","syscall":"write"}` |
| 1 | error | `❌ E-sign expiry reminder job failed: getaddrinfo ENOTFOUND ac-u35fwfp-shard-00-00.zycf9g5.mongodb.net` |
| 1 | error | `❌ Auto-reminder job failed: getaddrinfo ENOTFOUND ac-u35fwfp-shard-00-00.zycf9g5.mongodb.net` |
| 1 | error | `❌ E-sign expiry reminder job failed: connect ETIMEDOUT 159.41.176.221:27017` |
| 1 | error | `❌ Auto-reminder job failed: connect ETIMEDOUT 159.41.176.221:27017` |
| 1 | warn | `⚠️ Gotenberg request error: fetch failed` |

`   ❌ Errors: 0` is the **exhibit folder-sync summary** — a success line. It matches `/ERROR/i`. It fires on every server boot, 9 times across two days.

**Finding 3 — `USER_ACTIVITY_PATTERNS` matches only routine info.**
`/logged in/i` matched 3 lines across both days, all of them `ℹ️ User <uuid> (Anush.Dasari@cloudfuze.com) already logged in today` — level `info`, entirely benign, and it carries a real email address. Nothing in `USER_ACTIVITY_PATTERNS` matched anything at `error` level in two days of real traffic.

**Finding 4 — `STATE_FILE` is declared but never used.**
`.env.monitor.example:5` sets `STATE_FILE=/root/CPQ12/logs/monitor/.state.json`. `monitor-user-logs.cjs` never reads it. This design claims it for the AI budget counter and explanation cache.

**Finding 5 — secret shapes actually present in the logs.** Full table in §7. Summary of what a scan of both files found: 5 real email addresses; a Mongo Atlas `mongodb+srv://[REDACTED]@cluster1.zycf9g5.mongodb.net/...` URI (password already masked by the logger, but the cluster host is exposed); 9 truncated e-sign signing tokens in `/sign/<uuid-prefix>` and `?token=<uuid-prefix>` form; a user UUID; a Mongo shard IP `159.41.176.221:27017`; SendGrid `x-message-id` values. No live JWT or `sk-`/`SG.` key appeared in these two days — but redaction must cover them anyway, per the past Mongo-password-in-boot-line incident.

### 3.3 Consequences for the design

**Two separate changes come out of Findings 1–3.**

**(a) Eligibility rule for the AI call.** Send a group to the AI only if the parsed `level` is `error` or `warn`, **or** the line could not be parsed as JSON and matches a `GENERIC_PATTERN`. Against the two real log files this reduces 15 flagged lines to the 6 genuine ones.

**(b) `NOISE_PATTERNS` gains the folder-sync success line** (decision §15.6). Add:

```js
/❌ Errors: 0/,
```

This stops `bugCount` being inflated by a success message — it is a change to the *reported number* in the Teams header, not just to what gets explained. After this change the two real log files report `bugCount` 1 (09-08) and 5 (09-09) instead of 7 and 8.

Both changes are needed. (a) alone would still show a wrong count; (b) alone would still send noise if a future success line happened to sit at `warn`.

---

## 4. Architecture

### 4.1 Module boundary

Two new files at the repo root:

- **`monitor-ai-explain.cjs`** — everything provider-agnostic. The bulk of the logic.
- **`monitor-ai-providers.cjs`** — the *only* file that knows an OpenAI request differs from an Anthropic one. Small by design.

`monitor-user-logs.cjs` requires only `monitor-ai-explain.cjs` and calls one entry point. It never sees a provider name except to print it.

Separate modules are what make this testable: `tests/unit/` already imports root `.cjs` modules directly (`esign-field-carry.cjs`, `esign-bulk-download-utils.cjs`, `esign-creator-utils.cjs`, `esign-sequential-utils.cjs`), and `package.json` is `"type": "module"`, so the `.cjs` extension is required. Follow the same `module.exports = { ... }` shape as `esign-field-carry.cjs`.

```
docker logs --since 16m
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ monitor-user-logs.cjs (existing, minimally edited)          │
│                                                             │
│  getContainerLogs()  ── unchanged + optional file mode      │
│  classify()          ── UNCHANGED                           │
│  NOISE_PATTERNS      ── + /❌ Errors: 0/                     │
│  buildMessage()      ── UNCHANGED (this is the fallback)    │
│  postToTeams()       ── UNCHANGED                           │
└───────────────┬─────────────────────────────────────────────┘
                │ eligible raw lines
                ▼
┌─────────────────────────────────────────────────────────────┐
│ monitor-ai-explain.cjs  (PROVIDER-AGNOSTIC)                 │
│                                                             │
│  parseLogLine / isAiEligible / fingerprint / groupErrors    │
│  redact / hasResidualSecret          ← §7, shared           │
│  buildPrompt      → {system, user, idMap}   ← shared        │
│  validateResponse → shared schema check     ← §5.5          │
│  loadState / saveState  (budget + cache)    ← shared        │
│  explainErrors    → orchestrator, null on any failure       │
│  renderAiMessage  → Teams text                              │
└───────────────┬─────────────────────────────────────────────┘
                │ selectAdapter(AI_PROVIDER)
                ▼
┌─────────────────────────────────────────────────────────────┐
│ monitor-ai-providers.cjs  (THE ONLY PROVIDER-AWARE CODE)    │
│                                                             │
│  openaiAdapter    { name, keyEnv, defaultModel,             │
│                     defaultBaseUrl, buildRequest,           │
│                     extractText, extractUsage }             │
│  anthropicAdapter { ...same interface... }                  │
│  selectAdapter(providerName) -> adapter | null              │
└───────────────┬─────────────────────────────────────────────┘
                │ https POST (only when dirty, eligible,
                │ under budget, and guard-clean)
                ▼
   api.openai.com  |  api.anthropic.com  |  AI_BASE_URL override
```

### 4.2 Control flow in `main()`

Insert between the report write (`monitor-user-logs.cjs:166`) and the message build (`:173-185`). Pseudocode, not implementation:

```
let ai = null;
if (bugCount > 0 || userCount > 0) {
  ai = await aiExplain.explainErrors(lines, { generatedAt, container: CONTAINER });
}
// ai is null on every failure path — buildMessage() is the fallback
const message = FORCE_ALERT ? testMessage
              : ai ? aiExplain.renderAiMessage(summary, ai, groups)
              : (bugCount > 0 || userCount > 0) ? buildMessage(summary, userLines, bugLines)
              : healthyMessage;
```

`explainErrors()` must be internally wrapped so it can never throw — `try/catch` around everything, returning `null`. `main()` should additionally wrap the call in its own `try/catch` as belt and braces: an AI failure must never reach the `process.exit(1)` at `:191`.

### 4.3 Grouping and fingerprinting

`fingerprint(message)` normalises before keying, so the same fault with varying detail collapses:

| Step | Transform |
|---|---|
| 1 | Lowercase. |
| 2 | Replace full and truncated UUIDs with `<id>`. |
| 3 | Replace IPv4 (with optional `:port`) with `<ip>`. |
| 4 | Replace hostnames ending `.mongodb.net` with `<mongohost>`. |
| 5 | Replace email addresses with `<email>`. |
| 6 | Replace runs of digits with `<n>` (kills `(310ms)`, `errno:-4077`, byte counts). |
| 7 | Collapse whitespace, trim, take first 200 chars. |

The group key is that normalised string — no hashing needed, it is already short and useful when debugging.

**Verification against real data.** Applying this to the 6 genuine lines yields:

| Group | Normalised key | Count |
|---|---|---|
| 1 | `❌ e-sign expiry reminder job failed: getaddrinfo enotfound <mongohost>` | 1 |
| 2 | `❌ auto-reminder job failed: getaddrinfo enotfound <mongohost>` | 1 |
| 3 | `❌ e-sign expiry reminder job failed: connect etimedout <ip>` | 1 |
| 4 | `❌ auto-reminder job failed: connect etimedout <ip>` | 1 |
| 5 | `⚠️ gotenberg request error: fetch failed` | 1 |
| 6 | `❌ e-sign agreement-status error: {"errno":<n>,"code":"econnreset","syscall":"write"}` | 1 |

Groups 1/2 stay distinct (different jobs) and 3/4 stay distinct — correct, they are different subsystems failing. Within a single 16-minute scan window, 09-09 produces groups 1+2 at 05:12, groups 3+4 at 06:11, and group 5 at 10:23, so **each scan sends at most 2 groups**. This is the basis of the cost estimate in §10.

### 4.4 Cross-run explanation cache

The Mongo reminder-job failure recurred at 05:12 and again at 06:11 with a different error code. A flapping error re-explained every 15 minutes is the main runaway-cost risk.

Store in `STATE_FILE`:

```json
{
  "aiCallsToday": 3,
  "aiCallsDate": "2026-09-09",
  "cache": {
    "<normalised key>": {
      "explanation": { "whatBroke": "...", "likelyCause": "..." },
      "cachedAt": "2026-09-09T05:12:20.000Z",
      "provider": "openai",
      "model": "gpt-5.6-terra"
    }
  }
}
```

On each run: split the groups into cache hits (entry younger than `AI_CACHE_TTL_MIN`) and misses. **Call the API only if there is at least one miss**, and send only the misses. Merge cached and fresh explanations for the Teams message, marking cached ones so the team knows they are a repeat (`↻ seen before`). Prune entries older than the TTL on write, and cap the cache at 200 entries (drop oldest).

**Provider change invalidates the cache.** A cache entry records the `provider` and `model` that produced it. If either differs from the current config, treat the entry as a miss. Without this, switching provider to compare quality would silently keep serving the old provider's answers — defeating the comparison the attribution line (F9) exists to support.

### 4.5 The adapter boundary

`selectAdapter(name)` returns one of two objects implementing an identical interface, or `null` for an unknown or empty name. The calling code in `monitor-ai-explain.cjs` must be unable to tell which one it received.

```
adapter = {
  name:           'openai' | 'anthropic',
  keyEnv:         'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY',
  defaultModel:   String,
  defaultBaseUrl: String,

  // Pure. Same inputs for both. No I/O, no env reads.
  buildRequest({ system, user, model, schema, maxTokens, effort })
      -> { path, headers, body }      // headers EXCLUDE the api key

  // Pure. Coerce a provider response into the one internal shape.
  extractText(parsedBody)  -> { text: String|null, finishReason: String|null }
  extractUsage(parsedBody) -> { inputTokens: Number|null, outputTokens: Number|null }
}
```

Rules that make this boundary hold:

1. `buildRequest` returns headers **without** the API key. The shared caller injects it using `adapter.keyEnv`, so no adapter can read or log a key.
2. `extractText` returns `{ text: null }` rather than throwing when the response shape is unexpected. Every "I don't understand this response" path becomes a normal `null` return that lands in the shared fallback.
3. `finishReason` is normalised by the adapter to one of `complete` | `truncated` | `refused` | `other`. Shared validation then checks only for `complete` — it never sees `end_turn` or `stop`.
4. Adapters perform no network I/O. The shared `callProvider()` in `monitor-ai-explain.cjs` owns `https`, timeouts, retries and status mapping, identically for both.

Everything in §7 (redaction), §5.5 (validation), §9 (failure matrix), §11 (rendering) and the budget/cache logic sits above this line and is written once.

---

## 5. The prompt

### 5.1 System prompt (verbatim — shared, identical for both providers)

```
You are the on-call log analyst for CPQ12, a Configure-Price-Quote web app used by
CloudFuze enterprise sales teams. You read error lines pulled from the production
container and explain them to engineers in Microsoft Teams.

CPQ12 architecture you should reason about:
- Node.js 20 + Express backend (server.cjs), single Docker container `cpq-application`
  behind an nginx proxy. React 18 + Vite frontend.
- MongoDB Atlas is the primary database (cluster hostnames end in .mongodb.net,
  default port 27017). Mongoose is the ORM. PostgreSQL holds signatures and audit logs.
- E-signature subsystem: signing links, per-recipient sequential signing, reviewer
  and signer roles, expiry reminder jobs and auto-reminder jobs that run on a timer.
- PDF generation: DOCX templates are preprocessed, then converted by a Gotenberg
  service on localhost:3004, falling back to a direct LibreOffice conversion.
- Email: SendGrid, sending from dealdesk@zenop.ai.
- Integrations: HubSpot (contacts, deals), Microsoft SSO, BoldSign.
- Pricing and quoting: quotes, pricing tiers, templates, exhibits, approval workflow.

Rules:
- Explain the CAUSE, not the text. Never restate the log line.
- Be specific to CPQ12. Name the subsystem you believe is affected.
- If you genuinely cannot tell the cause, say so plainly and set confidence to "low".
  A confident wrong answer is worse than an honest "unclear".
- Values shown as [EMAIL], [IP], [UUID], [TOKEN], [REDACTED], [MONGO_HOST] and similar
  are deliberately masked. Do not ask for them, do not guess them, and do not treat
  the masking itself as the error.
- nextStep must be one concrete action an engineer can take in under 10 minutes
  (a command to run, a service to check, a config value to verify). Not "investigate".
- Severity: critical = customers cannot complete a quote or signature; high = a core
  flow is degraded or a background job is failing; medium = a fallback absorbed it;
  low = cosmetic or self-healing.
- Write for a reader skimming a phone notification. Short sentences. No markdown.
- Reply with JSON only, matching the requested schema. No prose before or after.
```

Approximately 510 tokens. The final "JSON only" line is belt-and-braces: both providers are asked for schema-constrained output, but a provider that silently ignores the schema parameter must still be nudged toward JSON. §5.5 handles it when that nudge fails.

Note: this prompt is below the minimum cacheable prefix on Anthropic (512–4096 tokens, model-dependent) and runs are 15 minutes apart against a 5-minute default TTL, so prompt caching cannot help on either provider. Do not build it.

### 5.2 User message (verbatim template — shared)

A single text block containing JSON. Deterministic key order.

```
Scan window: 16 minutes ending 2026-09-09T06:11:30.000Z
Container: cpq-application
Distinct error groups this scan: 2

{"errors":[
{"id":"e1","level":"error","count":1,"firstSeen":"2026-09-09T06:11:02.399Z","lastSeen":"2026-09-09T06:11:02.399Z","sample":"❌ E-sign expiry reminder job failed: connect ETIMEDOUT [IP]"},
{"id":"e2","level":"error","count":1,"firstSeen":"2026-09-09T06:11:02.400Z","lastSeen":"2026-09-09T06:11:02.400Z","sample":"❌ Auto-reminder job failed: connect ETIMEDOUT [IP]"}
]}

Return one explanation object per id above, in the same order.
```

`sample` is the redacted `message` field only — never the raw JSON envelope. Dropping `timestamp`/`source` from the sample saves roughly 25% of input tokens and removes a redaction surface.

### 5.3 Per-provider request shape

> **Verification status.** The Anthropic shape below is taken from the bundled `claude-api` skill reference and is high-confidence. The OpenAI shape was checked against `developers.openai.com` on 2026-09-10; treat it as **needs-verification** and confirm against OpenAI's live docs before writing the adapter — in particular the `response_format` key name, which differs between the two OpenAI endpoints (see the note after the table).

| Concern | `openai` | `anthropic` |
|---|---|---|
| Default base URL | `https://api.openai.com` | `https://api.anthropic.com` |
| Path | `/v1/chat/completions` | `/v1/messages` |
| Auth header | `Authorization: Bearer <OPENAI_API_KEY>` | `x-api-key: <ANTHROPIC_API_KEY>` |
| Extra required header | none | `anthropic-version: 2023-06-01` |
| System prompt | first element of `messages`: `{"role":"system","content":…}` | top-level `system` field |
| User prompt | `{"role":"user","content":…}` | `messages: [{"role":"user","content":…}]` |
| Output cap | `max_completion_tokens` | `max_tokens` |
| JSON schema | `response_format: {"type":"json_schema","json_schema":{"name":"cpq_explanations","strict":true,"schema":{…}}}` | `output_config: {"format":{"type":"json_schema","schema":{…}}}` |
| Effort / thinking | omit unless the chosen model documents an effort parameter | `thinking:{"type":"adaptive"}` + `output_config.effort:"low"` |
| Text location | `body.choices[0].message.content` | first `body.content[]` block with `type === "text"`, field `.text` |
| Finish reason | `body.choices[0].finish_reason` — `stop`→`complete`, `length`→`truncated`, `content_filter`→`refused` | `body.stop_reason` — `end_turn`→`complete`, `max_tokens`→`truncated`, `refusal`→`refused` |
| Usage | `body.usage.prompt_tokens` / `completion_tokens` | `body.usage.input_tokens` / `output_tokens` |

**OpenAI endpoint fork — resolve this before implementing.** OpenAI has two endpoints with *different* structured-output parameter names:
- `/v1/chat/completions` uses `response_format: {type:"json_schema", json_schema:{...}}`.
- `/v1/responses` (the newer API) uses `text: {format: {type:"json_schema", name, schema, strict}}`.

**Use `/v1/chat/completions`.** Reasons: it is the endpoint Azure OpenAI exposes (see §5.3.1), so one code path covers both OpenAI proper and Azure; and it is the broader-compatibility choice for a local stub in testing. If the operator's chosen model is only served on `/v1/responses`, that is an adapter change — keep the path in `adapter.buildRequest` so it is a one-line edit.

**Anthropic-specific cautions** (from the `claude-api` reference): do not send `budget_tokens`, `temperature` or `top_p` — all return 400 on current models. Do not set `thinking:{"type":"disabled"}`; `effort: "low"` is the correct cost lever.

#### 5.3.1 Azure OpenAI via `AI_BASE_URL`

CLAUDE.md already references `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`, so Azure OpenAI is a realistic target. `AI_BASE_URL` covers it.

**Needs verification before use — do not treat the following as confirmed.** An Azure OpenAI endpoint looks roughly like:

```
https://<resource-name>.openai.azure.com/openai/deployments/<deployment-name>/chat/completions?api-version=<version>
```

Two differences from OpenAI proper that the implementer must confirm against Azure's current docs:

1. **Auth header differs.** Azure OpenAI uses `api-key: <key>` rather than `Authorization: Bearer <key>`. If confirmed, the adapter needs an auth-style flag rather than a hardcoded header name.
2. **The model lives in the URL, not the body.** Azure routes by *deployment name* in the path; `model` in the body may be ignored or rejected.

Design accommodation: treat `AI_BASE_URL` as a full override that may already include a path and query string. If it contains a path beyond `/`, the adapter should use it verbatim rather than appending its own path. Add `AI_AUTH_STYLE` (`bearer` | `api-key` | `x-api-key`) so an Azure deployment is a config change, not a code change. Default it from the provider (`openai`→`bearer`, `anthropic`→`x-api-key`).

Azure is **out of scope for the first implementation** — build the config surface so it is reachable, but do not test against Azure in this pass. Flag it for a follow-up once someone confirms the header and URL shape.

### 5.4 Response schema and expected shape (shared)

The same JSON Schema object is sent to both providers, in whichever wrapper §5.3 specifies:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["overallSummary", "worstSeverity", "explanations"],
  "properties": {
    "overallSummary": { "type": "string", "maxLength": 200 },
    "worstSeverity": { "type": "string", "enum": ["critical", "high", "medium", "low"] },
    "explanations": {
      "type": "array",
      "minItems": 1,
      "maxItems": 8,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "whatBroke", "likelyCause", "affectedArea", "severity", "nextStep", "confidence"],
        "properties": {
          "id": { "type": "string" },
          "whatBroke": { "type": "string", "maxLength": 140 },
          "likelyCause": { "type": "string", "maxLength": 220 },
          "affectedArea": {
            "type": "string",
            "enum": ["e-signature", "pdf-generation", "email", "database",
                     "pricing-quotes", "authentication", "integrations",
                     "infrastructure", "unknown"]
          },
          "severity": { "type": "string", "enum": ["critical", "high", "medium", "low"] },
          "nextStep": { "type": "string", "maxLength": 180 },
          "confidence": { "type": "string", "enum": ["high", "medium", "low"] }
        }
      }
    }
  }
}
```

**OpenAI strict-mode caveat, needs verification:** OpenAI's `strict: true` historically requires `additionalProperties: false` on every object *and* every property listed in `required`. The schema above already satisfies both. It has also historically not supported `maxLength`. If `maxLength` is rejected, the adapter should strip length constraints before sending and rely on the shared renderer to truncate — **the internal validated object must stay identical either way**, so put any such stripping inside `buildRequest`, never in shared code.

Realistic expected internal object, identical from both providers:

```json
{
  "overallSummary": "Both e-sign reminder background jobs failed because MongoDB Atlas was unreachable.",
  "worstSeverity": "high",
  "explanations": [
    {
      "id": "e1",
      "whatBroke": "The e-sign expiry reminder job could not run.",
      "likelyCause": "The job opened a MongoDB Atlas connection and the TCP connect timed out on port 27017. Atlas was unreachable from the droplet, most likely an IP access-list or transient network issue, not app code.",
      "affectedArea": "e-signature",
      "severity": "high",
      "nextStep": "Check the Atlas IP access list still contains the droplet IP, then curl the app's /api/database/health endpoint.",
      "confidence": "high"
    },
    { "id": "e2", "whatBroke": "..." }
  ]
}
```

### 5.5 Shared validation and prose coercion

`validateResponse(text, finishReason, idMap)` runs **after** the adapter has normalised the response. It is provider-agnostic. Return `null` — falling back to raw lines — if **any** of these hold. Do not attempt repair beyond step 1.

1. **Prose-instead-of-JSON coercion, the one permitted repair.** If `JSON.parse(text)` throws, make exactly one attempt: extract the substring from the first `{` to the last `}` and parse that. This handles the common "Here is the JSON: {...}" and fenced-code-block replies from a provider that ignored the schema parameter. If that also throws, return `null`. Do not strip characters, do not fix quotes, do not retry the API.
2. `finishReason !== "complete"` (catches truncation and refusal on both providers).
3. `text` is null or empty — the adapter did not recognise the response shape.
4. Any required top-level key is missing or the wrong type.
5. `explanations` is not an array, is empty, or is longer than the number of groups sent.
6. Any explanation is missing a required field, or `affectedArea` / `severity` / `confidence` is outside its enum.
7. Any `id` does not correspond to an id that was sent.
8. Any string field exceeds its `maxLength` — truncate to the limit rather than rejecting, since a working explanation that is slightly long is more useful than no explanation. This is the only field-level repair.

The schema should make most of these impossible on both providers, but validate anyway — the fallback is free and a malformed Teams message is not. Steps 1 and 8 exist specifically because OpenAI strict-mode support (§5.4) is unverified; if `maxLength` is stripped from the outbound schema, step 8 is what enforces it.

---

## 6. Function signatures

**`monitor-ai-explain.cjs` (provider-agnostic):**

```
parseLogLine(raw)                    -> { timestamp, level, source, message, raw, parsed:boolean }
isAiEligible(entry, genericPatterns) -> boolean
fingerprint(message)                 -> string
groupErrors(entries, maxGroups)      -> [{ key, level, sample, count, firstSeen, lastSeen }]
redact(text)                         -> string
hasResidualSecret(text)              -> boolean
buildPrompt(groups, ctx)             -> { system, user, idMap }
resolveConfig(env)                   -> { provider, adapter, apiKey, model, baseUrl, authStyle } | { error }
callProvider(adapter, req, opts)     -> Promise<{ ok, status, json } | { ok:false, reason }>  // never rejects
validateResponse(text, finish, idMap)-> object | null
loadState(path)                      -> { aiCallsToday, aiCallsDate, cache }
saveState(path, state)               -> void   // swallows its own errors
explainErrors(rawLines, ctx)         -> Promise<{ overallSummary, worstSeverity, explanations, cachedIds, provider, model } | null>
renderAiMessage(summary, ai, groups) -> string
```

**`monitor-ai-providers.cjs` (provider-aware):**

```
selectAdapter(name)                  -> adapter | null     // null for unknown/empty
openaiAdapter                        -> adapter            // see §4.5 interface
anthropicAdapter                     -> adapter
```

`resolveConfig()` is the single place that reads `AI_PROVIDER`, picks the adapter, reads the matching key, and applies `AI_MODEL` / `AI_BASE_URL` / `AI_AUTH_STYLE` defaults. It returns a structured `{ error }` — never throws, never logs a key.

Every function must be side-effect-free except `callProvider`, `loadState` and `saveState`. That is what makes the test plan in §12 cheap.

---

## 7. Redaction rules

**Shared. Runs identically regardless of provider** — the redaction table has nothing to do with who receives the text, and duplicating it per adapter would be the single most dangerous thing this design could do.

### 7.1 Ordering

Redaction runs on the `message` field only, **before** truncation to `AI_MAX_CHARS_PER_ERROR`, and in **exactly the order below**. Order matters: the full-UUID rule must precede the truncated-UUID rule, and the specific key-shape rules must precede the generic ones.

### 7.2 Pattern table

| # | Target | Pattern (JS regex) | Replacement | Grounded in |
|---|---|---|---|---|
| 1 | URI credentials | `/(:\/\/)([^/\s:@]+):([^/\s:@]+)@/g` | `'$1[REDACTED]@'` | Mongo boot line; matches `server/logger.cjs:66` |
| 2 | JWT | `/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g` | `'[JWT]'` | JWT auth per CLAUDE.md |
| 3 | Bearer header | `/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi` | `'Bearer [REDACTED]'` | JWT Bearer tokens |
| 4 | SendGrid key | `/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g` | `'[SENDGRID_KEY]'` | SendGrid in use |
| 5 | OpenAI / Anthropic key | `/\bsk-[A-Za-z0-9_-]{16,}/g` | `'[API_KEY]'` | **both** providers' own keys |
| 6 | HubSpot PAT | `/\bpat-[a-z0-9]{2,4}-[A-Za-z0-9-]{16,}/gi` | `'[HUBSPOT_KEY]'` | HubSpot integration |
| 7 | Slack token | `/\bxox[baprs]-[A-Za-z0-9-]{10,}/g` | `'[SLACK_TOKEN]'` | defensive |
| 8 | AWS access key | `/\bAKIA[0-9A-Z]{16}\b/g` | `'[AWS_KEY]'` | defensive |
| 9 | Azure client secret | `/\b[A-Za-z0-9~._-]{3}8Q~[A-Za-z0-9~._-]{30,}/g` | `'[AZURE_SECRET]'` | `AZURE_CLIENT_SECRET` in CLAUDE.md; also the Azure OpenAI path (§5.3.1) |
| 10 | Postgres URI | `/\bpostgres(?:ql)?:\/\/\S+/gi` | `'[POSTGRES_URI]'` | `POSTGRES_URI` in CLAUDE.md |
| 11 | Mongo URI | `/\bmongodb(?:\+srv)?:\/\/\S+/gi` | `'[MONGO_URI]'` | real boot line |
| 12 | Secret-shaped key/value | `/((?:password｜passwd｜pwd｜secret｜token｜api[_-]?key｜apikey｜authorization｜auth｜jwt｜client[_-]?secret｜signature｜sig｜credential)\s*["']?\s*[:=]\s*["']?)([^"'\s,&}\]]{4,})/gi` | `'$1[REDACTED]'` | catches `?token=…`, `"password":"…"` |
| 13 | Signing link path | `/\/sign\/[A-Za-z0-9-]{8,}/g` | `'/sign/[TOKEN]'` | 9 real occurrences |
| 14 | E-sign inbox link | `/\/esign-inbox\?[^\s"']+/g` | `'/esign-inbox?[TOKEN]'` | real occurrences |
| 15 | Full UUID | `/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi` | `'[UUID]'` | user ids, document ids |
| 16 | Truncated UUID | `/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{0,4}\b/gi` | `'[UUID]'` | logger truncates ids mid-string |
| 17 | Email | `/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g` | `'[EMAIL]'` | 5 real addresses |
| 18 | Mongo Atlas host | `/\b[a-z0-9-]+\.[a-z0-9]{6,}\.mongodb\.net\b/gi` | `'[MONGO_HOST]'` | real cluster and shard hosts |
| 19 | IPv4 (+port) | `/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g` | `'[IP]'` | `159.41.176.221:27017` |
| 20 | Long base64 blob | `/\b[A-Za-z0-9+/]{60,}={0,2}\b/g` | `'[BLOB]'` | attachment / PDF payloads |

> Note on row 12: the `｜` characters in the alternation above are full-width so the markdown table renders. **Use ordinary `|` pipes in the actual regex.**

Rule 12 deliberately fires on the word `token` in the log's own `?token=` links; rules 13–14 catch the path-shaped variants that rule 12 misses.

### 7.3 The residual-secret guard

After redaction, `hasResidualSecret(text)` re-scans the **entire assembled outbound payload** (system + user content) for high-risk shapes:

| Shape | Pattern |
|---|---|
| Credentials in a URI | `/:\/\/[^/\s:@]+:[^/\s:@]+@/` |
| JWT | `/\beyJ[A-Za-z0-9_-]{8,}\./` |
| API key | `/\bsk-[A-Za-z0-9_-]{16,}/` |
| SendGrid key | `/\bSG\.[A-Za-z0-9_-]{16,}\./` |
| AWS key | `/\bAKIA[0-9A-Z]{16}\b/` |
| Email | `/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/` |

If any match: **do not call the provider.** Log `[ai] redaction guard tripped — skipping API call`, set `aiStatus: "failed_redaction_guard"`, and fall back to the raw-line message.

The guard runs on the assembled prompt **before** `adapter.buildRequest` is called, so it protects both providers with one implementation and cannot be bypassed by an adapter bug.

This is the design's answer to the 2026-09-09 Mongo-password precedent. Even if a new secret shape appears that rules 1–20 miss, the guard's overlapping coverage stops the most dangerous shapes leaving the box; and if the guard itself misses, the fix is one redaction rule, not an incident.

The guard is intentionally strict enough to cause occasional false skips. A skipped explanation is a non-event; a leaked credential is not.

---

## 8. Config additions to `.env.monitor.example`

Add with empty or safe-default values. **Both key variables ship empty** and are filled in only on the server at `/root/.cpq-monitor/monitor.env`.

```
# --- AI explanation layer -------------------------------------------------
# AI_PROVIDER selects the engine. Leave EMPTY to disable the AI layer entirely
# (the monitor then behaves exactly as it did before this feature).
# Valid values: openai | anthropic
AI_PROVIDER=openai

# Only the key matching AI_PROVIDER is read. Leave BOTH empty in this example
# file. Real values go ONLY in /root/.cpq-monitor/monitor.env
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Model. MUST be set to a model your key can actually access.
#   openai    -> suggested default: gpt-5.6-terra   (budget option: gpt-5.6-luna)
#   anthropic -> suggested default: claude-opus-5
# !! CONFIRM THE MODEL NAME AND YOUR KEY'S ACCESS TO IT BEFORE ENABLING. !!
# !! The OpenAI names above were read from OpenAI's docs on 2026-09-10 and   !!
# !! are NOT verified against this account's entitlements. A wrong or        !!
# !! inaccessible name gives a 404/400 -> the monitor falls back to raw      !!
# !! lines and keeps working, but you get no explanations.                   !!
AI_MODEL=

# Optional. Override the API base URL. Use for Azure OpenAI, a proxy, or a
# local stub in testing. If it contains a path, it is used verbatim.
# Azure OpenAI shape (NEEDS VERIFICATION, see design section 5.3.1):
#   https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=<version>
AI_BASE_URL=

# Auth header style. Defaults from AI_PROVIDER; override only for Azure.
# bearer  -> Authorization: Bearer <key>   (OpenAI default)
# x-api-key -> x-api-key: <key>            (Anthropic default)
# api-key -> api-key: <key>                (Azure OpenAI, NEEDS VERIFICATION)
AI_AUTH_STYLE=

# --- Shared limits (apply identically to both providers) ------------------
AI_EFFORT=low
AI_MAX_GROUPS=8
AI_MAX_CHARS_PER_ERROR=400
AI_MAX_TOTAL_CHARS=6000
AI_MAX_MESSAGE_CHARS=8000
AI_MAX_CALLS_PER_DAY=40
AI_CACHE_TTL_MIN=180
AI_TIMEOUT_MS=20000
AI_TOTAL_BUDGET_MS=45000
AI_MAX_RETRIES=1
AI_INCLUDE_USER_ACTIVITY=0

# --- Test / debug modes (leave empty in production) -----------------------
AI_DRY_RUN=0
AI_FIXTURE_FILE=
MONITOR_LOG_FILE=
```

Model defaults live in the adapter (`adapter.defaultModel`) so an empty `AI_MODEL` still works, but the example file documents them and tells the operator to confirm.

Also confirm `.gitignore` covers `.env.monitor` and any local `monitor.env`. `.env.monitor.example` is the only monitor env file in the repo and must contain no value for `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `TEAMS_WEBHOOK_URL`.

**Env-parser caveat for the implementer:** the loader at `monitor-user-logs.cjs:22-25` does not strip quotes and does not skip `#` comments on the value side. An API key contains neither, so this is safe as-is — but do not wrap a key in quotes when writing `monitor.env`, or it will be sent with literal quote characters and every call will 401. This bites harder now there are two key variables.

---

## 9. Failure and fallback matrix

Every row ends in: **raw-line message posted to Teams, exit code 0.** No row can wedge or crash the cron job. Rows marked *(both)* behave identically for either provider — that is the point of the §4.5 boundary.

| # | Failure mode | Detection | Monitor behaviour | `aiStatus` |
|---|---|---|---|---|
| 1 | `AI_PROVIDER` unset or empty | `resolveConfig` | AI layer off. No request, no warning noise. | `skipped_disabled` |
| 2 | `AI_PROVIDER` is an unknown value | `selectAdapter` returns `null` | Log `[ai] unknown AI_PROVIDER "<v>" — valid: openai, anthropic`. Fall back. | `failed_config_provider` |
| 3 | Matching key missing or empty | `resolveConfig` checks `adapter.keyEnv` | Log `[ai] AI_PROVIDER=<p> but <KEYENV> is not set — skipping`. **Do not try the other provider.** Fall back. | `skipped_no_key` |
| 4 | `AI_BASE_URL` is not a valid URL | `new URL()` throws | Log and fall back. Do not silently use the default. | `failed_config_url` |
| 5 | Clean scan | `bugCount === 0 && userCount === 0` | Skip API, heartbeat message unchanged | `skipped_clean` |
| 6 | Dirty scan, no AI-eligible group | eligibility filter | Skip API, raw-line message | `skipped_not_eligible` |
| 7 | All groups served from cache | cache lookup | Skip API, render from cache | `ok_cached` |
| 8 | Provider or model changed since cache write | cache entry mismatch | Treat as miss, call API | (normal path) |
| 9 | Daily call budget exhausted | `aiCallsToday >= AI_MAX_CALLS_PER_DAY` | Skip API, raw-line message | `skipped_budget` |
| 10 | `AI_DRY_RUN=1` | config | Print payload to stdout, no request, raw-line message | `skipped_dry_run` |
| 11 | Residual secret after redaction | `hasResidualSecret()` | **Abort before `buildRequest`**, raw-line message | `failed_redaction_guard` |
| 12 | DNS / TCP failure *(both)* | `req.on('error')` | Retry once if budget allows, else fall back | `failed_network` |
| 13 | Request timeout *(both)* | `req.setTimeout` **plus** independent `setTimeout` calling `req.destroy()` | Retry once if budget allows, else fall back | `failed_timeout` |
| 14 | Overall budget exceeded | wall-clock check before retry | No retry, fall back immediately | `failed_timeout` |
| 15 | HTTP 401 / 403 — bad key *(both)* | status | **No retry** — a bad key will not fix itself. Fall back. | `failed_auth` |
| 16 | HTTP 404 — model name wrong or not entitled | status | **No retry.** Log the model name so the operator can fix `AI_MODEL`. | `failed_model` |
| 17 | HTTP 400 — bad request, e.g. schema rejected *(both)* | status | **No retry.** Log the provider's error message verbatim — this is the main signal that the §5.4 strict-mode caveat bit. | `failed_http` |
| 18 | HTTP 429 *(both)* | status | Retry once after 2 s if budget allows, else fall back | `failed_rate_limit` |
| 19 | HTTP 5xx *(both)* | status | Retry once after 2 s if budget allows, else fall back | `failed_http` |
| 20 | Response body is not JSON *(both)* | `JSON.parse` throws on the envelope | Fall back, no retry | `failed_parse` |
| 21 | Adapter cannot find the text field | `extractText` returns `{text:null}` | Fall back, no retry. Never throws. | `failed_parse` |
| 22 | Finish reason `truncated` or `refused` *(both)* | normalised `finishReason` | Fall back, no retry | `failed_parse` |
| 23 | **Provider returned prose, not JSON** | `JSON.parse` throws on the text | One brace-extraction attempt (§5.5 step 1). If that fails, fall back. **Never throws.** | `failed_parse` |
| 24 | Schema-invalid payload *(both)* | `validateResponse` | Fall back, no retry | `failed_parse` |
| 25 | `STATE_FILE` unreadable or corrupt | try/catch on read | Treat as empty state, continue, do not throw | (unaffected) |
| 26 | `STATE_FILE` unwritable | try/catch on write | Log and continue; budget and cache degrade to per-run only | (unaffected) |
| 27 | Teams webhook fails | existing `postToTeams` | Existing behaviour: resolves `false`, logs, exits 0 | (unaffected) |
| 28 | Any unexpected throw in the AI layer | `try/catch` in `explainErrors` **and** in `main()` | Return `null`, fall back | `failed_internal` |

### 9.1 Timeout and retry policy (shared, identical for both providers)

- Per-request timeout: **20 s** (`AI_TIMEOUT_MS`).
- Retries: **at most 1**, only for rows 12, 13, 18, 19. Fixed 2 s delay, no exponential backoff — with a single retry there is nothing to back off from.
- Overall AI budget: **45 s** (`AI_TOTAL_BUDGET_MS`), checked before the retry is issued. Worst case is 20 + 2 + 20 = 42 s, comfortably inside the 15-minute cron gap and well under the 16-minute scan window.
- Implement the timeout with **both** `req.setTimeout(ms, () => req.destroy())` and an independent `setTimeout` that destroys the socket — `req.setTimeout` measures socket inactivity, not total elapsed time, and a slow-drip response can outlive it.
- Call `.unref()` on the standalone timer and `clearTimeout` in every resolution path, so a stray timer cannot hold the Node process open after `main()` finishes.
- **Never retry across providers.** A failure on the configured provider falls back to raw lines. Silent cross-provider failover would double the cost of an outage and make the attribution line lie.

---

## 10. Model choice and cost

### 10.1 Recommended defaults

| Provider | Default `AI_MODEL` | Status |
|---|---|---|
| `openai` (default provider) | `gpt-5.6-terra` — budget alternative `gpt-5.6-luna` | **Needs confirming.** Read from OpenAI's docs 2026-09-10. Not verified against this account's entitlements. |
| `anthropic` | `claude-opus-5` | High confidence — from the bundled `claude-api` reference. |

Both are overridable via `AI_MODEL` with no code change, which is the point.

**Why a mid-tier model rather than the cheapest.** The entire value of the feature is explanation *quality* — a plausible-sounding wrong cause posted to Teams is worse than the raw line, because engineers will act on it. Volume is tiny by construction (clean-scan skip, eligibility filter, dedup, cross-run cache), so the price difference between tiers is a few dollars a month. `gpt-5.6-luna` is documented as the budget option if the user prefers; §10.3 shows both.

### 10.2 Token arithmetic per call (shared — the prompt is identical for both providers)

| Component | Estimate |
|---|---|
| System prompt (§5.1) | 510 input tokens |
| Envelope and instructions (§5.2) | 120 input tokens |
| Per group: 400-char sample + JSON fields | ~130 input tokens |
| 8 groups (the cap) | 1,040 input tokens |
| **Total input, worst case** | **~1,670 → round to 1,700** |
| Per explanation: 140 + 220 + 180 chars, plus field names and enums | ~170 output tokens |
| 8 explanations | 1,360 output tokens |
| `overallSummary` + envelope | ~90 output tokens |
| Reasoning/thinking tokens (billed as output on both providers) | ~1,000 output tokens |
| **Total output, worst case** | **~2,450 → round to 2,500** |

So for any provider, with `IN` and `OUT` as that provider's price per **million** tokens:

```
cost per call = 1,700 × IN/1e6  +  2,500 × OUT/1e6
              = 0.0017 × IN     +  0.0025 × OUT
```

### 10.3 Monthly cost

Runs per month: `4/hr × 24 hr × 30 days = 2,880`.

Call volume, derived from the two real log files:
- 09-08: 1 scan window contained an eligible error (21:38).
- 09-09: 3 scan windows contained eligible errors (05:12, 06:11, 10:23).
- 4 windows over 2 days = **2 calls/day = 60 calls/month**.
- Planning band, 3× for growth and incident days: **180 calls/month**.
- Hard ceiling from `AI_MAX_CALLS_PER_DAY=40`: `40 × 30 = 1,200 calls/month`. **Applies identically to both providers.**

#### Anthropic (rates from the bundled `claude-api` reference — high confidence)

| Model | IN $/MTok | OUT $/MTok | Per call | 60 calls | 180 calls | 1,200 calls |
|---|---|---|---|---|---|---|
| `claude-opus-5` | $5.00 | $25.00 | 0.0017×5 + 0.0025×25 = **$0.0710** | **$4.26** | **$12.78** | $85.20 |
| `claude-sonnet-5` | $2.00 | $10.00 | **$0.0284** | $1.70 | $5.11 | $34.08 |
| `claude-haiku-4-5` | $1.00 | $5.00 | **$0.0142** | $0.85 | $2.56 | $17.04 |

#### OpenAI — **rates NOT confirmed; fill in from OpenAI's current pricing page**

> The figures below were read from `developers.openai.com/api/docs/pricing` on 2026-09-10 via an automated fetch. **Do not treat them as settled for budgeting.** Substitute the live rates into the formula before signing off on a budget. The formula is what matters; the numbers are an illustration.

Generic form, with `IN` and `OUT` filled in by the operator:

| Volume | Monthly cost |
|---|---|
| 60 calls | `60 × (0.0017×IN + 0.0025×OUT)` |
| 180 calls | `180 × (0.0017×IN + 0.0025×OUT)` |
| 1,200 calls (cap) | `1,200 × (0.0017×IN + 0.0025×OUT)` |

Worked through with the unconfirmed rates, for illustration only:

| Model (unconfirmed) | IN $/MTok | OUT $/MTok | Per call | 60 calls | 180 calls | 1,200 calls |
|---|---|---|---|---|---|---|
| `gpt-5.6-terra` | $2.00 | $12.00 | 0.0017×2 + 0.0025×12 = **$0.0334** | **$2.00** | **$6.01** | $40.08 |
| `gpt-5.6-luna` | $0.20 | $1.20 | **$0.0033** | $0.20 | $0.60 | $4.01 |

**Expected spend on the recommended default, if the rates above hold: roughly $2–6/month.** The ceiling row is only reachable if the app produces 8 distinct new error groups in 40 separate scan windows every day for a month — at which point the API bill is not the problem.

Two caveats that apply to both providers: these assume every call maxes out at 8 groups (observed data has at most 2 per window, so real spend lands near the bottom of each band), and the ~1,000 reasoning-token line in §10.2 is an estimate — if the chosen model does more hidden reasoning, output cost rises proportionally. Check `usage` on the first few real calls and re-run the arithmetic.

---

## 11. Teams message shape

### 11.1 Rendered message, AI path

```
🔎 CPQ12 User & Error Monitor
Time: 2026-09-09T06:11:30.000Z
Container: cpq-application
Severity: HIGH
New bug/error lines: 2
User-activity events: 0

Both e-sign reminder background jobs failed because MongoDB Atlas was unreachable.

1) E-signature — HIGH (x1)
   What broke: The e-sign expiry reminder job could not run.
   Why: The job opened a MongoDB Atlas connection and the TCP connect timed out
        on port 27017. Atlas was unreachable from the droplet, most likely an IP
        access-list or transient network issue, not app code.
   Next step: Check the Atlas IP access list still contains the droplet IP, then
        curl the app's /api/database/health endpoint.
   Confidence: high

2) E-signature — HIGH (x1)  ↻ seen before
   ...

Raw lines:
• ❌ E-sign expiry reminder job failed: connect ETIMEDOUT 159.41.176.221:27017
• ❌ Auto-reminder job failed: connect ETIMEDOUT 159.41.176.221:27017

Explained by openai / gpt-5.6-terra
```

**The footer is `Explained by <provider> / <model>`** (F9). It always names what actually ran, taken from the resolved config rather than from a default constant, so a comparison run is unambiguous. When some explanations came from cache and the cached provider differs, the footer names the current provider and the cached items keep their `↻ seen before` marker — but per §4.4 a provider change invalidates the cache, so this combination should not arise in practice.

Other design points:
- **Keep the raw lines.** The explanation is added value, not a replacement — engineers need the exact string to grep for. The raw lines shown in Teams are the *unredacted* originals; redaction applies only to what leaves the server.
- Header lines 1–5 keep today's ordering so anyone used to the old alert can still skim it, with `Severity:` inserted.
- Cap the rendered message at `AI_MAX_MESSAGE_CHARS` (default 8000) with a trailing `… (truncated, see logs/monitor/)`.

### 11.2 JSON payload — additive only

```js
{
  // EXISTING — unchanged names, types and meaning
  message:     String,
  bugCount:    Number,
  userCount:   Number,
  generatedAt: String,
  healthy:     Boolean,

  // NEW — all optional from the flow's perspective
  aiExplained: Boolean,          // true only when explanations are present
  aiStatus:    String,           // enum from the §9 matrix
  severity:    String | null,    // "critical" | "high" | "medium" | "low" | null
  aiSummary:   String | null,    // overallSummary, or null
  errorGroups: Number,           // distinct groups detected this scan
  aiProvider:  String | null,    // "openai" | "anthropic" | null
  aiModel:     String | null     // model id that produced the explanation, or null
}
```

**Does the Power Automate flow need updating? No** — but this still needs checking before deploy (§15.5).

The flow consumes `message`, `bugCount`, `userCount`, `generatedAt`, `healthy`. All five keep their exact names, types and semantics — `message` is still a plain string, it just contains better text. Power Automate ignores unrecognised JSON properties as long as the flow's schema does not reject extras. Two caveats for the DevOps handover:

1. If the flow's **Parse JSON** action has `additionalProperties: false` in its schema, adding fields **will** break it. Verify before the first production run. The fix is to relax that constraint or regenerate the schema from a sample — not to drop the fields.
2. `healthy` must keep meaning "no errors found", **not** "AI succeeded". An AI failure on a dirty scan is still `healthy: false`; an AI failure on a clean scan is still `healthy: true`.

Note that `bugCount` will drop once `❌ Errors: 0` joins `NOISE_PATTERNS` (§3.3b). If anyone has built a threshold or chart on that number, it will step down — worth mentioning when handing over.

Optional later enhancement, out of scope: colour the Adaptive Card by `severity`, use `aiSummary` as the card title, and show `aiProvider` as a footnote.

### 11.3 Report file

Append an `--- AI explanation ---` section to the dated report in `logs/monitor/`, containing the rendered explanation, the `aiStatus`, and the provider/model used. When `aiStatus` is a failure, record the reason there. This is the only durable record of why an explanation was missing, and the first place to look when the team asks why today's alert had no explanation — or why two alerts read differently during a provider comparison.

---

## 12. Test plan

**No test may make a network call. No test may cost money. Total test-suite API spend: $0.**

### 12.1 Three offline modes to build

| Mode | Env var | Purpose |
|---|---|---|
| File input | `MONITOR_LOG_FILE=<path>` | `getContainerLogs()` reads the file instead of shelling out to `docker logs`. Runs the whole pipeline against `logs/cpq-2026-09-09.log` on a laptop with no Docker. |
| Dry run | `AI_DRY_RUN=1` | Build and print the exact outbound payload **for the configured provider** (URL, headers with the key masked, body), make **no** request, return `null`. This is the mode used to verify redaction on the dev server safely, and to eyeball the difference between the two adapters. |
| Fixture | `AI_FIXTURE_FILE=<path>` | Read a canned provider response from disk instead of calling. Exercises adapter extraction, validation, rendering, caching and payload assembly end to end, offline. |

`AI_BASE_URL` doubles as a fourth mode: point it at a local stub server for an end-to-end HTTP test without touching a real provider. All modes must be no-ops when unset.

### 12.2 Provider-agnostic tests — `tests/unit/monitorAiExplain.test.ts`

Follow the existing convention: `import aiExplain from '../../monitor-ai-explain.cjs';`. Vitest's `environment: 'node'` is already the default in `vitest.config.ts` and `include` is `tests/**/*.test.{ts,tsx}` — no config change needed.

**Redaction (§7) — one test per rule, plus:**
- Each of rules 1–20 masks its target and leaves surrounding text intact.
- `mongodb+srv://user:hunter2@cluster1.zycf9g5.mongodb.net/...` → `hunter2` appears nowhere.
- Already-redacted input (`mongodb+srv://[REDACTED]@...`, the real log shape) stays valid and is not double-mangled.
- Ordering: a full UUID is replaced once, not chopped by the truncated-UUID rule.
- Real-line snapshots: each of the 6 genuine error messages from §3.2 redacts to a stable expected string.
- Idempotence: `redact(redact(x)) === redact(x)`.
- Guard returns `true` for each high-risk shape, `false` for a fully-redacted real line.
- **Negative guard test:** a line containing a plaintext secret no rule covers must trip the guard and skip the call.
- **Redaction is identical under both providers** — assert the same input yields the same redacted prompt with `AI_PROVIDER=openai` and `AI_PROVIDER=anthropic`.

**Eligibility, grouping and noise:**
- `❌ Errors: 0` at level `info` is **not** eligible **and** is now caught by `NOISE_PATTERNS`, so it does not increment `bugCount`.
- `⚠️ Gotenberg request error: fetch failed` at level `warn` **is** eligible.
- `ℹ️ User … already logged in today` at level `info` is **not** eligible.
- A non-JSON line matching `/TypeError/` **is** eligible; one matching nothing is not.
- Feeding the whole `logs/cpq-2026-09-09.log` yields exactly the groups in §4.3, and `bugCount` is 5 not 8.
- Feeding `logs/cpq-2026-09-08.log` yields `bugCount` 1 not 7.
- Two `ETIMEDOUT` lines with different IPs collapse; expiry-reminder and auto-reminder stay separate.
- `count`, `firstSeen`, `lastSeen` correct for a group with 3 occurrences.

**Config resolution (`resolveConfig`) — the new surface:**
- `AI_PROVIDER` unset → AI off, no adapter selected, `skipped_disabled`.
- `AI_PROVIDER=""` → same.
- `AI_PROVIDER=openai`, `OPENAI_API_KEY` set → resolves to the OpenAI adapter.
- `AI_PROVIDER=openai`, `OPENAI_API_KEY` empty, **`ANTHROPIC_API_KEY` set** → `skipped_no_key`, and assert the Anthropic key is **never read** and no request is built. This is the "do not silently try the other provider" guarantee.
- `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` empty → `skipped_no_key`.
- `AI_PROVIDER=gemini` → `failed_config_provider`, warning names the valid values.
- `AI_PROVIDER=OpenAI` (mixed case) → accepted, case-insensitive.
- `AI_BASE_URL=not-a-url` → `failed_config_url`, does not fall back to the default silently.
- `AI_MODEL` empty → adapter default used; `AI_MODEL=x` → `x` used.
- `resolveConfig` never throws and never includes a key in its returned object's log-safe form.

**Caps, prompt, state:** as before — group cap, per-error char cap, total char cap, prompt determinism, `idMap` round-trip, budget counter increment/reset/block, corrupt state file, cache TTL, 200-entry cap. Plus:
- **Cache invalidation on provider change:** an entry written under `openai` is treated as a miss when `AI_PROVIDER=anthropic`, and vice versa.

**Shared validation (§5.5) — one test per rejection reason:**
`finishReason: "truncated"`; `"refused"`; null text; non-JSON text with no braces; missing `explanations`; empty `explanations`; more explanations than groups sent; missing `nextStep`; `severity: "catastrophic"`; unknown `id`. Each returns `null`; none throws.
Plus the two permitted repairs:
- **Prose coercion:** `Here is the JSON:\n\`\`\`json\n{...}\n\`\`\`` parses successfully via brace extraction.
- **Prose with no JSON at all** returns `null` and does not throw.
- **Over-length field** is truncated to `maxLength`, not rejected.

**Rendering:**
- With explanations: all five fields per group, raw lines, and the footer.
- **Footer names the configured provider and model** — assert `Explained by openai / gpt-5.6-terra` and `Explained by anthropic / claude-opus-5` from otherwise identical inputs.
- Without explanations: `renderAiMessage` is not called and `buildMessage()` output is byte-identical to the pre-change version. **Snapshot the current `buildMessage()` output before touching the file** and assert against it — the single most important regression test in the plan.
- Cached explanations marked `↻ seen before`; over-long message truncated with the marker.

**Payload:** all five existing keys present with the same types in every path; `healthy` reflects errors not AI success; `aiStatus` matches the expected §9 value per simulated failure; `aiProvider`/`aiModel` populated on success and `null` on every fallback.

### 12.3 Adapter tests — `tests/unit/monitorAiProviders.test.ts`

These are the tests that stop the dual-provider surface rotting (§14). **Every case runs against both adapters** via a table-driven loop, so adding a third provider later means adding one row.

**Interface conformance:**
- Both adapters expose every key in the §4.5 interface with the right types.
- `selectAdapter('openai')` and `selectAdapter('anthropic')` return them; `selectAdapter('x')`, `selectAdapter('')`, `selectAdapter(undefined)` return `null`.

**`buildRequest` (pure — assert on the returned object, no network):**
- **Contains no API key anywhere** in `headers` or `body`. Assert by scanning the serialised request for a sentinel key value. Run for both adapters.
- OpenAI: system prompt is `messages[0].role === "system"`; Anthropic: system is the top-level `system` field and `messages[0].role === "user"`.
- OpenAI: `response_format.json_schema.schema` present; Anthropic: `output_config.format.schema` present. Both carry the §5.4 schema.
- Anthropic body contains **no** `budget_tokens`, `temperature` or `top_p`.
- Path and default base URL match the §5.3 table.
- `AI_BASE_URL` with a path is used verbatim; without a path, the adapter's own path is appended.
- `AI_AUTH_STYLE` selects the right header name for `bearer` / `x-api-key` / `api-key`.

**`extractText` / `extractUsage` — the coercion contract:**
- A well-formed response from each provider yields the **same** `{text, finishReason}` shape.
- Finish-reason normalisation: OpenAI `stop`→`complete`, `length`→`truncated`, `content_filter`→`refused`; Anthropic `end_turn`→`complete`, `max_tokens`→`truncated`, `refusal`→`refused`; anything unrecognised→`other`.
- Usage normalisation: OpenAI `prompt_tokens`/`completion_tokens` and Anthropic `input_tokens`/`output_tokens` both land in `{inputTokens, outputTokens}`.
- **Malformed input never throws** — returns `{text:null}`. Cover: `{}`, `null`, `{choices:[]}`, `{content:[]}`, `{choices:[{}]}`, `{content:[{type:"thinking"}]}`, a string, an array, and a response from the *wrong* provider fed to each adapter.

**Equivalence — the headline test:** feed each adapter a fixture representing the *same logical answer* in its own wire format, run both through `extractText` → `validateResponse`, and assert the two resulting internal objects are **deep-equal**. This is the executable form of requirement N7: if the two providers ever stop being interchangeable, this test fails.

### 12.4 Integration test, offline

Run the full `main()` path with `MONITOR_LOG_FILE=logs/cpq-2026-09-09.log`, `AI_FIXTURE_FILE=tests/fixtures/<provider>Response.json` and `TEAMS_WEBHOOK_URL` unset. **Run it twice, once per provider**, and assert the report file content and Teams payload are identical apart from `aiProvider` / `aiModel` and the footer line.

Fixtures live in `tests/fixtures/` and must be short excerpts. **Never commit a fixture containing a real credential**, and scrub the real email addresses out of log excerpts before committing.

### 12.5 Manual verification before production

1. On the **dev server** (159.89.175.168:3001), `AI_DRY_RUN=1 node monitor-user-logs.cjs` with `AI_PROVIDER=openai`. Read the printed payload line by line: no email, no token, no host, no IP, no key. Cost: $0.
2. Repeat with `AI_PROVIDER=anthropic` and confirm the redacted content is identical and only the wire format differs. Cost: $0.
3. Real OpenAI key, `AI_MAX_CALLS_PER_DAY=2`, one manual run against a window with a known error. **This is also the model-name check** — a 404 here means `AI_MODEL` is wrong or the key lacks access (§9 row 16). Cost: a few cents.
4. Wrong `OPENAI_API_KEY` → falls back to raw lines, exits 0.
5. `AI_PROVIDER=openai` with `OPENAI_API_KEY` empty but `ANTHROPIC_API_KEY` populated → confirm it does **not** call Anthropic.
6. `AI_PROVIDER` empty → byte-identical output to the pre-change script.
7. Only then enable on the production cron.

**Do not point any of this at the production database, and do not run it on the live server before step 7** — the shared-live-database constraint applies: `.env` `MONGODB_URI` is production.

---

## 13. Implementation sequence for the Backend Engineer

Work in this order. Each step is independently testable and leaves the cron job working.

| Step | Work | Done when |
|---|---|---|
| 1 | **Snapshot the fallback.** Add `tests/unit/monitorAiExplain.test.ts` with one test capturing today's `buildMessage()` output for a known input. Do this **before** editing anything. | Test passes against unmodified code. |
| 2 | **Confirm the unverified facts before writing adapter code.** Check against OpenAI's live docs: the model name in `AI_MODEL`, that the key can access it, the `/v1/chat/completions` `response_format` shape, whether `strict:true` accepts `maxLength` (§5.4), and current pricing for §10.3. Record what you found in this doc. | §5.3 and §10.3 have no "needs verification" markers left for OpenAI. |
| 3 | Create `monitor-ai-explain.cjs` with `parseLogLine`, `isAiEligible`, `fingerprint`, `groupErrors`. No network, no provider awareness. | Grouping tests pass against the real log files. |
| 4 | Add `redact` and `hasResidualSecret` with the full §7 table, in order. | All redaction tests pass, including idempotence and real-line snapshots. |
| 5 | Add `buildPrompt` and `validateResponse`, including the §5.5 prose-coercion step and length truncation. | Prompt determinism and every validation-rejection test passes. |
| 6 | Create `monitor-ai-providers.cjs` with both adapters and `selectAdapter`. Pure functions only — no `https`, no `process.env`. | All of `tests/unit/monitorAiProviders.test.ts` passes, including the equivalence test. |
| 7 | Add `resolveConfig` to `monitor-ai-explain.cjs` — the only reader of `AI_PROVIDER`, the key vars, `AI_MODEL`, `AI_BASE_URL`, `AI_AUTH_STYLE`. | Every config-resolution test passes, including "does not try the other provider". |
| 8 | Add `loadState` / `saveState` with the budget counter and the provider-aware cache. | State tests pass, including provider-change invalidation. |
| 9 | Add the shared `callProvider` over plain `https` — copy the structure of `postToTeams` (`monitor-user-logs.cjs:80-108`), which already models "never rejects". Dual timeout, single retry, §9 status mapping, key injected here from `adapter.keyEnv`. | Unit-testable via an injected request function; no real network call in tests. |
| 10 | Add the `explainErrors` orchestrator and `renderAiMessage` with the provider/model footer. Wrap everything in try/catch returning `null`. | Fixture-mode integration test passes for **both** providers. |
| 11 | Edit `monitor-user-logs.cjs`: add `/❌ Errors: 0/` to `NOISE_PATTERNS`, add `MONITOR_LOG_FILE` support to `getContainerLogs()`, require `monitor-ai-explain.cjs`, insert the call between the report write and the message build, extend the report section and the Teams payload. **Do not touch `buildMessage()`, `classify()`, `postToTeams()`, or the pattern arrays other than the one `NOISE_PATTERNS` addition.** | Step 1's snapshot test still passes; `bugCount` tests show 1 and 5. |
| 12 | Update `.env.monitor.example` per §8, with the model-confirmation warning intact. Verify `.gitignore` covers real env files. | `git diff` shows no secret value anywhere, and no `sk-` string. |
| 13 | Run `npm test`. Then the §12.5 manual sequence on the dev server. | All green; dry-run payload verified clean for both providers. |
| 14 | Hand to Code Reviewer and Security Reviewer **before** any deploy. Security review must re-derive the redaction table against the current log files and confirm no adapter can reach a key. | Both sign off. |
| 15 | DevOps: check the Power Automate flow's Parse JSON step (§11.2, §15.5) before enabling on production cron. | Confirmed or fixed. |

**Style reminders:** CommonJS, Node builtins only, no new npm dependencies. Comments explain WHY only, one short line maximum (CLAUDE.md). No `console.log` of anything containing log content outside dry-run mode, and never log a key or an `Authorization` header even masked-by-accident. Functions under 50 lines.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| **Two providers double the surface that can break, and only the configured one is exercised in production.** The unused adapter rots silently — a refactor breaks Anthropic, nobody notices for months, and it fails at the exact moment someone switches to compare or fail over. | Three specific defences, all in §12.3. (1) **Table-driven adapter tests** run every case against both adapters, so neither can be edited without its tests running. (2) The **equivalence test** feeds both adapters the same logical answer and asserts deep-equality of the resulting internal object — this fails the moment they stop being interchangeable. (3) The **integration test runs twice, once per provider**, asserting identical output apart from attribution. Beyond tests: the §4.5 boundary keeps adapters tiny and pure (no I/O, no env, no key access), so there is little in them *to* rot; and §12.5 step 2 makes a dry-run under the non-default provider part of every manual verification. Residual risk accepted: tests cannot catch a provider changing its wire format on their end. Mitigate operationally — when switching provider, run the §12.5 sequence first rather than switching straight on production. |
| OpenAI model name, pricing, `response_format` shape and strict-mode `maxLength` support are **unverified** in this design | Implementation step 2 is a blocking verification task before any adapter code. Every unverified claim is marked inline. A wrong model name degrades gracefully (§9 row 16) rather than crashing. |
| A new secret shape appears in logs that rules 1–20 miss | The §7.3 guard catches the six highest-risk shapes independently and runs **before** `buildRequest`, so it protects both providers with one implementation. A guard trip skips the call rather than leaking. Security Reviewer re-derives the table at review time. |
| Log content now goes to whichever third party is configured — the data-sharing decision changed when the provider became switchable | Redaction and the guard are provider-agnostic and unchanged. Worth confirming with whoever owns the vendor-review process that OpenAI is an approved processor for this content, since the original design assumed Anthropic. Flagged in §15.1. |
| A confident wrong explanation misleads an engineer | The prompt mandates `confidence: "low"` over guessing; raw lines always shown alongside; `confidence` rendered in the message; the footer names the model so a consistently poor one can be identified and swapped. |
| Runaway cost from a crash loop | Four independent brakes, identical for both providers: clean-scan skip, eligibility filter, cross-run cache, hard daily call cap. |
| `bugCount` steps down when `❌ Errors: 0` joins `NOISE_PATTERNS` | Intended (§15.6), but flagged in §11.2 in case anyone has a threshold or chart on that number. |
| Power Automate flow has a strict Parse JSON schema | Open item §15.5; implementation step 15. |
| Latency creep wedges cron | Hard 45 s total budget, dual timeout, timers `unref`'d. Worst case about 5% of the cron gap. Identical for both providers. |
| Someone quotes a key in `monitor.env` | Called out in §8 — the env loader does not strip quotes, and there are now two key variables to get wrong. |

---

## 15. Decisions

The user reviewed rev 1's seven open questions and accepted the recommendations. Recorded here as decisions; §15.1 supersedes the original model question.

| # | Decision | Effect on the design |
|---|---|---|
| **15.1** | **Provider and model are operator-configurable**, not fixed. `AI_PROVIDER` defaults to `openai` (the key CloudFuze holds); `anthropic` stays available. Model is `AI_MODEL`, with a documented per-provider default the operator must confirm. | This revision in full — §4.5, §5.3, §8, §10.1. **Follow-up:** confirm OpenAI is an approved processor for production log content, since rev 1 assumed Anthropic (see §14). |
| **15.2** | **Daily cap stays 40** (`AI_MAX_CALLS_PER_DAY=40`). | §8, §10.3. Applies identically to both providers. |
| **15.3** | **User-activity events are not explained.** `already logged in` and similar stay out of the AI call. | §3.3a eligibility rule; `AI_INCLUDE_USER_ACTIVITY=0`. |
| **15.4** | **Clean-scan heartbeat is unchanged** — no AI, no cost. Confirmed. | §9 row 5. Keeps the call rate at ~2/day rather than 96/day. |
| **15.5** | **Power Automate flow still needs checking** by the user's team before deploy. **This remains the one open item.** | §11.2 caveat 1; implementation step 15. Not a blocker for writing code — only for enabling on production cron. |
| **15.6** | **`❌ Errors: 0` is added to `NOISE_PATTERNS`** so `bugCount` stops counting success messages. | §3.3b. Changes the reported number: 09-08 goes 7→1, 09-09 goes 8→5. Flagged in §11.2. |
| **15.7** | **`monitor-daily-checks.cjs` is out of scope**, to be a separate task afterwards. | Its broken template literals (empty `lines.push()` and empty candidate arrays around lines 82–86 and 108–124, leaving its Teams message blank) are untouched by this work. |

### Still open

Only one item blocks deployment rather than implementation:

1. **Power Automate Parse JSON schema** (§15.5) — someone on the user's team opens the flow and confirms it accepts additional properties. If it does not, a small flow edit is needed before the new payload fields go live.

And one blocks implementation start:

2. **OpenAI facts verification** (implementation step 2) — model name and entitlement, `response_format` shape, strict-mode `maxLength` support, and current pricing. The backend engineer does this first and updates §5.3 and §10.3 in place.

**Sources for the OpenAI figures used in this document (read 2026-09-10, not independently confirmed):** [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), [OpenAI structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

---

## 16. Implementation verification record (added by the Backend Engineer, 2026-09-10)

Step 2 of §13 required confirming the facts marked "needs verification" before adapter code was written. Results:

| Claim | Status | Finding |
|---|---|---|
| OpenAI `/v1/chat/completions` structured-output shape | **Confirmed** | `response_format: {type:"json_schema", json_schema:{name, schema, strict}}`, exactly as §5.3 states. Source: OpenAI structured-outputs guide, read 2026-09-10. |
| `strict:true` requires `additionalProperties:false` + full `required` | **Confirmed** | The §5.4 schema already satisfies both. |
| `strict:true` supports `maxLength` | **NOT resolvable** | OpenAI documents only "a subset of JSON Schema" and does not list the supported keywords; the supported-schemas page 404s. Resolved the §5.4 way: `openaiAdapter.buildRequest` strips `maxLength`/`minLength`/`minItems`/`maxItems` before sending, and shared validation step 8 enforces the limits by truncating. The internal object is identical either way, and the Anthropic adapter still sends the constraints. |
| `gpt-5.6-terra` / `gpt-5.6-luna` exist, at $2/$12 and $0.20/$1.20 per MTok | **Confirmed** | Matches the §10.3 illustrative table exactly, so the $2–6/month estimate stands. Source: OpenAI pricing page, read 2026-09-10. |
| **This key can access that model** | **NOT verified — cannot be** | Entitlement is per-account. A 404 degrades cleanly: `failed_model`, a log line naming the rejected model, raw-line fallback, exit 0. §12.5 step 3 remains the check. |
| Anthropic wire format, `claude-opus-5`, $5/$25 | **Confirmed** | Top-level `system`, `output_config.format`, `thinking:{type:"adaptive"}`, `output_config.effort`, `stop_reason`, `usage.input_tokens`/`output_tokens`. `budget_tokens`/`temperature`/`top_p` correctly excluded. Source: bundled `claude-api` reference. |
| Azure OpenAI header and URL shape (§5.3.1) | **Not attempted** | Out of scope per §5.3.1. The config surface (`AI_BASE_URL` used verbatim when it carries a path, `AI_AUTH_STYLE`) is built and unit-tested; nothing was tested against Azure. |

### 16.1 Corrections to the design found during implementation

1. **§5.1 system prompt tripped the §7.3 guard on every run.** The prompt contained a literal sender address, and the guard scans `system + user` for email shapes — so the layer would have skipped every call with `failed_redaction_guard`. The address is replaced with a non-address phrase; the guard still scans the whole payload.
2. **§7.2 rule 12 was not idempotent.** Its value class excludes `]` but not `[`, so a second pass re-matched `[REDACTED` and produced `token=[REDACTED]]`. Added a `(?!\[)` lookahead. §12.2's idempotence test now passes.
3. **§12.2 assumes `logs/*.log` are available to tests.** They are gitignored and not in the repo. Tests run against a committed, scrubbed fixture (`tests/fixtures/monitorLogSample.txt`); the real-log assertions are `it.runIf(...)` and run only where the files exist.
4. **`explainErrors` returns an envelope, not bare `null`.** The payload needs `aiStatus`, `errorGroups`, `aiProvider` and `aiModel` on failure paths too, which a bare `null` cannot carry. The envelope's `ai` field is `null` on every failure, preserving the §4.2 semantics.
5. **§12.2 acceptance criterion 6 vs §4.3.** Criterion 6 says `cpq-2026-09-09.log` yields "4 AI-eligible groups across its two dirty windows"; §4.3 describes three dirty windows (05:12, 06:11, 10:23). Both numbers are snapshots of a file that has since grown, which is why the tests now derive their expectations from the file rather than hardcoding a count (see §17.3 item 13).

---

## 17. Review fix pass (2026-09-10)

Code review and security review returned 16 items; all were applied. The redaction table itself
was found sound and is unchanged apart from one added rule (Mongo ObjectId) and one idempotence
fix already recorded in §16.1.

### 17.1 Availability and cost

| # | Fix |
|---|---|
| 1 | `renderAiMessage` was the one step outside every try/catch. A cached explanation with a non-string `severity` threw past `main()`'s catch: **exit 1, no Teams alert at all**. Now wrapped, with `ai` reassigned to a `failed_render` envelope so the payload cannot claim an explanation that was never rendered. `explanationBlock` also coerces `severity` defensively. |
| 2 | The daily cap counted only *successful* calls, so a fully billed 200 with unusable content was never charged against it. The counter now increments immediately after the request is issued. |
| 3 | Cache entries are validated on read (`validateCacheEntry`) and again at point of use (`cacheHit`); bad entries are dropped rather than reaching the renderer. State is written atomically (temp file + rename) at mode `0600`. |
| 4 | The post-response cache back-fill read `state.cache[...]` raw, bypassing the TTL and provider/model gate. It now uses the same `cacheHit` gate. Reachable without corruption whenever a provider answers for fewer groups than were sent. |
| 5 | `AI_TIMEOUT_MS` and `AI_TOTAL_BUDGET_MS` are clamped (1s-60s, 1s-120s) and the effective per-request timeout is `min(timeout, budget)`. |
| 6 | A negative `aiCallsToday` on disk is clamped to 0 on both read and write. |

### 17.2 Data in and out

| # | Fix |
|---|---|
| 7 | Real PII removed from committed test files: a real address, the production sender address, the real Atlas cluster hash and shard host, and the real node IP. Note the suggested substitute `cluster0.abcde.mongodb.net` could not be used — redaction rule 18 requires a middle label of 6+ characters, so a 5-character one would have silently broken the rule-18 test; `abcdefg` is used instead. `.env.monitor.example` now ships `AI_PROVIDER=` empty, matching its own comment. |
| 8 | Model output reached Teams unsanitised; a forged `HEALTHY` banner above a real error count was reproducible. All four model-authored strings are now collapsed to a single line with control characters stripped, and every model-derived line carries a fixed label (including a new `Summary:` prefix), so none can be mistaken for a line the monitor wrote itself. The system prompt now states that log content is data, never instructions. |
| 9 | The residual-secret guard was decorative — every one of its six shapes was a strict subset of redaction rules 1-20, so it could only fire where redaction had already won. Rebuilt with GitHub/GitLab/Google/Stripe/npm key prefixes, PEM headers, bare hex >=24, Luhn-checked card numbers, SSN, IPv6, and a Shannon-entropy check over long tokens: **11 of 11** previously-missed shapes now caught. Tuned against real data — **0 false positives across 314 redacted production log messages**. Mongo ObjectIds gained a redaction rule so real document ids in error lines cannot cause a false skip. |
| 10 | `firstSeen`, `lastSeen`, `container`, `generatedAt` and `level` reached the network unredacted. Timestamps are now validated as ISO-8601 or dropped, `container` is redacted, `level` is enum-constrained and `count` coerced to a number. (`level` was not on the review list; it is attacker-influenceable through the log JSON in the same way.) |
| 11 | `NOISE_PATTERNS` was not applied to the AI path, so a deliberately suppressed line still cost a group slot and a paid call. The AI layer now receives the same filtered view the counts are built from. |
| 12 | `AI_BASE_URL` is refused unless it is `https` to a non-private host, unless `AI_ALLOW_INSECURE=1` (documented, for a local test stub). Response bodies are capped at 1 MB. Provider error details are run through `redact()` before logging — verified to have previously echoed an unmasked key back from an endpoint that reflects the request. **Known limitation:** the SSRF check is on the literal hostname, so a public name that resolves into a private range is not caught; that needs a check on the resolved address at connect time. |

### 17.3 Tests

| # | Fix |
|---|---|
| 13 | The `it.runIf` real-log tests hardcoded counts from files that have since rotated and grown (09-08 is gone; 09-09 now yields 10 -> 7, not 8 -> 5). They now derive every expectation from whatever the files hold, and assert the mechanism rather than a snapshot. |
| 14 | Three tests could not fail: the API-key assertion never injected the key, the "reads no environment variable" test only proved nothing was *written*, and the equivalence test used byte-identical fixtures. All three were strengthened and **verified by mutation** — each now fails against the exact defect it claims to guard. |
| 15 | Added the tests that would have caught items 1, 3 and 4, plus `tests/unit/monitorAiCronSafety.test.ts`: 17 cases that spawn the real script against a local webhook stub and assert it posts and exits 0 under corrupt state, malformed cache entries, unreadable fixtures, blocked URLs and an unwritable report directory. |
| 16 | `AI_INCLUDE_USER_ACTIVITY` was documented but read nowhere — removed, since decision §15.3 already settled that user activity is not explained. `❌ Errors: 0` is anchored so it no longer swallows `❌ Errors: 05`. `errorGroups` is now reported on config-level skips. `FORCE_ALERT` runs report `skipped_force_alert`. `AI_MAX_GROUPS=0` is a kill switch, matching `AI_MAX_CALLS_PER_DAY=0`. |

### 17.4 Found during the fix pass, outside the review list

- **`postToTeams` never passed the URL port**, so any webhook URL with an explicit port was sent to :80/:443. Pre-existing, present in the original committed file, invisible in production only because Teams webhook URLs use the default port. Fixed with `port: url.port || undefined` — behaviour-identical for a default-port URL. This required touching `postToTeams`, which the fix brief placed off-limits; without it the item 15 cron-safety tests cannot reach a local webhook stub at all.
- **An unwritable `REPORT_DIR` killed the alert.** `ensureDir` and the report write sat outside every try/catch, so a full disk or a permissions change meant exit 1 and no Teams post — the same availability class as item 1. Both are now non-fatal and the run still posts.
- **`buildMessage()` byte-identity is now a committed test.** 90 cases captured from the pre-change implementation live in `tests/fixtures/buildMessageGolden.json`; the check no longer depends on an ad-hoc script or on git still holding the original file. Verified by mutation to fail on a one-character change to the fallback text.
