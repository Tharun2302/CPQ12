// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EsignProviderPicker from '../../src/components/EsignProviderPicker';
import type { EsignProvider } from '../../src/services/esignDocumentService';

function Harness({ onChange }: { onChange?: (p: EsignProvider) => void }) {
  const [provider, setProvider] = useState<EsignProvider>('cpq');
  return (
    <EsignProviderPicker
      value={provider}
      onChange={(p) => {
        setProvider(p);
        onChange?.(p);
      }}
    />
  );
}

// Vitest runs without globals here, so React Testing Library's auto-cleanup never registers.
afterEach(cleanup);

describe('EsignProviderPicker', () => {
  it('offers both methods with the in-house one selected and marked as the default', () => {
    render(<Harness />);

    const cpq = screen.getByRole('radio', { name: /CPQ e-signature/i }) as HTMLInputElement;
    const zoho = screen.getByRole('radio', { name: /Zoho Sign/i }) as HTMLInputElement;

    expect(cpq.checked).toBe(true);
    expect(zoho.checked).toBe(false);
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Built in. Signers get a CPQ link.')).toBeInTheDocument();
    expect(screen.getByText('Sent through Zoho. Signers get a Zoho email.')).toBeInTheDocument();
  });

  it('spells out the consequences only once Zoho is picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const consequences = /Zoho emails the signers\. Reminders and the audit trail come from Zoho\. Status updates can take up to 5 minutes\./i;
    expect(screen.queryByText(consequences)).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Zoho Sign/i }));

    expect(onChange).toHaveBeenCalledWith('zoho');
    expect(screen.getByText(consequences)).toBeInTheDocument();
  });

  it('cannot be changed while a send is in flight', async () => {
    const onChange = vi.fn();
    render(<EsignProviderPicker value="cpq" onChange={onChange} disabled />);

    expect(screen.getByRole('radio', { name: /Zoho Sign/i })).toBeDisabled();
  });
});
