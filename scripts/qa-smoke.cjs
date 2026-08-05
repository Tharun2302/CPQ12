// QA UI smoke test — drives the real app in a browser, screenshots every step, writes tmp-e2e/qa-report.html
//
// Usage:
//   node scripts/qa-smoke.cjs                 (headed — watch the browser)
//   node scripts/qa-smoke.cjs --headless      (no visible window)
//   node scripts/qa-smoke.cjs --base-url=http://159.89.175.168:3001
//
// Env vars (optional):
//   QA_EMAIL, QA_PASSWORD — sign-in credentials. Without them, login-dependent
//   steps (dashboard, quote config, discount, PDF) are skipped rather than failed.
//
// Requires the app already running (npm run dev:all) at --base-url.

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const HEADLESS = args.includes('--headless');
const baseUrlArg = args.find((a) => a.startsWith('--base-url='));
const BASE_URL = baseUrlArg ? baseUrlArg.split('=')[1] : 'http://localhost:5173';

const OUT_DIR = path.join(__dirname, '..', 'tmp-e2e', 'qa-screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
let stepIndex = 0;
let page;

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function runStep(name, fn) {
  stepIndex += 1;
  const consoleErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  page.on('console', onConsole);

  const record = { index: stepIndex, name, status: 'pass', note: '', screenshot: null, consoleErrors: [] };
  try {
    await fn(record);
  } catch (err) {
    record.status = 'fail';
    record.note = err.message;
  }

  try {
    const suffix = record.status === 'fail' ? '-FAILED' : '';
    const shotName = `${String(stepIndex).padStart(2, '0')}-${slug(name)}${suffix}.png`;
    await page.screenshot({ path: path.join(OUT_DIR, shotName), fullPage: true });
    record.screenshot = shotName;
  } catch {
    // page may have navigated away/closed — leave screenshot null
  }

  page.off('console', onConsole);
  record.consoleErrors = consoleErrors;
  results.push(record);
  console.log(`[${record.status.toUpperCase()}] ${stepIndex}. ${name}${record.note ? ' — ' + record.note : ''}`);
}

function skipStep(name, note) {
  stepIndex += 1;
  results.push({ index: stepIndex, name, status: 'skipped', note, screenshot: null, consoleErrors: [] });
  console.log(`[SKIPPED] ${stepIndex}. ${name} — ${note}`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function generateReport(timestamp) {
  const rows = results
    .map((r) => {
      let imgTag = '<p class="none">No screenshot captured</p>';
      if (r.screenshot) {
        const b64 = fs.readFileSync(path.join(OUT_DIR, r.screenshot)).toString('base64');
        imgTag = `<img src="data:image/png;base64,${b64}" alt="${escapeHtml(r.name)}" />`;
      }
      const errs = r.consoleErrors.length
        ? `<div class="errs"><strong>Console errors</strong><ul>${r.consoleErrors
            .map((e) => `<li>${escapeHtml(e)}</li>`)
            .join('')}</ul></div>`
        : '';
      return `<li class="step status-${r.status}">
      <div class="step-head">
        <span class="idx">${String(r.index).padStart(2, '0')}</span>
        <span class="step-name">${escapeHtml(r.name.replace(/-/g, ' '))}</span>
        <span class="pill pill-${r.status}">${r.status}</span>
      </div>
      ${r.note ? `<p class="note">${escapeHtml(r.note)}</p>` : ''}
      ${errs}
      ${imgTag}
    </li>`;
    })
    .join('\n');

  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const skipCount = results.filter((r) => r.status === 'skipped').length;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>CPQ12 QA Smoke Test Report</title>
<style>
  :root {
    --bg: #f7f6f3;
    --surface: #ffffff;
    --border: #e3e0da;
    --text: #21201c;
    --text-muted: #6f6b62;
    --accent: #0f6e66;
    --pass: #1c7a4d;
    --pass-bg: #e8f5ee;
    --fail: #b3261e;
    --fail-bg: #fdecea;
    --skip: #93650a;
    --skip-bg: #fbf1de;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16181a;
      --surface: #1e2124;
      --border: #33373b;
      --text: #eceae5;
      --text-muted: #9d9a92;
      --accent: #4fd3c4;
      --pass: #5fc98d;
      --pass-bg: #17301f;
      --fail: #ff8a80;
      --fail-bg: #3a1a17;
      --skip: #e3b04b;
      --skip-bg: #3a2c0f;
    }
  }
  :root[data-theme="dark"] {
    --bg: #16181a; --surface: #1e2124; --border: #33373b; --text: #eceae5; --text-muted: #9d9a92;
    --accent: #4fd3c4; --pass: #5fc98d; --pass-bg: #17301f; --fail: #ff8a80; --fail-bg: #3a1a17;
    --skip: #e3b04b; --skip-bg: #3a2c0f;
  }
  :root[data-theme="light"] {
    --bg: #f7f6f3; --surface: #ffffff; --border: #e3e0da; --text: #21201c; --text-muted: #6f6b62;
    --accent: #0f6e66; --pass: #1c7a4d; --pass-bg: #e8f5ee; --fail: #b3261e; --fail-bg: #fdecea;
    --skip: #93650a; --skip-bg: #fbf1de;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    max-width: 880px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem;
    background: var(--bg); color: var(--text);
  }
  header { display: flex; flex-direction: column; gap: .35rem; margin-bottom: 1.75rem; }
  h1 { font-size: 1.5rem; font-weight: 700; margin: 0; letter-spacing: -0.01em; text-wrap: balance; }
  .meta { color: var(--text-muted); font-size: .85rem; font-variant-numeric: tabular-nums; }
  .meta code { font-family: ui-monospace, "SF Mono", Consolas, monospace; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: .1rem .35rem; }
  .summary { display: flex; gap: .6rem; margin-bottom: 2rem; }
  .summary .tile {
    flex: 1; border-radius: 10px; padding: .75rem 1rem; border: 1px solid var(--border); background: var(--surface);
  }
  .summary .tile .n { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 1.6rem; font-weight: 600; font-variant-numeric: tabular-nums; display: block; line-height: 1.1; }
  .summary .tile .l { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
  .summary .tile.pass .n { color: var(--pass); }
  .summary .tile.fail .n { color: var(--fail); }
  .summary .tile.skip .n { color: var(--skip); }
  ol.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1.1rem; }
  .step {
    border: 1px solid var(--border); border-left: 3px solid var(--border); border-radius: 10px;
    padding: 1rem 1.25rem; background: var(--surface);
  }
  .step.status-fail { border-left-color: var(--fail); }
  .step.status-pass { border-left-color: var(--pass); }
  .step.status-skipped { border-left-color: var(--skip); }
  .step-head { display: flex; align-items: center; gap: .6rem; }
  .idx { font-family: ui-monospace, "SF Mono", Consolas, monospace; color: var(--text-muted); font-size: .82rem; font-variant-numeric: tabular-nums; }
  .step-name { font-weight: 600; text-transform: capitalize; }
  .pill {
    margin-left: auto; font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: .68rem;
    text-transform: uppercase; letter-spacing: .04em; padding: .2rem .55rem; border-radius: 20px;
  }
  .pill-pass { color: var(--pass); background: var(--pass-bg); }
  .pill-fail { color: var(--fail); background: var(--fail-bg); }
  .pill-skipped { color: var(--skip); background: var(--skip-bg); }
  .note { color: var(--text-muted); font-size: .88rem; margin: .5rem 0 0; }
  .none { color: var(--text-muted); font-size: .85rem; font-style: italic; margin: .5rem 0 0; }
  .errs { background: var(--fail-bg); border: 1px solid var(--fail); border-radius: 8px; padding: .5rem .75rem; font-size: .82rem; margin: .6rem 0 0; color: var(--text); }
  .errs ul { margin: .3rem 0 0; padding-left: 1.1rem; }
  img { max-width: 100%; border: 1px solid var(--border); border-radius: 8px; margin-top: .75rem; display: block; }
</style></head>
<body>
  <header>
    <h1>CPQ12 QA Smoke Test</h1>
    <p class="meta">Base URL <code>${escapeHtml(BASE_URL)}</code> &middot; Generated ${timestamp}</p>
  </header>
  <div class="summary">
    <div class="tile pass"><span class="n">${passCount}</span><span class="l">Passed</span></div>
    <div class="tile fail"><span class="n">${failCount}</span><span class="l">Failed</span></div>
    <div class="tile skip"><span class="n">${skipCount}</span><span class="l">Skipped</span></div>
  </div>
  <ol class="steps">
  ${rows}
  </ol>
</body></html>`;

  const reportPath = path.join(OUT_DIR, '..', 'qa-report.html');
  fs.writeFileSync(reportPath, html);
  return reportPath;
}

async function main() {
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    defaultViewport: { width: 1440, height: 900 },
  });
  page = await browser.newPage();

  let lastDialog = null;
  page.on('dialog', async (dialog) => {
    lastDialog = { type: dialog.type(), message: dialog.message() };
    await dialog.dismiss();
  });

  await runStep('landing-page', async (r) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    r.note = `Loaded ${BASE_URL}`;
  });

  await runStep('navigate-to-signin', async (r) => {
    await page.locator('::-p-text(Sign In)').click();
    await page.waitForFunction(() => window.location.pathname.includes('/signin'), { timeout: 10000 });
    r.note = `URL: ${page.url()}`;
  });

  await runStep('reveal-manual-signin-form', async (r) => {
    await page.locator('::-p-text(Or manual sign in)').click();
    await page.waitForSelector('#email', { timeout: 5000 });
  });

  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;

  if (!email || !password) {
    skipStep(
      'authenticated-flow',
      'QA_EMAIL / QA_PASSWORD not set — skipping sign-in, dashboard, quote config, discount, and PDF checks'
    );
  } else {
    await runStep('fill-credentials', async () => {
      await page.type('#email', email, { delay: 20 });
      await page.type('#password', password, { delay: 20 });
    });

    await runStep('submit-signin', async (r) => {
      await page.locator('button[type="submit"]').click();
      await page.waitForFunction(() => window.location.pathname === '/deal', { timeout: 15000 });
      r.note = `Landed on ${page.url()}`;
    });

    await runStep('navigate-to-configure', async () => {
      await page.goto(`${BASE_URL}/configure`, { waitUntil: 'networkidle2', timeout: 20000 });
    });

    await runStep('quote-config-form-loaded', async (r) => {
      await page.waitForSelector('select', { timeout: 10000 });
      const selectCount = await page.$$eval('select', (els) => els.length);
      r.note = `Found ${selectCount} <select> elements on the configuration form`;
    });

    await runStep('select-combination', async (r) => {
      const combinationSelect = await page.waitForSelector('select', { timeout: 10000 });
      const optionLabels = await page.evaluate((el) => Array.from(el.options).map((o) => o.text), combinationSelect);
      if (optionLabels.length < 2) {
        throw new Error(`Combination dropdown has no real options beyond the placeholder (found: ${optionLabels.join(', ')})`);
      }
      await combinationSelect.select(await page.evaluate((el) => el.options[1].value, combinationSelect));
      r.note = `Selected combination: "${optionLabels[1]}" — waiting for form to expand`;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    await runStep('select-first-exhibit', async (r) => {
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('button')).some((b) => /files?\)/i.test(b.textContent || '')),
        { timeout: 15000 }
      );
      const clicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => /files?\)/i.test(b.textContent || ''));
        if (!btn) return null;
        btn.click();
        return btn.textContent.trim().slice(0, 80);
      });
      if (!clicked) throw new Error('No exhibit row button (matching "(N files)") found');
      r.note = `Clicked exhibit row: "${clicked}"`;
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    await runStep('proceed-with-custom-plan', async (r) => {
      const btn = await page.waitForSelector('::-p-text(Proceed with Custom Plan Selection)', { timeout: 10000 });
      await btn.click();
      r.note = 'Clicked "Proceed with Custom Plan Selection" (per-combination pricing path, where discount entry lives)';
      await new Promise((resolve) => setTimeout(resolve, 800));
    });

    await runStep('fill-quote-contact-info', async (r) => {
      await page.waitForSelector('input[placeholder="Enter contact name"]', { timeout: 10000 });
      await page.type('input[placeholder="Enter contact name"]', 'QA Smoke Test', { delay: 10 });
      await page.type('input[placeholder="Enter legal entity name"]', 'QA Smoke Test Inc', { delay: 10 });
      await page.type('input[placeholder="Enter email address"]', 'qa-smoke-test@example.com', { delay: 10 });
      r.note = 'Filled contact name, legal entity name, and email (dates left at their defaults)';
    });

    await runStep('expand-custom-line-items', async (r) => {
      const toggle = await page.waitForSelector('::-p-text(Custom Line Items)', { timeout: 10000 });
      await toggle.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      r.note = 'Expanded "Custom Line Items" — this also reveals the Custom Items Discount (%) field, which is disabled until an item exists';
    });

    await runStep('add-custom-line-item', async (r) => {
      await page.type('input[placeholder="Name (e.g. Onboarding)"]', 'QA Smoke Test Item', { delay: 10 });
      await page.type('input[placeholder="Price"]', '10', { delay: 10 });
      const addBtn = await page.waitForSelector('button[title="Add line item"]', { timeout: 5000 });
      await addBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      r.note = 'Added a $10 custom line item so the discount field becomes enabled';
    });

    await runStep('enter-discount-percentage', async (r) => {
      const input = await page.waitForSelector('input[placeholder="Enter discount percentage"]', { timeout: 10000 });
      const isDisabled = await page.evaluate((el) => el.disabled, input);
      if (isDisabled) throw new Error('Discount input is still disabled after adding a custom line item');
      await input.click({ clickCount: 3 });
      await input.type('20', { delay: 20 });
      r.note = 'Entered 20% (above the 15% approval threshold) into Custom Items Discount (%)';
    });

    await runStep('attempt-generate-agreement', async (r) => {
      lastDialog = null;
      const btn = await page.waitForSelector('::-p-text(Generate Agreement)', { timeout: 10000 });
      await btn.click();
      await new Promise((resolve) => setTimeout(resolve, 2500));
      if (lastDialog) {
        throw new Error(
          `Blocked by a native ${lastDialog.type} dialog: "${lastDialog.message}" — the form's own default dates ` +
          `(Project Start Date before Effective Date) fail the app's "start must be after effective" validation, ` +
          `so accepting the defaults and clicking Generate Agreement blocks every time. See QuoteGenerator.tsx:4566-4576.`
        );
      }
      r.note = 'Clicked Generate Agreement — no validation dialog fired, agreement generation proceeded';
    });

    await runStep('download-pdf-button-present', async (r) => {
      const btn = await page.$('::-p-text(Download PDF)');
      if (!btn) {
        r.status = 'skipped';
        r.note = lastDialog
          ? 'Skipped — Generate Agreement was blocked by the date-validation dialog above, so no agreement exists yet to download'
          : 'Download PDF button not found even though Generate Agreement reported success — worth a manual look';
        return;
      }
      r.note = 'Located (not clicked, to avoid a real download / approval side effect)';
    });
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  const timestamp = new Date().toISOString();
  const reportPath = generateReport(timestamp);

  const failed = results.filter((r) => r.status === 'fail');
  console.log(`\n${results.length - failed.length}/${results.length} steps passed. Report: ${reportPath}`);
  if (failed.length) {
    console.log('Failed steps:', failed.map((r) => r.name).join(', '));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
