// Usage: node scripts/check-open-routes.cjs [baseUrl]   (optional env CHECK_TOKEN = a login token)
const fs = require('fs');
const path = require('path');

const base = (process.argv[2] || 'http://localhost:3001').replace(/\/$/, '');
const token = process.env.CHECK_TOKEN || '';
const src = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8');

const SKIP = new Set(['/', '/assets/:filename', '/esign-inbox', '/sign/:documentId', '/auth/microsoft/callback', '/hubspot-landing', '/api/test-mongodb']);
const re = /^app\.get\(\s*(['"`])([^'"`]+)\1/gm;
const routes = [];
let m;
while ((m = re.exec(src))) if (!SKIP.has(m[2]) && !routes.includes(m[2])) routes.push(m[2]);

async function hit(url, headers) {
  try {
    const res = await fetch(url, { headers, redirect: 'manual' });
    const body = await res.arrayBuffer();
    return { status: res.status, size: body.byteLength };
  } catch {
    return { status: 'ERR', size: 0 };
  }
}

(async () => {
  const rows = [];
  for (const route of routes) {
    const url = base + route.replace(/:[A-Za-z]+/g, '000000000000000000000000');
    const anon = await hit(url, {});
    const authed = token ? await hit(url, { Authorization: `Bearer ${token}` }) : null;
    rows.push({ route, anon, authed });
  }
  const open = rows.filter((r) => typeof r.anon.status === 'number' && r.anon.status < 300);
  const locked = rows.filter((r) => r.anon.status === 401 || r.anon.status === 403);
  console.log(`checked ${rows.length} GET routes on ${base}`);
  console.log(`\nLOCKED without a login (401/403): ${locked.length}`);
  locked.forEach((r) => console.log(`  ${r.anon.status}  ${r.route}`));
  console.log(`\nANSWER WITHOUT A LOGIN (2xx): ${open.length}`);
  open.forEach((r) => console.log(`  ${r.anon.status}  ${String(r.anon.size).padStart(7)} B  ${r.route}`));
  console.log('\nOTHER (404 etc. - a 404 on a fake id usually means the handler ran with no login check):');
  rows
    .filter((r) => !open.includes(r) && !locked.includes(r))
    .forEach((r) => console.log(`  ${r.anon.status}  ${r.route}`));
  if (token) {
    console.log('\nWITH YOUR TOKEN:');
    rows.forEach((r) => console.log(`  ${r.authed.status}  ${String(r.authed.size).padStart(7)} B  ${r.route}`));
  }
})();
