import { ConfigurationData, PricingCalculation, SprawlLine } from '../types/pricing';
import {
  formatCurrency,
  normalizeSprawlTypes,
  calcSprawlLinesFromConfig,
  manageUserLineCost,
  manageDataLineCost
} from './pricing';

export interface SprawlRow {
  sprawlJobRequirement: string;
  sprawlLabel: string;
  sprawlPrice: string;
  sprawlRate: string;
  sprawlBasis: string;
  sprawlQty: string;
  isLast: boolean;
}

export interface SprawlAgreementData {
  types: SprawlLine['type'][];
  lines: SprawlLine[];
  rows: SprawlRow[];
  userCost: number;
  dataCost: number;
  totalCost: number;
  tokens: Record<string, string>;
}

const JOB_REQUIREMENT = 'CloudFuze Data Sprawl';
const round2 = (n: number): number => Math.round(n * 100) / 100;

// Quantity printed next to the row label. Content shows its priced GB; Message/Email show
// the captured counts, which are recorded for the customer but are NOT a pricing basis.
export function sprawlQuantityNote(type: SprawlLine['type'], config: ConfigurationData): string {
  const amount =
    type === 'Content' ? Number(config?.manageDataGB ?? 0)
    : type === 'Message' ? Number(config?.manageMessageCount ?? 0)
    : Number(config?.manageEmailCount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const unit = type === 'Content' ? 'GB' : type === 'Message' ? 'messages' : 'emails';
  return `${amount.toLocaleString('en-US')} ${unit}`;
}

function decorateLabel(line: SprawlLine, config: ConfigurationData): string {
  const note = sprawlQuantityNote(line.type, config);
  return note ? `${line.label} (${note})` : line.label;
}

// Derived from the live config, never a stored calculation: the selected tier is a
// snapshot that goes stale when the sprawl selection changes after a plan is picked.
// One builder for every agreement path — these token maps have drifted apart before.
export function buildSprawlAgreementData(
  config: ConfigurationData | undefined,
  calc?: Pick<PricingCalculation, 'sprawlType' | 'userCost'> | null
): SprawlAgreementData {
  const cfg = (config || {}) as ConfigurationData;
  const types = normalizeSprawlTypes(cfg);
  const gb = Number(cfg.manageDataGB ?? 0);
  // Same function the engine uses, so the printed rows always add up to the printed total.
  const lines = calcSprawlLinesFromConfig(cfg);

  const rows: SprawlRow[] = lines.map((line, i) => ({
    sprawlJobRequirement: JOB_REQUIREMENT,
    sprawlLabel: decorateLabel(line, cfg),
    sprawlPrice: formatCurrency(round2(line.cost)),
    sprawlRate: formatCurrency(line.rate),
    sprawlBasis: line.basis === 'gb' ? 'per GB' : 'per user',
    sprawlQty: String(line.quantity),
    isLast: i === lines.length - 1
  }));

  const dataCost = manageDataLineCost(cfg);
  const userCost = manageUserLineCost(cfg, calc);
  const totalCost = userCost + dataCost;

  return {
    types,
    lines,
    rows,
    userCost,
    dataCost,
    totalCost,
    tokens: {
      // Un-upgraded single-row templates: join the labels and sum the cost so the
      // printed row still agrees with the Total Price and with what is charged.
      '{{manag_data_label}}': lines.map(l => decorateLabel(l, cfg)).join(' + '),
      '{{manag_data_cost}}': formatCurrency(dataCost),
      '{{manag_data_size}}': String(gb || 0),
      '{{sprawl_row_count}}': String(lines.length),
      '{{sprawl_overage_line}}': buildOverageLine(lines)
    }
  };
}

// Appends a Discount row to the loop so it renders inside the existing {{#sprawlRows}}
// table and simply does not exist when no discount applies — no template row to strip,
// which is how the older static-Discount-row templates handle it.
export function withDiscountRow(rows: SprawlRow[], percent: number, amount: number): SprawlRow[] {
  const pct = Number(percent);
  const amt = Number(amount);
  if (!Number.isFinite(pct) || pct <= 0 || !Number.isFinite(amt) || amt <= 0) return rows;
  const discount: SprawlRow = {
    sprawlJobRequirement: 'Discount',
    // Trim a trailing .00 so 20 reads "20%" rather than "20.00%".
    sprawlLabel: `${Number(pct.toFixed(2))}%`,
    sprawlPrice: `– ${formatCurrency(amt)}`,
    sprawlRate: '',
    sprawlBasis: '',
    sprawlQty: '',
    isLast: true
  };
  return [...rows.map(r => ({ ...r, isLast: false })), discount];
}

// Whole sentence in one token so the unit always matches the basis. The old template
// wording hardcoded "per GB", which mislabelled the per-user Message/Email rates.
export function buildOverageLine(lines: SprawlLine[]): string {
  if (lines.length === 0) return '';
  const parts = lines.map(
    l => `${formatCurrency(l.rate)} ${l.basis === 'gb' ? 'per GB' : 'per user'}`
  );
  return `Overage Charge: ${parts.join(' | ')}`;
}

// Value for the legacy {{per_data_cost}} token on templates not yet carrying
// {{sprawl_overage_line}}. Content wins because its rate matches the static "per GB"
// wording; otherwise this keeps today's (mislabelled) deployed value rather than
// silently changing a live agreement's number.
export function sprawlPerDataCost(config: ConfigurationData | undefined): string | undefined {
  const cfg = (config || {}) as ConfigurationData;
  // Without this guard a Migrate quote would print a Data Sprawl rate, because switching
  // plans leaves manageSprawlTypes on the config.
  if (cfg.servicePlan !== 'Manage') return undefined;
  const lines = calcSprawlLinesFromConfig(cfg);
  if (lines.length === 0) return undefined;
  // Content wins because its rate matches the template's static "per GB" wording.
  const line = lines.find(l => l.type === 'Content') ?? lines[0];
  return formatCurrency(line.rate);
}
