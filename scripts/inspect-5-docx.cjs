require('dotenv').config();
const { MongoClient } = require('mongodb');
function toBuf(fd){ if(!fd) return null; if(Buffer.isBuffer(fd)) return fd; if(fd.buffer) return Buffer.from(fd.buffer); if(fd.data) return Buffer.from(fd.data); if(typeof fd==='string') return Buffer.from(fd,'base64'); return null; }
function kind(fd){ const b=toBuf(fd); if(!b||!b.length) return 'MISSING'; if(b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46) return 'PDF'; if(b[0]===0x50&&b[1]===0x4b) return 'DOCX'; return 'OTHER'; }
(async()=>{
  const c=new MongoClient(process.env.MONGODB_URI); await c.connect();
  const db=c.db(process.env.DB_NAME||'cpq_database');
  const ids=['Netkiller_StevenKim_06530','Ceribell_ThereseCharles_42401','Ceribell_ThereseCharles_38291','BlackMountainBlueCur_MatthewDeChant_85608','IcebergIQ_NatashaNarayan_08630'];
  for(const id of ids){
    const d=await db.collection('documents').findOne({id});
    if(!d){ console.log(id,'NOT FOUND'); continue; }
    const fb=toBuf(d.fileData), db2=toBuf(d.docxFileData);
    console.log(`\n${id}`);
    console.log(`  fileName:      ${d.fileName}`);
    console.log(`  fileData:      ${kind(d.fileData)} (${fb?fb.length:0} bytes)`);
    console.log(`  docxFileData:  ${d.docxFileData?kind(d.docxFileData):'(none)'} (${db2?db2.length:0} bytes)`);
    console.log(`  docxFileName:  ${d.docxFileName||'(none)'}`);
  }
  await c.close();
})();
