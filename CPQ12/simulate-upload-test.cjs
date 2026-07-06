/**
 * Simulation: Upload two exhibits with same combination but different includeType
 *
 * Before Fix:
 * Upload 1: "ShareFile to Google Shared Drive" + "Include"
 *   → combination: "sharefile-to-google-sharedrive-included-standard" ❌ WRONG
 * Upload 2: "ShareFile to Google Shared Drive" + "NotInclude"
 *   → combination: "sharefile-to-google-sharedrive-notincluded-standard" ❌ WRONG
 * Result: Different combinations, won't group together ❌
 *
 * After Fix:
 * Upload 1: "ShareFile to Google Shared Drive" + "Include"
 *   → combination: "sharefile-to-google-sharedrive" ✅ CORRECT
 * Upload 2: "ShareFile to Google Shared Drive" + "NotInclude"
 *   → combination: "sharefile-to-google-sharedrive" ✅ CORRECT
 * Result: Same combination, will group together ✅
 */

// Simulate the OLD buildCombinationKey (WRONG)
function buildCombinationKeyOLD(base, includeType, planType) {
  const b = base.toLowerCase().replace(/\s+/g, '-');
  const t = String(includeType || '').toLowerCase();
  const p = String(planType || '').toLowerCase();
  return [b || 'all', t, p].filter(Boolean).join('-');
}

// Simulate the NEW buildCombinationKey (FIXED)
function buildCombinationKeyNEW(base, includeType, planType) {
  // IMPORTANT: Combination key should ONLY be the base migration path.
  // Include type and plan type should NOT be part of the key.
  const b = base.toLowerCase().replace(/\s+/g, '-');
  return b || 'all';
}

console.log('🧪 UPLOAD COMBINATION GROUPING TEST\n');
console.log('═'.repeat(70));

// Scenario: User uploads two exhibits with same combination but different include types
const base = 'ShareFile to Google Shared Drive';
const includeType1 = 'included';
const includeType2 = 'notincluded';
const planType = 'standard';

console.log('\n📤 SCENARIO: Upload 2 exhibits for same migration\n');
console.log(`   Combination: "${base}"`);
console.log(`   Plan Type: ${planType}`);
console.log(`   Variants: Include + Not Include\n`);

console.log('═'.repeat(70));
console.log('\n❌ OLD CODE (BROKEN):\n');

const oldCombo1 = buildCombinationKeyOLD(base, includeType1, planType);
const oldCombo2 = buildCombinationKeyOLD(base, includeType2, planType);

console.log(`Upload 1 (Include):`);
console.log(`  Base: "${base}"`);
console.log(`  Include Type: ${includeType1}`);
console.log(`  Plan Type: ${planType}`);
console.log(`  → Combination Key: "${oldCombo1}"`);
console.log('');

console.log(`Upload 2 (Not Include):`);
console.log(`  Base: "${base}"`);
console.log(`  Include Type: ${includeType2}`);
console.log(`  Plan Type: ${planType}`);
console.log(`  → Combination Key: "${oldCombo2}"`);
console.log('');

console.log(`Comparison:`);
console.log(`  Combo1: "${oldCombo1}"`);
console.log(`  Combo2: "${oldCombo2}"`);

if (oldCombo1 === oldCombo2) {
  console.log(`  ✅ SAME - they will group together`);
} else {
  console.log(`  ❌ DIFFERENT - they won't group together`);
  console.log(`  Problem: includeType and planType are in the key!`);
}

console.log('\n═'.repeat(70));
console.log('\n✅ NEW CODE (FIXED):\n');

const newCombo1 = buildCombinationKeyNEW(base, includeType1, planType);
const newCombo2 = buildCombinationKeyNEW(base, includeType2, planType);

console.log(`Upload 1 (Include):`);
console.log(`  Base: "${base}"`);
console.log(`  Include Type: ${includeType1} (STORED SEPARATELY)`);
console.log(`  Plan Type: ${planType} (STORED SEPARATELY)`);
console.log(`  → Combination Key: "${newCombo1}"`);
console.log('');

console.log(`Upload 2 (Not Include):`);
console.log(`  Base: "${base}"`);
console.log(`  Include Type: ${includeType2} (STORED SEPARATELY)`);
console.log(`  Plan Type: ${planType} (STORED SEPARATELY)`);
console.log(`  → Combination Key: "${newCombo2}"`);
console.log('');

console.log(`Comparison:`);
console.log(`  Combo1: "${newCombo1}"`);
console.log(`  Combo2: "${newCombo2}"`);

if (newCombo1 === newCombo2) {
  console.log(`  ✅ SAME - they will group together`);
  console.log(`  Solution: includeType and planType are stored separately!`);
} else {
  console.log(`  ❌ DIFFERENT - they won't group together`);
}

console.log('\n═'.repeat(70));
console.log('\n📊 DATABASE STORAGE COMPARISON:\n');

console.log('OLD (broken) - exhibit 1:');
console.log('  {');
console.log(`    name: "ShareFile to Google Shared Drive Standard Plan - Standard Include",`);
console.log(`    combinations: ["${oldCombo1}"],`);
console.log('    planType: undefined,  ❌ Not stored');
console.log('    includeType: undefined  ❌ Not stored');
console.log('  }');
console.log('');

console.log('OLD (broken) - exhibit 2:');
console.log('  {');
console.log(`    name: "ShareFile to Google Shared Drive Standard Plan - Standard Not Include",`);
console.log(`    combinations: ["${oldCombo2}"],`);
console.log('    planType: undefined,  ❌ Not stored');
console.log('    includeType: undefined  ❌ Not stored');
console.log('  }');
console.log('');
console.log('Result: Different combinations - won\'t group\\n');

console.log('─'.repeat(70));
console.log('');

console.log('NEW (fixed) - exhibit 1:');
console.log('  {');
console.log(`    name: "ShareFile to Google Shared Drive Standard Plan - Standard Include",`);
console.log(`    combinations: ["${newCombo1}"],`);
console.log(`    planType: "standard",  ✅ Stored separately`);
console.log(`    includeType: "included"  ✅ Stored separately`);
console.log('  }');
console.log('');

console.log('NEW (fixed) - exhibit 2:');
console.log('  {');
console.log(`    name: "ShareFile to Google Shared Drive Standard Plan - Standard Not Include",`);
console.log(`    combinations: ["${newCombo2}"],`);
console.log(`    planType: "standard",  ✅ Stored separately`);
console.log(`    includeType: "notincluded"  ✅ Stored separately`);
console.log('  }');
console.log('');
console.log('Result: Same combination → Will group ✅\n');

console.log('═'.repeat(70));
console.log('\n🎯 RESULT:\n');

if (newCombo1 === newCombo2) {
  console.log('✅ FIX WORKS! Include and Not Include exhibits will now group together.');
  console.log(`   Both use combination key: "${newCombo1}"`);
  console.log('   In the UI, they will appear in the same folder.');
} else {
  console.log('❌ Fix did not work as expected.');
}

console.log('\n═'.repeat(70));
