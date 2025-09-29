import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // HubSpot authentication bypass removed - users must authenticate normally
    // This component now only handles HubSpot data extraction for authenticated users
    const processHubSpotData = async () => {
      console.log('🔍 HubSpotAuthHandler: Processing HubSpot data for authenticated user');
      
      // Only process HubSpot data if user is already authenticated
      if (!isAuthenticated) {
        console.log('🔍 User not authenticated, skipping HubSpot data processing');
        return;
      }

      // Check for HubSpot URL parameters
      const urlParams = new URLSearchParams(location.search);
      const hasHubspotData = urlParams.has('dealId') || 
                            urlParams.has('dealName') ||
                            urlParams.has('ContactEmail') ||
                            urlParams.has('ContactFirstName') ||
                            urlParams.has('ContactLastName') ||
                            urlParams.has('CompanyName');

      if (!hasHubspotData) {
        console.log('🔍 No HubSpot data in URL parameters');
        return;
      }

      console.log('🔍 Processing HubSpot data for authenticated user');
      setIsProcessing(true);
      setError(null);

      try {
        // Extract HubSpot data from URL parameters
        const firstName = urlParams.get('ContactFirstName') || '';
        const lastName = urlParams.get('ContactLastName') || '';
        const fullName = `${firstName} ${lastName}`.trim() || urlParams.get('dealName') || 'HubSpot User';
        
        const hubspotUserData: HubSpotUserData = {
          contactId: urlParams.get('hs_contact_id') || urlParams.get('contactId') || undefined,
          dealId: urlParams.get('hs_deal_id') || urlParams.get('dealId') || undefined,
          companyName: urlParams.get('hs_company') || 
                      urlParams.get('company') || 
                      urlParams.get('CompanyName') || 
                      urlParams.get('CompanyFromContact') || 
                      undefined,
          contactName: urlParams.get('hs_contact_name') || 
                      urlParams.get('contact_name') || 
                      urlParams.get('contactName') || 
                      fullName || 
                      urlParams.get('dealName') || 
                      undefined,
          contactEmail: urlParams.get('hs_contact_email') || 
                       urlParams.get('contact_email') || 
                       urlParams.get('ContactEmail') || 
                       undefined,
          dealAmount: urlParams.get('hs_deal_amount') || 
                     urlParams.get('deal_amount') || 
                     urlParams.get('amount') || 
                     undefined,
          dealStage: urlParams.get('hs_deal_stage') || urlParams.get('deal_stage') || undefined,
          source: 'hubspot'
        };

        console.log('📊 Extracted HubSpot data:', hubspotUserData);

        // Store HubSpot data for use in quotes (but don't create user session)
        localStorage.setItem('cpq_hubspot_data', JSON.stringify(hubspotUserData));
        console.log('📊 Stored HubSpot data for authenticated user:', hubspotUserData);

      } catch (error) {
        console.error('❌ HubSpot data processing failed:', error);
        setError(error instanceof Error ? error.message : 'HubSpot data processing failed');
      } finally {
        setIsProcessing(false);
      }
    };

    processHubSpotData();
  }, [location, isAuthenticated]);

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
