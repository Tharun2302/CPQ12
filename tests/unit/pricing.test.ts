import { describe, it, expect } from 'vitest';
import {
  PRICING_TIERS,
  calculatePricing,
  calculateAllTiers,
  calculateCombinationPricing,
  getRecommendedTier,
  formatCurrency,
  getInstanceTypeCost,
  manageUserCost,
  getManageDataRatePerGB,
  MANAGE_STANDALONE_DATA_RATE,
} from '../../src/utils/pricing';
import type { ConfigurationData, PricingCalculation } from '../../src/types/pricing';

const BASIC = PRICING_TIERS[0];
const STANDARD = PRICING_TIERS[1];

function makeConfig(overrides: Partial<ConfigurationData> = {}): ConfigurationData {
  return {
    numberOfUsers: 100,
    instanceType: 'Small',
    numberOfInstances: 1,
    duration: 1,
    migrationType: 'Messaging',
    dataSizeGB: 0,
    servicePlan: 'Migrate',
    customerLocation: '1',
    ...overrides,
  };
}

// Every result must satisfy: userCost + dataCost + migrationCost + instanceCost ≈ totalCost
function expectInvariant(calc: PricingCalculation): void {
  const sum = calc.userCost + calc.dataCost + calc.migrationCost + calc.instanceCost;
  expect(Math.abs(sum - calc.totalCost)).toBeLessThan(0.02);
}

describe('calculatePricing — Messaging', () => {
  it('should price 100 users on Basic with the K2 lookup × 1.2', () => {
    // Arrange
    const config = makeConfig({ numberOfUsers: 100 });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    // 100 users → K2 = $18 (51–100 slab); 18 × 1.2 Basic = $21.60/user × 100 = $2,160
    expect(calc.userCost).toBeCloseTo(2160, 6);
    // Messaging never accrues data cost
    expect(calc.dataCost).toBe(0);
    // Managed: basic hrs(100) = 18 → 18 × 100 / 4 = $450; MAX(450, 400 floor) = $450 (formula wins)
    expect(calc.migrationCost).toBeCloseTo(450, 6);
    // Small instance $500 × 1 month × 1 instance = $500
    expect(calc.instanceCost).toBeCloseTo(500, 6);
    // 2160 + 0 + 450 + 500 = $3,110
    expect(calc.totalCost).toBeCloseTo(3110, 6);
    expectInvariant(calc);
  });

  it('should apply the $400 managed-migration floor when few users (Basic)', () => {
    // Arrange
    const config = makeConfig({ numberOfUsers: 10 });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    // 10 users → K2 = $25 (≤25 slab); 25 × 1.2 = $30/user × 10 = $300
    expect(calc.userCost).toBeCloseTo(300, 6);
    // Managed: basic hrs(10) = 18 → 18 × 10 / 4 = $45; MAX(45, 400 floor) = $400 (floor wins)
    expect(calc.migrationCost).toBeCloseTo(400, 6);
    // 300 + 0 + 400 + 500 (Small × 1 × 1) = $1,200
    expect(calc.totalCost).toBeCloseTo(1200, 6);
    expectInvariant(calc);
  });

  it('should use K2 × 1.6 and the advanced hours table on Standard (formula beats $800 floor)', () => {
    // Arrange
    const config = makeConfig({ numberOfUsers: 1000, instanceType: 'Standard', duration: 2 });

    // Act
    const calc = calculatePricing(config, STANDARD);

    // Assert
    // 1000 users → K2 = $12.50 (501–1000 slab); 12.5 × 1.6 Standard = $20/user × 1000 = $20,000
    expect(calc.userCost).toBeCloseTo(20000, 6);
    // Managed: Standard uses advanced hrs table → hrs(1000) = 28 → 28 × 1000 / 4 = $7,000 > $800 floor
    expect(calc.migrationCost).toBeCloseTo(7000, 6);
    // Standard instance $1,000 × 2 months × 1 instance = $2,000
    expect(calc.instanceCost).toBeCloseTo(2000, 6);
    // 20000 + 0 + 7000 + 2000 = $29,000
    expect(calc.totalCost).toBeCloseTo(29000, 6);
    expectInvariant(calc);
  });

  it('should drop the per-user rate across the 25→26 user slab edge', () => {
    // Act
    const at25 = calculatePricing(makeConfig({ numberOfUsers: 25 }), BASIC);
    const at26 = calculatePricing(makeConfig({ numberOfUsers: 26 }), BASIC);

    // Assert
    // 25 users → K2 = $25 (≤25 slab); 25 × 1.2 = $30/user × 25 = $750
    expect(at25.userCost).toBeCloseTo(750, 6);
    // 26 users → K2 = $20 (26–50 slab); 20 × 1.2 = $24/user × 26 = $624
    expect(at26.userCost).toBeCloseTo(624, 6);
  });
});

describe('calculatePricing — Email', () => {
  it('should price Email like Messaging (K2 × multiplier, zero data cost)', () => {
    // Arrange
    const config = makeConfig({
      migrationType: 'Email',
      numberOfUsers: 300,
      instanceType: 'Standard',
      duration: 2,
    });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    // 300 users → K2 = $14 (251–500 slab); 14 × 1.2 = $16.80/user × 300 = $5,040
    expect(calc.userCost).toBeCloseTo(5040, 6);
    // Email never accrues data cost
    expect(calc.dataCost).toBe(0);
    // Managed: basic hrs(300) = 12 → 12 × 300 / 4 = $900; MAX(900, 400) = $900
    expect(calc.migrationCost).toBeCloseTo(900, 6);
    // Standard instance $1,000 × 2 months × 1 = $2,000
    expect(calc.instanceCost).toBeCloseTo(2000, 6);
    // 5040 + 0 + 900 + 2000 = $7,940
    expect(calc.totalCost).toBeCloseTo(7940, 6);
    expectInvariant(calc);
  });
});

describe('calculatePricing — Content', () => {
  it('should combine per-user, per-GB and tier cost on Basic', () => {
    // Arrange
    const config = makeConfig({ migrationType: 'Content', numberOfUsers: 100, dataSizeGB: 1000 });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    // 100 users → K2 = $18; 18 × 1.2 = $21.60/user × 100 = $2,160
    expect(calc.userCost).toBeCloseTo(2160, 6);
    // 1000 GB → K3 = $0.80 (501–2500 slab) × 1.0 Basic = $0.80/GB × 1000 = $800
    expect(calc.dataCost).toBeCloseTo(800, 6);
    // k4(100 users) = tier 2, k5(1000 GB) = tier 2 → max = tier 2 → $600
    expect(calc.migrationCost).toBeCloseTo(600, 6);
    // Small $500 × 1 month × 1 = $500
    expect(calc.instanceCost).toBeCloseTo(500, 6);
    // 2160 + 800 + 600 + 500 = $4,060
    expect(calc.totalCost).toBeCloseTo(4060, 6);
    expectInvariant(calc);
  });

  it('should multiply per-GB rate by 1.8 on Standard', () => {
    // Arrange
    const config = makeConfig({ migrationType: 'Content', numberOfUsers: 100, dataSizeGB: 1000 });

    // Act
    const calc = calculatePricing(config, STANDARD);

    // Assert
    // 1000 GB → K3 = $0.80 × 1.8 Standard = $1.44/GB × 1000 = $1,440
    expect(calc.dataCost).toBeCloseTo(1440, 6);
    // 100 users → K2 = $18 × 1.6 = $28.80/user × 100 = $2,880
    expect(calc.userCost).toBeCloseTo(2880, 6);
    expectInvariant(calc);
  });

  it('should cross the 500→501 GB slab edge on both per-GB rate and tier cost', () => {
    // Arrange — 10 users keeps the user-driven tier at k4 = 1 so the GB tier drives k6
    const at500 = calculatePricing(
      makeConfig({ migrationType: 'Content', numberOfUsers: 10, dataSizeGB: 500 }),
      BASIC
    );
    const at501 = calculatePricing(
      makeConfig({ migrationType: 'Content', numberOfUsers: 10, dataSizeGB: 501 }),
      BASIC
    );

    // Assert
    // 500 GB → K3 = $1.00 (≤500 slab) × 1.0 × 500 = $500
    expect(at500.dataCost).toBeCloseTo(500, 6);
    // k5(500) = tier 1, k4(10) = tier 1 → max = tier 1 → $300
    expect(at500.migrationCost).toBeCloseTo(300, 6);
    // 501 GB → K3 = $0.80 (501–2500 slab) × 1.0 × 501 = $400.80
    expect(at501.dataCost).toBeCloseTo(400.8, 6);
    // k5(501) = tier 2 → max(1, 2) = tier 2 → $600
    expect(at501.migrationCost).toBeCloseTo(600, 6);
  });
});

describe('calculatePricing — Bundle service plan', () => {
  it('should price bundle per-user as migrate × 0.85 + user addon (Messaging)', () => {
    // Arrange
    const config = makeConfig({ servicePlan: 'Bundle', numberOfUsers: 100 });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    // Migrate per-user = 18 × 1.2 = $21.60; bundle = 21.60 × 0.85 + $23 addon (51–200 slab) = $41.36/user
    // 41.36 × 100 users = $4,136
    expect(calc.userCost).toBeCloseTo(4136, 6);
    // Managed migration unchanged by Bundle: $450 (18 hrs × 100 / 4)
    expect(calc.migrationCost).toBeCloseTo(450, 6);
    // 4136 + 0 + 450 + 500 = $5,086
    expect(calc.totalCost).toBeCloseTo(5086, 6);
    expectInvariant(calc);
  });

  it('should price bundle per-GB as migrate per-GB + data addon (Content)', () => {
    // Arrange
    const config = makeConfig({
      servicePlan: 'Bundle',
      migrationType: 'Content',
      numberOfUsers: 100,
      dataSizeGB: 1000,
    });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    // Migrate per-GB = $0.80 × 1.0; bundle = 0.80 + $0.13 addon (501–2500 slab) = $0.93/GB × 1000 = $930
    expect(calc.dataCost).toBeCloseTo(930, 6);
    // Per-user bundle same formula as messaging: $41.36 × 100 = $4,136
    expect(calc.userCost).toBeCloseTo(4136, 6);
    // Tier cost unchanged by Bundle: tier 2 → $600
    expect(calc.migrationCost).toBeCloseTo(600, 6);
    expectInvariant(calc);
  });
});

describe('calculatePricing — customerLocation region multipliers', () => {
  it('should scale every cost component by 0.8 for Region 2', () => {
    // Arrange
    const config = makeConfig({ customerLocation: '0.8' });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert — base case is the 100-user Basic Messaging config: 2160 / 450 / 500 / 3110
    // 2160 × 0.8 = $1,728
    expect(calc.userCost).toBeCloseTo(1728, 6);
    // 450 × 0.8 = $360
    expect(calc.migrationCost).toBeCloseTo(360, 6);
    // 500 × 0.8 = $400
    expect(calc.instanceCost).toBeCloseTo(400, 6);
    // 3110 × 0.8 = $2,488
    expect(calc.totalCost).toBeCloseTo(2488, 6);
    expectInvariant(calc);
  });

  it('should scale every cost component by 0.65 for Region 3 (Content)', () => {
    // Arrange
    const config = makeConfig({
      migrationType: 'Content',
      numberOfUsers: 100,
      dataSizeGB: 1000,
      customerLocation: '0.65',
    });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert — base Content case is 2160 / 800 / 600 / 500 / 4060
    // 2160 × 0.65 = $1,404
    expect(calc.userCost).toBeCloseTo(1404, 6);
    // 800 × 0.65 = $520
    expect(calc.dataCost).toBeCloseTo(520, 6);
    // 600 × 0.65 = $390
    expect(calc.migrationCost).toBeCloseTo(390, 6);
    // 500 × 0.65 = $325
    expect(calc.instanceCost).toBeCloseTo(325, 6);
    // 4060 × 0.65 = $2,639
    expect(calc.totalCost).toBeCloseTo(2639, 6);
    expectInvariant(calc);
  });
});

describe('calculatePricing — cost-sum invariant', () => {
  it('should satisfy userCost + dataCost + migrationCost + instanceCost ≈ totalCost across configs', () => {
    // Arrange — spread across migration types, plans, regions and tiers
    const configs: ConfigurationData[] = [
      makeConfig({ numberOfUsers: 7 }),
      makeConfig({ numberOfUsers: 2500, instanceType: 'Large', duration: 6 }),
      makeConfig({ migrationType: 'Content', numberOfUsers: 60000, dataSizeGB: 4000000 }),
      makeConfig({ migrationType: 'Email', numberOfUsers: 51, customerLocation: '0.65' }),
      makeConfig({ servicePlan: 'Bundle', migrationType: 'Content', numberOfUsers: 6000, dataSizeGB: 30 }),
      makeConfig({ servicePlan: 'Manage', manageUsers: 400, manageDataGB: 250, customerLocation: '0.8' }),
    ];

    // Act + Assert
    for (const config of configs) {
      for (const tier of PRICING_TIERS) {
        expectInvariant(calculatePricing(config, tier));
      }
    }
  });
});

describe('calculatePricing — Overage Agreement', () => {
  it('should charge only instance cost', () => {
    // Arrange
    const config = makeConfig({
      migrationType: 'Overage Agreement',
      instanceType: 'Large',
      numberOfInstances: 2,
      duration: 3,
    });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    expect(calc.userCost).toBe(0);
    expect(calc.dataCost).toBe(0);
    expect(calc.migrationCost).toBe(0);
    // Large $2,000 × 3 months × 2 instances = $12,000
    expect(calc.instanceCost).toBeCloseTo(12000, 6);
    expect(calc.totalCost).toBeCloseTo(12000, 6);
  });

  it('should route via the overage-agreement combination flag too', () => {
    // Arrange
    const config = makeConfig({ combination: 'overage-agreement' });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert — Small $500 × 1 month × 1 instance = $500, nothing else
    expect(calc.userCost).toBe(0);
    expect(calc.totalCost).toBeCloseTo(500, 6);
  });
});

describe('calculatePricing — Manage standalone', () => {
  it('should use the K12 user slab plus the fixed $0.13/GB data rate', () => {
    // Arrange
    const config = makeConfig({ servicePlan: 'Manage', manageUsers: 100, manageDataGB: 1000 });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    // 100 users → 51–200 slab = $5,999
    expect(calc.userCost).toBeCloseTo(5999, 6);
    // 1000 GB × fixed $0.13 = $130
    expect(calc.dataCost).toBeCloseTo(130, 6);
    expect(calc.migrationCost).toBe(0);
    expect(calc.instanceCost).toBe(0);
    // 5999 + 130 = $6,129
    expect(calc.totalCost).toBeCloseTo(6129, 6);
    expectInvariant(calc);
  });

  it('should return custom status above 5000 managed users', () => {
    // Arrange
    const config = makeConfig({ servicePlan: 'Manage', manageUsers: 5001, manageDataGB: 0 });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    expect(calc.status).toBe('custom');
    expect(calc.totalCost).toBe(0);
  });

  it('should apply the region multiplier to Manage costs', () => {
    // Arrange
    const config = makeConfig({
      servicePlan: 'Manage',
      manageUsers: 100,
      manageDataGB: 1000,
      customerLocation: '0.8',
    });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    // 5999 × 0.8 = $4,799.20; 130 × 0.8 = $104; total $4,903.20
    expect(calc.userCost).toBeCloseTo(4799.2, 6);
    expect(calc.dataCost).toBeCloseTo(104, 6);
    expect(calc.totalCost).toBeCloseTo(4903.2, 6);
  });
});

describe('calculatePricing — Multi combination', () => {
  const msgExhibit = {
    exhibitId: 'm1',
    exhibitName: 'slack-to-teams',
    numberOfUsers: 100,
    instanceType: 'Small' as const,
    numberOfInstances: 1,
    duration: 1,
    messages: 0,
  };
  const contentExhibit = {
    exhibitId: 'c1',
    exhibitName: 'dropbox-to-onedrive',
    numberOfUsers: 100,
    instanceType: 'Small' as const,
    numberOfInstances: 1,
    duration: 1,
    dataSizeGB: 1000,
  };
  const emailExhibit = {
    exhibitId: 'e1',
    exhibitName: 'gmail-to-outlook',
    numberOfUsers: 100,
    instanceType: 'Small' as const,
    numberOfInstances: 1,
    duration: 1,
    messages: 0,
  };

  it('should sum messaging, content and email exhibit configs', () => {
    // Arrange
    const config = makeConfig({
      migrationType: 'Multi combination',
      messagingConfigs: [msgExhibit],
      contentConfigs: [contentExhibit],
      emailConfigs: [emailExhibit],
    });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert — components derived in the standalone tests above:
    // Messaging(100u, Small, 1mo) = $3,110; Content(100u, 1000GB) = $4,060; Email = $3,110
    expect(calc.totalCost).toBeCloseTo(10280, 6);
    // userCost = 2160 × 3 legs = $6,480
    expect(calc.userCost).toBeCloseTo(6480, 6);
    // dataCost only from the Content leg = $800
    expect(calc.dataCost).toBeCloseTo(800, 6);
    // migrationCost = 450 + 600 + 450 = $1,500
    expect(calc.migrationCost).toBeCloseTo(1500, 6);
    // instanceCost = 500 × 3 legs = $1,500
    expect(calc.instanceCost).toBeCloseTo(1500, 6);
    expectInvariant(calc);
  });

  it('should populate per-combination breakdown arrays', () => {
    // Arrange
    const config = makeConfig({
      migrationType: 'Multi combination',
      messagingConfigs: [msgExhibit],
      contentConfigs: [contentExhibit],
      emailConfigs: [emailExhibit],
    });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    expect(calc.messagingCombinationBreakdowns).toHaveLength(1);
    expect(calc.messagingCombinationBreakdowns?.[0].combinationName).toBe('slack-to-teams');
    expect(calc.messagingCombinationBreakdowns?.[0].totalCost).toBeCloseTo(3110, 6);
    expect(calc.contentCombinationBreakdowns).toHaveLength(1);
    expect(calc.contentCombinationBreakdowns?.[0].totalCost).toBeCloseTo(4060, 6);
    expect(calc.emailCombinationBreakdowns).toHaveLength(1);
    expect(calc.emailCombinationBreakdowns?.[0].totalCost).toBeCloseTo(3110, 6);
    expect(calc.messagingCalculation?.totalCost).toBeCloseTo(3110, 6);
    expect(calc.contentCalculation?.totalCost).toBeCloseTo(4060, 6);
    expect(calc.emailCalculation?.totalCost).toBeCloseTo(3110, 6);
  });

  it('should fall back to legacy single messagingConfig/contentConfig', () => {
    // Arrange
    const config = makeConfig({
      migrationType: 'Multi combination',
      messagingConfig: {
        numberOfUsers: 100,
        instanceType: 'Small',
        numberOfInstances: 1,
        duration: 1,
        messages: 0,
      },
      contentConfig: {
        numberOfUsers: 100,
        instanceType: 'Small',
        numberOfInstances: 1,
        duration: 1,
        dataSizeGB: 1000,
      },
    });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert — same legs as above without the Email leg: 3110 + 4060 = $7,170
    expect(calc.totalCost).toBeCloseTo(7170, 6);
    expect(calc.messagingCalculation?.totalCost).toBeCloseTo(3110, 6);
    expect(calc.contentCalculation?.totalCost).toBeCloseTo(4060, 6);
    expect(calc.emailCalculation).toBeUndefined();
    expectInvariant(calc);
  });
});

describe('calculateCombinationPricing', () => {
  it('should resolve a messaging exhibit from messagingConfigs by name', () => {
    // Arrange
    const config = makeConfig({
      migrationType: 'Multi combination',
      messagingConfigs: [
        {
          exhibitId: 'm1',
          exhibitName: 'slack-to-teams',
          numberOfUsers: 100,
          instanceType: 'Small',
          numberOfInstances: 1,
          duration: 1,
          messages: 0,
        },
      ],
    });

    // Act
    const result = calculateCombinationPricing('slack-to-teams', 'messaging', config, BASIC);

    // Assert — identical to the standalone 100-user Messaging Basic case
    expect(result.combinationName).toBe('slack-to-teams');
    expect(result.numberOfUsers).toBe(100);
    expect(result.totalCost).toBeCloseTo(3110, 6);
  });

  it('should use the config directly when no matching content exhibit exists', () => {
    // Arrange
    const config = makeConfig({ migrationType: 'Content', numberOfUsers: 100, dataSizeGB: 1000 });

    // Act
    const result = calculateCombinationPricing('direct-content', 'content', config, BASIC);

    // Assert — identical to the standalone Content Basic case
    expect(result.totalCost).toBeCloseTo(4060, 6);
    expect(result.dataCost).toBeCloseTo(800, 6);
  });

  it('should resolve an email exhibit from emailConfigs by name', () => {
    // Arrange
    const config = makeConfig({
      migrationType: 'Multi combination',
      emailConfigs: [
        {
          exhibitId: 'e1',
          exhibitName: 'gmail-to-outlook',
          numberOfUsers: 100,
          instanceType: 'Small',
          numberOfInstances: 1,
          duration: 1,
          messages: 0,
        },
      ],
    });

    // Act
    const result = calculateCombinationPricing('gmail-to-outlook', 'email', config, BASIC);

    // Assert — identical to the standalone 100-user Email Basic case (same math as Messaging)
    expect(result.totalCost).toBeCloseTo(3110, 6);
  });
});

describe('manageUserCost slab boundaries', () => {
  it('should return the documented slab value at each boundary', () => {
    // K12 slab: 0 → 0; 1–50 → 2499; 51–200 → 5999; 201–500 → 9999; 501–5000 → 20 × users; 5001+ → CUSTOM
    expect(manageUserCost(0)).toBe(0);
    expect(manageUserCost(1)).toBe(2499);
    expect(manageUserCost(50)).toBe(2499);
    expect(manageUserCost(51)).toBe(5999);
    expect(manageUserCost(200)).toBe(5999);
    expect(manageUserCost(201)).toBe(9999);
    expect(manageUserCost(500)).toBe(9999);
    // 501 users → $20 × 501 = $10,020
    expect(manageUserCost(501)).toBe(10020);
    // 5000 users → $20 × 5000 = $100,000
    expect(manageUserCost(5000)).toBe(100000);
    expect(manageUserCost(5001)).toBe('CUSTOM');
  });

  it('should expose the fixed manage data rate', () => {
    expect(MANAGE_STANDALONE_DATA_RATE).toBe(0.13);
    expect(getManageDataRatePerGB(999999)).toBe(0.13);
  });
});

describe('calculateAllTiers / getRecommendedTier', () => {
  it('should return one calculation per pricing tier', () => {
    // Act
    const calcs = calculateAllTiers(makeConfig());

    // Assert
    expect(calcs).toHaveLength(PRICING_TIERS.length);
    expect(calcs.map((c) => c.tier.name)).toEqual(['Basic', 'Standard', 'Advanced']);
  });

  it('should recommend the Standard tier when present', () => {
    // Arrange
    const calcs = calculateAllTiers(makeConfig());

    // Act
    const recommended = getRecommendedTier(calcs);

    // Assert
    expect(recommended.tier.name).toBe('Standard');
  });

  it('should fall back to the first calculation when Standard is absent', () => {
    // Arrange
    const calcs = calculateAllTiers(makeConfig()).filter((c) => c.tier.name !== 'Standard');

    // Act
    const recommended = getRecommendedTier(calcs);

    // Assert
    expect(recommended.tier.name).toBe('Basic');
  });
});

describe('formatCurrency (pricing)', () => {
  it('should format USD with the $ symbol and exactly 2 decimals', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(0.005)).toBe('$0.01');
  });
});

describe('getInstanceTypeCost', () => {
  it('should return the monthly base cost for each instance type', () => {
    expect(getInstanceTypeCost('Small')).toBe(500);
    expect(getInstanceTypeCost('Standard')).toBe(1000);
    expect(getInstanceTypeCost('Large')).toBe(2000);
    expect(getInstanceTypeCost('Extra Large')).toBe(5000);
  });

  it('should default unknown types to the Small cost', () => {
    expect(getInstanceTypeCost('Nano')).toBe(500);
  });
});

describe('calculatePricing — lookup slab sweeps (invariant holds on every slab)', () => {
  // Hand-checking every slab is impractical; assert the cost-sum invariant and
  // monotone non-negativity instead, while driving every lookup-table branch.
  const userCounts = [1, 10, 30, 75, 150, 300, 750, 1200, 1800, 3000, 8000, 20000, 60000];
  const gbSizes = [100, 1000, 3000, 8000, 15000, 30000, 80000, 300000, 800000, 1500000, 2500000, 4000000];
  const instanceTypes: Array<ConfigurationData['instanceType']> = ['Small', 'Standard', 'Large', 'Extra Large'];

  it('should hold for Messaging and Email across all user slabs and instance types', () => {
    userCounts.forEach((users, i) => {
      const instanceType = instanceTypes[i % instanceTypes.length];
      for (const migrationType of ['Messaging', 'Email'] as const) {
        for (const tier of PRICING_TIERS) {
          const calc = calculatePricing(makeConfig({ numberOfUsers: users, instanceType, migrationType }), tier);
          expectInvariant(calc);
          expect(calc.userCost).toBeGreaterThan(0);
          expect(calc.dataCost).toBe(0);
        }
      }
    });
  });

  it('should hold for Content across all GB slabs', () => {
    gbSizes.forEach((gb, i) => {
      const instanceType = instanceTypes[i % instanceTypes.length];
      const calc = calculatePricing(
        makeConfig({ migrationType: 'Content', numberOfUsers: 100, dataSizeGB: gb, instanceType }),
        BASIC
      );
      expectInvariant(calc);
      expect(calc.dataCost).toBeGreaterThan(0);
      expect(calc.migrationCost).toBeGreaterThanOrEqual(300);
    });
  });

  it('should hold for Bundle across user and data addon slabs', () => {
    for (const users of [30, 100, 300, 700, 1200, 2000, 4000, 6000]) {
      expectInvariant(calculatePricing(makeConfig({ servicePlan: 'Bundle', numberOfUsers: users }), BASIC));
    }
    for (const gb of gbSizes) {
      expectInvariant(
        calculatePricing(
          makeConfig({ servicePlan: 'Bundle', migrationType: 'Content', numberOfUsers: 100, dataSizeGB: gb }),
          STANDARD
        )
      );
    }
  });

  it('should price Manage across all user slabs with and without data', () => {
    for (const users of [1, 100, 400, 2000]) {
      const calc = calculatePricing(makeConfig({ servicePlan: 'Manage', manageUsers: users, manageDataGB: 0 }), BASIC);
      expect(calc.dataCost).toBe(0);
      expectInvariant(calc);
    }
    // Missing manage fields default to 0 → zero-cost quote
    const empty = calculatePricing(makeConfig({ servicePlan: 'Manage' }), BASIC);
    expect(empty.totalCost).toBe(0);
  });
});

describe('calculatePricing — instance type variants', () => {
  it('should price each instance type at its base monthly cost', () => {
    // Overage isolates instance cost: base × duration(1) × instances(1)
    const expectedByType: Array<[ConfigurationData['instanceType'], number]> = [
      ['Small', 500],
      ['Standard', 1000],
      ['Large', 2000],
      ['Extra Large', 5000],
    ];
    for (const [instanceType, expected] of expectedByType) {
      const calc = calculatePricing(makeConfig({ migrationType: 'Overage Agreement', instanceType }), BASIC);
      expect(calc.instanceCost).toBe(expected);
    }
  });

  it('should default unknown instance types to the Small cost in each migration flow', () => {
    // Cast exercises the switch default branch in the per-type calculators
    const unknownType = 'Nano' as ConfigurationData['instanceType'];
    const msg = calculatePricing(makeConfig({ instanceType: unknownType }), BASIC);
    // Small default $500 × 1 month × 1 instance
    expect(msg.instanceCost).toBeCloseTo(500, 6);
    const content = calculatePricing(
      makeConfig({ migrationType: 'Content', instanceType: unknownType, dataSizeGB: 100 }),
      BASIC
    );
    expect(content.instanceCost).toBeCloseTo(500, 6);
    const email = calculatePricing(makeConfig({ migrationType: 'Email', instanceType: unknownType }), BASIC);
    expect(email.instanceCost).toBeCloseTo(500, 6);
  });

  it('should use Large and Extra Large costs inside Messaging/Content flows', () => {
    // Messaging: Large $2,000 × 2 months × 2 instances = $8,000
    const msg = calculatePricing(
      makeConfig({ instanceType: 'Large', duration: 2, numberOfInstances: 2 }),
      BASIC
    );
    expect(msg.instanceCost).toBeCloseTo(8000, 6);
    // Content: Extra Large $5,000 × 1 month × 1 instance = $5,000
    const content = calculatePricing(
      makeConfig({ migrationType: 'Content', instanceType: 'Extra Large', dataSizeGB: 100 }),
      BASIC
    );
    expect(content.instanceCost).toBeCloseTo(5000, 6);
  });
});

describe('calculateCombinationPricing — defaulted fields', () => {
  it('should default missing messaging fields to zero-cost inputs (direct config path)', () => {
    // Arrange — zeros exercise every `|| fallback` branch
    const config = makeConfig({
      numberOfUsers: 0,
      numberOfInstances: 0,
      duration: 0,
      instanceType: '' as ConfigurationData['instanceType'],
      messages: 0,
    });

    // Act
    const result = calculateCombinationPricing('sparse', 'messaging', config, BASIC);

    // Assert — 0 users → $0 user cost; 0 instances → $0 instance cost; only the $400 managed floor remains
    expect(result.numberOfUsers).toBe(0);
    expect(result.userCost).toBe(0);
    expect(result.instanceCost).toBe(0);
    expect(result.migrationCost).toBe(400);
  });

  it('should default missing exhibit fields when resolving from config arrays', () => {
    // Arrange
    const sparseExhibit = {
      exhibitId: 's1',
      exhibitName: 'sparse-exhibit',
      numberOfUsers: 0,
      instanceType: '' as ConfigurationData['instanceType'],
      numberOfInstances: 0,
      duration: 0,
      messages: 0,
      dataSizeGB: 0,
    };
    const config = makeConfig({
      migrationType: 'Multi combination',
      contentConfigs: [sparseExhibit],
      emailConfigs: [sparseExhibit],
    });

    // Act
    const content = calculateCombinationPricing('sparse-exhibit', 'content', config, BASIC);
    const email = calculateCombinationPricing('sparse-exhibit', 'email', config, BASIC);

    // Assert — content keeps the minimum tier-1 cost ($300); email keeps the $400 managed floor
    expect(content.userCost).toBe(0);
    expect(content.dataCost).toBe(0);
    expect(content.migrationCost).toBe(300);
    expect(email.migrationCost).toBe(400);
  });

  it('should use the direct config path for email when no emailConfigs match', () => {
    // Act — same 100-user Email Basic case as the standalone test
    const result = calculateCombinationPricing('no-match', 'email', makeConfig(), BASIC);

    // Assert
    expect(result.totalCost).toBeCloseTo(3110, 6);
  });
});

describe('calculatePricing — fallback migration type', () => {
  it('should use flat per-user/per-GB rates for unrecognized types', () => {
    // Arrange — cast keeps the union type honest while exercising the fallback branch
    const config = makeConfig({
      migrationType: 'Legacy' as ConfigurationData['migrationType'],
      numberOfUsers: 10,
      dataSizeGB: 5,
    });

    // Act
    const calc = calculatePricing(config, BASIC);

    // Assert
    // Basic fallback: 10 users × $30 + 5 GB × $1.00 + $300 flat migration + $500 instance = $1,105
    expect(calc.userCost).toBeCloseTo(300, 6);
    expect(calc.dataCost).toBeCloseTo(5, 6);
    expect(calc.migrationCost).toBe(300);
    expect(calc.totalCost).toBeCloseTo(1105, 6);
    expectInvariant(calc);
  });

  it('should use the Standard fallback rates for unrecognized types', () => {
    // Arrange
    const config = makeConfig({
      migrationType: 'Legacy' as ConfigurationData['migrationType'],
      numberOfUsers: 10,
      dataSizeGB: 5,
    });

    // Act
    const calc = calculatePricing(config, STANDARD);

    // Assert
    // Standard fallback: 10 users × $35 + 5 GB × $1.50 + $300 + $500 = $1,157.50
    expect(calc.userCost).toBeCloseTo(350, 6);
    expect(calc.dataCost).toBeCloseTo(7.5, 6);
    expect(calc.totalCost).toBeCloseTo(1157.5, 6);
  });
});
