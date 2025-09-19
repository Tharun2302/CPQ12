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
  // Check if the configuration falls within the tier's limits
  const isUserInRange = config.numberOfUsers >= tier.userLimits.from && config.numberOfUsers <= tier.userLimits.to;
  const isGBInRange = config.dataSizeGB >= tier.gbLimits.from && config.dataSizeGB <= tier.gbLimits.to;
 
  if (!isUserInRange || !isGBInRange) {
    console.warn(`Configuration outside ${tier.name} tier limits: Users ${config.numberOfUsers} (${tier.userLimits.from}-${tier.userLimits.to}), GB ${config.dataSizeGB} (${tier.gbLimits.from}-${tier.gbLimits.to})`);
  }
 
  // Calculate instance cost based on instance type and duration
  const getInstanceCost = (instanceType: string, duration: number): number => {
    const baseCost = (() => {
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
    })();
    return baseCost * duration;
  };
 
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
 
    const dataPerGbRate = dataCostPerGB[planKey];
    const dataCost = (config.dataSizeGB || 0) * dataPerGbRate;
 
    const instanceCost = getInstanceCost(config.instanceType, config.duration) * config.numberOfInstances;
 
    // Managed migration cost: plan-based floors (Basic: 400, Standard: 600, Advanced: 800)
    const lookupValue = getManagedMigrationLookupValue(config.numberOfUsers, planKey);
    const s38 = (lookupValue * config.numberOfUsers) / 4;
    const floor = planKey === 'advanced' ? 800 : (planKey === 'standard' ? 600 : 400);
    const migrationCost = Math.max(floor, s38);
 
    const totalCost = userCost + dataCost + instanceCost + migrationCost;
 
    return {
      userCost,
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
  const totalCost = userCost + dataCost + migrationCost + instanceCost;
 
  return { userCost, dataCost, migrationCost, instanceCost, totalCost, tier };
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