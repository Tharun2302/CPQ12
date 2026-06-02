require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');
const FormData = require('form-data');

const CONVERT_URL = process.env.CONVERT_URL || 'https://zenop.ai/api/convert/docx-to-pdf';
const DRY = process.env.DRY === '1';

const ids = [
  'Netkiller_StevenKim_06530',
  'Ceribell_ThereseCharles_42401',
  'Ceribell_ThereseCharles_38291',
  'BlackMountainBlueCur_MatthewDeChant_85608',
  'IcebergIQ_NatashaNarayan_08630',
];

function toBuf(fd){ if(!fd) return null; if(Buffer.isBuffer(fd)) return fd; if(fd.buffer) return Buffer.from(fd.buffer); if(fd.data) return Buffer.from(fd.data); if(typeof fd==='string') return Buffer.from(fd,'base64'); return null; }
const isPdf = b => b && b[0]===0x25 && b[1]===0x50 && b[2]===0x44 && b[3]===0x46;
const isDocx = b => b && b[0]===0x50 && b[1]===0x4b;

(async () => {
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  const db = c.db(process.env.DB_NAME || 'cpq_database');
  const col = db.collection('documents');
  console.log(`Convert endpoint: ${CONVERT_URL}  ${DRY ? '(DRY RUN — no writes)' : ''}\n`);

  for (const id of ids) {
    const d = await col.findOne({ id });
    if (!d) { console.log(`❌ ${id}: not found`); continue; }
    const docx = toBuf(d.docxFileData) || toBuf(d.fileData);
    if (!isDocx(docx)) { console.log(`⚠️  ${id}: source is not DOCX, skipping`); continue; }

    try {
      const fdata = new FormData();
      fdata.append('file', docx, { filename: d.docxFileName || 'agreement.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const resp = await axios.post(CONVERT_URL, fdata, { headers: fdata.getHeaders(), responseType: 'arraybuffer', timeout: 120000, maxContentLength: Infinity, maxBodyLength: Infinity });
      const pdf = Buffer.from(resp.data);
      if (!isPdf(pdf)) { console.log(`❌ ${id}: converter did not return a PDF (got ${pdf.length} bytes), skipping`); continue; }

      if (DRY) {
        console.log(`✅ ${id}: would update fileData → PDF (${pdf.length} bytes)  [docxFileData preserved]`);
      } else {
        await col.updateOne({ id }, { $set: { fileData: pdf, fileSize: pdf.length } });
        console.log(`✅ ${id}: fileData updated to PDF (${pdf.length} bytes)  [docxFileData preserved]`);
      }
    } catch (e) {
      console.log(`❌ ${id}: conversion failed — ${e.response?.status || ''} ${e.message}`);
    }
  }
  await c.close();
})();
