import { PricingTier, ConfigurationData, PricingCalculation } from '../types/pricing';
 
export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'basic',
    name: 'Basic',
    perUserCost: 30.0,
    perGBCost: 1.00,
    managedMigrationCost: 300,
    instanceCost: 500,
    userLimits: { from: 1, to: Infinity },
    gbLimits: { from: 1, to: 10000 },
    features: [
      'Basic support',
      'Standard migration',
      'Email support',
      'Basic reporting'
    ]
  },
  {
    id: 'standard',
    name: 'Standard',
    perUserCost: 35.0,
    perGBCost: 1.50,
    managedMigrationCost: 300,
    instanceCost: 500,
    userLimits: { from: 1, to: Infinity },
    gbLimits: { from: 1, to: 10000 },
    features: [
      'Priority support',
      'Advanced migration',
      'Phone & email support',
      'Advanced reporting',
      'Custom integrations'
    ]
  },
  {
    id: 'advanced',
    name: 'Advanced',
    perUserCost: 40.0,
    perGBCost: 1.80,
    managedMigrationCost: 300,
    instanceCost: 500,
    userLimits: { from: 1, to: Infinity },
    gbLimits: { from: 1, to: 10000 },
    features: [
      'Dedicated support',
      'Premium migration',
      '24/7 phone support',
      'Enterprise reporting',
      'Full customization',
      'SLA guarantee'
    ]
  }
];

// Helper function to calculate Messaging pricing (extracted for reuse in Multi combination)
function calculateMessagingPricing(config: ConfigurationData, tier: PricingTier): PricingCalculation {
  const getInstanceTypeCost = (instanceType: string): number => {
    switch (instanceType) {
      case 'Small': return 500;
      case 'Standard': return 1000;
      case 'Large': return 2000;
      case 'Extra Large': return 5000;
      default: return 500;
    }
  };

  const getInstanceCost = (instanceType: string, duration: number): number => {
    const baseCost = getInstanceTypeCost(instanceType);
    return baseCost * duration;
  };

  const perUserCostLookupByPlan: Record<string, { threshold: number; value: number }[]> = {
    basic: [
      { threshold: 100, value: 18 },
      { threshold: 250, value: 15 },
      { threshold: 500, value: 12 },
      { threshold: 1000, value: 10 },
      { threshold: 2500, value: 8 },
      { threshold: 5000, value: 6 },
      { threshold: 10000, value: 4 },
      { threshold: 25000, value: 3 },
      { threshold: 50000, value: 3 },
      { threshold: Infinity, value: 3 }
    ],
    standard: [
      { threshold: 100, value: 22 },
      { threshold: 250, value: 20 },
      { threshold: 500, value: 18 },
      { threshold: 1000, value: 15 },
      { threshold: 2500, value: 12 },
      { threshold: 5000, value: 10 },
      { threshold: 10000, value: 8 },
      { threshold: 25000, value: 6 },
      { threshold: 50000, value: 4 },
      { threshold: Infinity, value: 3 }
    ],
    advanced: [
      { threshold: 100, value: 34 },
      { threshold: 250, value: 32 },
      { threshold: 500, value: 30 },
      { threshold: 1000, value: 28 },
      { threshold: 2500, value: 24 },
      { threshold: 5000, value: 18 },
      { threshold: 10000, value: 12 },
      { threshold: 25000, value: 10 },
      { threshold: 50000, value: 8 },
      { threshold: Infinity, value: 6 }
    ]
  };

  const getPerUserCostForPlan = (userCount: number, planKey: 'basic' | 'standard' | 'advanced'): number => {
    const lookupArray = perUserCostLookupByPlan[planKey];
    for (let i = 0; i < lookupArray.length; i++) {
      if (userCount <= lookupArray[i].threshold) {
        return lookupArray[i].value;
      }
    }
    return lookupArray[lookupArray.length - 1].value;
  };

  const getManagedMigrationLookupValue = (userCount: number, planKey: 'basic' | 'standard' | 'advanced'): number => {
    const lookupArray = perUserCostLookupByPlan[planKey];
    for (let i = 0; i < lookupArray.length; i++) {
      if (userCount <= lookupArray[i].threshold) {
        return lookupArray[i].value;
      }
    }
    return lookupArray[lookupArray.length - 1].value;
  };

  const planKey = tier.name.toLowerCase() as 'basic' | 'standard' | 'advanced';
  const perUserRate = getPerUserCostForPlan(config.numberOfUsers, planKey);
  const userCost = perUserRate * config.numberOfUsers;
  const dataCost = 0;
  const instanceCost = getInstanceCost(config.instanceType, config.duration) * config.numberOfInstances;
  const lookupValue = getManagedMigrationLookupValue(config.numberOfUsers, planKey);
  const s38 = (lookupValue * config.numberOfUsers) / 4;
  const floor = planKey === 'advanced' ? 800 : (planKey === 'standard' ? 600 : 400);
  const migrationCost = Math.max(floor, s38);
  let totalCost = userCost + dataCost + instanceCost + migrationCost;
  
  // Skip minimum for Multi combination (minimum will be applied to overall total)
  const isMultiCombination = config.combination?.startsWith('multi-combination-');
  const MINIMUM_TOTAL = 2500;
  let adjustedUserCost = userCost;
  
  if (!isMultiCombination && totalCost < MINIMUM_TOTAL) {
    const deficit = MINIMUM_TOTAL - totalCost;
    adjustedUserCost = userCost + deficit;
    totalCost = MINIMUM_TOTAL;
  }

  return {
    userCost: adjustedUserCost,
    dataCost,
    migrationCost,
    instanceCost,
    totalCost,
    tier
  };
}

// Helper function to calculate Content pricing (extracted for reuse in Multi combination)
function calculateContentPricing(config: ConfigurationData, tier: PricingTier): PricingCalculation {
  const getInstanceTypeCost = (instanceType: string): number => {
    switch (instanceType) {
      case 'Small': return 500;
      case 'Standard': return 1000;
      case 'Large': return 2000;
      case 'Extra Large': return 5000;
      default: return 500;
    }
  };

  const getInstanceCost = (instanceType: string, duration: number): number => {
    const baseCost = getInstanceTypeCost(instanceType);
    return baseCost * duration;
  };

  const vwLookup = [
    { threshold: 25, value: 25 },
    { threshold: 50, value: 20 },
    { threshold: 100, value: 18 },
    { threshold: 250, value: 16 },
    { threshold: 500, value: 14 },
    { threshold: 1000, value: 12.5 },
    { threshold: 1500, value: 11 },
    { threshold: 2000, value: 9 },
    { threshold: 5000, value: 8 },
    { threshold: 10000, value: 7.5 },
    { threshold: 50000, value: 7 },
    // Keep a non-zero floor so ultra-high user counts still accrue per-user cost
    { threshold: Infinity, value: 7 }
  ];

  const vxLookup = [
    { threshold: 25, value: 1 },
    { threshold: 50, value: 1 },
    { threshold: 100, value: 2 },
    { threshold: 250, value: 2 },
    { threshold: 500, value: 3 },
    { threshold: 1000, value: 4 },
    { threshold: 1500, value: 5 },
    { threshold: 2000, value: 6 },
    { threshold: 5000, value: 7 },
    { threshold: 10000, value: 8 },
    { threshold: 30000, value: 10 },
    { threshold: Infinity, value: 10 }
  ];

  const qrLookup = [
    { threshold: 500, value: 1 },
    { threshold: 2500, value: 0.8 },
    { threshold: 5000, value: 0.7 },
    { threshold: 10000, value: 0.6 },
    { threshold: 20000, value: 0.5 },
    { threshold: 50000, value: 0.45 },
    { threshold: 100000, value: 0.4 },
    { threshold: 500000, value: 0.35 },
    { threshold: 1000000, value: 0.32 },
    { threshold: 2000000, value: 0.28 },
    { threshold: 3000001, value: 0.25 },
    { threshold: Infinity, value: 0.25 }
  ];

  const qsLookup = [
    { threshold: 500, value: 1 },
    { threshold: 2500, value: 2 },
    { threshold: 5000, value: 3 },
    { threshold: 10000, value: 4 },
    { threshold: 20000, value: 5 },
    { threshold: 50000, value: 6 },
    { threshold: 100000, value: 7 },
    { threshold: 500000, value: 9 },
    { threshold: 1000000, value: 10 },
    { threshold: 2000000, value: 11 },
    { threshold: 3000001, value: 11 },
    { threshold: Infinity, value: 11 }
  ];

  const tierCostLookup = [
    { tier: 1, cost: 300 },
    { tier: 2, cost: 600 },
    { tier: 3, cost: 1500 },
    { tier: 4, cost: 2250 },
    { tier: 5, cost: 4500 },
    { tier: 6, cost: 9000 },
    { tier: 7, cost: 12000 },
    { tier: 8, cost: 15000 },
    { tier: 9, cost: 18750 },
    { tier: 10, cost: 22500 },
    { tier: 11, cost: 30000 }
  ];

  const lookupValue = (value: number, lookupArray: { threshold: number; value: number }[]): number => {
    for (let i = 0; i < lookupArray.length; i++) {
      if (value <= lookupArray[i].threshold) {
        return lookupArray[i].value;
      }
    }
    return lookupArray[lookupArray.length - 1].value;
  };

  const planKey = tier.name.toLowerCase() as 'basic' | 'standard' | 'advanced';
  const k2Value = lookupValue(config.numberOfUsers, vwLookup);

  let userCostPerUser: number;
  if (planKey === 'basic') {
    userCostPerUser = k2Value * 1.2;
  } else if (planKey === 'standard') {
    userCostPerUser = k2Value * 1.4;
  } else {
    userCostPerUser = k2Value * 1.6;
  }
  const userCost = userCostPerUser * config.numberOfUsers;

  const k3Value = lookupValue(config.dataSizeGB, qrLookup);

  let perGBCost: number;
  if (planKey === 'basic') {
    perGBCost = k3Value;
  } else if (planKey === 'standard') {
    perGBCost = k3Value * 1.5;
  } else {
    perGBCost = k3Value * 1.8;
  }
  const dataCost = perGBCost * config.dataSizeGB;

  const k4Value = lookupValue(config.numberOfUsers, vxLookup);
  const k5Value = lookupValue(config.dataSizeGB, qsLookup);
  const k6Value = Math.max(k4Value, k5Value);
  const tierCostEntry = tierCostLookup.find(t => t.tier === k6Value);
  const migrationCost = tierCostEntry ? tierCostEntry.cost : 300;
  const instanceCost = getInstanceCost(config.instanceType, config.duration) * config.numberOfInstances;

  let totalCost = userCost + dataCost + instanceCost + migrationCost;
  
  // Skip minimum for Multi combination (minimum will be applied to overall total)
  const isMultiCombination = config.combination?.startsWith('multi-combination-');
  const MINIMUM_TOTAL = 2500;
  let adjustedUserCost = userCost;
  
  if (!isMultiCombination && totalCost < MINIMUM_TOTAL) {
    const deficit = MINIMUM_TOTAL - totalCost;
    adjustedUserCost = userCost + deficit;
    totalCost = MINIMUM_TOTAL;
  }

  return {
    userCost: adjustedUserCost,
    dataCost,
    migrationCost,
    instanceCost,
    totalCost,
    tier
  };
}

// Helper function to calculate Email pricing
function calculateEmailPricing(config: ConfigurationData, tier: PricingTier): PricingCalculation {
  const getInstanceTypeCost = (instanceType: string): number => {
    switch (instanceType) {
      case 'Small': return 500;
      case 'Standard': return 1000;
      case 'Large': return 2000;
      case 'Extra Large': return 5000;
      default: return 500;
    }
  };

  const getInstanceCost = (instanceType: string, duration: number): number => {
    const baseCost = getInstanceTypeCost(instanceType);
    return baseCost * duration;
  };

  // Messaging lookup tables (reused for Email managed migration cost calculation)
  const perUserCostLookupByPlan: Record<string, { threshold: number; value: number }[]> = {
    basic: [
      { threshold: 100, value: 18 },
      { threshold: 250, value: 15 },
      { threshold: 500, value: 12 },
      { threshold: 1000, value: 10 },
      { threshold: 2500, value: 8 },
      { threshold: 5000, value: 6 },
      { threshold: 10000, value: 4 },
      { threshold: 25000, value: 3 },
      { threshold: 50000, value: 3 },
      { threshold: Infinity, value: 3 }
    ],
    standard: [
      { threshold: 100, value: 22 },
      { threshold: 250, value: 20 },
      { threshold: 500, value: 18 },
      { threshold: 1000, value: 15 },
      { threshold: 2500, value: 12 },
      { threshold: 5000, value: 10 },
      { threshold: 10000, value: 8 },
      { threshold: 25000, value: 6 },
      { threshold: 50000, value: 4 },
      { threshold: Infinity, value: 3 }
    ],
    advanced: [
      { threshold: 100, value: 34 },
      { threshold: 250, value: 32 },
      { threshold: 500, value: 30 },
      { threshold: 1000, value: 28 },
      { threshold: 2500, value: 24 },
      { threshold: 5000, value: 18 },
      { threshold: 10000, value: 12 },
      { threshold: 25000, value: 10 },
      { threshold: 50000, value: 8 },
      { threshold: Infinity, value: 6 }
    ]
  };

  const getManagedMigrationLookupValue = (userCount: number, planKey: 'basic' | 'standard' | 'advanced'): number => {
    const lookupArray = perUserCostLookupByPlan[planKey];
    for (let i = 0; i < lookupArray.length; i++) {
      if (userCount <= lookupArray[i].threshold) {
        return lookupArray[i].value;
      }
    }
    return lookupArray[lookupArray.length - 1].value;
  };

  const planKey = tier.name.toLowerCase() as 'basic' | 'standard' | 'advanced';
  
  // Per user cost: $15 if < 500 users, $20 if >= 500 users (same for all plans)
  const perUserCost = config.numberOfUsers < 500 ? 15 : 20;
  const userCost = perUserCost * config.numberOfUsers;
  
  // Data cost = 0 (always)
  const dataCost = 0;
  
  // Managed migration cost: Uses Messaging lookup tables with floors
  const lookupValue = getManagedMigrationLookupValue(config.numberOfUsers, planKey);
  const s38 = (lookupValue * config.numberOfUsers) / 4;
  const floor = planKey === 'advanced' ? 800 : (planKey === 'standard' ? 600 : 400);
  const migrationCost = Math.max(floor, s38);
  
  // Instance cost
  const instanceCost = getInstanceCost(config.instanceType, config.duration) * config.numberOfInstances;
  
  // Total cost
  let totalCost = userCost + dataCost + instanceCost + migrationCost;
  
  // Skip minimum for Multi combination (minimum will be applied to overall total)
  const isMultiCombination = config.combination?.startsWith('multi-combination-');
  // Apply $2500 minimum by adjusting user cost only
  const MINIMUM_TOTAL = 2500;
  let adjustedUserCost = userCost;
  
  if (!isMultiCombination && totalCost < MINIMUM_TOTAL) {
    const deficit = MINIMUM_TOTAL - totalCost;
    adjustedUserCost = userCost + deficit;
    totalCost = MINIMUM_TOTAL;
    
    console.log('💰 Applied $2500 minimum to Email plan:', {
      plan: tier.name,
      originalTotal: userCost + dataCost + instanceCost + migrationCost,
      originalUserCost: userCost,
      deficit,
      adjustedUserCost,
      finalTotal: MINIMUM_TOTAL,
      unchangedCosts: { dataCost, migrationCost, instanceCost }
    });
  }

  console.log('📊 Email Migration Calculation:', {
    tier: tier.name,
    perUserCost,
    numberOfUsers: config.numberOfUsers,
    userCost: adjustedUserCost,
    dataCost,
    migrationCost,
    instanceCost,
    totalCost
  });

  return {
    userCost: adjustedUserCost,
    dataCost,
    migrationCost,
    instanceCost,
    totalCost,
    tier
  };
}
 
export function calculatePricing(config: ConfigurationData, tier: PricingTier): PricingCalculation {
  // Get base instance type cost (without duration multiplier)
  const getInstanceTypeCost = (instanceType: string): number => {
    switch (instanceType) {
      case 'Small':
        return 500;
      case 'Standard':
        return 1000;
      case 'Large':
        return 2000;
      case 'Extra Large':
        return 5000;
      default:
        return 500;
    }
  };

  // Calculate instance cost based on instance type and duration
  const getInstanceCost = (instanceType: string, duration: number): number => {
    const baseCost = getInstanceTypeCost(instanceType);
    return baseCost * duration;
  };

  // MULTI COMBINATION: Calculate Messaging + Content (+ Email) separately, then sum
  // Now supports per-exhibit configs: loop over arrays and sum results
  if (config.migrationType === 'Multi combination') {
    let messagingCalculation, contentCalculation, emailCalculation;
    let totalCombined = 0;

    // Calculate Messaging - loop over per-exhibit configs
    let messagingCombinationBreakdowns: PricingCalculation['messagingCombinationBreakdowns'] = [];
    if (config.messagingConfigs && config.messagingConfigs.length > 0) {
      const perExhibitResults = config.messagingConfigs.map(exCfg => {
        const msgConfig: ConfigurationData = {
          numberOfUsers: exCfg.numberOfUsers,
          instanceType: exCfg.instanceType,
          numberOfInstances: exCfg.numberOfInstances,
          duration: exCfg.duration,
          migrationType: 'Messaging',
          dataSizeGB: 0,
          messages: exCfg.messages,
          combination: 'multi-combination-messaging'
        };
        const result = calculateMessagingPricing(msgConfig, tier);
        return { combinationName: exCfg.exhibitName, numberOfUsers: exCfg.numberOfUsers, ...result };
      });

      // Store per-combination breakdowns for UI display
      messagingCombinationBreakdowns = perExhibitResults.map(r => ({
        combinationName: r.combinationName,
        numberOfUsers: r.numberOfUsers,
        userCost: r.userCost,
        dataCost: r.dataCost,
        migrationCost: r.migrationCost,
        instanceCost: r.instanceCost,
        totalCost: r.totalCost,
      }));

      messagingCalculation = perExhibitResults.reduce(
        (acc, r) => ({
          userCost: acc.userCost + r.userCost,
          dataCost: acc.dataCost + r.dataCost,
          migrationCost: acc.migrationCost + r.migrationCost,
          instanceCost: acc.instanceCost + r.instanceCost,
          totalCost: acc.totalCost + r.totalCost,
        }),
        { userCost: 0, dataCost: 0, migrationCost: 0, instanceCost: 0, totalCost: 0 }
      );
      totalCombined += messagingCalculation.totalCost;
      
      console.log('📊 Multi combination - Messaging calculation (per-combination):', {
        combinationCount: config.messagingConfigs.length,
        perCombination: messagingCombinationBreakdowns,
        combined: messagingCalculation
      });
    } else if (config.messagingConfig) {
      // Fallback to single config for backward compatibility
      const msgConfig: ConfigurationData = {
        numberOfUsers: config.messagingConfig.numberOfUsers,
        instanceType: config.messagingConfig.instanceType,
        numberOfInstances: config.messagingConfig.numberOfInstances,
        duration: config.messagingConfig.duration,
        migrationType: 'Messaging',
        dataSizeGB: 0,
        messages: config.messagingConfig.messages,
        combination: 'multi-combination-messaging'
      };
      
      const msgResult = calculateMessagingPricing(msgConfig, tier);
      messagingCalculation = {
        userCost: msgResult.userCost,
        dataCost: msgResult.dataCost,
        migrationCost: msgResult.migrationCost,
        instanceCost: msgResult.instanceCost,
        totalCost: msgResult.totalCost
      };
      totalCombined += msgResult.totalCost;
      
      console.log('📊 Multi combination - Messaging calculation (single config fallback):', messagingCalculation);
    }

    // Calculate Content - loop over per-exhibit configs
    let contentCombinationBreakdowns: PricingCalculation['contentCombinationBreakdowns'] = [];
    if (config.contentConfigs && config.contentConfigs.length > 0) {
      const perExhibitResults = config.contentConfigs.map((exCfg) => {
        const contentConfigData: ConfigurationData = {
          numberOfUsers: exCfg.numberOfUsers,
          instanceType: exCfg.instanceType,
          numberOfInstances: exCfg.numberOfInstances,
          duration: exCfg.duration,
          migrationType: 'Content',
          dataSizeGB: exCfg.dataSizeGB,
          messages: 0,
          combination: 'multi-combination-content'
        };
        const result = calculateContentPricing(contentConfigData, tier);
        return { combinationName: exCfg.exhibitName, numberOfUsers: exCfg.numberOfUsers, ...result };
      });

      // Store per-combination breakdowns for UI display
      contentCombinationBreakdowns = perExhibitResults.map(r => ({
        combinationName: r.combinationName,
        numberOfUsers: r.numberOfUsers,
        userCost: r.userCost,
        dataCost: r.dataCost,
        migrationCost: r.migrationCost,
        instanceCost: r.instanceCost,
        totalCost: r.totalCost,
      }));

      contentCalculation = perExhibitResults.reduce(
        (acc, r) => ({
          userCost: acc.userCost + r.userCost,
          dataCost: acc.dataCost + r.dataCost,
          migrationCost: acc.migrationCost + r.migrationCost,
          instanceCost: acc.instanceCost + r.instanceCost,
          totalCost: acc.totalCost + r.totalCost,
        }),
        { userCost: 0, dataCost: 0, migrationCost: 0, instanceCost: 0, totalCost: 0 }
      );
      totalCombined += contentCalculation.totalCost;
      
      console.log('📊 Multi combination - Content calculation (per-combination):', {
        combinationCount: config.contentConfigs.length,
        perCombination: contentCombinationBreakdowns,
        combined: contentCalculation
      });
    } else if (config.contentConfig) {
      // Fallback to single config for backward compatibility
      const contentConfigData: ConfigurationData = {
        numberOfUsers: config.contentConfig.numberOfUsers,
        instanceType: config.contentConfig.instanceType,
        numberOfInstances: config.contentConfig.numberOfInstances,
        duration: config.contentConfig.duration,
        migrationType: 'Content',
        dataSizeGB: config.contentConfig.dataSizeGB,
        messages: 0,
        combination: 'multi-combination-content'
      };
      
      const contentResult = calculateContentPricing(contentConfigData, tier);
      contentCalculation = {
        userCost: contentResult.userCost,
        dataCost: contentResult.dataCost,
        migrationCost: contentResult.migrationCost,
        instanceCost: contentResult.instanceCost,
        totalCost: contentResult.totalCost
      };
      totalCombined += contentResult.totalCost;
      
      console.log('📊 Multi combination - Content calculation (single config fallback):', contentCalculation);
    }

    // Calculate Email - loop over per-exhibit configs
    let emailCombinationBreakdowns: PricingCalculation['emailCombinationBreakdowns'] = [];
    if (config.emailConfigs && config.emailConfigs.length > 0) {
      const perExhibitResults = config.emailConfigs.map(exCfg => {
        const emailConfigData: ConfigurationData = {
          numberOfUsers: exCfg.numberOfUsers,
          instanceType: exCfg.instanceType,
          numberOfInstances: exCfg.numberOfInstances,
          duration: exCfg.duration,
          migrationType: 'Email',
          dataSizeGB: 0,
          messages: exCfg.messages,
          combination: 'multi-combination-email'
        };
        const result = calculateEmailPricing(emailConfigData, tier);
        return { combinationName: exCfg.exhibitName, numberOfUsers: exCfg.numberOfUsers, ...result };
      });

      // Store per-combination breakdowns for UI display
      emailCombinationBreakdowns = perExhibitResults.map(r => ({
        combinationName: r.combinationName,
        numberOfUsers: r.numberOfUsers,
        userCost: r.userCost,
        dataCost: r.dataCost,
        migrationCost: r.migrationCost,
        instanceCost: r.instanceCost,
        totalCost: r.totalCost,
      }));

      emailCalculation = perExhibitResults.reduce(
        (acc, r) => ({
          userCost: acc.userCost + r.userCost,
          dataCost: acc.dataCost + r.dataCost,
          migrationCost: acc.migrationCost + r.migrationCost,
          instanceCost: acc.instanceCost + r.instanceCost,
          totalCost: acc.totalCost + r.totalCost,
        }),
        { userCost: 0, dataCost: 0, migrationCost: 0, instanceCost: 0, totalCost: 0 }
      );
      totalCombined += emailCalculation.totalCost;
      
      console.log('📊 Multi combination - Email calculation (per-combination):', {
        combinationCount: config.emailConfigs.length,
        perCombination: emailCombinationBreakdowns,
        combined: emailCalculation
      });
    }

    // Return combined result
    const combinedUserCost =
      (messagingCalculation?.userCost || 0) +
      (contentCalculation?.userCost || 0) +
      (emailCalculation?.userCost || 0);
    const combinedDataCost =
      (messagingCalculation?.dataCost || 0) +
      (contentCalculation?.dataCost || 0) +
      (emailCalculation?.dataCost || 0);
    const combinedMigrationCost =
      (messagingCalculation?.migrationCost || 0) +
      (contentCalculation?.migrationCost || 0) +
      (emailCalculation?.migrationCost || 0);
    const combinedInstanceCost =
      (messagingCalculation?.instanceCost || 0) +
      (contentCalculation?.instanceCost || 0) +
      (emailCalculation?.instanceCost || 0);

    console.log('📊 Multi combination - Combined total (before minimum):', totalCombined);

    // Apply $2500 minimum to OVERALL Multi combination total
    const MINIMUM_TOTAL = 2500;
    let adjustedCombinedUserCost = combinedUserCost;
    let finalTotal = totalCombined;
    
    if (totalCombined < MINIMUM_TOTAL) {
      const deficit = MINIMUM_TOTAL - totalCombined;
      adjustedCombinedUserCost = combinedUserCost + deficit;
      finalTotal = MINIMUM_TOTAL;
      
      console.log('💰 Applied $2500 minimum to Multi combination overall total:', {
        originalTotal: totalCombined,
        originalUserCost: combinedUserCost,
        deficit,
        adjustedUserCost: adjustedCombinedUserCost,
        finalTotal: MINIMUM_TOTAL
      });
    }

    return {
      userCost: adjustedCombinedUserCost,
      dataCost: combinedDataCost,
      migrationCost: combinedMigrationCost,
      instanceCost: combinedInstanceCost,
      totalCost: finalTotal,
      tier,
      messagingCalculation,
      contentCalculation,
      emailCalculation,
      // Per-combination breakdowns for individual display
      messagingCombinationBreakdowns,
      contentCombinationBreakdowns,
      emailCombinationBreakdowns
    };
  }

  // OVERAGE AGREEMENT: Only calculate instance cost, no other costs
  if (config.combination === 'overage-agreement') {
    const instanceCost = getInstanceCost(config.instanceType, config.duration) * config.numberOfInstances;
    const totalCost = instanceCost;

    console.log('📊 Overage Agreement Calculation:', {
      tier: tier.name,
      instanceCost,
      totalCost,
      calculation: `${config.numberOfInstances} instances × ${getInstanceTypeCost(config.instanceType)} (${config.instanceType}) × ${config.duration} months = ${instanceCost}`
    });

    return {

      
      userCost: 0,
      dataCost: 0,
      migrationCost: 0,
      instanceCost,
      totalCost,
      tier
    };
  }

  // Check if the configuration falls within the tier's limits
  const isUserInRange = config.numberOfUsers >= tier.userLimits.from && config.numberOfUsers <= tier.userLimits.to;
  const isGBInRange = config.dataSizeGB >= tier.gbLimits.from && config.dataSizeGB <= tier.gbLimits.to;

  if (!isUserInRange || !isGBInRange) {
    console.warn(`Configuration outside ${tier.name} tier limits: Users ${config.numberOfUsers} (${tier.userLimits.from}-${tier.userLimits.to}), GB ${config.dataSizeGB} (${tier.gbLimits.from}-${tier.gbLimits.to})`);
  }
 
  // Implement Messaging logic exactly as in the provided calculator
  if (config.migrationType === 'Messaging') {
    return calculateMessagingPricing(config, tier);
  }
 
  // CONTENT MIGRATION CALCULATIONS
  if (config.migrationType === 'Content') {
    return calculateContentPricing(config, tier);
  }
 
  // EMAIL MIGRATION CALCULATIONS
  if (config.migrationType === 'Email') {
    return calculateEmailPricing(config, tier);
  }
 
  // Fallback for any other migration types (kept for completeness)
  const pricingByType = (tierName: string) => ({
    perUserCost: tierName === 'Basic' ? 30.0 : tierName === 'Standard' ? 35.0 : 40.0,
    perGBCost: tierName === 'Basic' ? 1.0 : tierName === 'Standard' ? 1.5 : 1.8,
    migrationCost: 300
  });
 
  const fallbackPricing = pricingByType(tier.name);
  const userCost = config.numberOfUsers * fallbackPricing.perUserCost;
  const dataCost = config.dataSizeGB * fallbackPricing.perGBCost;
  const migrationCost = fallbackPricing.migrationCost;
  const instanceCost = getInstanceCost(config.instanceType, config.duration) * config.numberOfInstances;
  let totalCost = userCost + dataCost + migrationCost + instanceCost;
  
  const MINIMUM_TOTAL = 2500;
  let adjustedUserCost = userCost;
  
  if (totalCost < MINIMUM_TOTAL) {
    const deficit = MINIMUM_TOTAL - totalCost;
    adjustedUserCost = userCost + deficit;
    totalCost = MINIMUM_TOTAL;
  }
 
  return { userCost: adjustedUserCost, dataCost, migrationCost, instanceCost, totalCost, tier };
}
 
export function calculateAllTiers(config: ConfigurationData, tiers: PricingTier[] = PRICING_TIERS): PricingCalculation[] {
  return tiers.map(tier => calculatePricing(config, tier));
}

/**
 * Calculate pricing for a single combination with a specific tier
 * Used for per-combination plan selection in Multi combination scenarios
 */
export function calculateCombinationPricing(
  combinationName: string,
  combinationType: 'messaging' | 'content' | 'email',
  config: ConfigurationData,
  tier: PricingTier
): {
  combinationName: string;
  numberOfUsers: number;
  userCost: number;
  dataCost: number;
  migrationCost: number;
  instanceCost: number;
  totalCost: number;
} {
  let result: PricingCalculation;

  if (combinationType === 'messaging') {
    // Check if config is passed directly (from ConfigurationForm) or nested in messagingConfigs array
    const msgConfigFromArray = config.messagingConfigs?.find(c => c.exhibitName === combinationName);
    const msgConfig: ConfigurationData = msgConfigFromArray ? {
      numberOfUsers: msgConfigFromArray.numberOfUsers || 0,
      instanceType: msgConfigFromArray.instanceType || 'Standard',
      numberOfInstances: msgConfigFromArray.numberOfInstances || 0,
      duration: msgConfigFromArray.duration || 0,
      migrationType: 'Messaging',
      dataSizeGB: 0,
      messages: msgConfigFromArray.messages || 0,
      combination: 'multi-combination-messaging'
    } : {
      // Use config directly if it's already a single config object (from ConfigurationForm)
      numberOfUsers: config.numberOfUsers || 0,
      instanceType: config.instanceType || 'Standard',
      numberOfInstances: config.numberOfInstances || 0,
      duration: config.duration || 0,
      migrationType: 'Messaging',
      dataSizeGB: 0,
      messages: config.messages || 0,
      combination: 'multi-combination-messaging'
    };
    result = calculateMessagingPricing(msgConfig, tier);
    return {
      combinationName,
      numberOfUsers: msgConfig.numberOfUsers,
      userCost: result.userCost,
      dataCost: result.dataCost,
      migrationCost: result.migrationCost,
      instanceCost: result.instanceCost,
      totalCost: result.totalCost,
    };
  } else if (combinationType === 'content') {
    // Check if config is passed directly (from ConfigurationForm) or nested in contentConfigs array
    const contentConfigFromArray = config.contentConfigs?.find(c => c.exhibitName === combinationName);
    const contentConfig: ConfigurationData = contentConfigFromArray ? {
      numberOfUsers: contentConfigFromArray.numberOfUsers || 0,
      instanceType: contentConfigFromArray.instanceType || 'Standard',
      numberOfInstances: contentConfigFromArray.numberOfInstances || 0,
      duration: contentConfigFromArray.duration || 0,
      migrationType: 'Content',
      dataSizeGB: contentConfigFromArray.dataSizeGB || 0,
      messages: 0,
      combination: 'multi-combination-content'
    } : {
      // Use config directly if it's already a single config object (from ConfigurationForm)
      numberOfUsers: config.numberOfUsers || 0,
      instanceType: config.instanceType || 'Standard',
      numberOfInstances: config.numberOfInstances || 0,
      duration: config.duration || 0,
      migrationType: 'Content',
      dataSizeGB: config.dataSizeGB || 0,
      messages: 0,
      combination: 'multi-combination-content'
    };
    result = calculateContentPricing(contentConfig, tier);
    return {
      combinationName,
      numberOfUsers: contentConfig.numberOfUsers,
      userCost: result.userCost,
      dataCost: result.dataCost,
      migrationCost: result.migrationCost,
      instanceCost: result.instanceCost,
      totalCost: result.totalCost,
    };
  } else {
    // email
    // Check if config is passed directly (from ConfigurationForm) or nested in emailConfigs array
    const emailConfigFromArray = config.emailConfigs?.find(c => c.exhibitName === combinationName);
    const emailConfig: ConfigurationData = emailConfigFromArray ? {
      numberOfUsers: emailConfigFromArray.numberOfUsers || 0,
      instanceType: emailConfigFromArray.instanceType || 'Standard',
      numberOfInstances: emailConfigFromArray.numberOfInstances || 0,
      duration: emailConfigFromArray.duration || 0,
      migrationType: 'Email',
      dataSizeGB: 0,
      messages: emailConfigFromArray.messages || 0,
      combination: 'multi-combination-email'
    } : {
      // Use config directly if it's already a single config object (from ConfigurationForm)
      numberOfUsers: config.numberOfUsers || 0,
      instanceType: config.instanceType || 'Standard',
      numberOfInstances: config.numberOfInstances || 0,
      duration: config.duration || 0,
      migrationType: 'Email',
      dataSizeGB: 0,
      messages: config.messages || 0,
      combination: 'multi-combination-email'
    };
    result = calculateEmailPricing(emailConfig, tier);
    return {
      combinationName,
      numberOfUsers: emailConfig.numberOfUsers,
      userCost: result.userCost,
      dataCost: result.dataCost,
      migrationCost: result.migrationCost,
      instanceCost: result.instanceCost,
      totalCost: result.totalCost,
    };
  }
}
 
export function getRecommendedTier(calculations: PricingCalculation[]): PricingCalculation {
  // Logic: Recommend Standard if total cost is reasonable, Basic for small projects, Advanced for large
  const standardCalc = calculations.find(calc => calc.tier.name === 'Standard');
  return standardCalc || calculations[0];
}
 
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Export the instance type cost function for use in templates
export function getInstanceTypeCost(instanceType: string): number {
  switch (instanceType) {
    case 'Small':
      return 500;
    case 'Standard':
      return 1000;
    case 'Large':
      return 2000;
    case 'Extra Large':
      return 5000;
    default:
      return 500;
  }
}