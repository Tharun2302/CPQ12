// Preloaded into the demo server (node --require). Two layers keep the demo from reaching anyone:
// 1. @sendgrid/mail.send is replaced: emails are written to out/outbox/*.json and "accepted" (202).
// 2. Every TCP connection to a non-loopback host is refused, whatever library opens it.
const fs = require('fs');
const net = require('net');
const path = require('path');
const Module = require('module');

const OUTBOX = path.join(__dirname, '..', 'out', 'outbox');
const LOG = path.join(__dirname, '..', 'out', 'net-guard.log');
fs.mkdirSync(OUTBOX, { recursive: true });

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1', '0.0.0.0']);
const isLocal = (host) => !host || LOOPBACK.has(String(host).toLowerCase()) || String(host).startsWith('127.');

function log(line) {
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const opts = typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])
    ? args[0]
    : { port: args[0], host: typeof args[1] === 'string' ? args[1] : undefined };
  if (opts.path) return originalConnect.apply(this, args);
  const host = opts.host || opts.hostname;
  if (!isLocal(host)) {
    log(`BLOCKED outbound connection to ${host}:${opts.port}`);
    const err = Object.assign(new Error(`demo net-guard: outbound connection to ${host} blocked`), { code: 'ECONNREFUSED' });
    process.nextTick(() => this.destroy(err));
    return this;
  }
  return originalConnect.apply(this, args);
};

let mailCount = 0;
function captureMail(msg) {
  const list = Array.isArray(msg) ? msg : [msg];
  // setup-demo clears the outbox between runs, so the folder may be gone.
  fs.mkdirSync(OUTBOX, { recursive: true });
  for (const m of list) {
    mailCount += 1;
    const file = path.join(OUTBOX, `${Date.now()}-${String(mailCount).padStart(3, '0')}.json`);
    const slim = { ...m, attachments: (m.attachments || []).map((a) => ({ filename: a.filename, type: a.type, bytes: (a.content || '').length })) };
    fs.writeFileSync(file, JSON.stringify(slim, null, 2));
    const to = [].concat(m.to || []).map((t) => (typeof t === 'string' ? t : t.email)).join(', ');
    log(`CAPTURED email to ${to} — "${m.subject}"`);
  }
  return Promise.resolve([{ statusCode: 202, headers: { 'x-message-id': `demo-${Date.now()}` }, body: '' }, {}]);
}

const originalLoad = Module._load;
Module._load = function guardedLoad(request, ...rest) {
  const exported = originalLoad.call(this, request, ...rest);
  if (/@sendgrid[\\/]mail$/.test(request) && exported && !exported.__demoGuarded) {
    exported.send = captureMail;
    exported.sendMultiple = captureMail;
    exported.__demoGuarded = true;
  }
  return exported;
};

const uri = process.env.MONGODB_URI || '';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(uri)) {
  console.error('demo net-guard: MONGODB_URI is not a localhost database, refusing to start.');
  process.exit(1);
}
log(`net-guard active (pid ${process.pid})`);
