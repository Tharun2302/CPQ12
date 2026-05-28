/* Throwaway E2E harness for zenop.ai — public (unauthenticated) pass.
   Uses puppeteer already present in the CPQ12 repo. Not for committing. */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = process.env.ZENOP_URL || 'https://zenop.ai/';
const OUT = path.join(__dirname, 'artifacts');
fs.mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

const findings = [];
const log = (...a) => { console.log(...a); };

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('requestfailed', r => failedRequests.push(`${r.failure()?.errorText} ${r.url()}`));
  page.on('response', r => { if (r.status() >= 400) failedRequests.push(`HTTP ${r.status()} ${r.url()}`); });

  // ---- Load home + perf timing ----
  await page.setViewport(viewports[0]);
  const t0 = Date.now();
  let resp;
  try {
    resp = await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e) {
    findings.push(['FAIL', `Home page did not reach networkidle: ${e.message}`]);
  }
  const wallMs = Date.now() - t0;
  const status = resp ? resp.status() : 'n/a';
  log(`\n[HOME] ${BASE} -> HTTP ${status} in ${wallMs}ms`);
  if (status >= 400) findings.push(['FAIL', `Home returned HTTP ${status}`]);

  const title = await page.title();
  log(`[HOME] <title>: "${title}"`);
  if (!title || !title.trim()) findings.push(['WARN', 'Empty <title>']);

  const perf = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    const paints = {};
    performance.getEntriesByType('paint').forEach(p => paints[p.name] = Math.round(p.startTime));
    return {
      ttfb: Math.round(n.responseStart || 0),
      domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0),
      load: Math.round(n.loadEventEnd || 0),
      transferKB: Math.round((performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0)) / 1024),
      reqCount: performance.getEntriesByType('resource').length,
      fcp: paints['first-contentful-paint'] || null,
    };
  });
  log('[PERF]', JSON.stringify(perf));
  if (perf.fcp && perf.fcp > 3000) findings.push(['WARN', `Slow First Contentful Paint: ${perf.fcp}ms`]);
  if (perf.load && perf.load > 5000) findings.push(['WARN', `Slow load event: ${perf.load}ms`]);

  // ---- SEO / basic a11y signals ----
  const meta = await page.evaluate(() => ({
    desc: document.querySelector('meta[name="description"]')?.content || null,
    viewport: document.querySelector('meta[name="viewport"]')?.content || null,
    h1count: document.querySelectorAll('h1').length,
    imgsNoAlt: [...document.querySelectorAll('img')].filter(i => !i.getAttribute('alt')).length,
    imgTotal: document.querySelectorAll('img').length,
    lang: document.documentElement.lang || null,
  }));
  log('[META]', JSON.stringify(meta));
  if (!meta.desc) findings.push(['WARN', 'Missing meta description']);
  if (!meta.viewport) findings.push(['WARN', 'Missing viewport meta (mobile)']);
  if (meta.h1count === 0) findings.push(['WARN', 'No <h1> on home']);
  if (meta.h1count > 1) findings.push(['WARN', `Multiple <h1> (${meta.h1count})`]);
  if (meta.imgsNoAlt > 0) findings.push(['WARN', `${meta.imgsNoAlt}/${meta.imgTotal} images missing alt text`]);

  // ---- Collect internal links, test each ----
  const links = await page.evaluate((base) => {
    const origin = new URL(base).origin;
    return [...new Set([...document.querySelectorAll('a[href]')]
      .map(a => a.href)
      .filter(h => h.startsWith(origin) && !h.includes('#')))];
  }, BASE);
  log(`\n[LINKS] ${links.length} unique internal links found`);

  for (const url of links.slice(0, 25)) {
    try {
      const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const code = r.status();
      const mark = code >= 400 ? 'FAIL' : 'OK';
      log(`  [${mark}] ${code} ${url}`);
      if (code >= 400) findings.push(['FAIL', `Broken page HTTP ${code}: ${url}`]);
    } catch (e) {
      log(`  [FAIL] ERR ${url} (${e.message})`);
      findings.push(['FAIL', `Navigation error: ${url} — ${e.message}`]);
    }
  }

  // ---- Responsive screenshots of home ----
  for (const v of viewports) {
    await page.setViewport(v);
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    const shot = path.join(OUT, `home-${v.name}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    log(`[SHOT] ${v.name} -> ${shot}`);
    const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (hScroll) findings.push(['WARN', `Horizontal scroll/overflow at ${v.name} (${v.width}px)`]);
  }

  // ---- JS / network errors summary ----
  if (consoleErrors.length) findings.push(['WARN', `${consoleErrors.length} console error(s) — e.g. ${consoleErrors[0]?.slice(0,140)}`]);
  if (pageErrors.length) findings.push(['FAIL', `${pageErrors.length} uncaught JS error(s) — e.g. ${pageErrors[0]?.slice(0,140)}`]);
  const realFails = failedRequests.filter(f => !/favicon/i.test(f));
  if (realFails.length) findings.push(['WARN', `${realFails.length} failed/4xx-5xx request(s) — e.g. ${realFails[0]?.slice(0,160)}`]);

  // ---- Report ----
  log('\n========== FINDINGS ==========');
  if (!findings.length) log('No issues detected on public pass. ✅');
  findings.forEach(([sev, msg]) => log(`  [${sev}] ${msg}`));
  fs.writeFileSync(path.join(OUT, 'public-findings.json'),
    JSON.stringify({ base: BASE, status, perf, meta, findings, consoleErrors, pageErrors, failedRequests: realFails }, null, 2));
  log(`\nArtifacts in ${OUT}`);

  await browser.close();
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(1); });
