// Live UI exploration used to verify APP_MODEL.md and find selectors. Not part of the video build.
// node lib/explore.mjs <flowName>   (flows defined below; each starts from a fresh, logged-in browser)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { APP_URL, DEALS, OUT_DIR, PEOPLE } from './demo-env.mjs';
import { apiLogin, dealUrl, guardContext, sessionInitScript } from './session.mjs';

const shots = path.join(OUT_DIR, 'explore');
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await guardContext(context, (from, to) => console.log(`REROUTED ${from} -> ${to}`));
const page = await context.newPage();
page.on('dialog', async (d) => { console.log(`DIALOG(${d.type()}): ${d.message().slice(0, 300)}`); await d.accept(); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

const who = process.argv[3] || 'priya';
await context.addInitScript(sessionInitScript(await apiLogin(PEOPLE[who].email)));

export async function ready(p = page) {
  await p.waitForLoadState('domcontentloaded');
  await p.waitForFunction(() => !document.querySelector('.animate-spin.h-12, .animate-spin.h-8'), null, { timeout: 60000 }).catch(() => {});
  await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(400);
}

let n = 0;
async function snap(name, full = false) {
  await ready();
  n += 1;
  const base = path.join(shots, `${String(n).padStart(2, '0')}-${name}`);
  await page.screenshot({ path: `${base}.png`, fullPage: full });
  fs.writeFileSync(`${base}.txt`, (await page.locator('body').innerText()).replace(/\n{2,}/g, '\n'));
  console.log(`snap ${base}.png  ${page.url()}`);
}
const go = async (p) => { await page.goto(p.startsWith('http') ? p : `${APP_URL}${p}`, { waitUntil: 'domcontentloaded' }); await ready(); };

const flows = {
  async pages() {
    await go('/signin'); await snap('signin');
    await go('/approval'); await snap('approval', true);
    await go('/esign-tracking'); await snap('esign-status', true);
  },
  async configure() {
    await go(dealUrl(DEALS.northwind)); await snap('deal');
    await page.getByRole('button', { name: 'Use Deal Data' }).click(); await ready();
    await page.getByRole('button', { name: 'Migrate options' }).click(); await snap('migrate-open');
    await page.locator('input[data-value]').first().check();
    await page.keyboard.press('Escape'); await ready();
    await page.getByPlaceholder('Search exhibits...').fill('Box to Microsoft');
    await page.waitForTimeout(800);
    await page.locator('button', { hasText: 'Box to Microsoft(OneDrive' }).first().click();
    await page.getByPlaceholder('Search exhibits...').fill('Slack to Teams');
    await page.waitForTimeout(800);
    await snap('exhibit-slack-search');
    await page.getByPlaceholder('Search exhibits...').fill('');
    await snap('after-exhibit', true);
    const html = await page.locator('form').first().evaluate((f) => [...f.querySelectorAll('input,select,label')].map((e) => `${e.tagName} ${e.getAttribute('type') || ''} name=${e.getAttribute('name') || ''} ph=${e.getAttribute('placeholder') || ''} id=${e.id} text=${(e.innerText || '').slice(0, 60)} opts=${e.tagName === 'SELECT' ? [...e.options].map((o) => o.text).join('|') : ''}`).join('\n'));
    fs.writeFileSync(path.join(shots, 'form-fields.txt'), html);
  },
  async combine() {
    await go(dealUrl(DEALS.northwind));
    await page.getByRole('button', { name: 'Use Deal Data' }).click(); await ready();
    const tick = async (value) => {
      if (!(await page.locator(`input[data-value="${value}"]`).isVisible())) await page.getByRole('button', { name: 'Migrate options' }).click();
      await page.locator(`label:has(input[data-value="${value}"])`).click();
      await page.keyboard.press('Escape'); await ready();
    };
    await tick('multi-combination'); await snap('combine-multi', true);
    await tick('overage-agreement'); await snap('combine-multi-overage', true);
    await tick('data-sprawl'); await snap('combine-all-three', true);
    await page.getByRole('button', { name: 'Migrate options' }).click(); await snap('combine-list');
    await page.keyboard.press('Escape');
    fs.writeFileSync(path.join(shots, 'combine-fields.txt'), await page.locator('body').evaluate((b) => [...b.querySelectorAll('input,select,[data-section],h2,h3')].map((e) => `${e.tagName} ph=${e.getAttribute('placeholder') || ''} sec=${e.getAttribute('data-section') || ''} id=${e.id} text=${(e.innerText || '').slice(0, 80).replace(/\n/g, ' ')}`).join('\n')));
    await tick('diy'); await snap('combine-diy');
  },
  async quote() {
    await flows.configure();
    await page.getByPlaceholder('Enter number of users').fill('250');
    await page.getByPlaceholder('Enter number of instances').fill('1');
    await page.getByPlaceholder('Enter data size in GB').fill('1200');
    await page.getByPlaceholder('Enter duration').fill('3');
    await page.locator('select:has(option:text-is("Standard Plan"))').first().selectOption({ label: 'Standard Plan' });
    await page.getByPlaceholder('Enter discount percentage').fill('25');
    await page.getByPlaceholder('Enter discount percentage').blur();
    await snap('discount-capped');
    await page.getByPlaceholder('Enter discount percentage').fill('10');
    await page.getByPlaceholder('Enter discount percentage').blur();
    await snap('configured', true);
    await page.getByRole('button', { name: 'Proceed with Custom Plan Selection' }).click();
    await snap('quote', true);
    await page.getByRole('button', { name: /Generate Agreement/ }).click();
    await page.waitForTimeout(1500);
    await snap('generate-blocked');
  },
  async generate() {
    await flows.quote();
    const pick = async (label, aria) => {
      const field = page.locator('div.group', { hasText: label }).locator('span').filter({ hasText: /\d\d-\d\d-\d{4}|mm-dd-yyyy/ }).first();
      await field.click();
      const target = new Date(aria);
      for (let i = 0; i < 12 && !(await page.getByRole('button', { name: aria, exact: true }).isVisible()); i += 1) {
        const header = await page.locator('span', { hasText: /^[A-Z][a-z]+, \d{4}$/ }).first().innerText();
        const shown = new Date(`1 ${header.replace(',', '')}`);
        await page.getByRole('button', { name: target < shown ? 'Previous month' : 'Next month' }).click();
      }
      await page.getByRole('button', { name: aria, exact: true }).click();
    };
    await pick('Project Start Date', '1 December 2026');
    await snap('dates-set');
    const t0 = Date.now();
    await page.getByRole('button', { name: /Generate Agreement/ }).click();
    await page.getByText('Agreement Generated!').waitFor({ timeout: 180000 });
    console.log(`generation took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await snap('generated');
    await page.getByRole('button', { name: 'Send for Approval' }).first().click();
    await snap('send-modal');
    await page.locator('select').filter({ hasText: 'SMB' }).last().selectOption({ index: 1 }).catch((e) => console.log('select team:', e.message));
    await snap('send-modal-team');
  },
  async redline() {
    await flows.quote();
    const field = page.locator('div.group', { hasText: 'Project Start Date' }).locator('span').filter({ hasText: /\d\d-\d\d-\d{4}|mm-dd-yyyy/ }).first();
    await field.click();
    for (let i = 0; i < 12 && !(await page.getByRole('button', { name: '1 December 2026', exact: true }).isVisible()); i += 1) {
      await page.getByRole('button', { name: 'Next month' }).click();
    }
    await page.getByRole('button', { name: '1 December 2026', exact: true }).click();
    await page.getByRole('button', { name: /Generate Agreement/ }).click();
    await page.getByText('Agreement Generated!').waitFor({ timeout: 180000 });
    await page.waitForTimeout(2500);
    const t0 = Date.now();
    await page.getByRole('button', { name: /Edit for RedLine/ }).click();
    await page.getByText('Editing agreement (Word editor)').waitFor({ timeout: 60000 });
    const editor = page.frameLocator('iframe').first();
    await editor.locator('#id_main_view, #editor_sdk').first().waitFor({ timeout: 90000 }).catch((e) => console.log('editor frame:', e.message.split('\n')[0]));
    await page.waitForTimeout(6000);
    console.log(`editor took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await snap('redline-editor');
    console.log('frames:', page.frames().map((f) => f.url().slice(0, 100)).join(' | '));
  },
  async approve() {
    await flows.generate();
    await page.getByRole('button', { name: 'Send for Approval' }).last().click();
    await page.waitForURL(/\/approval/, { timeout: 60000 });
    await snap('approval-after-send', true);
    const outbox = path.join(OUT_DIR, 'outbox');
    const latestLink = (to) => {
      const files = fs.readdirSync(outbox).sort().reverse();
      for (const f of files) {
        const m = JSON.parse(fs.readFileSync(path.join(outbox, f), 'utf8'));
        const rcpt = JSON.stringify(m.to);
        if (!rcpt.includes(to)) continue;
        const link = (m.html || m.text || '').match(/https?:\/\/localhost:5273\/approval\/[^"'\s<]+/);
        console.log(`email to ${to}: "${m.subject}" link=${link && link[0]}`);
        return link && link[0].replace(/&amp;/g, '&');
      }
      return null;
    };
    for (const [who, mailbox, heading] of [
      ['marcus', PEOPLE.marcus.email, 'Team Lead'],
      ['aisha', 'cpq.zenop.ai.technical', 'Technical'],
      ['daniel', 'cpq.zenop.ai.legal', 'Legal'],
    ]) {
      const link = latestLink(mailbox);
      if (!link) { console.log(`no link for ${who}`); break; }
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      await guardContext(ctx);
      const p = await ctx.newPage();
      p.on('dialog', async (d) => { console.log(`DIALOG[${who}](${d.type()}): ${d.message().slice(0, 200)}`); await d.accept(); });
      await p.goto(link, { waitUntil: 'domcontentloaded' });
      await ready(p);
      await p.waitForTimeout(2500);
      await p.screenshot({ path: path.join(shots, `portal-${who}.png`) });
      fs.writeFileSync(path.join(shots, `portal-${who}.txt`), await p.locator('body').innerText());
      await p.getByRole('button', { name: /^Approve$/ }).first().click();
      await p.waitForTimeout(4000);
      await p.screenshot({ path: path.join(shots, `portal-${who}-after.png`) });
      console.log(`${heading} approved`);
      await ctx.close();
    }
    await go('/approval'); await snap('approval-after-chain', true);
  },
  async esign() {
    await go('/approval');
    await page.getByPlaceholder(/Search by deal/).fill('Northwind');
    await page.waitForTimeout(800);
    await snap('approval-search');
    await page.getByRole('button', { name: 'e-Sign' }).first().click();
    await page.waitForURL(/place-fields/, { timeout: 60000 });
    await snap('place-fields');
    for (const [name, email, role] of [['Tom Reyes', PEOPLE.tom.email, 'reviewer'], ['Emma Clarke', PEOPLE.emma.email, 'signer']]) {
      await page.getByPlaceholder('Name', { exact: true }).fill(name);
      await page.getByPlaceholder('Email', { exact: true }).fill(email);
      await page.locator('select').filter({ has: page.locator('option[value=reviewer]') }).last().selectOption(role);
      await page.getByRole('button', { name: /Add recipient/ }).click();
      await page.waitForTimeout(1200);
    }
    await snap('recipients-added');
    const dropTarget = page.locator('[class*="relative"]').filter({ has: page.locator('canvas') }).last();
    await page.getByText('Emma Clarke').first().click();
    await page.locator('div[draggable=true]', { hasText: 'Signature' }).dragTo(dropTarget, { targetPosition: { x: 500, y: 700 } });
    await page.waitForTimeout(1000);
    await page.locator('div[draggable=true]', { hasText: 'Date' }).dragTo(dropTarget, { targetPosition: { x: 500, y: 760 } });
    await page.waitForTimeout(1000);
    await snap('fields-placed');
    fs.writeFileSync(path.join(shots, 'place-fields-dom.txt'), await page.locator('aside, [class*="sidebar"]').first().innerText().catch(() => ''));
  },
};
await flows[process.argv[2] || 'pages']();
await browser.close();
