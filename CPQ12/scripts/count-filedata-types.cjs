require('dotenv').config();
const { MongoClient } = require('mongodb');
function toBuf(fd){ if(!fd) return null; if(Buffer.isBuffer(fd)) return fd; if(fd.buffer) return Buffer.from(fd.buffer); if(fd.data) return Buffer.from(fd.data); if(typeof fd==='string') return Buffer.from(fd,'base64'); return null; }
function kind(fd){ const b=toBuf(fd); if(!b||!b.length) return 'MISSING'; if(b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46) return 'PDF'; if(b[0]===0x50&&b[1]===0x4b) return 'DOCX/ZIP'; return 'OTHER'; }
(async()=>{
  const c=new MongoClient(process.env.MONGODB_URI); await c.connect();
  const db=c.db(process.env.DB_NAME||'cpq_database');
  const docs=await db.collection('documents').find({}).toArray();
  const counts={}; const docxOnes=[];
  for(const d of docs){ const k=kind(d.fileData); counts[k]=(counts[k]||0)+1; if(k!=='PDF') docxOnes.push(`${k}  ${d.company} — ${d.clientName} (${d.id})`); }
  console.log('fileData type counts across', docs.length, 'documents:');
  Object.entries(counts).forEach(([k,v])=>console.log(`  ${String(v).padStart(4)}  ${k}`));
  if(docxOnes.length){ console.log('\nDocuments whose fileData is NOT a PDF (these fail "View"):'); docxOnes.slice(0,40).forEach(x=>console.log('  '+x)); if(docxOnes.length>40) console.log(`  ...and ${docxOnes.length-40} more`); }
  await c.close();
})();
