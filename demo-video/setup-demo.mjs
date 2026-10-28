// Builds (or resets) the isolated demo workspace in the LOCAL MongoDB.
//   node setup-demo.mjs                  reset demo data (clones config once from production, read-only)
//   node setup-demo.mjs --refresh-config re-copy the configuration from production first
//   node setup-demo.mjs --remove         drop the demo database and its uploaded files
//   node setup-demo.mjs --remove --all   also drop the cached configuration copy
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import {
  APP_DIR, CONFIG_CACHE_DB, DB_NAME, DEMO_PASSWORD, MONGO_URI, OUT_DIR, PEOPLE, TEAM_LEADS, assertLocalMongo,
} from './lib/demo-env.mjs';

const args = new Set(process.argv.slice(2));
const CONFIG_COLLECTIONS = ['combinations', 'templates', 'exhibits', 'pricing_tiers'];
const DEMO_FILE_LIST = path.join(OUT_DIR, 'demo-upload-files.json');

assertLocalMongo(MONGO_URI);
const local = await MongoClient.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
const demo = local.db(DB_NAME);
const cache = local.db(CONFIG_CACHE_DB);

async function removeDemoUploads() {
  // Signed PDFs and e-sign uploads land in the app's uploads/ folder; only files the demo created are deleted.
  const files = new Set(fs.existsSync(DEMO_FILE_LIST) ? JSON.parse(fs.readFileSync(DEMO_FILE_LIST, 'utf8')) : []);
  for (const doc of await demo.collection('esign_documents').find({}, { projection: { file_path: 1, signed_file_path: 1 } }).toArray()) {
    for (const p of [doc.file_path, doc.signed_file_path]) if (p) files.add(p);
  }
  const uploadsRoot = path.join(APP_DIR, 'uploads');
  let removed = 0;
  for (const f of files) {
    const abs = path.isAbsolute(f) ? f : path.join(APP_DIR, f);
    if (abs.startsWith(uploadsRoot) && fs.existsSync(abs)) {
      fs.rmSync(abs);
      removed += 1;
    }
  }
  fs.rmSync(DEMO_FILE_LIST, { force: true });
  return removed;
}

if (args.has('--remove')) {
  const removed = await removeDemoUploads();
  await demo.dropDatabase();
  if (args.has('--all')) await cache.dropDatabase();
  console.log(`Removed demo database "${DB_NAME}"${args.has('--all') ? ` and config cache "${CONFIG_CACHE_DB}"` : ''}; deleted ${removed} demo upload file(s).`);
  await local.close();
  process.exit(0);
}

async function cloneConfigFromProduction() {
  // The production URI is read inside this process only and never printed; only find() is used.
  const env = dotenv.parse(fs.readFileSync(path.join(APP_DIR, '.env')));
  if (!env.MONGODB_URI) throw new Error('No MONGODB_URI in ../.env to copy configuration from');
  const prod = await MongoClient.connect(env.MONGODB_URI, { readPreference: 'secondaryPreferred', serverSelectionTimeoutMS: 15000 });
  try {
    const src = prod.db(env.DB_NAME || 'cpq_database');
    await cache.dropDatabase();
    for (const name of CONFIG_COLLECTIONS) {
      const cursor = src.collection(name).find({}).batchSize(50);
      let batch = [];
      let count = 0;
      for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length === 50) {
          await cache.collection(name).insertMany(batch);
          count += batch.length;
          batch = [];
        }
      }
      if (batch.length) {
        await cache.collection(name).insertMany(batch);
        count += batch.length;
      }
      console.log(`  copied ${name}: ${count}`);
    }
    const discount = await src.collection('settings').findOne({ _id: 'discount_policy' });
    if (discount) await cache.collection('settings').insertOne(discount);
    const teams = await src.collection('team_approval_settings').findOne({ _id: 'main' });
    await cache.collection('meta').insertOne({
      _id: 'source',
      copiedAt: new Date(),
      teamKeys: Object.keys(teams?.teamLeads || TEAM_LEADS),
    });
  } finally {
    await prod.close();
  }
}

const hasCache = (await cache.collection('meta').countDocuments({ _id: 'source' })) > 0;
if (!hasCache || args.has('--refresh-config')) {
  if (args.has('--no-prod')) throw new Error('No cached configuration and --no-prod given');
  console.log('Copying configuration from production (read-only)…');
  await cloneConfigFromProduction();
}

console.log(`Resetting demo database "${DB_NAME}"…`);
await removeDemoUploads();
await demo.dropDatabase();

for (const name of CONFIG_COLLECTIONS) {
  const docs = await cache.collection(name).find({}).toArray();
  if (docs.length) await demo.collection(name).insertMany(docs);
}

const discountDoc = await cache.collection('settings').findOne({ _id: 'discount_policy' });
// Production may have no policy document, in which case the app's built-in default cap applies.
await demo.collection('settings').insertMany([
  ...(discountDoc ? [discountDoc] : []),
  { _id: 'approval_admins', emails: [], updatedAt: new Date() },
  { _id: 'exhibit_admins', emails: [], updatedAt: new Date() },
]);

const meta = await cache.collection('meta').findOne({ _id: 'source' });
const teamLeads = {};
for (const key of meta.teamKeys) teamLeads[key] = TEAM_LEADS[key] || `${key.toLowerCase()}.lead@demo.local`;
Object.assign(teamLeads, TEAM_LEADS);
await demo.collection('team_approval_settings').insertOne({
  _id: 'main',
  teamLeads,
  additionalRecipients: Object.fromEntries(Object.keys(teamLeads).map((k) => [k, []])),
  technicalEmails: [PEOPLE.aisha.email],
  updatedAt: new Date(),
});

const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
const now = new Date();
await demo.collection('users').insertMany(
  ['priya', 'jordan', 'marcus', 'aisha', 'daniel'].map((key, i) => ({
    id: `user_demo_${key}`,
    name: PEOPLE[key].name,
    email: PEOPLE[key].email,
    password: hash,
    provider: 'email',
    role: 'viewer',
    created_at: new Date(now.getTime() - (30 - i) * 86400000),
    updated_at: now,
  })),
);

// Earlier approvals, so "your day" shows a realistic history with real step durations.
const H = 3600000;
const iso = (msAgo) => new Date(now.getTime() - msAgo).toISOString();
const TECH = 'cpq.zenop.ai.technical@cloudfuze.com';
const LEGAL = 'cpq.zenop.ai.legal@cloudfuze.com';
const DESK = 'salesops@cloudfuze.com';
function history({ id, doc, client, amount, creator, team, created, decided, status, currentStep, deniedNote }) {
  const roles = ['Team Approval', 'Technical Team', 'Legal Team', 'Deal Desk'];
  const emails = [TEAM_LEADS[team], TECH, LEGAL, DESK];
  return {
    id,
    documentId: doc,
    documentType: 'PDF Agreement',
    clientName: client,
    amount,
    creatorEmail: PEOPLE[creator].email,
    creatorName: PEOPLE[creator].name,
    creatorVerified: true,
    isOverage: false,
    discountPercent: 5,
    hasCustomLineItems: false,
    totalSteps: 4,
    status,
    currentStep,
    workflowSteps: roles.map((role, i) => {
      const d = decided[i];
      return {
        step: i + 1,
        role,
        email: emails[i],
        ...(i === 0 ? { group: team, additionalRecipients: [] } : {}),
        status: d ? d.status : 'pending',
        comments: d?.comments || (i === 3 && d ? 'Notified' : ''),
        ...(d ? { timestamp: iso(d.at) } : {}),
      };
    }),
    ...(deniedNote ? { deniedReason: deniedNote } : {}),
    createdAt: iso(created),
    updatedAt: iso(decided.length ? decided[decided.length - 1].at : created),
  };
}
await demo.collection('approval_workflows').insertMany([
  history({
    id: 'WF-DEMO-CONTOSO', doc: 'DOC-DEMO-CONTOSO', client: 'Contoso Pharma', amount: 22400, creator: 'priya', team: 'SMB',
    created: 170 * H, status: 'approved', currentStep: 4,
    decided: [{ status: 'approved', at: 167.75 * H }, { status: 'approved', at: 139.75 * H }, { status: 'approved', at: 134.5 * H }, { status: 'approved', at: 134.5 * H }],
  }),
  history({
    id: 'WF-DEMO-FABRIKAM', doc: 'DOC-DEMO-FABRIKAM', client: 'Fabrikam Retail', amount: 7800, creator: 'priya', team: 'SMB',
    created: 27 * H, status: 'in_progress', currentStep: 3,
    decided: [{ status: 'approved', at: 25.5 * H }, { status: 'approved', at: 3.2 * H }],
  }),
  history({
    id: 'WF-DEMO-LAKESIDE', doc: 'DOC-DEMO-LAKESIDE', client: 'Lakeside School District', amount: 12900, creator: 'jordan', team: 'AM',
    created: 5 * H, status: 'pending', currentStep: 1, decided: [],
  }),
]);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.rmSync(path.join(OUT_DIR, 'outbox'), { recursive: true, force: true });
fs.writeFileSync(DEMO_FILE_LIST, '[]');

const counts = {};
for (const c of [...CONFIG_COLLECTIONS, 'users', 'approval_workflows']) counts[c] = await demo.collection(c).countDocuments();
console.log('Demo workspace ready:', counts);
console.log(`Logins (password "${DEMO_PASSWORD}"): ${['priya', 'jordan', 'marcus', 'aisha', 'daniel'].map((k) => PEOPLE[k].email).join(', ')}`);
await local.close();
