/* =========================================================
   CLOUDFUZE PRICING LOGIC — BACKEND MODULE
   Source: COST ESTIMATOR (Excel) — exact formulas preserved
   ========================================================= */

/* ---------------------------------------------------------
   PRICING TABLES
   --------------------------------------------------------- */

/* User cost lookup (V3:X13 in COST ESTIMATOR)
   K2 = rate per user, K4 = tier */
const USER_TABLE = [
  { max: 25,    rate: 25,   tier: 1  },
  { max: 50,    rate: 20,   tier: 1  },
  { max: 100,   rate: 18,   tier: 2  },
  { max: 250,   rate: 16,   tier: 2  },
  { max: 500,   rate: 14,   tier: 3  },
  { max: 1000,  rate: 12.5, tier: 4  },
  { max: 1500,  rate: 11,   tier: 5  },
  { max: 2000,  rate: 9,    tier: 6  },
  { max: 5000,  rate: 8,    tier: 7  },
  { max: 10000, rate: 7.5,  tier: 8  },
  { max: 30000, rate: 7,    tier: 10 }
];

/* Data cost lookup (Q3:S13)
   K3 = $/GB, K5 = tier */
const DATA_TABLE = [
  { max: 500,     rate: 1.0,  tier: 1  },
  { max: 2500,    rate: 0.8,  tier: 2  },
  { max: 5000,    rate: 0.7,  tier: 3  },
  { max: 10000,   rate: 0.6,  tier: 4  },
  { max: 20000,   rate: 0.5,  tier: 5  },
  { max: 50000,   rate: 0.45, tier: 6  },
  { max: 100000,  rate: 0.4,  tier: 7  },
  { max: 500000,  rate: 0.35, tier: 9  },
  { max: 1000000, rate: 0.32, tier: 10 },
  { max: 2000000, rate: 0.28, tier: 11 },
  { max: 3000001, rate: 0.25, tier: 11 }
];

/* Managed migration cost by tier (Z3:AC13)
   K6 = MAX(K4, K5); M6 = lookup(K6) */
const MANAGED_TABLE = {
  1: 300, 2: 600, 3: 1500, 4: 2250, 5: 4500,
  6: 9000, 7: 12000, 8: 15000, 9: 18750, 10: 22500, 11: 30000
};

/* Messaging managed migration table (AO4:AR13) */
const MSG_TABLE = [
  { max: 100,   basicHrs: 18,   stdHrs: 22, advHrs: 34 },
  { max: 250,   basicHrs: 15,   stdHrs: 20, advHrs: 32 },
  { max: 500,   basicHrs: 12,   stdHrs: 18, advHrs: 30 },
  { max: 1000,  basicHrs: 10,   stdHrs: 15, advHrs: 28 },
  { max: 2500,  basicHrs: 8,    stdHrs: 12, advHrs: 24 },
  { max: 5000,  basicHrs: 6,    stdHrs: 10, advHrs: 18 },
  { max: 10000, basicHrs: 4,    stdHrs: 8,  advHrs: 12 },
  { max: 25000, basicHrs: 3,    stdHrs: 6,  advHrs: 10 },
  { max: 50000, basicHrs: null, stdHrs: 4,  advHrs: 8  }
];

/* K11 — bundle user addon per user (H18:I24) */
const BUNDLE_USER_ADDON = [
  { max: 50,   addon: 38   },
  { max: 200,  addon: 23   },
  { max: 500,  addon: 15   },
  { max: 1000, addon: 11   },
  { max: 1500, addon: 9.5  },
  { max: 3000, addon: 8    },
  { max: 5000, addon: 6.5  }
];

/* K13 — bundle data addon per GB (AB19:AB29), keyed by Q3:Q13 boundaries */
const BUNDLE_DATA_ADDON = [
  { max: 500,     addon: 0.16    },
  { max: 2500,    addon: 0.13    },
  { max: 5000,    addon: 0.11667 },
  { max: 10000,   addon: 0.1     },
  { max: 20000,   addon: 0.08333 },
  { max: 50000,   addon: 0.075   },
  { max: 100000,  addon: 0.06667 },
  { max: 500000,  addon: 0.05833 },
  { max: 1000000, addon: 0.05333 },
  { max: 2000000, addon: 0.04667 },
  { max: 3000001, addon: 0.04167 }
];

/* Manage Standalone fixed user cost (K12 / C19:E22)
   IF(u<=50,2499, IF(u<=200,5999, IF(u<=500,9999, IF(u<=5000,20*u,'CUSTOM')))) */
const MANAGE_DATA_RATE = 0.13; // K12 — manage data rate ($/GB), reference only

/* ---------------------------------------------------------
   LOOKUP FUNCTIONS
   --------------------------------------------------------- */

function lookupUser(u) {
  for (let i = 0; i < USER_TABLE.length; i++) {
    if (u <= USER_TABLE[i].max) return USER_TABLE[i];
  }
  return USER_TABLE[USER_TABLE.length - 1];
}

function lookupData(gb) {
  if (!gb) return { rate: 0, tier: 0 };
  for (let i = 0; i < DATA_TABLE.length; i++) {
    if (gb <= DATA_TABLE[i].max) return DATA_TABLE[i];
  }
  return DATA_TABLE[DATA_TABLE.length - 1];
}

function lookupMsg(u) {
  for (let i = 0; i < MSG_TABLE.length; i++) {
    if (u <= MSG_TABLE[i].max) return MSG_TABLE[i];
  }
  return MSG_TABLE[MSG_TABLE.length - 1];
}

function lookupBundleUserAddon(u) {
  for (let i = 0; i < BUNDLE_USER_ADDON.length; i++) {
    if (u <= BUNDLE_USER_ADDON[i].max) return BUNDLE_USER_ADDON[i].addon;
  }
  return 6.5;
}

function lookupBundleDataAddon(gb) {
  if (!gb) return 0;
  for (let i = 0; i < BUNDLE_DATA_ADDON.length; i++) {
    if (gb <= BUNDLE_DATA_ADDON[i].max) return BUNDLE_DATA_ADDON[i].addon;
  }
  return BUNDLE_DATA_ADDON[BUNDLE_DATA_ADDON.length - 1].addon;
}

function manageUserCost(u) {
  if (u <= 0)    return 0;
  if (u <= 50)   return 2499;
  if (u <= 200)  return 5999;
  if (u <= 500)  return 9999;
  if (u <= 5000) return 20 * u;
  return 'CUSTOM';
}

/* ---------------------------------------------------------
   CORE CALCULATIONS
   --------------------------------------------------------- */

/**
 * Calculates Migrate (Basic + Standard) and Bundle (Basic + Standard) pricing.
 * Replicates COST ESTIMATOR formulas exactly.
 *
 * @param {Object}  params
 * @param {number}  params.users           — B51 (number of users)
 * @param {number}  params.dataGB          — B56 (data size in GB)
 * @param {string}  params.migrationType   — 'content' | 'email' | 'messaging' (B55)
 * @param {number}  params.regionMultiplier— 1.0 | 0.8 | 0.65
 * @param {number}  params.instanceCost    — B52 ($)
 * @param {number}  params.instanceCount   — B53
 * @param {number}  params.months          — B54
 * @returns {Object} migrate + bundle structured pricing
 */
function calcMigrateBundle({
  users,
  dataGB,
  migrationType,
  regionMultiplier,
  instanceCost,
  instanceCount,
  months
}) {
  /* User cost lookup */
  const uRow    = lookupUser(users);
  const K2_rate = uRow.rate;          // per-user rate
  const K4_tier = uRow.tier;
  const M2      = K2_rate * users;    // total user base

  /* Migrate per-user rates */
  const K17 = M2 * 1.2 / users;       // Basic per user (M2*1.2/B51)
  const M17 = M2 * 1.6 / users;       // Standard per user (M2*1.6/B51)

  /* Bundle per-user rates */
  const K9  = K17 * 0.85;
  const K14 = M17 * 0.85;
  const K11 = lookupBundleUserAddon(users);
  const D63 = K9  + K11;              // Bundle Basic per user
  const E63 = K14 + K11;              // Bundle Standard per user

  /* Data cost lookup */
  const dRow    = lookupData(dataGB);
  const K3_rate = dRow.rate;
  const K5_tier = dRow.tier;
  const K18     = K3_rate;            // Basic data $/GB
  const M18     = K3_rate * 1.8;      // Standard data $/GB
  const K13     = lookupBundleDataAddon(dataGB);

  /* Managed migration tier */
  let K6_tier = Math.max(K4_tier, K5_tier);
  if (K6_tier < 1) K6_tier = 1;
  const K21 = MANAGED_TABLE[K6_tier] || 30000;

  /* Messaging managed (W38, Y38) */
  const mRow     = lookupMsg(users);
  const basicHrs = mRow.basicHrs || 0;
  const advHrs   = mRow.advHrs   || 0;
  const S38 = basicHrs * users / 4;
  const U38 = advHrs   * users / 4;
  const W38 = Math.max(S38, 400);     // Basic messaging managed
  const Y38 = Math.max(U38, 800);     // Standard messaging managed

  const isContent = (migrationType === 'content');
  const B68 = isContent ? K21 : W38;  // Basic managed
  const C68 = isContent ? K21 : Y38;  // Standard managed

  /* Instance cost */
  const B69 = instanceCost * instanceCount * months;

  /* Data $/GB applied (0 for non-content) */
  const B64 = isContent ? K18 : 0;
  const C64 = isContent ? M18 : 0;
  const D64 = isContent ? (K18 + K13) : 0;   // Bundle Basic data $/GB
  const E64 = isContent ? (M18 + K13) : 0;   // Bundle Standard data $/GB

  /* Line totals (pre-region) */
  const userB = K17 * users;
  const userC = M17 * users;
  const userD = D63 * users;
  const userE = E63 * users;

  const dataB = B64 * dataGB;
  const dataC = C64 * dataGB;
  const dataD = D64 * dataGB;
  const dataE = E64 * dataGB;

  const r = regionMultiplier;

  return {
    migrate: {
      basic: {
        total: (userB + dataB + B68 + B69) * r,
        breakdown: {
          user:     userB * r,
          data:     dataB * r,
          managed:  B68   * r,
          instance: B69   * r
        }
      },
      standard: {
        total: (userC + dataC + C68 + B69) * r,
        breakdown: {
          user:     userC * r,
          data:     dataC * r,
          managed:  C68   * r,
          instance: B69   * r
        }
      }
    },
    bundle: {
      basic: {
        total: (userD + dataD + B68 + B69) * r,
        breakdown: {
          user:     userD * r,
          data:     dataD * r,
          managed:  B68   * r,
          instance: B69   * r
        }
      },
      standard: {
        total: (userE + dataE + C68 + B69) * r,
        breakdown: {
          user:     userE * r,
          data:     dataE * r,
          managed:  C68   * r,
          instance: B69   * r
        }
      }
    },
    meta: {
      perUserRates: { K17, M17, D63, E63, K9, K14, K11 },
      perGBRates:   { K18, M18, D64, E64, K13 },
      managed:      { K6_tier, K21, B68, C68 },
      tiers:        { K2_rate, K3_rate, K4_tier, K5_tier },
      isContent
    }
  };
}

/**
 * Calculates Manage Standalone pricing.
 *
 * @param {Object} params
 * @param {number} params.users   — E99 (number of managed users)
 * @param {number} params.b56GB   — B56 (sets $/GB rate via K13 lookup)
 * @param {number} params.e100GB  — E100 (managed content data volume)
 * @returns {Object} manage structured pricing
 */
function calcManage({ users, b56GB, e100GB }) {
  const B102 = manageUserCost(users);                    // user cost (or 'CUSTOM')
  const isCustom = (B102 === 'CUSTOM');

  const B99  = isCustom ? null : B102 / users;
  const B100 = e100GB > 0 ? lookupBundleDataAddon(b56GB) : 0;   // K13 rate
  const B103 = isCustom ? null : B100 * e100GB;
  const B104 = isCustom ? 'CUSTOM' : B102 + B103;

  return {
    total: B104,
    breakdown: {
      user: isCustom ? 'CUSTOM' : B102,
      data: isCustom ? null     : B103
    },
    meta: {
      perUserPerYear: B99,
      ratePerGB:      B100,
      isCustom
    }
  };
}

/* ---------------------------------------------------------
   AGGREGATE ENTRY POINT
   --------------------------------------------------------- */

/**
 * Single entry point returning the full pricing structure.
 *
 * @param {Object} params
 * @param {number} params.users
 * @param {number} params.dataGB           — used by migrate/bundle
 * @param {string} params.migrationType    — 'content' | 'email' | 'messaging'
 * @param {number} params.regionMultiplier — 1.0 | 0.8 | 0.65
 * @param {number} params.instanceCost
 * @param {number} params.instanceCount
 * @param {number} params.months
 * @param {number} [params.manageB56GB]    — manage: B56 (rate driver)
 * @param {number} [params.manageE100GB]   — manage: E100 (managed data volume)
 * @returns {{ migrate, bundle, manage }}
 */
function calculatePricing(params) {
  const mb = calcMigrateBundle({
    users:            params.users,
    dataGB:           params.dataGB,
    migrationType:    params.migrationType,
    regionMultiplier: params.regionMultiplier,
    instanceCost:     params.instanceCost,
    instanceCount:    params.instanceCount,
    months:           params.months
  });

  const mg = calcManage({
    users:   params.users,
    b56GB:   params.manageB56GB  != null ? params.manageB56GB  : params.dataGB,
    e100GB:  params.manageE100GB != null ? params.manageE100GB : 0
  });

  return {
    migrate: mb.migrate,
    bundle:  mb.bundle,
    manage:  mg
  };
}

/* ---------------------------------------------------------
   EXPORTS
   --------------------------------------------------------- */

module.exports = {
  // tables
  USER_TABLE,
  DATA_TABLE,
  MANAGED_TABLE,
  MSG_TABLE,
  BUNDLE_USER_ADDON,
  BUNDLE_DATA_ADDON,
  MANAGE_DATA_RATE,
  // lookups
  lookupUser,
  lookupData,
  lookupMsg,
  lookupBundleUserAddon,
  lookupBundleDataAddon,
  manageUserCost,
  // calculations
  calcMigrateBundle,
  calcManage,
  calculatePricing
};
