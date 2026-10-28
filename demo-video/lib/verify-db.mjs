// Checks that a full run left every demo record in the state the video claims. Exit code 1 on any mismatch.
import { MongoClient } from 'mongodb';
import { DB_NAME, MONGO_URI, PEOPLE, assertLocalMongo } from './demo-env.mjs';

assertLocalMongo(MONGO_URI);
const client = await MongoClient.connect(MONGO_URI);
const db = client.db(DB_NAME);
const results = [];
const check = (label, ok, detail = '') => results.push({ label, ok: !!ok, detail });

const wfs = await db.collection('approval_workflows').find({}).sort({ createdAt: 1 }).toArray();
const byDoc = (re) => wfs.filter((w) => re.test(w.documentId || ''));
const step = (w, n) => (w?.workflowSteps || []).find((s) => s.step === n) || {};

const [northwind] = byDoc(/Northwind/i);
check('Northwind workflow approved', northwind?.status === 'approved', northwind?.status);
check('Northwind Team/Tech/Legal approved', [1, 2, 3].every((n) => step(northwind, n).status === 'approved'));
check('Northwind requested by Priya', northwind?.creatorEmail === PEOPLE.priya.email, northwind?.creatorEmail);
check('Northwind discount is 10%', Number(northwind?.discountPercent) === 10, northwind?.discountPercent);

const esign = await db.collection('esign_documents').findOne({}, { sort: { created_at: -1 } });
const recips = esign ? await db.collection('esign_recipients').find({ esign_document_id: esign._id.toString() }).toArray() : [];
const allRecips = recips.length ? recips : await db.collection('esign_recipients').find({}).toArray();
check('Northwind e-sign completed', esign?.status === 'completed', esign?.status);
const tom = allRecips.find((r) => r.email === PEOPLE.tom.email);
const emma = allRecips.find((r) => r.email === PEOPLE.emma.email);
check('Tom reviewed', tom?.status === 'reviewed', tom?.status);
check('Emma signed', emma?.status === 'signed', emma?.status);

const harbor = byDoc(/Harbor/i);
check('Harbor has two approvals (rejected + fresh)', harbor.length === 2, harbor.length);
const [first, second] = harbor;
check('Harbor #1 denied at Technical', first?.status === 'denied' && step(first, 2).status === 'denied', `${first?.status}/${step(first, 2).status}`);
check('Harbor #1 denial comment saved', /2 million/.test(step(first, 2).comments || ''), step(first, 2).comments);
check('Harbor #2 pending at step 1', second?.status === 'pending' && second?.currentStep === 1, `${second?.status}/${second?.currentStep}`);

// Generating an agreement stores a `documents` record (not a `quotes` one); its template data holds the figures.
const docText = async (id) => JSON.stringify(await db.collection('documents').findOne({ id }, { projection: { fileData: 0, docxFileData: 0, pdfData: 0 } }) || {});
const [firstDoc, secondDoc] = [await docText(first?.documentId), await docText(second?.documentId)];
check('Harbor #1 agreement quoted 200,000 messages', /\b200,?000\b/.test(firstDoc));
check('Harbor re-quote uses 2,000,000 messages', /2,?000,?000/.test(secondDoc));
check('Harbor agreements have no Box/Northwind lines', !/Box to Microsoft|Northwind/i.test(firstDoc + secondDoc));

const [bright] = byDoc(/Brightline/i);
check('Brightline marked overage', bright?.isOverage === true, bright?.isOverage);
check('Brightline Technical skipped', /skipped/i.test(step(bright, 2).comments || '') && step(bright, 2).status === 'approved', step(bright, 2).comments);
check('Brightline now with Legal', bright?.currentStep === 3, bright?.currentStep);

for (const id of ['WF-DEMO-CONTOSO', 'WF-DEMO-FABRIKAM', 'WF-DEMO-LAKESIDE']) {
  const w = wfs.find((x) => x.id === id);
  check(`${id} untouched`, w && ['approved', 'in_progress', 'pending'].includes(w.status), w?.status);
}

const users = await db.collection('users').find({}).toArray();
check('Only @demo.local users exist', users.every((u) => u.email.endsWith('@demo.local')), users.map((u) => u.email).join(','));

await client.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.ok ? '' : `  → ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} check(s) failed` : 'All database checks passed');
process.exit(failed ? 1 : 0);
