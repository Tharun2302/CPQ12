import { describe, it, expect } from 'vitest';
import { patchOveragePerGB } from '../../src/utils/docxTemplateProcessor';

const line = (perGB: string) =>
  `<w:t>Overage Charges for Box To Dropbox: $26.00 per User | $650.00 per server per month | </w:t><w:t>${perGB}</w:t><w:t> per GB</w:t>`;

describe('patchOveragePerGB', () => {
  it('keeps a region-adjusted rate below $1 intact (Region 3 regression)', () => {
    const xml = line('$0.94');
    expect(patchOveragePerGB(xml, '$1.80')).toBe(xml);
  });

  it.each(['$0.91', '$0.90', '$2.51', '$1.10', '$10.00', '$0.05'])(
    'does not alter a real rate %s',
    rate => {
      const xml = line(rate);
      expect(patchOveragePerGB(xml, '$1.50')).toBe(xml);
    }
  );

  it('keeps the rate intact when it shares a run with "per GB"', () => {
    const xml = '<w:t>Overage Charges: $26.00 per User | $0.91 per GB</w:t>';
    expect(patchOveragePerGB(xml, '$1.50')).toBe(xml);
  });

  it('still replaces a "$0.00" placeholder near the Overage line', () => {
    expect(patchOveragePerGB(line('$0.00'), '$1.50')).toBe(line('$1.50'));
  });

  it('still replaces a bare "$0" placeholder near the Overage line', () => {
    expect(patchOveragePerGB(line('$0'), '$1.50')).toBe(line('$1.50'));
  });

  it('still replaces hardcoded "$1.00 per GB" / "$0 per GB" text', () => {
    expect(patchOveragePerGB('<w:t>Rate: $1.00 per GB.</w:t>', '$1.80')).toBe('<w:t>Rate: $1.80 per GB</w:t>');
    expect(patchOveragePerGB('<w:t>Rate: $0 per GB</w:t>', '$1.80')).toBe('<w:t>Rate: $1.80 per GB</w:t>');
  });

  it('leaves documents without an Overage line or placeholder untouched', () => {
    const xml = '<w:t>Total: $0.00</w:t>';
    expect(patchOveragePerGB(xml, '$1.50')).toBe(xml);
  });
});
