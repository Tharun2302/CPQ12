// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DealDetails from '../../src/components/DealDetails';

// Matches what App.parseDealParameters builds from the Wavenet link:
// ...&ContactEmail=&ContactFirstName=&ContactLastName=&CompanyName=Wavenet&CompanyFromContact=
const wavenetFromLink = {
  dealId: '57397519774',
  dealName: 'Wavenet - New Deal - Google Shared Drives',
  company: 'Wavenet',
  companyByContact: 'Not Available',
  contactName: 'Not Available',
  contactEmail: 'Not Available',
};

function companyCardValue() {
  const label = screen.getByText('Company Name');
  return label.nextElementSibling?.textContent;
}

describe('DealDetails Company Name card', () => {
  afterEach(cleanup);

  it('shows CompanyName (Wavenet) when CompanyFromContact is empty', () => {
    render(<DealDetails dealData={wavenetFromLink} />);
    expect(companyCardValue()).toBe('Wavenet');
    expect(screen.queryByText('Extracted from email domain')).toBeNull();
  });

  it('passes the fallback company on when "Use Deal Data" is clicked', () => {
    const onUseDealData = vi.fn();
    render(<DealDetails dealData={wavenetFromLink} onUseDealData={onUseDealData} />);
    fireEvent.click(screen.getByRole('button', { name: /use deal data/i }));
    expect(onUseDealData).toHaveBeenCalledWith(expect.objectContaining({ companyByContact: 'Wavenet' }));
  });

  it('still prefers CompanyFromContact when HubSpot sends it', () => {
    render(<DealDetails dealData={{ ...wavenetFromLink, companyByContact: 'Wavenet Ltd' }} />);
    expect(companyCardValue()).toBe('Wavenet Ltd');
  });

  it('falls back to the email domain only when neither company field is set', () => {
    render(
      <DealDetails
        dealData={{ ...wavenetFromLink, company: 'Not Available', contactEmail: 'nathan.harris@wavenet.com' }}
      />
    );
    expect(companyCardValue()).toBe('Wavenet');
    expect(screen.getByText('Extracted from email domain')).toBeTruthy();
  });

  it('shows Not Available when there is no company and no email', () => {
    render(<DealDetails dealData={{ ...wavenetFromLink, company: 'Not Available' }} />);
    expect(companyCardValue()).toBe('Not Available');
    expect(screen.queryByText('Extracted from email domain')).toBeNull();
  });
});
