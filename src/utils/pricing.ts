import { PricingTier, ConfigurationData, PricingCalculation } from '../types/pricing';
 
export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'basic',
    name: 'Basic',
    perUserCost: 30.0,
    perGBCost: 1.00,
    managedMigrationCost: 300,
    instanceCost: 500,
    userLimits: { from: 1, to: 1000 },
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
    userLimits: { from: 1, to: 1000 },
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
    userLimits: { from: 1, to: 1000 },
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
 
    const dataCostPerGB = { basic: 50, standard: 75, advanced: 100 } as const;
 
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
    // For Messaging: user cost is NOT multiplied by duration
    const userCost = perUserRate * config.numberOfUsers;
 
    // For Messaging migration: data cost should be 0 (no data cost calculation)
    const dataCost = 0;
 
    const instanceCost = getInstanceCost(config.instanceType, config.duration) * config.numberOfInstances;
 
    // Managed migration cost: plan-based floors (Basic: 400, Standard: 600, Advanced: 800)
    const lookupValue = getManagedMigrationLookupValue(config.numberOfUsers, planKey);
    const s38 = (lookupValue * config.numberOfUsers) / 4;
    const floor = planKey === 'advanced' ? 800 : (planKey === 'standard' ? 600 : 400);
    const migrationCost = Math.max(floor, s38);
 
    let totalCost = userCost + dataCost + instanceCost + migrationCost;
    
    // CRITICAL: Apply $2500 minimum by adjusting user cost only
    const MINIMUM_TOTAL = 2500;
    let adjustedUserCost = userCost;
    
    if (totalCost < MINIMUM_TOTAL) {
      const deficit = MINIMUM_TOTAL - totalCost;
      adjustedUserCost = userCost + deficit;
      totalCost = MINIMUM_TOTAL;
      
      console.log('💰 Applied $2500 minimum to Messaging plan:', {
        plan: tier.name,
        originalTotal: userCost + dataCost + instanceCost + migrationCost,
        originalUserCost: userCost,
        deficit,
        adjustedUserCost,
        finalTotal: MINIMUM_TOTAL,
        unchangedCosts: { dataCost, migrationCost, instanceCost }
      });
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
 
  // CONTENT MIGRATION CALCULATIONS (using Excel formulas)
  if (config.migrationType === 'Content') {
    // V/W lookup table (for K2 calculation)
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
      { threshold: Infinity, value: 0 }
    ];

    // V/X lookup table (K4 - user-based tier)
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

    // Q/R lookup table (K3 - data size based cost per GB)
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

    // Q/S lookup table (K5 - data size based tier)
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

    // Z/AC lookup table (managed migration cost by tier)
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

    // Lookup function
    const lookupValue = (value: number, lookupArray: { threshold: number; value: number }[]): number => {
      for (let i = 0; i < lookupArray.length; i++) {
        if (value <= lookupArray[i].threshold) {
          return lookupArray[i].value;
        }
      }
      return lookupArray[lookupArray.length - 1].value;
    };

    // K2 = V/W lookup based on users
    const k2Value = lookupValue(config.numberOfUsers, vwLookup);
    // M2 = K2 * L2 (users)
    const m2 = k2Value * config.numberOfUsers;

    // Per User Cost formulas based on tier:
    // Basic: M2*1.2/users = K2*1.2
    // Standard: M2*1.4/users = K2*1.4  
    // Advanced: M2*1.6/users = K2*1.6
    const planKey = tier.name.toLowerCase() as 'basic' | 'standard' | 'advanced';
    let userCostPerUser: number;
    if (planKey === 'basic') {
      userCostPerUser = k2Value * 1.2;
    } else if (planKey === 'standard') {
      userCostPerUser = k2Value * 1.4;
    } else {
      userCostPerUser = k2Value * 1.6;
    }
    const userCost = userCostPerUser * config.numberOfUsers;

    // K3 = Q/R lookup based on data size (cost per GB)
    const k3Value = lookupValue(config.dataSizeGB, qrLookup);
    // M3 = K3 * L3 (data size)
    const m3 = k3Value * config.dataSizeGB;

    // Per GB Cost formulas:
    // Basic: K3 (no multiplier)
    // Standard: K3*1.5
    // Advanced: K3*1.8
    let perGBCost: number;
    if (planKey === 'basic') {
      perGBCost = k3Value;
    } else if (planKey === 'standard') {
      perGBCost = k3Value * 1.5;
    } else {
      perGBCost = k3Value * 1.8;
    }
    const dataCost = perGBCost * config.dataSizeGB;

    // Managed Migration Cost calculation:
    // K4 = V/X lookup based on users
    const k4Value = lookupValue(config.numberOfUsers, vxLookup);
    // K5 = Q/S lookup based on data size
    const k5Value = lookupValue(config.dataSizeGB, qsLookup);
    // K6 = MAX(K4, K5)
    const k6Value = Math.max(k4Value, k5Value);
    // M6 = Z/AC lookup based on K6 (tier)
    const tierCostEntry = tierCostLookup.find(t => t.tier === k6Value);
    const migrationCost = tierCostEntry ? tierCostEntry.cost : 300;

    // Instance cost (same for both migration types)
    const instanceCost = getInstanceCost(config.instanceType, config.duration) * config.numberOfInstances;

    let totalCost = userCost + dataCost + instanceCost + migrationCost;
    
    // CRITICAL: Apply $2500 minimum by adjusting user cost only
    const MINIMUM_TOTAL = 2500;
    let adjustedUserCost = userCost;
    
    if (totalCost < MINIMUM_TOTAL) {
      const deficit = MINIMUM_TOTAL - totalCost;
      adjustedUserCost = userCost + deficit;
      totalCost = MINIMUM_TOTAL;
      
      console.log('💰 Applied $2500 minimum to Content plan:', {
        plan: tier.name,
        originalTotal: userCost + dataCost + instanceCost + migrationCost,
        originalUserCost: userCost,
        deficit,
        adjustedUserCost,
        finalTotal: MINIMUM_TOTAL,
        unchangedCosts: { dataCost, migrationCost, instanceCost }
      });
    }

    console.log('📊 Content Migration Calculation:', {
      tier: tier.name,
      k2Value,
      m2,
      userCostPerUser,
      userCost: adjustedUserCost,
      k3Value,
      m3,
      perGBCost,
      dataCost,
      k4Value,
      k5Value,
      k6Value,
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
 
  // CONTENT MIGRATION CALCULATIONS (using Excel formulas)
  if (config.migrationType === 'Content') {
    // V/W lookup table (for K2 calculation)
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
      { threshold: Infinity, value: 0 }
    ];

    // V/X lookup table (K4 - user-based tier)
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

    // Q/R lookup table (K3 - data size based cost per GB)
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

    // Q/S lookup table (K5 - data size based tier)
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

    // Z/AC lookup table (managed migration cost by tier)
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

    // Lookup function
    const lookupValue = (value: number, lookupArray: { threshold: number; value: number }[]): number => {
      for (let i = 0; i < lookupArray.length; i++) {
        if (value <= lookupArray[i].threshold) {
          return lookupArray[i].value;
        }
      }
      return lookupArray[lookupArray.length - 1].value;
    };

    // K2 = V/W lookup based on users
    const k2Value = lookupValue(config.numberOfUsers, vwLookup);
    // M2 = K2 * L2 (users)
    const m2 = k2Value * config.numberOfUsers;

    // Per User Cost formulas based on tier:
    // Basic: M2*1.2/users = K2*1.2
    // Standard: M2*1.4/users = K2*1.4  
    // Advanced: M2*1.6/users = K2*1.6
    const planKey = tier.name.toLowerCase() as 'basic' | 'standard' | 'advanced';
    let userCostPerUser: number;
    if (planKey === 'basic') {
      userCostPerUser = k2Value * 1.2;
    } else if (planKey === 'standard') {
      userCostPerUser = k2Value * 1.4;
    } else {
      userCostPerUser = k2Value * 1.6;
    }
    const userCost = userCostPerUser * config.numberOfUsers;

    // K3 = Q/R lookup based on data size (cost per GB)
    const k3Value = lookupValue(config.dataSizeGB, qrLookup);
    // M3 = K3 * L3 (data size)
    const m3 = k3Value * config.dataSizeGB;

    // Per GB Cost formulas:
    // Basic: K3 (no multiplier)
    // Standard: K3*1.5
    // Advanced: K3*1.8
    let perGBCost: number;
    if (planKey === 'basic') {
      perGBCost = k3Value;
    } else if (planKey === 'standard') {
      perGBCost = k3Value * 1.5;
    } else {
      perGBCost = k3Value * 1.8;
    }
    const dataCost = perGBCost * config.dataSizeGB;

    // Managed Migration Cost calculation:
    // K4 = V/X lookup based on users
    const k4Value = lookupValue(config.numberOfUsers, vxLookup);
    // K5 = Q/S lookup based on data size
    const k5Value = lookupValue(config.dataSizeGB, qsLookup);
    // K6 = MAX(K4, K5)
    const k6Value = Math.max(k4Value, k5Value);
    // M6 = Z/AC lookup based on K6 (tier)
    const tierCostEntry = tierCostLookup.find(t => t.tier === k6Value);
    const migrationCost = tierCostEntry ? tierCostEntry.cost : 300;

    // Instance cost (same for both migration types)
    const instanceCost = getInstanceCost(config.instanceType, config.duration) * config.numberOfInstances;

    let totalCost = userCost + dataCost + instanceCost + migrationCost;
    
    // CRITICAL: Apply $2500 minimum by adjusting user cost only
    const MINIMUM_TOTAL = 2500;
    let adjustedUserCost = userCost;
    
    if (totalCost < MINIMUM_TOTAL) {
      const deficit = MINIMUM_TOTAL - totalCost;
      adjustedUserCost = userCost + deficit;
      totalCost = MINIMUM_TOTAL;
      
      console.log('💰 Applied $2500 minimum to Content plan:', {
        plan: tier.name,
        originalTotal: userCost + dataCost + instanceCost + migrationCost,
        originalUserCost: userCost,
        deficit,
        adjustedUserCost,
        finalTotal: MINIMUM_TOTAL,
        unchangedCosts: { dataCost, migrationCost, instanceCost }
      });
    }

    console.log('📊 Content Migration Calculation:', {
      tier: tier.name,
      k2Value,
      m2,
      userCostPerUser,
      userCost: adjustedUserCost,
      k3Value,
      m3,
      perGBCost,
      dataCost,
      k4Value,
      k5Value,
      k6Value,
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
  
  // CRITICAL: Apply $2500 minimum by adjusting user cost only
  const MINIMUM_TOTAL = 2500;
  let adjustedUserCost = userCost;
  
  if (totalCost < MINIMUM_TOTAL) {
    const deficit = MINIMUM_TOTAL - totalCost;
    adjustedUserCost = userCost + deficit;
    totalCost = MINIMUM_TOTAL;
    
    console.log('💰 Applied $2500 minimum to Fallback plan:', {
      plan: tier.name,
      originalTotal: userCost + dataCost + migrationCost + instanceCost,
      originalUserCost: userCost,
      deficit,
      adjustedUserCost,
      finalTotal: MINIMUM_TOTAL,
      unchangedCosts: { dataCost, migrationCost, instanceCost }
    });
  }
 
  return { userCost: adjustedUserCost, dataCost, migrationCost, instanceCost, totalCost, tier };
}
 
export function calculateAllTiers(config: ConfigurationData, tiers: PricingTier[] = PRICING_TIERS): PricingCalculation[] {
  return tiers.map(tier => calculatePricing(config, tier));
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
      return 3500;
    default:
      return 500;
  }
}