# Zenop.ai onboarding video

A narrated walkthrough of the CPQ app for new team members (about nine minutes), recorded from the real
app against an **isolated local demo workspace**. Everything needed to rebuild it lives in this folder.

## What runs where (and why it is safe)

| Piece | Where | Safety |
|---|---|---|
| Database | Docker container `cpq-demo-mongo` on `127.0.0.1:27018`, database `cpq_demo` | Every script refuses a non-localhost URI. Your `.env` (production Atlas) is never used by the demo server. |
| Demo backend | `server.cjs` on port **3101**, started with `lib/net-guard.cjs` preloaded | The guard blocks **every** non-localhost connection and writes SendGrid mail to `out/outbox/` instead of sending it. Refuses to start unless the database is localhost. |
| Demo frontend | Vite on port **5273** (`lib/vite.demo.config.mjs`) | Its `/api` proxy points at 3101. The recording browser also reroutes anything aimed at 3001/5173 (your own dev servers) to the demo. |
| People | `@demo.local` only | Priya (rep), Jordan (rep), Marcus (SMB team lead), Aisha (Technical), Daniel (Legal), Emma and Tom (Northwind customer). |

The Technical, Legal and Deal Desk addresses shown in the app are its hard-coded real mailboxes
(`src/config/approvals.ts`). Mail to them is captured in `out/outbox/` like all other mail.

Differences from production, on purpose:
- `TECH_APPROVER_SIGNIN_REQUIRED=false`, because fake users can't do the Microsoft sign-in. The narration explains it.
- HubSpot, Zoho Sign, OpenAI and Clarity are off. The deal arrives through the same URL parameters HubSpot's link uses.

## Demo logins

Password for all: `Demo-Walkthrough-2026`

`priya.raman@demo.local`, `jordan.lee@demo.local`, `marcus.bell@demo.local`, `aisha.khan@demo.local`, `daniel.ortiz@demo.local`

The UI's email form only accepts `cpq@zenop.ai`, so the scripts log in through `POST /api/auth/login` and seed the session.
To look around by hand, open `http://localhost:5273` after `node lib/servers.mjs start`. Then in the browser console, run:
`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'priya.raman@demo.local',password:'Demo-Walkthrough-2026'})}).then(r=>r.json()).then(d=>{localStorage.cpq_token=d.token;localStorage.cpq_user=JSON.stringify(d.user);location='/deal'})`

## Regenerating the video

Prerequisites (already installed): Node 22, Docker Desktop running, ffmpeg (winget `Gyan.FFmpeg.Essentials`), LibreOffice.

```bash
cd CPQ12/demo-video
npm install                 # playwright 1.62.0 (reuses the cached Chromium)
node lib/servers.mjs start  # demo backend :3101 + frontend :5273 (no-op if already running)
node setup-demo.mjs         # reset demo data (first run copies config from production, read-only)
node tts.mjs                # narration: only changed beats are re-rendered
node record.mjs --dry       # rehearsal at full speed; on error see out/failed-<beat>.png
node lib/verify-db.mjs      # every record ended in the intended state?
node record.mjs             # real recording → out/raw.mp4 + out/timeline.json
node build-video.mjs        # → out/zenop-onboarding.mp4, -clean.mp4, .srt, chapters.txt
node lib/frames.mjs 15      # optional: a frame every 15 s with the line being spoken
```

### After editing…

- **The script** (`narration.mjs`): edit the beat's `lines`, then run `tts.mjs` → `record.mjs` → `build-video.mjs`.
  Beats are timed from their audio, so the recording must be redone whenever the narration length changes.
  Use `{shown|spoken}` for words the voice mispronounces. A trailing ` *` marks a key point (longer pause).
- **The on-screen actions** (`record.mjs`): run `record.mjs --dry` until it passes, then record and build.
- **The voice**: change `VOICE` in `narration.mjs`, then run `tts.mjs --force`. The engine is Windows OneCore "Mark" at 0.92×
  (no install needed). Samples are in `voice-samples/`.
- **The app itself changed** (labels, flows): the dry run fails at the first beat that no longer matches, with a screenshot.
- **Production config changed** (templates, exhibits, pricing): `node setup-demo.mjs --refresh-config`.

## Removing the demo

```bash
node lib/servers.mjs stop          # stop demo backend + frontend
node setup-demo.mjs --remove       # drop the cpq_demo database and the demo's uploaded files
node setup-demo.mjs --remove --all # …and the cached copy of the configuration
docker rm -f cpq-demo-mongo && docker volume rm cpq-demo-mongo-data   # remove the local MongoDB entirely
```

## Files

| File | Purpose |
|---|---|
| `APP_MODEL.md` | How the app works, as verified for this video, plus the bugs noticed |
| `narration.mjs` | The script as named beats |
| `setup-demo.mjs` | Builds/resets the demo workspace (idempotent; `--remove`) |
| `tts.mjs` | Per-sentence audio with natural gaps, per-beat subtitles, `audio/durations.json` |
| `record.mjs` | The scenes (Playwright + CDP screencast at 30 fps, 1920×1080) |
| `build-video.mjs` | Mix, loudness-normalise, 48 kHz stereo AAC, burn subtitles, export clean copy + `.srt` |
| `lib/net-guard.cjs` | Outbound-network block + local mail capture for the demo server |
| `lib/recorder.mjs`, `lib/overlay.js` | Recording engine; cursor, ripples, rings, chapter cards, login badge, alert cards |
| `lib/verify-db.mjs`, `lib/frames.mjs` | Verification helpers |
