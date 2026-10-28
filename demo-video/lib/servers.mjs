// Starts (or reuses) the guarded demo backend and the demo Vite dev server.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { APP_DIR, APP_URL, BACKEND_URL, DEMO_DIR, OUT_DIR, demoServerEnv } from './demo-env.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitFor(url, label, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isUp(url)) return;
    await sleep(1000);
  }
  throw new Error(`${label} did not come up at ${url} within ${timeoutMs / 1000}s (see demo-video/out/*.log)`);
}

// LibreOffice (PDF conversion) crashes under a console-less detached process on Windows, so the
// servers are started via Start-Process: a hidden window with its own console that outlives this script.
function launch(label, args, extraEnv) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const env = { ...process.env, ...extraEnv };
  if (process.platform !== 'win32') {
    const log = fs.openSync(path.join(OUT_DIR, `${label}.out.log`), 'a');
    const child = spawn(process.execPath, args, { cwd: APP_DIR, env, stdio: ['ignore', log, log], detached: true });
    child.unref();
    fs.writeFileSync(path.join(OUT_DIR, `${label}.pid`), String(child.pid));
    return;
  }
  const pidFile = path.join(OUT_DIR, `${label}.pid`);
  fs.rmSync(pidFile, { force: true });
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const ps = [
    `$p = Start-Process -FilePath ${q(process.execPath)}`,
    `-ArgumentList @(${args.map((a) => q(`"${a}"`)).join(',')})`,
    `-WorkingDirectory ${q(APP_DIR)} -WindowStyle Hidden -PassThru`,
    `-RedirectStandardOutput ${q(path.join(OUT_DIR, `${label}.out.log`))}`,
    `-RedirectStandardError ${q(path.join(OUT_DIR, `${label}.err.log`))};`,
    `Set-Content -NoNewline -Encoding ascii -Path ${q(pidFile)} -Value $p.Id`,
  ].join(' ');
  // No pipes: the started server would inherit them and spawnSync would wait for it to exit.
  spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { env, stdio: 'ignore' });
  if (!Number(fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8'))) throw new Error(`Could not start ${label}`);
}

export async function ensureServers() {
  const env = demoServerEnv();
  if (!(await isUp(`${BACKEND_URL}/api/combinations`))) {
    launch('backend', ['--require', path.join(DEMO_DIR, 'lib/net-guard.cjs'), 'server.cjs'], env);
  }
  if (!(await isUp(APP_URL))) {
    const viteBin = path.join(APP_DIR, 'node_modules/vite/bin/vite.js');
    launch('frontend', [viteBin, '--config', path.join(DEMO_DIR, 'lib/vite.demo.config.mjs')], {
      VITE_BACKEND_URL: BACKEND_URL,
      VITE_API_URL: BACKEND_URL,
      VITE_MSAL_REDIRECT_URI: APP_URL,
      VITE_CLARITY_ID: '',
      VITE_HOTJAR_ID: '',
    });
  }
  await waitFor(`${BACKEND_URL}/api/combinations`, 'Demo backend');
  await waitFor(APP_URL, 'Demo frontend');
}

export function stopServers() {
  for (const label of ['backend', 'frontend']) {
    const pidFile = path.join(OUT_DIR, `${label}.pid`);
    if (!fs.existsSync(pidFile)) continue;
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
      else process.kill(pid);
    } catch {
      // already gone
    }
    fs.rmSync(pidFile, { force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('servers.mjs')) {
  const cmd = process.argv[2] || 'start';
  if (cmd === 'stop') stopServers();
  else await ensureServers().then(() => console.log(`Demo running: ${APP_URL} (backend ${BACKEND_URL})`));
}
