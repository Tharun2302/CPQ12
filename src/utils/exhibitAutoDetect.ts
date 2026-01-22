/**
 * Auto-detection utility for exhibits
 * Extracts metadata from filename patterns
 */

export interface DetectedMetadata {
  combination: string;
  category: 'messaging' | 'content' | 'email';
  plan: 'basic' | 'standard' | 'advanced' | '';
  type: 'included' | 'notincluded' | '';
  name: string;
  keywords: string[];
  displayOrder: number;
}

/**
 * All available combinations by category
 */
const MESSAGING_COMBINATIONS = [
  { value: 'slack-to-teams', label: 'Slack to Teams' },
  { value: 'slack-to-google-chat', label: 'Slack to Google Chat' },
  { value: 'slack-to-slack', label: 'Slack to Slack' },
  { value: 'teams-to-teams', label: 'Teams to Teams' },
];

const CONTENT_COMBINATIONS = [
  { value: 'dropbox-to-mydrive', label: 'Dropbox to MyDrive' },
  { value: 'dropbox-to-sharedrive', label: 'Dropbox to Shared Drive' },
  { value: 'dropbox-to-sharepoint', label: 'Dropbox to SharePoint' },
  { value: 'dropbox-to-onedrive', label: 'Dropbox to OneDrive' },
  { value: 'dropbox-to-box', label: 'Dropbox to Box' },
  { value: 'dropbox-to-egnyte', label: 'Dropbox to Egnyte' },
  { value: 'dropbox-to-google', label: 'Dropbox to Google' },
  { value: 'dropbox-to-microsoft', label: 'Dropbox to Microsoft' },
  { value: 'box-to-box', label: 'Box to Box' },
  { value: 'box-to-dropbox', label: 'Box to Dropbox' },
  { value: 'box-to-sharefile', label: 'Box to ShareFile' },
  { value: 'box-to-aws-s3', label: 'Box to AWS S3' },
  { value: 'box-to-google-mydrive', label: 'Box to Google MyDrive' },
  { value: 'box-to-google-sharedrive', label: 'Box to Google Shared Drive' },
  { value: 'box-to-onedrive', label: 'Box to OneDrive' },
  { value: 'box-to-microsoft', label: 'Box to Microsoft' },
  { value: 'box-to-google', label: 'Box to Google' },
  { value: 'egnyte-to-google-sharedrive', label: 'Egnyte to Google Shared Drive' },
  { value: 'egnyte-to-sharepoint-online', label: 'Egnyte to SharePoint Online' },
  { value: 'egnyte-to-google-mydrive', label: 'Egnyte to Google MyDrive' },
  { value: 'egnyte-to-microsoft', label: 'Egnyte to Microsoft' },
  { value: 'egnyte-to-google', label: 'Egnyte to Google' },
  { value: 'google-sharedrive-to-egnyte', label: 'Google Shared Drive to Egnyte' },
  { value: 'google-sharedrive-to-google-sharedrive', label: 'Google Shared Drive to Google Shared Drive' },
  { value: 'google-sharedrive-to-onedrive', label: 'Google Shared Drive to OneDrive' },
  { value: 'google-sharedrive-to-sharepoint', label: 'Google Shared Drive to SharePoint' },
  { value: 'google-mydrive-to-dropbox', label: 'Google MyDrive to Dropbox' },
  { value: 'google-mydrive-to-egnyte', label: 'Google MyDrive to Egnyte' },
  { value: 'google-mydrive-to-onedrive', label: 'Google MyDrive to OneDrive' },
  { value: 'google-mydrive-to-sharepoint', label: 'Google MyDrive to SharePoint' },
  { value: 'google-mydrive-to-google-sharedrive', label: 'Google MyDrive to Google Shared Drive' },
  { value: 'google-mydrive-to-google-mydrive', label: 'Google MyDrive to Google MyDrive' },
  { value: 'sharefile-to-google-mydrive', label: 'ShareFile to Google MyDrive' },
  { value: 'sharefile-to-google-sharedrive', label: 'ShareFile to Google Shared Drive' },
  { value: 'sharefile-to-onedrive', label: 'ShareFile to OneDrive' },
  { value: 'sharefile-to-sharepoint', label: 'ShareFile to SharePoint' },
  { value: 'sharefile-to-sharefile', label: 'ShareFile to ShareFile' },
  { value: 'nfs-to-google', label: 'NFS to Google' },
  { value: 'nfs-to-microsoft', label: 'NFS to Microsoft' },
  { value: 'testing-to-production', label: 'Testing to Production' },
];

/**
 * Detect metadata from filename
 */
export function detectFromFilename(fileName: string): DetectedMetadata {
  const lower = fileName.toLowerCase().replace(/\.docx?$/i, '').trim();
  const parts = lower.split(/[-_\s]+/);

  // Detect category
  let category: 'messaging' | 'content' | 'email' = 'content';
  if (lower.includes('slack') || lower.includes('teams') || lower.includes('chat') || lower.includes('messaging')) {
    category = 'messaging';
  } else if (lower.includes('email') || lower.includes('gmail') || lower.includes('outlook')) {
    category = 'email';
  } else {
    category = 'content';
  }

  // Detect combination
  let combination = '';
  
  // Messaging combinations
  if (lower.includes('slack') && lower.includes('teams')) {
    combination = 'slack-to-teams';
  } else if (lower.includes('slack') && lower.includes('google') && lower.includes('chat')) {
    combination = 'slack-to-google-chat';
  } else if (lower.includes('slack') && lower.includes('slack')) {
    combination = 'slack-to-slack';
  } else if (lower.includes('teams') && lower.includes('teams')) {
    combination = 'teams-to-teams';
  }
  // Content combinations
  else if (lower.includes('dropbox') && lower.includes('mydrive')) {
    combination = 'dropbox-to-mydrive';
  } else if (lower.includes('dropbox') && lower.includes('sharedrive')) {
    combination = 'dropbox-to-sharedrive';
  } else if (lower.includes('dropbox') && lower.includes('sharepoint')) {
    combination = 'dropbox-to-sharepoint';
  } else if (lower.includes('dropbox') && lower.includes('onedrive')) {
    combination = 'dropbox-to-onedrive';
  } else if (lower.includes('dropbox') && lower.includes('box') && !lower.includes('to-box')) {
    combination = 'dropbox-to-box';
  } else if (lower.includes('dropbox') && lower.includes('egnyte')) {
    combination = 'dropbox-to-egnyte';
  } else if (lower.includes('dropbox') && lower.includes('google') && !lower.includes('mydrive') && !lower.includes('sharedrive')) {
    combination = 'dropbox-to-google';
  } else if (lower.includes('dropbox') && lower.includes('microsoft')) {
    combination = 'dropbox-to-microsoft';
  } else if (lower.includes('box') && lower.includes('box') && !lower.includes('dropbox')) {
    combination = 'box-to-box';
  } else if (lower.includes('box') && lower.includes('dropbox')) {
    combination = 'box-to-dropbox';
  } else if (lower.includes('box') && lower.includes('sharefile')) {
    combination = 'box-to-sharefile';
  } else if (lower.includes('box') && lower.includes('aws') && lower.includes('s3')) {
    combination = 'box-to-aws-s3';
  } else if (lower.includes('box') && lower.includes('google') && lower.includes('mydrive')) {
    combination = 'box-to-google-mydrive';
  } else if (lower.includes('box') && lower.includes('google') && lower.includes('sharedrive')) {
    combination = 'box-to-google-sharedrive';
  } else if (lower.includes('box') && lower.includes('onedrive') && !lower.includes('dropbox')) {
    combination = 'box-to-onedrive';
  } else if (lower.includes('box') && lower.includes('microsoft')) {
    combination = 'box-to-microsoft';
  } else if (lower.includes('box') && lower.includes('google') && !lower.includes('mydrive') && !lower.includes('sharedrive')) {
    combination = 'box-to-google';
  } else if (lower.includes('egnyte') && lower.includes('google') && lower.includes('sharedrive')) {
    combination = 'egnyte-to-google-sharedrive';
  } else if (lower.includes('egnyte') && lower.includes('sharepoint')) {
    combination = 'egnyte-to-sharepoint-online';
  } else if (lower.includes('egnyte') && lower.includes('google') && lower.includes('mydrive')) {
    combination = 'egnyte-to-google-mydrive';
  } else if (lower.includes('egnyte') && lower.includes('microsoft')) {
    combination = 'egnyte-to-microsoft';
  } else if (lower.includes('egnyte') && lower.includes('google') && !lower.includes('mydrive') && !lower.includes('sharedrive') && !lower.includes('microsoft')) {
    combination = 'egnyte-to-google';
  } else if (lower.includes('google') && lower.includes('sharedrive') && lower.includes('egnyte')) {
    combination = 'google-sharedrive-to-egnyte';
  } else if (lower.includes('google') && lower.includes('sharedrive') && lower.includes('google') && lower.includes('sharedrive')) {
    combination = 'google-sharedrive-to-google-sharedrive';
  } else if (lower.includes('google') && lower.includes('sharedrive') && lower.includes('onedrive')) {
    combination = 'google-sharedrive-to-onedrive';
  } else if (lower.includes('google') && lower.includes('sharedrive') && lower.includes('sharepoint')) {
    combination = 'google-sharedrive-to-sharepoint';
  } else if (lower.includes('google') && lower.includes('mydrive') && lower.includes('dropbox')) {
    combination = 'google-mydrive-to-dropbox';
  } else if (lower.includes('google') && lower.includes('mydrive') && lower.includes('egnyte')) {
    combination = 'google-mydrive-to-egnyte';
  } else if (lower.includes('google') && lower.includes('mydrive') && lower.includes('onedrive')) {
    combination = 'google-mydrive-to-onedrive';
  } else if (lower.includes('google') && lower.includes('mydrive') && lower.includes('sharepoint')) {
    combination = 'google-mydrive-to-sharepoint';
  } else if (lower.includes('google') && lower.includes('mydrive') && lower.includes('sharedrive')) {
    combination = 'google-mydrive-to-google-sharedrive';
  } else if (lower.includes('google') && lower.includes('mydrive') && lower.includes('google') && lower.includes('mydrive')) {
    combination = 'google-mydrive-to-google-mydrive';
  } else if (lower.includes('sharefile') && lower.includes('google') && lower.includes('mydrive')) {
    combination = 'sharefile-to-google-mydrive';
  } else if (lower.includes('sharefile') && lower.includes('google') && lower.includes('sharedrive')) {
    combination = 'sharefile-to-google-sharedrive';
  } else if (lower.includes('sharefile') && lower.includes('onedrive')) {
    combination = 'sharefile-to-onedrive';
  } else if (lower.includes('sharefile') && lower.includes('sharepoint')) {
    combination = 'sharefile-to-sharepoint';
  } else if (lower.includes('sharefile') && lower.includes('sharefile')) {
    combination = 'sharefile-to-sharefile';
  } else if (lower.includes('nfs') && lower.includes('google')) {
    combination = 'nfs-to-google';
  } else if (lower.includes('nfs') && lower.includes('microsoft')) {
    combination = 'nfs-to-microsoft';
  }

  // Detect plan
  let plan: 'basic' | 'standard' | 'advanced' | '' = '';
  if (lower.includes('basic')) {
    plan = 'basic';
  } else if (lower.includes('standard')) {
    plan = 'standard';
  } else if (lower.includes('advanced')) {
    plan = 'advanced';
  }

  // Detect type
  let type: 'included' | 'notincluded' | '' = '';
  if (lower.includes('included') || lower.includes('include')) {
    type = 'included';
  } else if (lower.includes('notincluded') || lower.includes('not-included') || lower.includes('not included') || lower.includes('excluded')) {
    type = 'notincluded';
  }

  // If no predefined combination found, try to extract custom combination
  // Remove plan type and include/notinclude parts to get base combination
  if (!combination) {
    let baseCombination = lower;
    
    // Remove plan types
    baseCombination = baseCombination
      .replace(/\b(basic|standard|advanced|premium|enterprise)\b/g, '')
      .trim();
    
    // Remove include/notinclude variations
    baseCombination = baseCombination
      .replace(/\b(included|include|notincluded|not-included|not included|excluded)\b/g, '')
      .trim();
    
    // Clean up extra dashes and spaces
    baseCombination = baseCombination.replace(/[-_\s]+/g, '-').replace(/^-+|-+$/g, '');
    
    // If we have a reasonable combination (at least 3 chars and contains "to"), use it
    if (baseCombination.length >= 3 && baseCombination.includes('to')) {
      combination = baseCombination;
    }
    // If no "to" pattern but we have a word that could be a combination base (like "testing")
    // and we detected include/notinclude or plan, extract the base word
    else if (baseCombination.length >= 3 && (type || plan)) {
      // Extract first meaningful word(s) as potential combination base
      const words = baseCombination.split(/[-_\s]+/).filter(w => w.length > 2);
      if (words.length > 0) {
        // Don't set combination here - let user enter it manually
        // But we've already detected type and plan which is helpful
      }
    }
  }

  // Generate name
  const name = generateName(combination, category, plan, type);

  // Extract keywords
  const keywords = extractKeywords(parts, combination, category, plan);

  // Get display order
  const displayOrder = getDisplayOrder(combination, plan, type);

  return {
    combination,
    category,
    plan,
    type,
    name,
    keywords,
    displayOrder,
  };
}

/**
 * Generate exhibit name from detected metadata
 */
function generateName(
  combination: string,
  category: string,
  plan: string,
  type: string
): string {
  if (!combination) {
    return 'New Exhibit';
  }

  const combinationLabel = getCombinationLabel(combination);
  const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : '';
  const typeLabel = type === 'included' ? 'Include' : type === 'notincluded' ? 'Not Include' : '';

  if (plan && type) {
    return `${combinationLabel} ${planLabel} Plan - ${planLabel} ${typeLabel}`;
  } else if (plan) {
    return `${combinationLabel} ${planLabel} Plan`;
  } else if (type) {
    return `${combinationLabel} - ${typeLabel}`;
  }

  return combinationLabel;
}

/**
 * Get human-readable label for combination
 */
function getCombinationLabel(combination: string): string {
  const all = [...MESSAGING_COMBINATIONS, ...CONTENT_COMBINATIONS];
  const found = all.find(c => c.value === combination);
  return found ? found.label.toUpperCase() : combination.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Extract keywords from filename parts
 */
function extractKeywords(
  parts: string[],
  combination: string,
  category: string,
  plan: string
): string[] {
  const keywords = new Set<string>();

  // Add combination parts
  if (combination) {
    combination.split('-').forEach(part => {
      if (part && part !== 'to') {
        keywords.add(part);
      }
    });
  }

  // Add category
  if (category) {
    keywords.add(category);
  }

  // Add plan
  if (plan) {
    keywords.add(plan);
  }

  // Add significant parts from filename
  parts.forEach(part => {
    if (part && part.length > 2 && part !== 'to' && part !== 'plan' && part !== 'and') {
      keywords.add(part);
    }
  });

  return Array.from(keywords).slice(0, 10); // Limit to 10 keywords
}

/**
 * Get display order based on combination and plan
 */
function getDisplayOrder(combination: string, plan: string, type: string): number {
  // Base order by plan
  const planOrder = plan === 'basic' ? 1 : plan === 'standard' ? 2 : plan === 'advanced' ? 3 : 999;

  // Type order
  const typeOrder = type === 'included' ? 0 : type === 'notincluded' ? 1 : 0;

  return planOrder * 10 + typeOrder;
}

/**
 * Get all combinations for a category
 */
export function getCombinationsForCategory(category: 'messaging' | 'content' | 'email'): Array<{ value: string; label: string }> {
  if (category === 'messaging') {
    return MESSAGING_COMBINATIONS;
  } else if (category === 'content') {
    return CONTENT_COMBINATIONS;
  }
  return [];
}
