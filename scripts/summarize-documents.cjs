require('dotenv').config();
const { MongoClient } = require('mongodb');
(async () => {
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  const db = c.db(process.env.DB_NAME || 'cpq_database');
  const docs = await db.collection('documents').find({}, { projection: { fileData: 0, docxFileData: 0 } }).toArray();
  console.log('Total documents:', docs.length, '\n');

  const by = (key) => {
    const m = {};
    for (const d of docs) { const k = d[key] || '(none)'; m[k] = (m[k]||0)+1; }
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  };

  console.log('— By templateName —');
  by('templateName').forEach(([k,v]) => console.log(`  ${v.toString().padStart(4)}  ${k}`));

  console.log('\n— By status —');
  by('status').forEach(([k,v]) => console.log(`  ${v.toString().padStart(4)}  ${k}`));

  const withDocx = docs.filter(d => d.docxFileName).length;
  console.log(`\nHave Word(.docx) copy: ${withDocx} / ${docs.length}`);

  // linkage counts
  let inApproval = 0, inEsign = 0;
  for (const d of docs) {
    if (await db.collection('approval_workflows').findOne({ documentId: d.id })) inApproval++;
    if (await db.collection('esign_documents').findOne({ source_document_id: d.id })) inEsign++;
  }
  console.log(`\nLinked to an approval workflow: ${inApproval}`);
  console.log(`Linked to an e-sign workflow:   ${inEsign}`);
  console.log(`Not linked to anything:         ${docs.length - new Set([...Array(0)]).size}`);

  // date range
  const dates = docs.map(d => d.generatedDate || d.createdAt).filter(Boolean).map(x=>new Date(x)).sort((a,b)=>a-b);
  if (dates.length) console.log(`\nDate range: ${dates[0].toISOString().slice(0,10)}  →  ${dates[dates.length-1].toISOString().slice(0,10)}`);

  await c.close();
})();
