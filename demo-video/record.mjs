// Records the onboarding walkthrough against the local demo workspace.
//   node record.mjs --dry   full speed, no capture, no waiting for narration; saves out/failed-<beat>.png on error
//   node record.mjs         records out/raw.mp4 + out/timeline.json for build-video.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Recorder } from './lib/recorder.mjs';
import { APP_URL, DEALS, DEMO_DIR, OUT_DIR, PEOPLE } from './lib/demo-env.mjs';
import { ensureServers } from './lib/servers.mjs';
import { apiLogin, dealUrl } from './lib/session.mjs';
import { BEATS, chapterTitle } from './narration.mjs';

const dry = process.argv.includes('--dry');
const durationsFile = path.join(DEMO_DIR, 'audio/durations.json');
if (!fs.existsSync(durationsFile)) throw new Error('Run "node tts.mjs" first');
const durations = JSON.parse(fs.readFileSync(durationsFile, 'utf8'));
const chapters = Object.fromEntries(BEATS.filter((b) => b.chapter).map((b) => [b.id, chapterTitle(b)]));

// Fresh demo data every run, from the cached config copy only (production is never contacted here).
const setup = spawnSync(process.execPath, [path.join(DEMO_DIR, 'setup-demo.mjs'), '--no-prod'], { stdio: 'inherit' });
if (setup.status !== 0) process.exit(1);
for (const f of fs.readdirSync(OUT_DIR)) if (/^failed-.*\.png$|^overruns\.log$|^page-errors\.log$/.test(f)) fs.rmSync(path.join(OUT_DIR, f));
await ensureServers();

const R = new Recorder({ dry, durations });
const sessions = {};
async function sessionFor(key) {
  sessions[key] ??= await apiLogin(PEOPLE[key].email);
  return sessions[key];
}

// Logged-in identity lives in localStorage; approvers and customers open links with no session at all.
async function actAs(key, url) {
  const p = R.page;
  if (!p.url().startsWith(APP_URL)) await R.goto('/');
  if (key && ['priya', 'jordan'].includes(key)) {
    const s = await sessionFor(key);
    await p.evaluate(({ token, user }) => { localStorage.setItem('cpq_token', token); localStorage.setItem('cpq_user', JSON.stringify(user)); }, s);
  } else {
    await p.evaluate(() => { localStorage.removeItem('cpq_token'); localStorage.removeItem('cpq_user'); });
  }
  await R.goto(url);
  const person = key ? PEOPLE[key] : null;
  const viaLink = key && !['priya', 'jordan'].includes(key);
  await R.setBadge(person, viaLink ? 'Email link opened by' : 'Logged in as');
}

const OUTBOX = path.join(OUT_DIR, 'outbox');
async function linkFor(toFragment, pattern, { after = 0, timeout = 30000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const files = fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX).sort().reverse() : [];
    for (const f of files) {
      if (Number(f.split('-')[0]) < after) continue;
      const mail = JSON.parse(fs.readFileSync(path.join(OUTBOX, f), 'utf8'));
      if (!JSON.stringify(mail.to).includes(toFragment)) continue;
      const m = (mail.html || mail.text || '').match(pattern);
      if (m) return m[0].replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${toFragment} matching ${pattern} in the outbox`);
}
const APPROVAL_LINK = /http:\/\/localhost:5273\/approval\/[^"'\s<>]+/;
const SIGN_LINK = /http:\/\/localhost:5273\/(?:sign\/[^"'\s<>]+|esign-inbox\?token=[^"'\s<>]+)/;

async function say(id, fn) {
  if (chapters[id]) await R.chapter(chapters[id]);
  await R.say(id, fn);
}

const page = () => R.page;
const btn = (name, opts = {}) => page().getByRole('button', { name, ...opts });
const ph = (text) => page().getByPlaceholder(text);

// ── reusable flows ──────────────────────────────────────────
// With a deal already active the app may open Configure directly; either way we end on Configure.
async function openDeal(deal, { onCamera = false } = {}) {
  await actAs('priya', dealUrl(deal));
  await btn('Use Deal Data').or(btn('Migrate options')).first().waitFor();
  if (onCamera) return;
  if (await btn('Use Deal Data').isVisible()) {
    await R.click(btn('Use Deal Data'));
    await R.settle();
  }
  // Configure keeps the previous quote's ticks for the session; the app clears them on a reload of /configure.
  await page().reload({ waitUntil: 'domcontentloaded' });
  await R.settle();
  await btn('Migrate options').waitFor();
}

async function pickMigrateOption(value) {
  const box = page().locator(`input[data-value="${value}"]`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await box.isVisible().catch(() => false))) await R.click(btn('Migrate options'));
    await box.waitFor({ timeout: 10000 });
    if (!(await box.isChecked())) await R.click(page().locator(`label:has(input[data-value="${value}"])`));
    await page().keyboard.press('Escape');
    await page().waitForTimeout(400);
    // The panel closes on Escape, so the trigger's label is the reliable check.
    if ((await btn('Migrate options').innerText()).trim() !== 'Select Combination') return;
  }
  throw new Error(`Migrate option ${value} did not stick`);
}

async function pickExhibit(search, rowText) {
  await R.type(ph('Search exhibits...'), search);
  await R.click(page().locator('button', { hasText: rowText }));
}

async function pickStartDate(ariaDay) {
  const field = page().locator('div.group', { hasText: 'Project Start Date' }).locator('span').filter({ hasText: /\d\d-\d\d-\d{4}|mm-dd-yyyy/ }).first();
  await R.click(field);
  const target = new Date(ariaDay);
  for (let i = 0; i < 12 && !(await btn(ariaDay, { exact: true }).isVisible()); i += 1) {
    const header = await page().locator('span', { hasText: /^[A-Z][a-z]+, \d{4}$/ }).first().innerText();
    await R.click(btn(new Date(`1 ${header.replace(',', '')}`) > target ? 'Previous month' : 'Next month'), { pauseAfter: 250 });
  }
  await R.click(btn(ariaDay, { exact: true }));
}

async function waitGenerated() {
  await page().getByText('Agreement Generated!').waitFor({ timeout: 180000 });
  await page().waitForTimeout(2500);
}

async function sendForApproval() {
  await R.click(btn('Send for Approval').first());
  await page().getByText('Select Team Lead to send this approval to').waitFor();
  await R.click(btn('Send for Approval').last());
  await page().waitForURL(/\/approval/, { timeout: 60000 });
  await R.settle();
}

async function approveViaLink(key, mailbox, after) {
  const link = await linkFor(mailbox, APPROVAL_LINK, { after });
  await actAs(key, link);
  await btn(/^Approve$/).first().waitFor({ timeout: 30000 });
}

function cardFor(text) {
  return page().locator('div.bg-white').filter({ hasText: text }).filter({ has: page().getByText('APPROVALS', { exact: false }) }).last();
}

async function searchApprovals(text) {
  await R.type(ph(/Search by deal/), text);
  await page().waitForTimeout(600);
}

// ── the video ───────────────────────────────────────────────
await R.start();
try {
  await R.offCamera('landing', async () => { await actAs(null, '/'); await R.setBadge(null); });

  await say('b01_welcome', async () => {
    await R.highlight(page().getByText(/Welcome to CloudFuze/).first(), 4000);
  });
  await say('b02_login', async () => {
    await R.click(page().getByRole('link', { name: 'Sign In' }).first());
    await R.settle();
    await R.highlight(btn(/Continue with Microsoft/), 5000);
  });

  // Chapter: one deal, start to finish
  await R.offCamera('northwind-deal', () => openDeal(DEALS.northwind, { onCamera: true }));
  await say('b03_deal', async () => {
    await R.highlight(page().getByText('Deal Information').first(), 2500);
    await R.hold(2500);
    await R.highlight(page().getByText('Contact & Company Information').first(), 3500);
    await R.hold(5000);
    await R.click(btn('Use Deal Data'));
    await R.settle();
  });
  await say('b04_configure_pick', async () => {
    await pickMigrateOption('multi-combination');
    await pickExhibit('Box to Microsoft', 'Box to Microsoft(OneDrive');
  });
  await say('b05_configure_numbers', async () => {
    await R.type(ph('Enter number of users'), '250');
    await R.type(ph('Enter number of instances'), '1');
    await R.type(ph('Enter data size in GB'), '1200');
    await R.type(ph('Enter duration'), '3');
    await R.highlight(page().getByText('Subtotal:').first(), 3000);
    await R.select(page().locator('select:has(option:text-is("Standard Plan"))'), { label: 'Standard Plan' });
  });
  await say('b06_discount', async () => {
    const discount = ph('Enter discount percentage');
    await R.highlight(discount, 2500);
    await R.hold(2500);
    await R.type(discount, '25');
    await page().keyboard.press('Tab');
    await R.highlight(page().getByText(/maximum discount is/i).first(), 4500);
    await R.hold(5500);
    await R.type(discount, '10');
    await page().keyboard.press('Tab');
  });
  await say('b07_quote', async () => {
    await R.click(btn('Select Standard'));
    await page().waitForURL(/\/quote/);
    await R.settle();
    await R.highlight(page().getByText('Template Selected').first(), 3000);
    await R.hold(2000);
    await R.highlight(page().locator('input[value="Northwind Logistics"]').first(), 2500);
  });
  await say('b08_dates_block', async () => {
    await R.click(btn(/Generate Agreement/));
    await R.hold(1200);
    await R.highlight(page().locator('div.group', { hasText: 'Project Start Date' }).first(), 4000);
    await R.hold(4500);
    await pickStartDate('1 December 2026');
    await R.highlight(page().locator('div.group', { hasText: 'Effective Date' }).first(), 2500);
  });
  await say('b09_generate', async () => {
    await R.click(btn(/Generate Agreement/));
  });
  await R.offCamera('generating', waitGenerated);
  await say('b09b_preview', async () => {
    const frame = page().locator('iframe').first();
    await R.moveTo(frame, { dx: 0.5, dy: 0.6 });
    for (let i = 0; i < 4; i += 1) { await page().mouse.wheel(0, 260); await R.hold(700); }
  });
  await say('b09c_redline', async () => {
    await R.highlight(btn(/Edit for RedLine/), 2500);
    await R.hold(2500);
    await R.click(btn(/Edit for RedLine/));
  });
  // The OnlyOffice editor (local container on :3003) takes a few seconds to load the DOCX.
  const editor = page().frameLocator('iframe[name="frameEditor"]');
  await R.offCamera('redline-load', async () => {
    await page().getByText('Editing agreement (Word editor)').waitFor({ timeout: 60000 });
    await editor.getByText(/Page 1 of/).waitFor({ timeout: 90000 });
    await page().waitForTimeout(1500);
    const gotIt = editor.getByRole('button', { name: 'Got it' }).or(editor.getByText('Got it', { exact: true }));
    if (await gotIt.first().isVisible().catch(() => false)) await gotIt.first().click();
  });
  await say('b09d_redline_editor', async () => {
    await R.highlight(editor.getByText('CloudFuze Purchase Agreement for').first(), 3500);
    await R.hold(1500);
    await R.highlight(editor.locator('#toolbar, .toolbar').first(), 3500);
    await R.hold(1500);
    await R.highlight(editor.getByText('File', { exact: true }).first(), 2000);
    await R.hold(1200);
    await R.highlight(page().getByTitle('Apply your edits and close the editor'), 2500);
    await R.hold(3000);
    await R.click(page().getByTitle('Close editor without applying'));
    await page().getByText('Editing agreement (Word editor)').waitFor({ state: 'hidden' });
  });
  await say('b10_send', async () => {
    await R.click(btn('Send for Approval').first());
    await page().getByText('Select Team Lead to send this approval to').waitFor();
    await R.highlight(page().locator('select').filter({ hasText: 'SMB' }).last(), 4000);
    await R.hold(4500);
    await R.highlight(page().getByText(/^Defaults:/).first(), 4000);
  });
  const sentAt = Date.now();
  await say('b10b_sent', async () => {
    await R.click(btn('Send for Approval').last());
    await page().waitForURL(/\/approval/, { timeout: 60000 });
    await R.settle();
    await R.highlight(page().getByText('Step 1 / 3').first(), 3000);
  });

  // Chapter: the hand-off
  await R.offCamera('marcus-link', () => approveViaLink('marcus', PEOPLE.marcus.email, sentAt));
  await say('b11_marcus', async () => {
    await R.hold(3500);
    await R.moveToPoint(960, 520);
    for (let i = 0; i < 3; i += 1) { await page().mouse.wheel(0, 240); await R.hold(500); }
    await R.click(btn(/^Approve$/));
    await R.hold(1500);
  });
  await R.offCamera('aisha-link', () => approveViaLink('aisha', 'cpq.zenop.ai.technical', sentAt));
  await say('b12_aisha', async () => {
    await R.hold(6000);
    await R.click(btn(/^Approve$/));
    await R.hold(1500);
  });
  await R.offCamera('daniel-link', () => approveViaLink('daniel', 'cpq.zenop.ai.legal', sentAt));
  await say('b13_daniel', async () => {
    await R.hold(1500);
    await R.click(btn(/^Approve$/));
    await R.hold(1500);
  });
  await R.offCamera('back-to-priya', async () => {
    await actAs('priya', '/approval');
    await page().getByText('NorthwindLogistics').first().waitFor();
  });
  await say('b14_back_to_priya', async () => {
    const card = cardFor('NorthwindLogistics');
    await R.highlight(card.getByText('APPROVALS').first(), 3500);
    await R.hover(card.getByText('Tech', { exact: true }).first());
    await R.hold(2500);
    await R.highlight(card.getByRole('button', { name: 'e-Sign' }), 3000);
  });

  // Chapter: getting it signed
  await R.click(cardFor('NorthwindLogistics').getByRole('button', { name: 'e-Sign' }));
  await R.offCamera('place-fields-load', async () => {
    await page().waitForURL(/place-fields/, { timeout: 60000 });
    await page().locator('canvas').first().waitFor();
  });
  await say('b15_recipients', async () => {
    for (const [person, role] of [[PEOPLE.tom, 'reviewer'], [PEOPLE.emma, 'signer']]) {
      await R.type(ph('Name'), person.name, { fast: true });
      await R.type(ph('Email'), person.email, { fast: true });
      // Signer is the default role, so only the reviewer needs changing.
      if (role !== 'signer') await R.select(page().locator('select').filter({ has: page().locator('option[value=reviewer]') }).last(), role);
      await R.click(btn(/Add recipient/));
      await page().waitForTimeout(800);
    }
  });
  await say('b16_checklist', async () => {
    await R.highlight(btn(/Review & Send/), 3000);
    await R.hold(1200);
    await R.click(page().getByText(PEOPLE.emma.email).first());
    // The customer's signature block ("For Northwind Logistics") is on page 3 of this agreement.
    await R.type(page().locator('#goto-page'), '3');
    await R.click(btn('Go', { exact: true }));
    await R.hold(700);
    const target = page().locator('[data-page="3"] canvas ~ div.absolute.inset-0').first();
    await R.scrollIntoView(target);
    // PDF points → CSS px: fields are centred on the drop point; the By and Date lines sit at x≈342pt, y≈221/311pt.
    const s = (await target.boundingBox()).width / 612;
    await R.dragTo(page().locator('div[draggable=true]', { hasText: 'Signature' }), target, { x: 395 * s, y: 210 * s });
    await R.dragTo(page().locator('div[draggable=true]', { hasText: 'Date' }), target, { x: 398 * s, y: 300 * s });
    if (process.env.DEBUG_SHOT) await page().screenshot({ path: 'out/debug-after-drop.png' });
  });
  const esignSentAt = Date.now();
  await say('b16b_send', async () => {
    await R.highlight(page().getByText(/Signature placed for each signer/).first(), 2000);
    await R.click(btn(/Review & Send/));
    await R.settle();
    const send = btn(/^Send/).last();
    if (await send.isVisible().catch(() => false)) await R.click(send);
    await page().getByText(/sent successfully/i).first().waitFor({ timeout: 60000 });
  });
  await R.offCamera('tom-link', async () => {
    const link = await linkFor(PEOPLE.tom.email, SIGN_LINK, { after: esignSentAt });
    await actAs('tom', link);
    await btn(/^Approve$/).first().waitFor({ timeout: 30000 });
  });
  await say('b17_waiting', async () => {
    await R.hold(1500);
    await R.click(btn(/^Approve$/).first());
    await R.hold(1500);
    await R.offCamera('priya-status', async () => {
      await actAs('priya', '/esign-tracking');
      await page().getByText(/Waiting for others/i).first().waitFor({ timeout: 30000 });
    });
    await R.highlight(page().getByText(/Waiting for others/i).first(), 4000);
    await R.hold(5500);
    const row = page().locator('tr').filter({ hasText: /Waiting for others/i }).first();
    await R.click(row.getByRole('button').last());
    await R.highlight(page().getByText('Send Reminder').first(), 3000);
    await R.hold(3000);
    await page().keyboard.press('Escape');
    await page().mouse.click(8, 880);
  });
  await R.offCamera('emma-link', async () => {
    const link = await linkFor(PEOPLE.emma.email, SIGN_LINK, { after: esignSentAt });
    await actAs('emma', link);
    await btn(/Approve & Sign/).waitFor({ timeout: 30000 });
    await R.click(btn(/Approve & Sign/));
    await page().getByText(/Sign Here/i).first().waitFor({ timeout: 30000 });
    await page().waitForFunction(() => !document.querySelector('.animate-spin'), null, { timeout: 30000 }).catch(() => {});
  });
  await say('b18_emma', async () => {
    // The signer page can re-fetch and drop back to its review screen; step back into signing if so.
    for (let attempt = 0; attempt < 3 && !(await page().getByText(/Sign Here/i).first().isVisible().catch(() => false)); attempt += 1) {
      if (await btn(/Approve & Sign/).isVisible().catch(() => false)) await R.click(btn(/Approve & Sign/));
      await page().getByText(/Sign Here/i).first().waitFor({ timeout: 10000 }).catch(() => {});
    }
    await R.click(page().getByText(/Sign Here/i).first());
    await page().getByText('Add your signature').waitFor();
    const typed = page().locator('input[type=text]').filter({ hasNot: page().locator('xx') }).last();
    if (!(await typed.inputValue().catch(() => ''))) await R.type(typed, PEOPLE.emma.name);
    await R.click(btn('Apply'));
    const date = page().locator('input[type=date]').first();
    await R.click(date);
    await date.fill(new Date().toISOString().slice(0, 10));
    await R.click(btn('Finish'));
    await page().getByText(/Signed Successfully|Completed/i).first().waitFor({ timeout: 60000 });
  });
  await R.offCamera('priya-completed', () => actAs('priya', '/esign-tracking'));
  await say('b19_completed', async () => {
    await R.click(btn(/^Completed/).first());
    await R.highlight(page().locator('tr').filter({ hasText: /Completed/ }).first(), 3000);
    await R.click(page().getByTitle(/View status/).first().or(btn(/View status/).first()));
    await R.highlight(page().getByText(/Download signed PDF/).first(), 4000);
  });
  await R.offCamera('close-status', async () => { await page().keyboard.press('Escape'); });

  // Chapter: rejection loop (Harbor Health). The quote itself is built off camera.
  let harborSent;
  await R.offCamera('harbor-quote', async () => {
    await openDeal(DEALS.harbor);
    await pickMigrateOption('multi-combination');
    await pickExhibit('Slack to Teams', 'Slack To Teams');
    await R.type(ph('Enter number of users'), '120');
    await R.type(ph('Enter number of instances'), '1');
    await R.type(page().getByPlaceholder(/messages/i).first(), '200000');
    await R.type(ph('Enter duration'), '2');
    await R.click(btn('Select Standard'));
    await page().waitForURL(/\/quote/);
    await R.settle();
    await pickStartDate('1 December 2026');
    await R.click(btn(/Generate Agreement/));
    await waitGenerated();
    harborSent = Date.now();
    await sendForApproval();
    await approveViaLink('marcus', PEOPLE.marcus.email, harborSent);
    await R.click(btn(/^Approve$/));
    await page().waitForTimeout(2500);
    await actAs('priya', '/approval');
    await searchApprovals('Harbor');
  });
  await say('b20_harbor_intro', async () => {
    const card = cardFor('HarborHealth');
    await R.highlight(card.getByText('APPROVALS').first(), 4000);
    await R.hold(4000);
    await R.highlight(card.getByText('Tech', { exact: true }).first(), 3000);
  });
  await R.offCamera('aisha-harbor', () => approveViaLink('aisha', 'cpq.zenop.ai.technical', harborSent));
  await say('b21_aisha_deny', async () => {
    await R.hold(3000);
    await R.click(btn(/^Deny$/).first());
    await page().getByText(/Provide Reason for Denial/i).waitFor();
    await R.hold(2500);
    await R.type(ph(/reason for denying/), 'Harbor has about 2 million Slack messages, not 200,000. Please re-quote.');
    await R.click(btn(/Save & Deny/));
    await R.hold(1500);
  });
  await R.offCamera('priya-rejected', async () => {
    await actAs('priya', '/approval');
    await searchApprovals('Harbor');
  });
  await say('b22_rejected', async () => {
    const card = cardFor('HarborHealth');
    await R.highlight(card.getByText(/Rejected|denied/i).first(), 3500);
    await R.hover(card.getByText('Tech', { exact: true }).first());
    await R.hold(4500);
    await R.highlight(card.getByText(/denied/i).first(), 3500);
    await R.hold(3500);
    await R.click(page().getByRole('link', { name: 'Configure' }));
    await R.settle();
    const messages = page().getByPlaceholder(/messages/i).first();
    await R.type(messages, '2000000');
  });
  await R.offCamera('harbor-requote', async () => {
    await R.click(btn('Select Standard'));
    await page().waitForURL(/\/quote/);
    await R.settle();
    await pickStartDate('1 December 2026');
    await R.click(btn(/Generate Agreement/));
    await waitGenerated();
    await sendForApproval();
    await searchApprovals('Harbor');
  });
  await say('b23_new_approval', async () => {
    await R.highlight(page().getByText('Step 1 / 3').first(), 4000);
  });

  // Chapter: overage shortcut (Brightline Media)
  let brightSent;
  await R.offCamera('brightline-deal', async () => {
    await openDeal(DEALS.brightline);
  });
  await say('b24_overage', async () => {
    await pickMigrateOption('overage-agreement');
    await R.settle();
    const instances = ph('Enter number of instances');
    if (await instances.isVisible().catch(() => false)) await R.type(instances, '2');
    const duration = ph('Enter duration');
    if (await duration.isVisible().catch(() => false)) await R.type(duration, '3');
    await R.highlight(page().locator('#pricing-comparison').first(), 2500);
  });
  await R.offCamera('brightline-send', async () => {
    await R.click(btn(/Select Overage/).first());
    await page().waitForURL(/\/quote/);
    await R.settle();
    await pickStartDate('1 December 2026');
    await R.click(btn(/Generate Agreement/));
    await waitGenerated();
    brightSent = Date.now();
    await sendForApproval();
    await approveViaLink('marcus', PEOPLE.marcus.email, brightSent);
  });
  await say('b25_skip', async () => {
    await R.click(btn(/^Approve$/));
    await R.hold(2000);
    await R.offCamera('priya-brightline', async () => {
      // The skip is applied server-side just after Marcus's approval; reload until the card shows it.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await actAs('priya', '/approval');
        await searchApprovals('Brightline');
        const title = await cardFor('Brightline').getByText('Tech', { exact: true }).first()
          .evaluate((el) => el.closest('[title]')?.getAttribute('title') || '').catch(() => '');
        if (/skipped/i.test(title)) return;
        await page().waitForTimeout(1500);
      }
    });
    const tip = await R.hover(cardFor('Brightline').getByText('Tech', { exact: true }).first());
    if (!/skipped/i.test(tip)) throw new Error(`Tech tooltip doesn't mention the overage skip: "${tip}"`);
    await R.hold(4000);
  });

  // Chapter: several migrations in one quote (Lakeside Bank). Configure only; nothing is sent.
  const tick = async (value) => {
    await R.click(page().locator(`label:has(input[data-value="${value}"])`), { pauseAfter: 900 });
    if (!(await page().locator(`input[data-value="${value}"]`).isChecked())) throw new Error(`${value} did not tick`);
  };
  await R.offCamera('lakeside-deal', () => openDeal(DEALS.lakeside));
  await say('b25a_combine_pick', async () => {
    await R.hold(3500);
    await R.click(btn('Migrate options'));
    await R.highlight(page().getByText('Tick one or more').first(), 3000);
    await R.hold(1500);
    for (const value of ['multi-combination', 'overage-agreement', 'data-sprawl']) await tick(value);
    await page().keyboard.press('Escape');
    await R.highlight(btn('Migrate options'), 3500);
  });
  await say('b25b_combine_sections', async () => {
    await pickExhibit('Box to Microsoft', 'Box to Microsoft(OneDrive');
    await R.type(ph('Enter duration'), '3');
    const sprawl = page().locator('[data-section="multi-data-sprawl"]');
    await R.highlight(sprawl.getByText('Data Sprawl').first(), 2500);
    await R.type(sprawl.getByPlaceholder('Search exhibits...'), 'Content Sprawl Box');
    await R.click(sprawl.locator('button', { hasText: 'Content Sprawl Box' }));
    const overage = page().locator('[data-section="overage-add-on"]');
    await R.type(overage.locator('#overage-add-on-instances'), '2');
    await R.highlight(overage.getByText(/Duration \(Months\) entered above/).first(), 4000);
  });
  await say('b25c_combine_rules', async () => {
    await R.click(btn('Migrate options'));
    await R.hold(3500);
    await tick('diy');
    await R.hold(1500);
    for (const value of ['multi-combination', 'overage-agreement', 'data-sprawl']) {
      if (await page().locator(`input[data-value="${value}"]`).isChecked()) throw new Error(`DIY left ${value} ticked`);
    }
    await page().keyboard.press('Escape');
    await R.highlight(btn('Migrate options'), 3000);
  });

  // Chapter: your day
  await R.offCamera('your-day', async () => {
    await R.goto('/approval');
    await R.setBadge(PEOPLE.priya, 'Logged in as');
  });
  await say('b26_approval_tab', async () => {
    await R.hold(2500);
    await R.highlight(page().getByText('All Approvals', { exact: false }).first().locator('..').locator('..'), 3000);
    await R.click(page().getByText('Pending Approvals', { exact: false }).first());
    await R.hold(1500);
    await R.click(page().getByText('All approvals', { exact: true }).first()).catch(() => {});
    await R.select(page().locator('select').filter({ hasText: 'All requesters' }), { label: 'Priya Raman' });
  });
  await say('b27_waiting_times', async () => {
    const card = cardFor('Fabrikam Retail');
    await R.highlight(card.getByText(/waiting/).first(), 4500);
    await R.hold(5500);
    await R.click(card.getByRole('button').last());
    await R.highlight(page().getByText('Reminder', { exact: true }).first(), 3000);
    await R.hold(3000);
    await page().keyboard.press('Escape');
    await page().mouse.click(8, 880);
  });
  await say('b28_esign_tab', async () => {
    await R.click(page().getByRole('link', { name: 'e sign status' }));
    await R.settle();
    await R.click(btn(/^Completed/).first());
    await R.click(btn(/^Pending/).first());
    await R.click(btn(/^All/).first());
  });

  // Chapter: rules of the road
  await R.offCamera('recap', async () => { await R.goto('/approval'); });
  await say('b29_recap', async () => {
    const cues = durations.b29_recap.cues.slice(1).map((c) => c.start);
    const items = ['Start from the HubSpot deal', 'Keep discounts within the cap', 'Project Start Date after the Effective Date', 'Read the agreement before you send it', 'Approvers: always say why you deny'];
    await page().evaluate(([list, times, speedUp]) => window.__demo.recap('Five things to remember', list, times.map((t) => t / speedUp)), [items, cues, dry ? 20 : 1]);
  });
  await say('b30_outro', async () => {
    await page().evaluate(() => window.__demo.recap(null));
    await R.highlight(page().getByText('Help / Contact Us').first(), 4000);
    await R.hold(5000);
  });
  await R.chapter('Welcome aboard', 2500);
} finally {
  await R.stop().catch(() => {});
  const report = { dialogs: R.dialogs, reroutes: R.reroutes, videoSeconds: R.now() };
  fs.writeFileSync(path.join(OUT_DIR, dry ? 'dry-report.json' : 'record-report.json'), JSON.stringify(report, null, 2));
  if (R.reroutes.length) console.log(`Rerouted ${R.reroutes.length} request(s) away from the developer's live servers`);
}
console.log(dry ? 'Dry run passed.' : `Recorded ${R.now().toFixed(1)}s → out/raw.mp4`);
