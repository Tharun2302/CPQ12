import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import zohoConfig from '../../zoho-sign-config.cjs';

// Zoho Sign is off unless it is explicitly switched on, and it must say exactly which .env keys
// are missing without ever echoing one. These tests pin both, plus the data-centre table: a
// token minted on the wrong accounts domain fails against Sign in a way that is very hard to
// diagnose from the error alone.

type ZohoConfig = {
  enabled: boolean; dc: string; apiBase: string; accountsBase: string; dcError: string | null;
  clientId: string; clientSecret: string; refreshToken: string; webhookSecret: string;
  missingKeys: string[]; configured: boolean; webhookConfigured: boolean;
  pollEnabled: boolean; pollIntervalMs: number; pollBatch: number; minRefreshMs: number;
  coordOrigin: string; coordUnit: string;
};

const {
  ZOHO_SIGN_DATA_CENTRES, REQUIRED_ZOHO_SIGN_KEYS, isTruthyFlag, zohoSignMissingKeys,
  resolveZohoSignBases, resolveZohoSignConfig, zohoSignEnabled, zohoSignConfigured,
  zohoSignConfigReport, zohoSignBootWarning, getZohoSignConfig, resetZohoSignConfigCache,
} = zohoConfig as {
  ZOHO_SIGN_DATA_CENTRES: Record<string, { apiBase: string; accountsBase: string }>;
  REQUIRED_ZOHO_SIGN_KEYS: string[];
  isTruthyFlag: (value: unknown) => boolean;
  zohoSignMissingKeys: (env: unknown) => string[];
  resolveZohoSignBases: (env: unknown) => { dc: string; apiBase: string; accountsBase: string; knownDc: boolean; error: string | null };
  resolveZohoSignConfig: (env: unknown) => ZohoConfig;
  zohoSignEnabled: (config: unknown) => boolean;
  zohoSignConfigured: (config: unknown) => boolean;
  zohoSignConfigReport: (config: unknown) => Record<string, unknown>;
  zohoSignBootWarning: (config: unknown) => string | null;
  getZohoSignConfig: () => ZohoConfig;
  resetZohoSignConfigCache: () => void;
};

const CLIENT_ID = '1000.ABCDEFGHIJKLMNOP';
const CLIENT_SECRET = 'super-secret-client-value-0001';
const REFRESH_TOKEN = '1000.refresh-token-value-0002.aaaa';

function fullEnv(overrides: Record<string, string> = {}) {
  return {
    ZOHO_SIGN_ENABLED: '1',
    ZOHO_SIGN_DC: 'us',
    ZOHO_SIGN_CLIENT_ID: CLIENT_ID,
    ZOHO_SIGN_CLIENT_SECRET: CLIENT_SECRET,
    ZOHO_SIGN_REFRESH_TOKEN: REFRESH_TOKEN,
    ...overrides,
  };
}

describe('isTruthyFlag', () => {
  it('accepts only explicit affirmatives', () => {
    for (const on of ['1', 'true', 'TRUE', ' yes ', 'On']) expect(isTruthyFlag(on)).toBe(true);
  });

  it('treats blank, absent and anything else as off', () => {
    for (const off of ['', ' ', '0', 'false', 'no', 'off', undefined, null, 'maybe']) {
      expect(isTruthyFlag(off)).toBe(false);
    }
  });
});

describe('data centre table', () => {
  it('pairs every Sign root with the accounts root on the same domain family', () => {
    expect(Object.keys(ZOHO_SIGN_DATA_CENTRES).sort()).toEqual(['au', 'ca', 'eu', 'in', 'jp', 'sa', 'us']);
    expect(ZOHO_SIGN_DATA_CENTRES.us).toEqual({ apiBase: 'https://sign.zoho.com/api/v1', accountsBase: 'https://accounts.zoho.com' });
    expect(ZOHO_SIGN_DATA_CENTRES.eu).toEqual({ apiBase: 'https://sign.zoho.eu/api/v1', accountsBase: 'https://accounts.zoho.eu' });
    expect(ZOHO_SIGN_DATA_CENTRES.in).toEqual({ apiBase: 'https://sign.zoho.in/api/v1', accountsBase: 'https://accounts.zoho.in' });
    expect(ZOHO_SIGN_DATA_CENTRES.jp).toEqual({ apiBase: 'https://sign.zoho.jp/api/v1', accountsBase: 'https://accounts.zoho.jp' });
    expect(ZOHO_SIGN_DATA_CENTRES.au).toEqual({ apiBase: 'https://sign.zoho.com.au/api/v1', accountsBase: 'https://accounts.zoho.com.au' });
    expect(ZOHO_SIGN_DATA_CENTRES.ca).toEqual({ apiBase: 'https://sign.zohocloud.ca/api/v1', accountsBase: 'https://accounts.zohocloud.ca' });
    expect(ZOHO_SIGN_DATA_CENTRES.sa).toEqual({ apiBase: 'https://sign.zoho.sa/api/v1', accountsBase: 'https://accounts.zoho.sa' });
  });

  it('defaults to us and lower-cases the configured value', () => {
    expect(resolveZohoSignBases({}).dc).toBe('us');
    expect(resolveZohoSignBases({ ZOHO_SIGN_DC: 'EU' }).apiBase).toBe('https://sign.zoho.eu/api/v1');
  });

  it('reports an unknown data centre as a configuration error instead of falling back to US', () => {
    // Silently using the US roots for a UK account produces an auth failure nobody can read.
    const bases = resolveZohoSignBases({ ZOHO_SIGN_DC: 'uk' });
    expect(bases.knownDc).toBe(false);
    expect(bases.error).toMatch(/Unknown ZOHO_SIGN_DC "uk"/);
    expect(bases.error).toMatch(/ZOHO_SIGN_API_BASE/);
  });

  it('accepts an unlisted data centre when both overrides are supplied', () => {
    const bases = resolveZohoSignBases({
      ZOHO_SIGN_DC: 'uk',
      ZOHO_SIGN_API_BASE: 'https://sign.zoho.uk/api/v1/',
      ZOHO_SIGN_ACCOUNTS_BASE: 'https://accounts.zoho.uk/',
    });
    expect(bases.error).toBeNull();
    expect(bases.apiBase).toBe('https://sign.zoho.uk/api/v1');
    expect(bases.accountsBase).toBe('https://accounts.zoho.uk');
  });

  it('still errors when only one half of the override pair is set', () => {
    expect(resolveZohoSignBases({ ZOHO_SIGN_DC: 'uk', ZOHO_SIGN_API_BASE: 'https://sign.zoho.uk/api/v1' }).error).not.toBeNull();
  });

  it('lets an override win over a known data centre', () => {
    const bases = resolveZohoSignBases({ ZOHO_SIGN_DC: 'us', ZOHO_SIGN_API_BASE: 'https://sign.example.test/api/v1' });
    expect(bases.apiBase).toBe('https://sign.example.test/api/v1');
    expect(bases.accountsBase).toBe('https://accounts.zoho.com');
  });
});

describe('zohoSignMissingKeys', () => {
  it('names every credential that is absent or blank', () => {
    expect(zohoSignMissingKeys({})).toEqual(REQUIRED_ZOHO_SIGN_KEYS);
    expect(zohoSignMissingKeys({ ZOHO_SIGN_CLIENT_ID: '  ' })).toEqual(REQUIRED_ZOHO_SIGN_KEYS);
    expect(zohoSignMissingKeys(fullEnv())).toEqual([]);
  });

  it('reports names, never values', () => {
    const missing = zohoSignMissingKeys({ ZOHO_SIGN_CLIENT_ID: CLIENT_ID });
    expect(missing).toEqual(['ZOHO_SIGN_CLIENT_SECRET', 'ZOHO_SIGN_REFRESH_TOKEN']);
    expect(missing.join(' ')).not.toContain(CLIENT_ID);
  });
});

describe('resolveZohoSignConfig', () => {
  it('is off by default so an untouched .env changes nothing', () => {
    const config = resolveZohoSignConfig({});
    expect(zohoSignEnabled(config)).toBe(false);
    expect(zohoSignConfigured(config)).toBe(false);
    expect(config.pollEnabled).toBe(false);
  });

  it('is enabled and configured with all three credentials present', () => {
    const config = resolveZohoSignConfig(fullEnv());
    expect(zohoSignEnabled(config)).toBe(true);
    expect(zohoSignConfigured(config)).toBe(true);
    expect(config.missingKeys).toEqual([]);
  });

  it('is enabled but NOT configured when credentials are missing', () => {
    const config = resolveZohoSignConfig({ ZOHO_SIGN_ENABLED: '1' });
    expect(zohoSignEnabled(config)).toBe(true);
    expect(zohoSignConfigured(config)).toBe(false);
  });

  it('is not configured when the data centre cannot be resolved', () => {
    const config = resolveZohoSignConfig(fullEnv({ ZOHO_SIGN_DC: 'atlantis' }));
    expect(config.configured).toBe(false);
    expect(config.dcError).toMatch(/atlantis/);
  });

  it('freezes the result so nothing downstream can rewrite a base URL at runtime', () => {
    const config = resolveZohoSignConfig(fullEnv());
    expect(Object.isFrozen(config)).toBe(true);
    expect(() => { (config as unknown as Record<string, string>).apiBase = 'https://evil.test'; }).toThrow();
  });

  it('clamps polling numbers to values that stay under Zoho 50-calls-per-minute ceiling', () => {
    const config = resolveZohoSignConfig(fullEnv({
      ZOHO_SIGN_POLL_ENABLED: 'true',
      ZOHO_SIGN_POLL_INTERVAL_MS: '1000',
      ZOHO_SIGN_POLL_BATCH: '5000',
    }));
    expect(config.pollEnabled).toBe(true);
    expect(config.pollIntervalMs).toBe(30000);
    expect(config.pollBatch).toBe(40);
  });

  it('falls back to the defaults on unparseable numbers rather than producing NaN', () => {
    const config = resolveZohoSignConfig(fullEnv({ ZOHO_SIGN_POLL_INTERVAL_MS: 'soon', ZOHO_SIGN_POLL_BATCH: '2.5' }));
    expect(config.pollIntervalMs).toBe(300000);
    expect(config.pollBatch).toBe(20);
    expect(config.minRefreshMs).toBe(30000);
  });

  it('accepts only the documented coordinate origin and unit values', () => {
    expect(resolveZohoSignConfig(fullEnv()).coordOrigin).toBe('top');
    expect(resolveZohoSignConfig(fullEnv()).coordUnit).toBe('pt');
    const custom = resolveZohoSignConfig(fullEnv({ ZOHO_SIGN_COORD_ORIGIN: 'BOTTOM', ZOHO_SIGN_COORD_UNIT: 'px' }));
    expect(custom.coordOrigin).toBe('bottom');
    expect(custom.coordUnit).toBe('px');
    const nonsense = resolveZohoSignConfig(fullEnv({ ZOHO_SIGN_COORD_ORIGIN: 'sideways', ZOHO_SIGN_COORD_UNIT: 'furlongs' }));
    expect(nonsense.coordOrigin).toBe('top');
    expect(nonsense.coordUnit).toBe('pt');
  });

  it('marks the webhook configured only when a secret is present', () => {
    expect(resolveZohoSignConfig(fullEnv()).webhookConfigured).toBe(false);
    expect(resolveZohoSignConfig(fullEnv({ ZOHO_SIGN_WEBHOOK_SECRET: 'hmac-secret-value' })).webhookConfigured).toBe(true);
  });
});

describe('zohoSignConfigReport', () => {
  it('carries no secret and no fragment of one', () => {
    const config = resolveZohoSignConfig(fullEnv({ ZOHO_SIGN_WEBHOOK_SECRET: 'hmac-secret-value' }));
    const serialised = JSON.stringify(zohoSignConfigReport(config));
    expect(serialised).not.toContain(CLIENT_SECRET);
    expect(serialised).not.toContain(REFRESH_TOKEN);
    expect(serialised).not.toContain(CLIENT_ID);
    expect(serialised).not.toContain('hmac-secret-value');
  });

  it('exposes the operational facts the status endpoint needs', () => {
    const report = zohoSignConfigReport(resolveZohoSignConfig(fullEnv()));
    expect(report.enabled).toBe(true);
    expect(report.configured).toBe(true);
    expect(report.dc).toBe('us');
    expect(report.api_base).toBe('https://sign.zoho.com/api/v1');
    expect(report.missing_keys).toEqual([]);
  });

  it('degrades safely with no config at all', () => {
    const report = zohoSignConfigReport(null);
    expect(report.enabled).toBe(false);
    expect(report.missing_keys).toEqual(REQUIRED_ZOHO_SIGN_KEYS);
  });
});

describe('zohoSignBootWarning', () => {
  it('says nothing when the feature is off', () => {
    expect(zohoSignBootWarning(resolveZohoSignConfig({}))).toBeNull();
  });

  it('says nothing when the feature is on and complete', () => {
    expect(zohoSignBootWarning(resolveZohoSignConfig(fullEnv()))).toBeNull();
  });

  it('names the missing variables and no values', () => {
    const warning = zohoSignBootWarning(resolveZohoSignConfig({ ZOHO_SIGN_ENABLED: '1', ZOHO_SIGN_CLIENT_ID: CLIENT_ID }));
    expect(warning).toContain('ZOHO_SIGN_CLIENT_SECRET');
    expect(warning).toContain('ZOHO_SIGN_REFRESH_TOKEN');
    expect(warning).not.toContain(CLIENT_ID);
  });

  it('leads with the data centre problem when there is one', () => {
    expect(zohoSignBootWarning(resolveZohoSignConfig(fullEnv({ ZOHO_SIGN_DC: 'atlantis' })))).toMatch(/Unknown ZOHO_SIGN_DC/);
  });
});

describe('getZohoSignConfig', () => {
  it('reads process.env once and returns the same frozen object', () => {
    resetZohoSignConfigCache();
    const first = getZohoSignConfig();
    const second = getZohoSignConfig();
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    resetZohoSignConfigCache();
  });

  it('resolves from process.env and nothing else', () => {
    resetZohoSignConfigCache();
    expect(getZohoSignConfig()).toEqual(resolveZohoSignConfig(process.env));
    resetZohoSignConfigCache();
  });
});
