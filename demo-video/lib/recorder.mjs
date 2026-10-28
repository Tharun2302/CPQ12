// Recording engine: CDP screencast → ffmpeg at a constant 30 fps, a beat timeline for the narration,
// and human-looking actions (cursor arcs, ripples, typing, smooth scrolling) with retries.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { APP_URL, DEMO_DIR, FFMPEG, OUT_DIR } from './demo-env.mjs';
import { guardContext } from './session.mjs';

const FPS = 30;
const VIEWPORT = { width: 1600, height: 900 };
const SCALE = 1.2; // 1600x900 CSS px → 1920x1080 frames
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OVERLAY = fs.readFileSync(path.join(DEMO_DIR, 'lib/overlay.js'), 'utf8');

export class Recorder {
  constructor({ dry, durations }) {
    this.dry = dry;
    this.durations = durations;
    this.timeline = [];
    this.frames = 0;
    this.recording = false;
    this.currentBeat = 'setup';
    this.dialogs = [];
    this.reroutes = [];
  }

  async start() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    this.browser = await chromium.launch({ channel: 'chromium', args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'] });
    this.context = await this.browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, locale: 'en-GB', timezoneId: 'Asia/Kolkata' });
    await guardContext(this.context, (from, to) => this.reroutes.push(`${from} -> ${to}`));
    await this.context.addInitScript(OVERLAY);
    if (this.dry) await this.context.addInitScript('try{sessionStorage.setItem("__demoOverlay", JSON.stringify({...JSON.parse(sessionStorage.getItem("__demoOverlay")||"{}"), speed: 12}))}catch(e){}');
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(30000);
    this.page.on('dialog', (d) => this.onDialog(d));
    this.page.on('pageerror', (e) => fs.appendFileSync(path.join(OUT_DIR, 'page-errors.log'), `[${this.currentBeat}] ${e.message}\n`));
    if (!this.dry) await this.startCapture();
  }

  // ── capture ────────────────────────────────────────────────
  async startCapture() {
    this.videoPath = path.join(OUT_DIR, 'raw.mp4');
    this.ffmpeg = spawn(FFMPEG, ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
      '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-r', String(FPS), this.videoPath],
    { stdio: ['pipe', 'inherit', 'inherit'] });
    this.cdp = await this.context.newCDPSession(this.page);
    this.lastFrame = null;
    this.cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      this.lastFrame = Buffer.from(data, 'base64');
      this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    // Frames only arrive when the page changes; the ticker repeats the latest one to hold a constant 30 fps.
    this.ticker = setInterval(() => {
      if (!this.recording || !this.lastFrame) return;
      const due = Math.floor(((performance.now() - this.segmentStart) / 1000) * FPS) + this.segmentBase;
      while (this.frames < due) {
        this.ffmpeg.stdin.write(this.lastFrame);
        this.frames += 1;
      }
    }, 4);
    while (!this.lastFrame) await sleep(50);
    this.resume();
  }

  resume() {
    if (this.dry) return;
    this.segmentBase = this.frames;
    this.segmentStart = performance.now();
    this.recording = true;
  }

  pause() {
    if (this.dry) return;
    this.recording = false;
  }

  // Seconds of finished video so far (wall clock in dry mode).
  now() {
    if (this.dry) return (performance.now() - (this.dryStart ??= performance.now())) / 1000;
    return this.frames / FPS;
  }

  async stop() {
    clearInterval(this.ticker);
    if (this.cdp) await this.cdp.send('Page.stopScreencast').catch(() => {});
    if (this.ffmpeg) {
      this.ffmpeg.stdin.end();
      await new Promise((r) => this.ffmpeg.on('close', r));
    }
    fs.writeFileSync(path.join(OUT_DIR, 'timeline.json'), JSON.stringify({ fps: FPS, frames: this.frames, beats: this.timeline }, null, 2));
    await this.browser.close();
  }

  // ── narration timing ───────────────────────────────────────
  async say(beatId, actions = async () => {}) {
    const info = this.durations[beatId];
    if (!info) throw new Error(`No audio for beat ${beatId}; run tts.mjs`);
    this.currentBeat = beatId;
    const t0 = this.now();
    this.timeline.push({ beat: beatId, start: t0, duration: info.duration / 1000 });
    try {
      await actions();
    } catch (err) {
      await this.fail(beatId, err);
    }
    if (this.dry) return;
    const end = t0 + info.duration / 1000 + 0.35;
    const over = this.now() - end;
    if (over > 0.5) fs.appendFileSync(path.join(OUT_DIR, 'overruns.log'), `${beatId}: actions ran ${over.toFixed(1)}s past the narration\n`);
    while (this.now() < end) await sleep(20);
  }

  // A beat-less hold on camera (e.g. let a result sink in).
  async hold(ms) {
    if (!this.dry) await sleep(ms);
  }

  async offCamera(label, fn) {
    this.currentBeat = `offCamera:${label}`;
    this.pause();
    try {
      await fn();
      await this.settle();
    } catch (err) {
      await this.fail(this.currentBeat, err);
    }
    this.resume();
  }

  async chapter(title, ms = 2300) {
    await this.page.evaluate(([t, d]) => window.__demo.card(t, 'Zenop.ai onboarding', d), [title, ms]).catch(() => {});
  }

  async fail(label, err) {
    const file = path.join(OUT_DIR, `failed-${label.replace(/[^\w-]+/g, '_')}.png`);
    await this.page.screenshot({ path: file }).catch(() => {});
    // Nested offCamera/say both catch; only the innermost label is kept.
    if (!err.demoLabelled) {
      err.message = `[${label}] ${err.message.split('\n')[0]}\n  screenshot: ${file}`;
      err.stack = err.message;
      err.demoLabelled = true;
    }
    throw err;
  }

  // ── dialogs: native alerts are invisible to the screencast, so their text is shown in an overlay ──
  async onDialog(dialog) {
    const message = dialog.message();
    this.dialogs.push({ beat: this.currentBeat, type: dialog.type(), message });
    await dialog.accept().catch(() => {});
    const tone = /error|please|denied|required|must|⚠|❌/i.test(message) ? 'warn' : 'ok';
    setTimeout(() => this.page.evaluate(([m, t]) => window.__demo && window.__demo.alertCard(m, t, 5200), [message, tone]).catch(() => {}), 50);
  }

  lastDialog(match) {
    return [...this.dialogs].reverse().find((d) => !match || match.test(d.message));
  }

  // ── navigation & waiting ───────────────────────────────────
  async settle(p = this.page) {
    await p.waitForLoadState('domcontentloaded').catch(() => {});
    await p.waitForFunction(() => !document.querySelector('.animate-spin.h-12, .animate-spin.h-8'), null, { timeout: 60000 }).catch(() => {});
    await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await sleep(this.dry ? 100 : 350);
  }

  async goto(url) {
    const target = url.startsWith('http') ? url : `${APP_URL}${url}`;
    await this.page.goto(target, { waitUntil: 'domcontentloaded' });
    await this.settle();
    // The Vite dev server occasionally fails a lazy chunk ("Failed to fetch dynamically imported module"),
    // leaving a blank page; a reload always recovers.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rendered = await this.page.waitForFunction(() => document.body && document.body.innerText.replace(/Logged in as.*|Email link opened by.*/g, '').trim().length > 0, null, { timeout: 12000 }).then(() => true).catch(() => false);
      if (rendered) return;
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.settle();
    }
  }

  async setBadge(person, prefix) {
    await this.page.evaluate((b) => window.__demo && window.__demo.setBadge(b), person ? { name: person.name, role: person.role, prefix } : null);
  }

  // ── human-looking actions ──────────────────────────────────
  async box(locator) {
    await locator.waitFor({ state: 'visible' });
    await this.scrollIntoView(locator);
    const b = await locator.boundingBox();
    if (!b) throw new Error('element has no box');
    return b;
  }

  async scrollIntoView(locator) {
    const inView = await locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 70 && r.bottom <= window.innerHeight - 40;
    }).catch(() => true);
    if (inView) return;
    await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await sleep(this.dry ? 80 : 750);
  }

  async moveToPoint(x, y) {
    await this.page.evaluate(([px, py]) => window.__demo && window.__demo.moveTo(px, py), [x, y]);
    await this.page.mouse.move(x, y);
  }

  async scrollBy(dy) {
    await this.page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), dy);
    await sleep(this.dry ? 80 : 800);
  }

  async moveTo(locator, { dx = 0.5, dy = 0.5 } = {}) {
    const b = await this.box(locator);
    const x = b.x + b.width * dx;
    const y = b.y + b.height * dy;
    await this.page.evaluate(([px, py]) => window.__demo && window.__demo.moveTo(px, py), [x, y]);
    return { x, y };
  }

  // Retries cover clicks that land during a React re-render or before a list finishes loading.
  async click(locator, { dispatch = false, retries = 3, pauseAfter = 450 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        const target = locator.first();
        const { x, y } = await this.moveTo(target);
        await this.page.evaluate(([px, py]) => window.__demo && window.__demo.ripple(px, py), [x, y]);
        if (dispatch) await target.dispatchEvent('click');
        else await target.click({ timeout: 8000 });
        await sleep(this.dry ? 60 : pauseAfter);
        return;
      } catch (err) {
        lastErr = err;
        await sleep(500);
      }
    }
    throw lastErr;
  }

  async type(locator, text, { clear = true, fast = false } = {}) {
    await this.click(locator, { pauseAfter: 150 });
    const target = locator.first();
    if (clear) await target.fill('');
    if (this.dry) { await target.fill(text); return; }
    // Long text types a little faster so it doesn't drag behind the narration.
    const base = fast ? 22 : text.length > 30 ? 28 : 60;
    for (const ch of text) {
      await target.pressSequentially(ch);
      await sleep(base + Math.random() * base);
    }
    await sleep(250);
  }

  async select(locator, option) {
    await this.click(locator, { pauseAfter: 200 });
    await locator.first().selectOption(option);
    await this.page.keyboard.press('Escape').catch(() => {});
    await sleep(this.dry ? 50 : 350);
  }

  async hover(locator) {
    const { x, y } = await this.moveTo(locator.first());
    await locator.first().hover();
    await sleep(this.dry ? 50 : 500);
    const title = await locator.first().evaluate((el) => el.closest('[title]')?.getAttribute('title') || '').catch(() => '');
    if (title) await this.page.evaluate(([t, px, py]) => window.__demo && window.__demo.tooltip(t, px, py), [title, x, y]);
    return title;
  }

  // Cosmetic only: never fails the run.
  async highlight(locator, ms = 2400) {
    try {
      const b = await this.box(locator.first());
      await this.page.evaluate(([r, d]) => window.__demo && window.__demo.ring(r, d), [b, ms]);
    } catch {
      // ignore
    }
  }

  async dragTo(source, target, position) {
    const s = await this.moveTo(source);
    await this.page.evaluate(([px, py]) => window.__demo.ripple(px, py), [s.x, s.y]);
    const tb = await this.box(target);
    const tx = tb.x + position.x;
    const ty = tb.y + position.y;
    await this.page.evaluate(([px, py]) => window.__demo.moveTo(px, py), [tx, ty]);
    await source.dragTo(target, { targetPosition: position });
    await this.page.evaluate(([px, py]) => window.__demo.ripple(px, py), [tx, ty]);
    await sleep(this.dry ? 60 : 500);
  }
}
