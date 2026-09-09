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
  lookupMessageSprawlRate,
  lookupContentSprawlRate,
  calcSprawlCost,
  DATA_SPRAWL_TABLES,
  BUNDLE_DATA_ADDON,
  getRegionMultiplier,
  overagePerServerPerMonth,
  normalizeSprawlType,
  sprawlRowLabel,
  manageDataLineCost,
  manageUserLineCost,
  normalizeSprawlTypes,
  withSprawlTypes,
  calcSprawlLines,
  sumSprawlLines,
  sprawlDisplayTotal,
  SPRAWL_TYPE_ORDER,
  resolveSprawlUsers,
  manageLicenceUsers,
  calcSprawlLinesFromConfig,
} from '../../src/utils/pricing';
import type { ConfigurationData, PricingCalculation } from '../../src/types/pricing';
// Backend pricing engine (CommonJS) — must stay in lock-step with src/utils/pricing.ts.
import pricingLogic from '../../pricing-logic.js';

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

describe('Data Sprawl — rate tables', () => {
  it('lookupMessageSprawlRate returns the per-user rate at each band edge', () => {
    expect(lookupMessageSprawlRate(0)).toBe(0);
    expect(lookupMessageSprawlRate(25)).toBe(5.0);
    expect(lookupMessageSprawlRate(26)).toBe(4.0);
    expect(lookupMessageSprawlRate(50)).toBe(4.0);
    expect(lookupMessageSprawlRate(51)).toBe(3.6);
    expect(lookupMessageSprawlRate(100)).toBe(3.6);
    expect(lookupMessageSprawlRate(250)).toBe(3.2);
    expect(lookupMessageSprawlRate(500)).toBe(2.8);
    expect(lookupMessageSprawlRate(1000)).toBe(2.5);
    expect(lookupMessageSprawlRate(1500)).toBe(2.2);
    expect(lookupMessageSprawlRate(2000)).toBe(1.8);
    expect(lookupMessageSprawlRate(5000)).toBe(1.6);
    expect(lookupMessageSprawlRate(10000)).toBe(1.5);
    expect(lookupMessageSprawlRate(30000)).toBe(1.4);
    // beyond the top band clamps to the last rate
    expect(lookupMessageSprawlRate(30001)).toBe(1.4);
  });

  it('lookupContentSprawlRate returns the per-GB rate at each band edge', () => {
    expect(lookupContentSprawlRate(0)).toBe(0);
    expect(lookupContentSprawlRate(500)).toBe(0.16);
    expect(lookupContentSprawlRate(501)).toBe(0.13);
    expect(lookupContentSprawlRate(2500)).toBe(0.13);
    expect(lookupContentSprawlRate(5000)).toBe(0.11667);
    expect(lookupContentSprawlRate(10000)).toBe(0.1);
    expect(lookupContentSprawlRate(20000)).toBe(0.08333);
    expect(lookupContentSprawlRate(50000)).toBe(0.075);
    expect(lookupContentSprawlRate(100000)).toBe(0.06667);
    expect(lookupContentSprawlRate(500000)).toBe(0.05833);
    expect(lookupContentSprawlRate(1000000)).toBe(0.05333);
    expect(lookupContentSprawlRate(2000000)).toBe(0.04667);
    expect(lookupContentSprawlRate(3000001)).toBe(0.04167);
    expect(lookupContentSprawlRate(9999999)).toBe(0.04167);
  });

  it('CONTENT_SPRAWL matches BUNDLE_DATA_ADDON value-for-value', () => {
    const content = DATA_SPRAWL_TABLES.CONTENT_SPRAWL;
    expect(content).toHaveLength(BUNDLE_DATA_ADDON.length);
    content.forEach((row, i) => {
      expect(row.max).toBe(BUNDLE_DATA_ADDON[i].max);
      expect(row.rate).toBe(BUNDLE_DATA_ADDON[i].addon);
    });
  });

  it('Email uses the Message per-user table (no distinct Email pricing)', () => {
    expect(calcSprawlCost('Email', 3001, 0)).toBe(calcSprawlCost('Message', 3001, 0));
    expect(calcSprawlCost('Email', 70, 0)).toBeCloseTo(252, 6);
  });

  it('Content sprawl bills by GB and ignores users; Message ignores GB', () => {
    // Content: 222 GB → 0.16 band → 0.16 × 222 = 35.52 (users ignored)
    expect(calcSprawlCost('Content', 3001, 222)).toBeCloseTo(35.52, 6);
    // Message: 3001 users → 1.60 band → 1.60 × 3001 = 4801.60 (GB ignored)
    expect(calcSprawlCost('Message', 3001, 222)).toBeCloseTo(4801.6, 6);
  });
});

describe('calculateManagePricing — Data Sprawl mode', () => {
  const MANAGE = PRICING_TIERS[0];

  function sprawlConfig(overrides: Partial<ConfigurationData> = {}): ConfigurationData {
    return makeConfig({
      servicePlan: 'Manage',
      migrationType: 'Content',
      manageUsers: 3001,
      manageDataGB: 222,
      manageSprawlType: 'Message',
      customerLocation: '1',
      ...overrides,
    });
  }

  it('MANAGE + Sprawl = license + sprawl; standalone = sprawl only (3001 users / Message)', () => {
    const calc = calculatePricing(sprawlConfig(), MANAGE);
    // license (K12): 3001 → 501–5000 band → 20 × 3001 = 60,020
    expect(calc.userCost).toBe(60020);
    // sprawl (B103): 1.60 × 3001 = 4,801.60
    expect(calc.dataCost).toBeCloseTo(4801.6, 6);
    expect(calc.sprawlCost).toBeCloseTo(4801.6, 6);
    // MANAGE + Sprawl (B104): 60,020 + 4,801.60 = 64,821.60
    expect(calc.totalCost).toBeCloseTo(64821.6, 6);
    // Standalone omits the license line
    expect(calc.sprawlStandalone?.totalCost).toBeCloseTo(4801.6, 6);
    expect(calc.sprawlStandalone?.dataCost).toBeCloseTo(4801.6, 6);
    expect(calc.sprawlType).toBe('Message');
    expectInvariant(calc);
  });

  it('matches the 70-user Message example (license 5999 + sprawl 252 = 6251)', () => {
    const calc = calculatePricing(sprawlConfig({ manageUsers: 70 }), MANAGE);
    expect(calc.userCost).toBe(5999);
    expect(calc.dataCost).toBeCloseTo(252, 6);
    expect(calc.totalCost).toBeCloseTo(6251, 6);
    expect(calc.sprawlStandalone?.totalCost).toBeCloseTo(252, 6);
  });

  it('Content sprawl bills by GB (license + rate × GB)', () => {
    const calc = calculatePricing(
      sprawlConfig({ manageSprawlType: 'Content', manageUsers: 3001, manageDataGB: 222 }),
      MANAGE
    );
    // license unchanged (3001 users); sprawl = 0.16 × 222 = 35.52
    expect(calc.userCost).toBe(60020);
    expect(calc.dataCost).toBeCloseTo(35.52, 6);
    expect(calc.totalCost).toBeCloseTo(60055.52, 6);
    expect(calc.sprawlStandalone?.totalCost).toBeCloseTo(35.52, 6);
  });

  it('is FLAT — region multiplier does NOT apply to Manage/Sprawl', () => {
    const r1 = calculatePricing(sprawlConfig({ customerLocation: '1' }), MANAGE);
    const r2 = calculatePricing(sprawlConfig({ customerLocation: '0.8' }), MANAGE);
    const r3 = calculatePricing(sprawlConfig({ customerLocation: '0.65' }), MANAGE);
    expect(r2.totalCost).toBeCloseTo(r1.totalCost, 6);
    expect(r3.totalCost).toBeCloseTo(r1.totalCost, 6);
    expect(r2.sprawlCost).toBeCloseTo(4801.6, 6);
  });

  it('above 5000 users: combined is CUSTOM but the standalone sprawl still shows', () => {
    // Message, 8000 users → license CUSTOM, but standalone sprawl = 8000 × 1.5 = 12,000
    const calc = calculatePricing(sprawlConfig({ manageUsers: 8000 }), MANAGE);
    expect(calc.status).toBe('custom');
    expect(calc.userCost).toBe(0);
    expect(calc.sprawlStandalone?.totalCost).toBeCloseTo(12000, 6);
  });

  it('Content standalone survives >5000 users (never depended on the license)', () => {
    // Content, 8000 users, 600 GB → license CUSTOM; 600 GB is the ≤2500 band ($0.13),
    // so standalone = 600 × 0.13 = 78
    const calc = calculatePricing(
      sprawlConfig({ manageSprawlType: 'Content', manageUsers: 8000, manageDataGB: 600 }),
      MANAGE
    );
    expect(calc.status).toBe('custom');
    expect(calc.sprawlStandalone?.totalCost).toBeCloseTo(78, 6);
  });

  it('Content sprawl is region-flat too', () => {
    const base = sprawlConfig({ manageSprawlType: 'Content', manageUsers: 3001, manageDataGB: 222 });
    const r1 = calculatePricing({ ...base, customerLocation: '1' }, MANAGE);
    const r2 = calculatePricing({ ...base, customerLocation: '0.65' }, MANAGE);
    expect(r2.totalCost).toBeCloseTo(r1.totalCost, 6);
  });

  it('guards negative and non-finite inputs to 0 (no negative quotes)', () => {
    expect(calcSprawlCost('Message', -5, 0)).toBe(0);
    expect(calcSprawlCost('Content', 0, -100)).toBe(0);
    const calc = calculatePricing(sprawlConfig({ manageUsers: -5 }), MANAGE);
    expect(calc.sprawlCost).toBe(0);
    expect(calc.totalCost).toBeGreaterThanOrEqual(0);
  });

  it('treats an out-of-enum sprawl type as no sprawl (legacy Manage)', () => {
    const calc = calculatePricing(
      makeConfig({ servicePlan: 'Manage', manageUsers: 70, manageDataGB: 1000, customerLocation: '1', manageSprawlType: 'Bogus' as unknown as 'Message' }),
      MANAGE
    );
    expect(calc.sprawlType).toBeUndefined();
    expect(calc.dataCost).toBeCloseTo(130, 6); // fell back to $0.13/GB legacy path
  });

  it('is backward compatible — no sprawl type falls back to $0.13/GB Manage', () => {
    const calc = calculatePricing(
      makeConfig({ servicePlan: 'Manage', manageUsers: 70, manageDataGB: 1000, customerLocation: '1' }),
      MANAGE
    );
    // legacy: license 5999 + 0.13 × 1000 = 130 → 6129; no sprawl fields
    expect(calc.userCost).toBe(5999);
    expect(calc.dataCost).toBeCloseTo(130, 6);
    expect(calc.sprawlType).toBeUndefined();
    expect(calc.sprawlStandalone).toBeUndefined();
  });
});

describe('pricing-logic.js — Data Sprawl backend mirror', () => {
  it('calcManage matches the frontend (3001 users / Message)', () => {
    const mg = pricingLogic.calcManage({ users: 3001, e100GB: 222, sprawlType: 'Message' });
    // license 60,020 + sprawl 4,801.60 = 64,821.60
    expect(mg.total).toBeCloseTo(64821.6, 6);
    expect(mg.sprawl.type).toBe('Message');
    expect(mg.sprawl.standalone.totalCost).toBeCloseTo(4801.6, 6);
    expect(mg.sprawl.standalone.dataCost).toBeCloseTo(4801.6, 6);
  });

  it('calcManage Content matches the frontend (3001 users / 222 GB)', () => {
    const mg = pricingLogic.calcManage({ users: 3001, e100GB: 222, sprawlType: 'Content' });
    // license 60,020 + sprawl (0.16 × 222 = 35.52) = 60,055.52
    expect(mg.total).toBeCloseTo(60055.52, 6);
    expect(mg.sprawl.standalone.totalCost).toBeCloseTo(35.52, 6);
  });

  it('calcManage keeps the standalone when the license band is exceeded (>5000)', () => {
    const mg = pricingLogic.calcManage({ users: 8000, e100GB: 0, sprawlType: 'Message' });
    expect(mg.total).toBe('CUSTOM');
    expect(mg.sprawl.standalone.totalCost).toBeCloseTo(12000, 6);
  });

  it('calcSprawlCost mirrors the frontend tables', () => {
    expect(pricingLogic.calcSprawlCost('Message', 70, 0)).toBeCloseTo(252, 6);
    expect(pricingLogic.calcSprawlCost('Content', 0, 222)).toBeCloseTo(35.52, 6);
    expect(pricingLogic.calcSprawlCost('Email', 3001, 0)).toBe(pricingLogic.calcSprawlCost('Message', 3001, 0));
  });

  it('legacy calcManage (no sprawlType) still bills K13 × GB', () => {
    const mg = pricingLogic.calcManage({ users: 70, b56GB: 1000, e100GB: 1000 });
    expect(mg.sprawl).toBeUndefined();
    expect(typeof mg.total).toBe('number');
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

describe('overagePerServerPerMonth — region multiplier in Overage Charges', () => {
  // Region multipliers: R1 = ×1, R2 (AUS/NZ/EU) = ×0.8, R3 (Rest of World) = ×0.65
  const REGIONS: Array<{ label: string; customerLocation: string; mult: number }> = [
    { label: 'Region 1 — US/Canada', customerLocation: '1', mult: 1 },
    { label: 'Region 2 — AUS, NZ, EU', customerLocation: '0.8', mult: 0.8 },
    { label: 'Region 3 — Rest of World', customerLocation: '0.65', mult: 0.65 },
  ];

  it('getRegionMultiplier maps each region correctly', () => {
    expect(getRegionMultiplier(makeConfig({ customerLocation: '1' }))).toBe(1);
    expect(getRegionMultiplier(makeConfig({ customerLocation: '0.8' }))).toBe(0.8);
    expect(getRegionMultiplier(makeConfig({ customerLocation: '0.65' }))).toBe(0.65);
    // Unknown / missing values must not silently discount
    expect(getRegionMultiplier(makeConfig({ customerLocation: undefined }))).toBe(1);
    expect(getRegionMultiplier(makeConfig({ customerLocation: 'bogus' }))).toBe(1);
  });

  // Regression: the overage line used the flat base rate, so a Region 2 quote whose
  // instance line billed $800 still advertised "$1,000.00 per server per month".
  REGIONS.forEach(({ label, customerLocation, mult }) => {
    it(`${label}: falls back to base rate × ${mult} when no breakdown exists`, () => {
      const config = makeConfig({ customerLocation });
      // Standard instance base = $1,000
      expect(overagePerServerPerMonth(config, 'Standard', null)).toBeCloseTo(1000 * mult, 6);
      // Small = $500, Large = $2,000
      expect(overagePerServerPerMonth(config, 'Small', null)).toBeCloseTo(500 * mult, 6);
      expect(overagePerServerPerMonth(config, 'Large', null)).toBeCloseTo(2000 * mult, 6);
    });

    it(`${label}: derives the rate from the billed breakdown`, () => {
      const config = makeConfig({ customerLocation });
      // What the engine actually bills: base × duration × instances × regionMult
      const billed = 1000 * 1 * 1 * mult;
      expect(overagePerServerPerMonth(config, 'Standard', { instanceCost: billed }, 1, 1))
        .toBeCloseTo(1000 * mult, 6);
    });
  });

  it('matches the engine: overage rate never exceeds the billed per-server cost', () => {
    REGIONS.forEach(({ customerLocation }) => {
      const config = makeConfig({
        migrationType: 'Messaging',
        numberOfUsers: 1,
        instanceType: 'Standard',
        numberOfInstances: 1,
        duration: 1,
        customerLocation,
      });
      const calc = calculatePricing(config, STANDARD);
      const rate = overagePerServerPerMonth(config, 'Standard', calc, 1, 1);
      // One instance for one month → the quoted rate IS the billed instance cost
      expect(rate).toBeCloseTo(calc.instanceCost, 6);
    });
  });

  it('divides multi-month / multi-instance breakdowns back to a monthly per-server rate', () => {
    const config = makeConfig({ customerLocation: '0.8' });
    // 3 instances × 4 months at Region 2: 1000 × 4 × 3 × 0.8 = 9,600 billed
    expect(overagePerServerPerMonth(config, 'Standard', { instanceCost: 9600 }, 4, 3))
      .toBeCloseTo(800, 6);
  });

  it('guards zero / missing duration and instance counts', () => {
    const config = makeConfig({ customerLocation: '0.8' });
    expect(overagePerServerPerMonth(config, 'Standard', { instanceCost: 800 }, 0, 0)).toBeCloseTo(800, 6);
    expect(overagePerServerPerMonth(config, 'Standard', { instanceCost: 0 }, 1, 1)).toBeCloseTo(800, 6);
    expect(overagePerServerPerMonth(config, 'Standard', undefined, 1, 1)).toBeCloseTo(800, 6);
  });
});

describe('Data Sprawl — agreement row helpers', () => {
  function manageConfig(overrides: Partial<ConfigurationData> = {}): ConfigurationData {
    return makeConfig({
      servicePlan: 'Manage',
      migrationType: 'Datasprawl',
      manageUsers: 32,
      manageDataGB: 0,
      customerLocation: '1',
      ...overrides,
    });
  }

  it('normalizeSprawlType accepts only the three known types', () => {
    expect(normalizeSprawlType('Content')).toBe('Content');
    expect(normalizeSprawlType('Message')).toBe('Message');
    expect(normalizeSprawlType('Email')).toBe('Email');
    expect(normalizeSprawlType('Bogus')).toBeUndefined();
    expect(normalizeSprawlType(undefined)).toBeUndefined();
    expect(normalizeSprawlType('')).toBeUndefined();
    expect(normalizeSprawlType(null)).toBeUndefined();
  });

  it('sprawlRowLabel matches the agreement reference wording', () => {
    expect(sprawlRowLabel('Content')).toBe('Data Sprawl');
    expect(sprawlRowLabel('Email')).toBe('Email Sprawl');
    expect(sprawlRowLabel('Message')).toBe('Message Sprawl');
    // No sprawl type (or an unknown one) keeps the neutral label
    expect(sprawlRowLabel(undefined)).toBe('Data Sprawl');
    expect(sprawlRowLabel('Bogus')).toBe('Data Sprawl');
  });

  it('regression: Message/Email no longer price the row at $0 when GB is 0', () => {
    // The bug: the row was computed as manageDataGB × 0.13, and Message/Email
    // deliberately clear manageDataGB, so it always rendered $0.00.
    expect(manageDataLineCost(manageConfig({ manageSprawlType: 'Message' }))).toBeCloseTo(128, 6);
    expect(manageDataLineCost(manageConfig({ manageSprawlType: 'Email' }))).toBeCloseTo(128, 6);
  });

  it('row cost equals the engine dataCost for every sprawl type', () => {
    const cases: Array<Partial<ConfigurationData>> = [
      { manageSprawlType: 'Message', manageUsers: 32 },
      { manageSprawlType: 'Email', manageUsers: 897 },
      { manageSprawlType: 'Message', manageUsers: 1022 },
      { manageSprawlType: 'Content', manageUsers: 32, manageDataGB: 345 },
      { manageSprawlType: 'Content', manageUsers: 3001, manageDataGB: 222 },
    ];
    for (const overrides of cases) {
      const config = manageConfig(overrides);
      const calc = calculatePricing(config, PRICING_TIERS[0]);
      expect(manageDataLineCost(config)).toBeCloseTo(calc.dataCost, 6);
    }
  });

  it('reproduces the reference agreement figures', () => {
    // Email Sprawl: 897 users → $2.50 band
    expect(manageDataLineCost(manageConfig({ manageSprawlType: 'Email', manageUsers: 897 })))
      .toBeCloseTo(2242.5, 6);
    // Message Sprawl: 1022 users → $2.20 band
    expect(manageDataLineCost(manageConfig({ manageSprawlType: 'Message', manageUsers: 1022 })))
      .toBeCloseTo(2248.4, 6);
  });

  it('non-sprawl Manage keeps the legacy flat per-GB line', () => {
    expect(manageDataLineCost(manageConfig({ manageDataGB: 345 })))
      .toBeCloseTo(345 * MANAGE_STANDALONE_DATA_RATE, 6);
    expect(manageDataLineCost(manageConfig({ manageDataGB: 0 }))).toBe(0);
  });

  it('guards missing and negative inputs to 0', () => {
    expect(manageDataLineCost({} as ConfigurationData)).toBe(0);
    expect(manageDataLineCost(manageConfig({ manageSprawlType: 'Message', manageUsers: -5 }))).toBe(0);
    expect(manageDataLineCost(manageConfig({ manageSprawlType: 'Content', manageDataGB: -10 }))).toBe(0);
    expect(manageDataLineCost(manageConfig({ manageDataGB: Number.NaN }))).toBe(0);
  });
});

describe('Data Sprawl — agreement license line', () => {
  function manageConfig(overrides: Partial<ConfigurationData> = {}): ConfigurationData {
    return makeConfig({
      servicePlan: 'Manage',
      migrationType: 'Datasprawl',
      manageUsers: 32,
      manageDataGB: 0,
      customerLocation: '1',
      ...overrides,
    });
  }

  it('regression: standalone Data Sprawl keeps the license at 0', () => {
    // PricingComparison zeroes userCost for the standalone plan; only the calculation
    // records that choice, so recomputing from manageUsers must not re-add the license.
    const standalone = { sprawlType: 'Message' as const, userCost: 0 };
    expect(manageUserLineCost(manageConfig({ manageSprawlType: 'Message' }), standalone)).toBe(0);
  });

  it('MANAGE + Sprawl charges the license from the live user count', () => {
    const combined = { sprawlType: 'Message' as const, userCost: 2499 };
    expect(manageUserLineCost(manageConfig({ manageSprawlType: 'Message' }), combined)).toBe(2499);
    // Editing users after picking the plan re-derives the license instead of going stale
    const config = manageConfig({ manageSprawlType: 'Message', manageUsers: 897 });
    expect(manageUserLineCost(config, combined)).toBe(17940);
  });

  it('regression: sprawl always carries a license, even when manageRequiresUsers is false', () => {
    // The flag comes from the combination admin checkbox; the engine ignores it for sprawl.
    const config = manageConfig({ manageSprawlType: 'Message', manageRequiresUsers: false });
    expect(manageUserLineCost(config, { sprawlType: 'Message', userCost: 2499 })).toBe(2499);
    expect(calculatePricing(config, PRICING_TIERS[0]).userCost).toBe(2499);
  });

  it('non-sprawl Manage still honours manageRequiresUsers === false', () => {
    expect(manageUserLineCost(manageConfig({ manageRequiresUsers: false }), null)).toBe(0);
    expect(manageUserLineCost(manageConfig({ manageRequiresUsers: true }), null)).toBe(2499);
  });

  it('license line matches the engine userCost for every sprawl type', () => {
    const cases: Array<Partial<ConfigurationData>> = [
      { manageSprawlType: 'Message', manageUsers: 32 },
      { manageSprawlType: 'Email', manageUsers: 897 },
      { manageSprawlType: 'Message', manageUsers: 1022 },
      { manageSprawlType: 'Content', manageUsers: 32, manageDataGB: 345 },
    ];
    for (const overrides of cases) {
      const config = manageConfig(overrides);
      const calc = calculatePricing(config, PRICING_TIERS[0]);
      expect(manageUserLineCost(config, calc)).toBeCloseTo(calc.userCost, 6);
      // The agreement total must equal the two lines it prints
      expect(manageUserLineCost(config, calc) + manageDataLineCost(config))
        .toBeCloseTo(calc.totalCost, 6);
    }
  });

  it('CUSTOM license (>5000 users) falls back to the calculation', () => {
    const config = manageConfig({ manageSprawlType: 'Message', manageUsers: 6000 });
    const calc = calculatePricing(config, PRICING_TIERS[0]);
    // Engine reports a zeroed license plus status "custom"; the row must not invent a price
    expect(calc.status).toBe('custom');
    expect(manageUserLineCost(config, calc)).toBe(0);
    expect(manageUserLineCost(manageConfig({ manageUsers: 6000 }), { userCost: 1234 } as any)).toBe(1234);
  });

  it('guards missing inputs to 0', () => {
    expect(manageUserLineCost({} as ConfigurationData, null)).toBe(0);
    expect(manageUserLineCost(manageConfig({ manageUsers: -5 }), null)).toBe(0);
    expect(manageUserLineCost(manageConfig({ manageUsers: Number.NaN }), null)).toBe(0);
  });
});

describe('Data Sprawl (Standalone) — reference agreement rows', () => {
  // Agreed spec: the standalone plan prints one row (sprawl cost only, no license line),
  // so the row price and the Total Price are the same figure.
  const REFERENCE = [
    { label: 'Data Sprawl', type: 'Content' as const, users: 32, gb: 345, price: 55.2 },
    { label: 'Email Sprawl', type: 'Email' as const, users: 897, gb: 0, price: 2242.5 },
    { label: 'Message Sprawl', type: 'Message' as const, users: 1022, gb: 0, price: 2248.4 },
  ];

  for (const row of REFERENCE) {
    it(`renders "${row.label}" at ${formatCurrency(row.price)}`, () => {
      const config = makeConfig({
        servicePlan: 'Manage',
        migrationType: 'Datasprawl',
        manageSprawlType: row.type,
        manageUsers: row.users,
        manageDataGB: row.gb,
        customerLocation: '1',
      });
      const engine = calculatePricing(config, PRICING_TIERS[0]);
      // Standalone selection zeroes the license (PricingComparison spreads userCost: 0)
      const selected = { sprawlType: engine.sprawlType, userCost: 0 };

      expect(sprawlRowLabel(row.type)).toBe(row.label);
      expect(manageDataLineCost(config)).toBeCloseTo(row.price, 6);
      expect(manageUserLineCost(config, selected)).toBe(0);
      // Total Price equals the single printed row
      expect(manageUserLineCost(config, selected) + manageDataLineCost(config))
        .toBeCloseTo(row.price, 6);
      expect(engine.sprawlStandalone?.totalCost).toBeCloseTo(row.price, 6);
    });
  }
});

describe('Data Sprawl — multi-select', () => {
  const MANAGE = PRICING_TIERS[0];

  function cfg(overrides: Partial<ConfigurationData> = {}): ConfigurationData {
    return makeConfig({
      servicePlan: 'Manage',
      migrationType: 'Datasprawl',
      manageUsers: 1022,
      manageDataGB: 0,
      customerLocation: '1',
      ...overrides,
    });
  }

  describe('normalizeSprawlTypes', () => {
    it('prefers the array, in canonical order, deduped', () => {
      expect(normalizeSprawlTypes(cfg({ manageSprawlTypes: ['Message', 'Content'] })))
        .toEqual(['Content', 'Message']);
      expect(normalizeSprawlTypes(cfg({ manageSprawlTypes: ['Email', 'Email'] }))).toEqual(['Email']);
      expect(SPRAWL_TYPE_ORDER).toEqual(['Content', 'Message', 'Email']);
    });

    it('an empty array means None and beats the legacy field', () => {
      const c = cfg({ manageSprawlTypes: [], manageSprawlType: 'Message' });
      expect(normalizeSprawlTypes(c)).toEqual([]);
      expect(calculatePricing(c, MANAGE).sprawlType).toBeUndefined();
    });

    it('falls back to the legacy single field when no array exists', () => {
      expect(normalizeSprawlTypes(cfg({ manageSprawlType: 'Email' }))).toEqual(['Email']);
      expect(normalizeSprawlTypes(cfg())).toEqual([]);
    });

    it('drops out-of-enum members', () => {
      expect(normalizeSprawlTypes(cfg({ manageSprawlTypes: ['Bogus'] as never }))).toEqual([]);
      expect(normalizeSprawlTypes(cfg({ manageSprawlTypes: ['Bogus', 'Message'] as never })))
        .toEqual(['Message']);
    });
  });

  describe('withSprawlTypes', () => {
    it('writes both fields so no read path sees them disagree', () => {
      const next = withSprawlTypes(cfg(), ['Message', 'Content']);
      expect(next.manageSprawlTypes).toEqual(['Content', 'Message']);
      expect(next.manageSprawlType).toBe('Content');
    });

    it('clears GB when Content is not selected, keeps it when it is', () => {
      expect(withSprawlTypes(cfg({ manageDataGB: 345 }), ['Message']).manageDataGB).toBe(0);
      expect(withSprawlTypes(cfg({ manageDataGB: 345 }), ['Content']).manageDataGB).toBe(345);
      expect(withSprawlTypes(cfg({ manageDataGB: 345 }), []).manageDataGB).toBe(0);
    });

    it('clearing the selection leaves the legacy mirror undefined', () => {
      const next = withSprawlTypes(cfg({ manageSprawlType: 'Message' }), []);
      expect(next.manageSprawlTypes).toEqual([]);
      expect(next.manageSprawlType).toBeUndefined();
    });
  });

  it('single-type stays byte-identical to the pre-feature numbers', () => {
    const msg = calculatePricing(
      cfg({ manageUsers: 3001, manageDataGB: 222, manageSprawlTypes: ['Message'] }), MANAGE);
    expect(msg.userCost).toBe(60020);
    expect(msg.dataCost).toBeCloseTo(4801.6, 6);
    expect(msg.totalCost).toBeCloseTo(64821.6, 6);
    expect(msg.sprawlLines).toHaveLength(1);
    expect(msg.sprawlType).toBe('Message');
    expectInvariant(msg);

    const legacy = calculatePricing(
      cfg({ manageUsers: 3001, manageDataGB: 222, manageSprawlType: 'Message' }), MANAGE);
    expect(legacy.dataCost).toBe(msg.dataCost);
    expect(legacy.totalCost).toBe(msg.totalCost);
  });

  it('Content + Message sums one line per type', () => {
    const calc = calculatePricing(
      cfg({ manageUsers: 1022, manageDataGB: 345, manageSprawlTypes: ['Content', 'Message'] }),
      MANAGE
    );
    expect(calc.sprawlLines?.map(l => l.type)).toEqual(['Content', 'Message']);
    expect(calc.sprawlLines?.[0].cost).toBeCloseTo(55.2, 6);
    expect(calc.sprawlLines?.[1].cost).toBeCloseTo(2248.4, 6);
    expect(calc.sprawlCost).toBeCloseTo(2303.6, 6);
    expect(calc.sprawlStandalone?.totalCost).toBeCloseTo(2303.6, 6);
    expect(calc.userCost).toBe(20440);
    expect(calc.totalCost).toBeCloseTo(22743.6, 6);
    expectInvariant(calc);
  });

  it('Message + Email bills the shared user count twice (product decision)', () => {
    const calc = calculatePricing(cfg({ manageUsers: 897, manageSprawlTypes: ['Message', 'Email'] }), MANAGE);
    expect(calc.sprawlLines?.map(l => l.cost)).toEqual([2242.5, 2242.5]);
    expect(calc.sprawlLines?.every(l => l.quantity === 897)).toBe(true);
    expect(calc.sprawlCost).toBeCloseTo(4485, 6);
    expectInvariant(calc);
  });

  it('all three types produce three lines', () => {
    const calc = calculatePricing(
      cfg({ manageUsers: 897, manageDataGB: 345, manageSprawlTypes: ['Content', 'Message', 'Email'] }),
      MANAGE
    );
    expect(calc.sprawlLines).toHaveLength(3);
    expect(calc.sprawlCost).toBeCloseTo(55.2 + 2242.5 + 2242.5, 6);
    expectInvariant(calc);
  });

  it('line metadata reports the basis, quantity and rate', () => {
    const calc = calculatePricing(
      cfg({ manageUsers: 1022, manageDataGB: 345, manageSprawlTypes: ['Content', 'Message'] }),
      MANAGE
    );
    expect(calc.sprawlLines?.[0]).toMatchObject({
      type: 'Content', label: 'Data Sprawl', basis: 'gb', quantity: 345, rate: 0.16,
    });
    expect(calc.sprawlLines?.[1]).toMatchObject({
      type: 'Message', label: 'Message Sprawl', basis: 'user', quantity: 1022, rate: 2.2,
    });
  });

  it('multi-select is region-flat, like single-type', () => {
    const base = { manageUsers: 1022, manageDataGB: 345, manageSprawlTypes: ['Content', 'Message'] as never };
    const r1 = calculatePricing(cfg({ ...base, customerLocation: '1' }), MANAGE);
    const r2 = calculatePricing(cfg({ ...base, customerLocation: '0.8' }), MANAGE);
    const r3 = calculatePricing(cfg({ ...base, customerLocation: '0.65' }), MANAGE);
    expect(r2.totalCost).toBe(r1.totalCost);
    expect(r3.totalCost).toBe(r1.totalCost);
  });

  it('every line stays quotable above the CUSTOM license band', () => {
    const calc = calculatePricing(cfg({ manageUsers: 8000, manageSprawlTypes: ['Message', 'Email'] }), MANAGE);
    expect(calc.status).toBe('custom');
    expect(calc.userCost).toBe(0);
    expect(calc.sprawlStandalone?.totalCost).toBeCloseTo(24000, 6);
    expectInvariant(calc);
  });

  it('sprawlDisplayTotal sums rounded rows so the printed column adds up', () => {
    const lines = calcSprawlLines(['Content', 'Message'], 1022, 345);
    expect(sprawlDisplayTotal(lines)).toBeCloseTo(2303.6, 6);
    expect(sumSprawlLines(lines)).toBeCloseTo(sprawlDisplayTotal(lines), 2);
  });

  it('agreement row cost equals the sum of the selected lines', () => {
    const config = cfg({ manageUsers: 1022, manageDataGB: 345, manageSprawlTypes: ['Content', 'Message'] });
    expect(manageDataLineCost(config)).toBeCloseTo(2303.6, 6);
    expect(manageUserLineCost(config, calculatePricing(config, MANAGE))).toBe(20440);
  });

  it('backend mirror matches the frontend for multi-select', () => {
    const mg = pricingLogic.calcManage({
      users: 1022, e100GB: 345, sprawlTypes: ['Content', 'Message'],
    });
    const fe = calculatePricing(
      cfg({ manageUsers: 1022, manageDataGB: 345, manageSprawlTypes: ['Content', 'Message'] }),
      MANAGE
    );
    expect(mg.total).toBeCloseTo(fe.totalCost, 6);
    expect(mg.sprawl.standalone.totalCost).toBeCloseTo(fe.sprawlCost!, 6);
    expect(mg.sprawl.types).toEqual(['Content', 'Message']);
    expect(mg.sprawl.lines.map((l: { cost: number }) => l.cost))
      .toEqual(fe.sprawlLines!.map(l => l.cost));

    const legacy = pricingLogic.calcManage({ users: 1022, e100GB: 345, sprawlType: 'Content' });
    expect(legacy.sprawl.types).toEqual(['Content']);
    expect(legacy.meta.sprawlBasis).toBe('gb');
  });
});

describe('Data Sprawl — independent user count per type', () => {
  const MANAGE = PRICING_TIERS[0];

  function cfg(overrides: Partial<ConfigurationData> = {}): ConfigurationData {
    return makeConfig({
      servicePlan: 'Manage',
      migrationType: 'Datasprawl',
      manageDataGB: 0,
      customerLocation: '1',
      ...overrides,
    });
  }

  it('regression: editing one type does not change another', () => {
    const config = cfg({
      manageSprawlTypes: ['Message', 'Email'],
      manageUsersByType: { Message: 424, Email: 100 },
      manageUsers: 524,
    });
    const lines = calcSprawlLinesFromConfig(config);
    expect(lines.map(l => l.quantity)).toEqual([424, 100]);
    // 424 -> $2.80 band ; 100 -> $3.60 band
    expect(lines.map(l => l.rate)).toEqual([2.8, 3.6]);
    lines.map(l => l.cost).forEach((c, i) => expect(c).toBeCloseTo([1187.2, 360][i], 6));
  });

  it('resolveSprawlUsers falls back to the shared count only when NO map exists', () => {
    expect(resolveSprawlUsers(cfg({ manageUsers: 62 })))
      .toEqual({ Content: 62, Message: 62, Email: 62 });
    // Once a map exists a missing key is 0, not the shared sum — charging the aggregate
    // to a type that has no count of its own silently doubles the licence.
    expect(resolveSprawlUsers(cfg({ manageUsers: 62, manageUsersByType: { Message: 10 } })))
      .toEqual({ Content: 0, Message: 10, Email: 0 });
  });

  it('regression: a selected type missing from the map does not inherit the aggregate', () => {
    const config = cfg({
      manageSprawlTypes: ['Message', 'Email'],
      manageUsersByType: { Message: 424 },
      manageUsers: 424,
    });
    // Email has no count, so it must contribute 0 rather than another 424
    expect(manageLicenceUsers(config)).toBe(424);
    expect(calculatePricing(config, MANAGE).userCost).toBe(9999);
  });

  it('regression: ticking a second type does not inflate the price', () => {
    // Reproduces the reported walkthrough: Message 424, then tick Email.
    const first = withSprawlTypes(cfg({ manageUsers: 0 }), ['Message']);
    const withCount = { ...first, manageUsersByType: { Message: 424 }, manageUsers: 424 };
    const second = withSprawlTypes(withCount, ['Message', 'Email']);
    // Email seeds empty, so the licence stays on 424 until a count is entered
    expect(second.manageUsersByType).toEqual({ Message: 424, Email: 0 });
    expect(second.manageUsers).toBe(424);
    expect(calculatePricing(second, MANAGE).userCost).toBe(9999);
  });

  it('withSprawlTypes keeps manageUsers equal to the sum of the selected counts', () => {
    const base = cfg({ manageUsersByType: { Message: 424, Email: 100 }, manageUsers: 0 });
    const both = withSprawlTypes(base, ['Message', 'Email']);
    expect(both.manageUsers).toBe(524);
    // Untick Email: the aggregate must drop too, or a phantom count keeps being charged
    const onlyMessage = withSprawlTypes(both, ['Message']);
    expect(onlyMessage.manageUsers).toBe(424);
    expect(manageLicenceUsers(onlyMessage)).toBe(424);
  });

  it('a legacy config with no map seeds every selected type from the shared count', () => {
    const upgraded = withSprawlTypes(cfg({ manageUsers: 300 }), ['Message']);
    expect(upgraded.manageUsersByType).toEqual({ Message: 300 });
    expect(upgraded.manageUsers).toBe(300);
    expect(calculatePricing(upgraded, MANAGE).userCost).toBe(9999);
  });

  it('guards missing, zero and negative per-type counts to 0', () => {
    const per = resolveSprawlUsers(cfg({
      manageUsers: 0,
      manageUsersByType: { Content: -5, Message: 0, Email: Number.NaN },
    }));
    expect(per).toEqual({ Content: 0, Message: 0, Email: 0 });
  });

  it('the licence prices on the SUM of the selected types', () => {
    const config = cfg({
      manageSprawlTypes: ['Message', 'Email'],
      manageUsersByType: { Message: 424, Email: 100 },
      manageUsers: 524,
    });
    // 524 falls in the 501-5,000 band -> 20 x 524
    expect(manageLicenceUsers(config)).toBe(524);
    expect(calculatePricing(config, MANAGE).userCost).toBe(10480);
  });

  it('the sum only counts SELECTED types', () => {
    const config = cfg({
      manageSprawlTypes: ['Message'],
      manageUsersByType: { Message: 30, Email: 9000 },
      manageUsers: 30,
    });
    expect(manageLicenceUsers(config)).toBe(30);
    expect(calculatePricing(config, MANAGE).userCost).toBe(2499);
  });

  it('a config without the per-type map is unchanged (legacy quotes)', () => {
    const legacy = cfg({ manageSprawlTypes: ['Message', 'Email'], manageUsers: 424 });
    const calc = calculatePricing(legacy, MANAGE);
    // Licence stays on the single 424, NOT 424 x 2
    expect(manageLicenceUsers(legacy)).toBe(424);
    expect(calc.userCost).toBe(9999);
    // Both lines still price on the shared count
    calc.sprawlLines?.forEach(l => expect(l.cost).toBeCloseTo(1187.2, 6));
    expectInvariant(calc);
  });

  it('non-sprawl Manage still prices the licence on manageUsers', () => {
    expect(manageLicenceUsers(cfg({ manageUsers: 100, manageDataGB: 345 }))).toBe(100);
  });

  it('Content carries a user count for the licence but is still priced per GB', () => {
    const config = cfg({
      manageSprawlTypes: ['Content'],
      manageUsersByType: { Content: 62 },
      manageUsers: 62,
      manageDataGB: 345,
    });
    const calc = calculatePricing(config, MANAGE);
    expect(calc.userCost).toBe(5999);              // 62 users -> 51-200 band
    expect(calc.dataCost).toBeCloseTo(55.2, 6);    // 0.16 x 345, GB-based
    expect(calc.sprawlLines?.[0].basis).toBe('gb');
    expectInvariant(calc);
  });

  it('withSprawlTypes seeds and prunes the per-type counts', () => {
    // No map yet, so both selected types inherit the single shared count
    const start = withSprawlTypes(cfg({ manageUsers: 62 }), ['Message', 'Email']);
    expect(start.manageUsersByType).toEqual({ Message: 62, Email: 62 });
    // Deselecting Email drops its count so it cannot feed the licence sum
    const next = withSprawlTypes({ ...start, manageUsersByType: { Message: 424, Email: 100 } }, ['Message']);
    expect(next.manageUsersByType).toEqual({ Message: 424 });
    expect(manageLicenceUsers(next)).toBe(424);
  });

  it('backend mirror matches the frontend for per-type counts', () => {
    const config = cfg({
      manageSprawlTypes: ['Message', 'Email'],
      manageUsersByType: { Message: 424, Email: 100 },
      manageUsers: 524,
    });
    const fe = calculatePricing(config, MANAGE);
    const mg = pricingLogic.calcManage({
      users: 524,
      e100GB: 0,
      sprawlTypes: ['Message', 'Email'],
      usersByType: { Message: 424, Email: 100 },
    });
    expect(mg.breakdown.user).toBe(fe.userCost);
    expect(mg.sprawl.standalone.totalCost).toBeCloseTo(fe.sprawlCost!, 6);
    mg.sprawl.lines.forEach((l: { cost: number }, i: number) =>
      expect(l.cost).toBeCloseTo(fe.sprawlLines![i].cost, 6));
    // Legacy caller with no map keeps the shared-count behaviour
    const legacy = pricingLogic.calcManage({ users: 424, e100GB: 0, sprawlTypes: ['Message', 'Email'] });
    expect(legacy.breakdown.user).toBe(9999);
    legacy.sprawl.lines.forEach((l: { cost: number }) => expect(l.cost).toBeCloseTo(1187.2, 6));
  });
});
