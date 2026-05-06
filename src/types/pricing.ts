export interface UserLimits {
  from: number;
  to: number;
}

export interface GBLimits {
  from: number;
  to: number;
}

export interface PricingTier {
  id: string;
  name: 'Basic' | 'Standard' | 'Advanced';
  perUserCost: number;
  perGBCost: number;
  managedMigrationCost: number;
  instanceCost: number;
  userLimits: UserLimits;
  gbLimits: GBLimits;
  features: string[];
}

export interface PricingTierConfiguration {
  id: string;
  name: string;
  description?: string;
  tiers: PricingTier[];
  createdAt: Date;
  updatedAt: Date;
  isDefault?: boolean;
}

export interface ConfigurationData {
  numberOfUsers: number;
  instanceType: 'Small' | 'Standard' | 'Large' | 'Extra Large';
  numberOfInstances: number;
  duration: number;
  migrationType: 'Multi combination' | 'Messaging' | 'Content' | 'Email' | 'Overage Agreement';
  dataSizeGB: number;
  messages?: number;
  startDate?: string;
  endDate?: string;
  combination?: string;
  timelineProjection?: string;
  // Service plan: top-level offering tier (Migrate is default; all combinations live under Migrate)
  servicePlan?: 'Migrate' | 'Manage' | 'Bundle';
  // Customer Location — region multiplier as a string ('1' = R1 x1.0, '0.8' = R2, '0.65' = R3)
  customerLocation?: '1' | '0.8' | '0.65';
  // Multi combination specific configs
  messagingConfig?: {
    numberOfUsers: number;
    instanceType: 'Small' | 'Standard' | 'Large' | 'Extra Large';
    numberOfInstances: number;
    duration: number;
    messages: number;
  };
  contentConfig?: {
    numberOfUsers: number;
    instanceType: 'Small' | 'Standard' | 'Large' | 'Extra Large';
    numberOfInstances: number;
    duration: number;
    dataSizeGB: number;
  };
  // Per-exhibit configs for Multi combination (one config per selected exhibit)
  messagingConfigs?: Array<{
    exhibitId: string;
    exhibitName: string;
    numberOfUsers: number;
    instanceType: 'Small' | 'Standard' | 'Large' | 'Extra Large';
    numberOfInstances: number;
    duration: number;
    messages: number;
    planType?: string; // Plan type from exhibit (basic, standard, advanced)
  }>;
  contentConfigs?: Array<{
    exhibitId: string;
    exhibitName: string;
    numberOfUsers: number;
    instanceType: 'Small' | 'Standard' | 'Large' | 'Extra Large';
    numberOfInstances: number;
    duration: number;
    dataSizeGB: number;
    planType?: string; // Plan type from exhibit (basic, standard, advanced)
  }>;
  emailConfigs?: Array<{
    exhibitId: string;
    exhibitName: string;
    numberOfUsers: number;
    instanceType: 'Small' | 'Standard' | 'Large' | 'Extra Large';
    numberOfInstances: number;
    duration: number;
    dataSizeGB?: number;
  }>;
  // Manage Standalone (servicePlan === 'Manage') — separate from Migrate B51/B56.
  // Maps to COST ESTIMATOR E99 (managed users) and E100 (managed data GB).
  manageUsers?: number;
  manageDataGB?: number;
}

export interface PricingCalculation {
  userCost: number;
  dataCost: number;
  migrationCost: number;
  instanceCost: number;
  totalCost: number;
  tier: PricingTier;
  // Multi combination separate calculations
  messagingCalculation?: {
    userCost: number;
    dataCost: number;
    migrationCost: number;
    instanceCost: number;
    totalCost: number;
  };
  contentCalculation?: {
    userCost: number;
    dataCost: number;
    migrationCost: number;
    instanceCost: number;
    totalCost: number;
  };
  emailCalculation?: {
    userCost: number;
    dataCost: number;
    migrationCost: number;
    instanceCost: number;
    totalCost: number;
  };
  // Per-combination breakdowns (for displaying individual pricing per combination)
  contentCombinationBreakdowns?: Array<{
    combinationName: string;
    numberOfUsers?: number;
    userCost: number;
    dataCost: number;
    migrationCost: number;
    instanceCost: number;
    totalCost: number;
  }>;
  messagingCombinationBreakdowns?: Array<{
    combinationName: string;
    numberOfUsers?: number;
    userCost: number;
    dataCost: number;
    migrationCost: number;
    instanceCost: number;
    totalCost: number;
  }>;
  emailCombinationBreakdowns?: Array<{
    combinationName: string;
    numberOfUsers?: number;
    userCost: number;
    dataCost: number;
    migrationCost: number;
    instanceCost: number;
    totalCost: number;
  }>;
  // Manage Standalone — set to 'custom' when users > 5000 (slab returns CUSTOM).
  // UI should surface as a "Contact sales" CTA rather than a numeric quote.
  status?: 'custom';
  message?: string;
}

export interface DealData {
  dealId: string;
  dealName: string;
  amount: string;
  closeDate?: string;
  stage?: string;
  ownerId?: string;
  company?: string;
  contactName?: string;
  contactEmail?: string;
}

export interface Quote {
  id: string;
  clientName: string;
  clientEmail: string;
  company: string;
  quoteExpiryDate?: string;
  configuration: ConfigurationData;
  selectedTier: PricingTier;
  calculation: PricingCalculation;
  createdAt: Date;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected';
  signatureUrl?: string;
  templateUsed?: {
    id: string;
    name: string;
    isDefault: boolean;
  };
  dealData?: DealData | null;
  discount?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}