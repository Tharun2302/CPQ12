const fs = require('fs');
const path = require('path');

/**
 * Seeds default exhibits into the database
 */
async function seedDefaultExhibits(db) {
  if (!db) {
    console.error('❌ Database connection required for seeding exhibits');
    return false;
  }

  console.log('🌱 Starting exhibits seeding process...');

  const defaultExhibits = [
    // Messaging exhibits
    {
      name: 'Slack to Teams Basic Plan',
      description: 'Basic plan documentation for Slack to Teams migration',
      fileName: 'exhibit-slack-to-teams-basic-plan.docx',
      combinations: ['slack-to-teams'],
      category: 'messaging',
      isRequired: false,
      displayOrder: 1,
      keywords: ['slack', 'teams', 'messaging', 'basic']
    },
    // Google MyDrive to MyDrive exhibits
    {
      name: 'Google MyDrive Compliance',
      description: 'Google Workspace compliance and security documentation for MyDrive migrations',
      fileName: 'exhibit-mydrive-to-mydrive-compliance.docx',
      // NOTE: You were testing "google-mydrive-to-google-sharedrive" in UI, so include that too.
      // If you want this exhibit for *all* content combinations, change to: combinations: ['all']
      combinations: ['google-mydrive-to-google-mydrive', 'google-mydrive-to-google-sharedrive'],
      category: 'content',
      isRequired: false,
      displayOrder: 1,
      keywords: ['google', 'mydrive', 'compliance', 'security']
    },
    // NFS to Google MyDrive exhibits
    {
      name: 'NFS to Google MyDrive Compliance',
      description: 'Compliance and security documentation for NFS to Google MyDrive migrations',
      fileName: 'exhibit-nfs-to-google-mydrive-compliance.docx',
      // Show for ALL Content combinations
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 5,
      keywords: ['nfs', 'google', 'mydrive', 'compliance', 'security']
    },
    {
      name: 'MyDrive Migration Guide',
      description: 'Step-by-step preparation guide for Google MyDrive migration',
      fileName: 'exhibit-mydrive-to-mydrive-guide.docx',
      combinations: ['google-mydrive-to-google-mydrive'],
      category: 'content',
      isRequired: false,
      displayOrder: 2,
      keywords: ['google', 'mydrive', 'guide', 'migration']
    },
    {
      name: 'Workspace Permissions',
      description: 'Permissions mapping and access control documentation',
      fileName: 'exhibit-mydrive-to-mydrive-permissions.docx',
      combinations: ['google-mydrive-to-google-mydrive'],
      category: 'content',
      isRequired: false,
      displayOrder: 3,
      keywords: ['permissions', 'access', 'workspace']
    },
    {
      name: 'Drive File Structure',
      description: 'File organization and folder structure best practices',
      fileName: 'exhibit-mydrive-to-mydrive-structure.docx',
      combinations: ['google-mydrive-to-google-mydrive'],
      category: 'content',
      isRequired: false,
      displayOrder: 4,
      keywords: ['structure', 'files', 'folders']
    },
    // ShareFile to Google Shared Drive exhibits (Included + Excluded)
    {
      name: 'ShareFile to Google Shared Drive - Included Features',
      description: 'Features included in ShareFile to Google Shared Drive Advanced Plan migration',
      fileName: 'exhibit-sharefile-to-sharedrive-advanced-included.docx',
      combinations: ['sharefile-to-google-sharedrive'],
      category: 'content',
      exhibitType: 'included',
      isRequired: false,
      displayOrder: 1,
      keywords: ['sharefile', 'google', 'sharedrive', 'included', 'features', 'advanced']
    },
    {
      name: 'ShareFile to Google Shared Drive - Not Included Features',
      description: 'Features NOT included in ShareFile to Google Shared Drive Advanced Plan migration',
      fileName: 'exhibit-sharefile-to-sharedrive-advanced-not-included.docx',
      combinations: ['sharefile-to-google-sharedrive'],
      category: 'content',
      exhibitType: 'excluded',
      isRequired: false,
      displayOrder: 2,
      keywords: ['sharefile', 'google', 'sharedrive', 'excluded', 'not-included', 'features', 'advanced']
    },
    // General exhibits (available for all combinations)
    {
      name: 'Data Privacy Agreement',
      description: 'Standard data privacy and GDPR compliance agreement',
      fileName: 'exhibit-data-privacy.docx',
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 10,
      keywords: ['privacy', 'gdpr', 'data', 'security']
    },
    {
      name: 'SLA Terms',
      description: 'Service Level Agreement terms and uptime guarantees',
      fileName: 'exhibit-sla-terms.docx',
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 11,
      keywords: ['sla', 'service', 'uptime', 'support']
    },
    {
      name: 'Migration Checklist',
      description: 'Pre-migration checklist and preparation requirements',
      fileName: 'exhibit-migration-checklist.docx',
      combinations: ['all'],
      category: 'content',
      isRequired: false,
      displayOrder: 12,
      keywords: ['checklist', 'migration', 'preparation']
    }
  ];

  const exhibitsDir = path.resolve(__dirname, 'backend-exhibits');
  let seededCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  // Check if directory exists
  if (!fs.existsSync(exhibitsDir)) {
    console.warn(`⚠️ Exhibits directory not found: ${exhibitsDir}`);
    console.log('📁 Creating backend-exhibits directory...');
    fs.mkdirSync(exhibitsDir, { recursive: true });
  }

  for (const exhibit of defaultExhibits) {
    try {
      const filePath = path.join(exhibitsDir, exhibit.fileName);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ File not found: ${filePath}, skipping...`);
        skippedCount++;
        continue;
      }

      const fileStats = fs.statSync(filePath);
      const fileBuffer = fs.readFileSync(filePath);
      const fileData = fileBuffer.toString('base64');

      const exhibitDoc = {
        ...exhibit,
        fileData,
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: fileStats.size,
        updatedAt: new Date(),
        version: 1
      };

      // Check if exhibit already exists
      const existing = await db.collection('exhibits').findOne({
        fileName: exhibit.fileName
      });

      if (existing) {
        // Update if file is newer OR metadata changed (combinations/category/name/etc).
        const existingModified = existing.updatedAt || existing.createdAt || new Date(0);
        const metadataChanged = (() => {
          const keysToCompare = ['name', 'description', 'fileName', 'category', 'isRequired', 'displayOrder', 'keywords', 'combinations', 'exhibitType'];
          for (const key of keysToCompare) {
            const a = existing[key];
            const b = exhibit[key];
            if (Array.isArray(a) || Array.isArray(b)) {
              const aArr = Array.isArray(a) ? a : [];
              const bArr = Array.isArray(b) ? b : [];
              if (aArr.length !== bArr.length) return true;
              const aSorted = [...aArr].map(String).sort();
              const bSorted = [...bArr].map(String).sort();
              for (let i = 0; i < aSorted.length; i++) {
                if (aSorted[i] !== bSorted[i]) return true;
              }
            } else if ((a ?? null) !== (b ?? null)) {
              return true;
            }
          }
          return false;
        })();

        if (fileStats.mtime > existingModified || metadataChanged) {
          await db.collection('exhibits').updateOne(
            { fileName: exhibit.fileName },
            {
              $set: {
                ...exhibitDoc,
                createdAt: existing.createdAt,
                version: (existing.version || 0) + 1
              }
            }
          );
          console.log(`✅ Updated exhibit: ${exhibit.name}${metadataChanged && fileStats.mtime <= existingModified ? ' (metadata changed)' : ''}`);
          updatedCount++;
        } else {
          console.log(`⏭️  Skipped (up to date): ${exhibit.name}`);
          skippedCount++;
        }
      } else {
        // Insert new exhibit
        exhibitDoc.createdAt = new Date();
        await db.collection('exhibits').insertOne(exhibitDoc);
        console.log(`✅ Seeded exhibit: ${exhibit.name}`);
        seededCount++;
      }

    } catch (error) {
      console.error(`❌ Error seeding exhibit ${exhibit.name}:`, error);
    }
  }

  console.log(`\n📊 Exhibits Seeding Summary:`);
  console.log(`   ✅ New: ${seededCount}`);
  console.log(`   🔄 Updated: ${updatedCount}`);
  console.log(`   ⏭️  Skipped: ${skippedCount}`);
  console.log(`   📁 Total in config: ${defaultExhibits.length}\n`);

  return true;
}

module.exports = { seedDefaultExhibits };



