import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface HubSpotUserData {
  contactId?: string;
  dealId?: string;
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  dealAmount?: string;
  dealStage?: string;
  source: 'hubspot';
}

interface HubSpotAuthHandlerProps {
  children: React.ReactNode;
}

const HubSpotAuthHandler: React.FC<HubSpotAuthHandlerProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processHubSpotAuth = async () => {
      console.log('🔍 HubSpotAuthHandler: Starting processHubSpotAuth');
      console.log('🔍 isAuthenticated:', isAuthenticated);
      console.log('🔍 location.search:', location.search);
      
      // Check if user is already authenticated
      if (isAuthenticated) {
        console.log('🔍 User already authenticated, skipping HubSpot auth');
        return;
      }

      // Check for HubSpot URL parameters
      const urlParams = new URLSearchParams(location.search);
      const isFromHubspot = urlParams.has('hubspot') || 
                           urlParams.has('hs_deal_id') || 
                           urlParams.has('hs_contact_id') ||
                           location.search.includes('hubspot') ||
                           document.referrer.includes('hubspot');

      console.log('🔍 isFromHubspot:', isFromHubspot);
      console.log('🔍 urlParams:', Object.fromEntries(urlParams.entries()));

      if (!isFromHubspot) {
        console.log('🔍 Not from HubSpot, letting normal auth flow handle it');
        return; // Not from HubSpot, let normal auth flow handle it
      }

      console.log('🔍 Starting HubSpot authentication process');
      setIsProcessing(true);
      setError(null);

      try {
        console.log('🔍 HubSpot authentication detected');
        console.log('📍 Current URL:', window.location.href);
        console.log('📍 Referrer:', document.referrer);
        console.log('📍 URL Params:', Object.fromEntries(urlParams.entries()));

        // Extract HubSpot data from URL parameters
        const hubspotUserData: HubSpotUserData = {
          contactId: urlParams.get('hs_contact_id') || undefined,
          dealId: urlParams.get('hs_deal_id') || undefined,
          companyName: urlParams.get('hs_company') || urlParams.get('company') || undefined,
          contactName: urlParams.get('hs_contact_name') || urlParams.get('contact_name') || undefined,
          contactEmail: urlParams.get('hs_contact_email') || urlParams.get('contact_email') || undefined,
          dealAmount: urlParams.get('hs_deal_amount') || urlParams.get('deal_amount') || undefined,
          dealStage: urlParams.get('hs_deal_stage') || urlParams.get('deal_stage') || undefined,
          source: 'hubspot'
        };

        console.log('📊 Extracted HubSpot data:', hubspotUserData);

        // If we have minimal data, try to fetch more from HubSpot API
        if (hubspotUserData.contactId || hubspotUserData.dealId) {
          try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            
            // Try to fetch contact details
            if (hubspotUserData.contactId) {
              const contactResponse = await fetch(`${backendUrl}/api/hubspot/contacts/${hubspotUserData.contactId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              });
              
              if (contactResponse.ok) {
                const contactData = await contactResponse.json();
                if (contactData.success && contactData.data) {
                  hubspotUserData.contactName = hubspotUserData.contactName || contactData.data.properties?.firstname + ' ' + contactData.data.properties?.lastname;
                  hubspotUserData.contactEmail = hubspotUserData.contactEmail || contactData.data.properties?.email;
                  hubspotUserData.companyName = hubspotUserData.companyName || contactData.data.properties?.company;
                }
              }
            }

            // Try to fetch deal details
            if (hubspotUserData.dealId) {
              const dealResponse = await fetch(`${backendUrl}/api/hubspot/deals/${hubspotUserData.dealId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              });
              
              if (dealResponse.ok) {
                const dealData = await dealResponse.json();
                if (dealData.success && dealData.data) {
                  hubspotUserData.dealAmount = hubspotUserData.dealAmount || dealData.data.properties?.amount;
                  hubspotUserData.dealStage = hubspotUserData.dealStage || dealData.data.properties?.dealstage;
                }
              }
            }
          } catch (apiError) {
            console.warn('⚠️ Could not fetch additional HubSpot data:', apiError);
            // Continue with available data
          }
        }

        // Store HubSpot data for later use
        console.log('📊 HubSpot data extracted:', hubspotUserData);

        // Create a HubSpot user object
        const hubspotUser = {
          id: `hubspot_${hubspotUserData.contactId || Date.now()}`,
          name: hubspotUserData.contactName || 'HubSpot User',
          email: hubspotUserData.contactEmail || 'hubspot@example.com',
          provider: 'hubspot',
          createdAt: new Date().toISOString(),
          hubspotData: hubspotUserData
        };

        // Store user data in localStorage
        localStorage.setItem('cpq_user', JSON.stringify(hubspotUser));
        localStorage.setItem('cpq_hubspot_data', JSON.stringify(hubspotUserData));
        localStorage.setItem('cpq_auth_source', 'hubspot');
        localStorage.setItem('cpq_token', 'hubspot_auth_token'); // Simple token for HubSpot users

        console.log('✅ HubSpot user authenticated successfully:', hubspotUser);

        // Reload the page to trigger auth context update
        window.location.href = '/dashboard';

      } catch (error) {
        console.error('❌ HubSpot authentication failed:', error);
        setError(error instanceof Error ? error.message : 'HubSpot authentication failed');
        
        // Redirect to landing page on error
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 3000);
      } finally {
        setIsProcessing(false);
      }
    };

    // Add timeout to prevent infinite processing
    const timeoutId = setTimeout(() => {
      if (isProcessing) {
        console.warn('⚠️ HubSpot auth processing timeout, stopping');
        setIsProcessing(false);
        setError('Authentication timeout');
      }
    }, 10000); // 10 second timeout

    processHubSpotAuth();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [location, isAuthenticated, navigate]);

  // Show loading state while processing HubSpot auth
  if (isProcessing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-6">
            <Loader2 className="h-16 w-16 text-blue-600 animate-spin mx-auto" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Connecting from HubSpot...
          </h2>
          <p className="text-gray-600 mb-6">
            We're setting up your account automatically. This will only take a moment.
          </p>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Detected HubSpot integration</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-6">
            <AlertCircle className="h-16 w-16 text-red-600 mx-auto" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Authentication Error
          </h2>
          <p className="text-gray-600 mb-6">
            {error}
          </p>
          <p className="text-sm text-gray-500">
            Redirecting to home page...
          </p>
        </div>
      </div>
    );
  }

  // Render children if not processing and no error
  if (!isProcessing && !error) {
    return <>{children}</>;
  }

  // This should not happen, but just in case
  return <>{children}</>;
};

export default HubSpotAuthHandler;
