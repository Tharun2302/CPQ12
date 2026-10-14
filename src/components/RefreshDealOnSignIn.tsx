import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isHubSpotDealId } from '../utils/hubspotDealDetails';

interface RefreshDealOnSignInProps {
  dealId?: string;
  onRefresh: () => void;
}

// The deal endpoint needs a signed-in user, so the live HubSpot lookup waits for (and
// re-runs after) sign-in instead of failing once at page load
function RefreshDealOnSignIn({ dealId, onRefresh }: RefreshDealOnSignInProps) {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (userId && isHubSpotDealId(dealId)) onRefresh();
  }, [userId, dealId, onRefresh]);

  return null;
}

export default RefreshDealOnSignIn;
