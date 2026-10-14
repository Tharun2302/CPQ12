// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const authState: { user: { id: string } | null } = { user: null };
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => authState }));

import RefreshDealOnSignIn from '../../src/components/RefreshDealOnSignIn';

describe('RefreshDealOnSignIn', () => {
  beforeEach(() => {
    authState.user = null;
  });

  it('waits for sign-in, then refreshes the deal', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<RefreshDealOnSignIn dealId="57397519774" onRefresh={onRefresh} />);
    expect(onRefresh).not.toHaveBeenCalled();

    authState.user = { id: 'u1' };
    rerender(<RefreshDealOnSignIn dealId="57397519774" onRefresh={onRefresh} />);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes immediately when already signed in', () => {
    authState.user = { id: 'u1' };
    const onRefresh = vi.fn();
    render(<RefreshDealOnSignIn dealId="57397519774" onRefresh={onRefresh} />);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh for missing or synthetic deal IDs', () => {
    authState.user = { id: 'u1' };
    const onRefresh = vi.fn();
    const { rerender } = render(<RefreshDealOnSignIn onRefresh={onRefresh} />);
    rerender(<RefreshDealOnSignIn dealId="HUBSPOT-1700000000" onRefresh={onRefresh} />);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
