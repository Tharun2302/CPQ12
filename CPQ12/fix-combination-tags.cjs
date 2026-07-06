const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saitharunreddy2302_db_user:Saireddy2302@cluster1.zycf9g5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1';
const DB_NAME = process.env.DB_NAME || 'cpq_database';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const { ObjectId } = require('mongodb');

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              FIX COMBINATION TAGS - MIGRATION SCRIPT            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const fixes = [
    // DROPBOX-TO-MYDRIVE fixes
    {
      id: '6967906d0d2cb1db2f4aec0b',
      name: 'Dropbox to Google Drive (MyDrive & Shared Drive)',
      oldCombo: ['dropbox-to-mydrive', 'dropbox-to-google-sharedrive', 'dropbox-to-google', 'all'],
      newCombo: ['dropbox-to-google-mydrive-and-sharedrive', 'all'],
      reason: 'Covers BOTH MyDrive and SharedDrive'
    },
    {
      id: '696a45415d18434d1b410b51',
      name: 'Dropbox to Google MyDrive Standard',
      oldCombo: ['dropbox-to-mydrive', 'dropbox-to-google', 'all'],
      newCombo: ['dropbox-to-google-mydrive', 'all'],
      reason: 'Covers only MyDrive (not SharedDrive)'
    },

    // SHAREFILE-TO-GOOGLE-SHAREDRIVE fixes
    {
      id: '69400400eafb4acacf0b5aaa',
      name: 'ShareFile to Google SharedDrive',
      oldCombo: ['sharefile-to-google-sharedrive', 'all'],
      newCombo: ['sharefile-to-google-sharedrive', 'all'],
      reason: 'No change needed - already specific'
    },
    {
      id: '69705d075db342c1893897ad',
      name: 'ShareFile to Google Shared Drive Standard',
      oldCombo: ['sharefile-to-google-sharedrive', 'all'],
      newCombo: ['sharefile-to-google-sharedrive', 'all'],
      reason: 'No change needed - already specific'
    },

    // NFS-TO-MICROSOFT fixes
    {
      id: '695f7141036b9e315ad4387c',
      name: 'NFS to SharePoint Online',
      oldCombo: ['nfs-to-microsoft', 'all'],
      newCombo: ['nfs-to-sharepoint', 'all'],
      reason: 'More specific: SharePoint only'
    },
    {
      id: '6960fa898c5f6d11a5a61b7b',
      name: 'NFS to OneDrive',
      oldCombo: ['nfs-to-microsoft', 'all'],
      newCombo: ['nfs-to-onedrive', 'all'],
      reason: 'More specific: OneDrive only'
    },

    // NFS-TO-GOOGLE fixes
    {
      id: '6960855cf30deb251a707d1d',
      name: 'NFS to Google Shared Drive',
      oldCombo: ['nfs-to-google', 'all'],
      newCombo: ['nfs-to-google-sharedrive', 'all'],
      reason: 'More specific: SharedDrive only'
    },
    {
      id: '69609ce647c07139a4ebe4f7',
      name: 'NFS to Google MyDrive',
      oldCombo: ['nfs-to-google', 'all'],
      newCombo: ['nfs-to-google-mydrive', 'all'],
      reason: 'More specific: MyDrive only'
    },

    // DROPBOX-TO-GOOGLE-SHAREDRIVE fixes
    {
      id: '6967c696a7d7c1972a07ea74',
      name: 'Dropbox to Google Shared Drive',
      oldCombo: ['dropbox-to-google', 'dropbox-to-google-sharedrive', 'all'],
      newCombo: ['dropbox-to-google-sharedrive', 'all'],
      reason: 'Remove generic "dropbox-to-google", keep specific'
    }
  ];

  console.log(`Preparing to update ${fixes.length} exhibits...\n`);

  let updated = 0;
  let noChange = 0;
  let errors = 0;

  for (const fix of fixes) {
    try {
      const oldStr = JSON.stringify(fix.oldCombo);
      const newStr = JSON.stringify(fix.newCombo);
      
      const result = await db.collection('exhibits').updateOne(
        { _id: new ObjectId(fix.id) },
        { $set: { combinations: fix.newCombo, updatedAt: new Date() } }
      );

      if (oldStr === newStr) {
        console.log(`⏭️  ${fix.name}`);
        console.log(`   Reason: ${fix.reason}`);
        console.log(`   Status: No change needed\n`);
        noChange++;
      } else if (result.modifiedCount > 0) {
        console.log(`✅ ${fix.name}`);
        console.log(`   Old: ${oldStr}`);
        console.log(`   New: ${newStr}`);
        console.log(`   Reason: ${fix.reason}\n`);
        updated++;
      } else {
        console.log(`❌ ${fix.name}`);
        console.log(`   Error: Document not found\n`);
        errors++;
      }
    } catch (error) {
      console.log(`❌ ${fix.name}`);
      console.log(`   Error: ${error.message}\n`);
      errors++;
    }
  }

  console.log('═'.repeat(65));
  console.log(`\n📊 MIGRATION SUMMARY:\n`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  No change: ${noChange}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   📁 Total: ${fixes.length}\n`);

  if (errors === 0) {
    console.log('✨ MIGRATION COMPLETE - All fixes applied successfully!\n');
  } else {
    console.log('⚠️  MIGRATION COMPLETE - But some errors occurred.\n');
  }

  await client.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
