import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const HubSpotIntegrationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const processHubSpotRedirect = async () => {
      try {
        console.log('🔍 Processing HubSpot redirect...');
        
        // Check if we have HubSpot parameters
        const dealId = searchParams.get('dealId');
        const dealName = searchParams.get('dealName');
        const contactEmail = searchParams.get('ContactEmail') || searchParams.get('contactEmail');
        
        console.log('🔍 HubSpot parameters:', {
          dealId,
          dealName,
          contactEmail,
          allParams: Object.fromEntries(searchParams.entries())
        });

        // Auto-authenticate user with HubSpot data
        if (contactEmail) {
          console.log('🔍 Auto-authenticating user with HubSpot email:', contactEmail);
          
          // Create a temporary user for HubSpot integration
          const hubspotUser = {
            id: `hubspot_${Date.now()}`,
            name: searchParams.get('ContactFirstName') + ' ' + searchParams.get('ContactLastName') || 'HubSpot User',
            email: contactEmail,
            provider: 'hubspot',
            createdAt: new Date().toISOString()
          };

          // Store user in localStorage
          localStorage.setItem('cpq_user', JSON.stringify(hubspotUser));
          localStorage.setItem('cpq_token', `hubspot_${Date.now()}`);
          localStorage.setItem('hubspot_deal_data', JSON.stringify({
            dealId,
            dealName,
            contactEmail,
            contactFirstName: searchParams.get('ContactFirstName'),
            contactLastName: searchParams.get('ContactLastName'),
            companyName: searchParams.get('CompanyName'),
            amount: searchParams.get('amount'),
            closeDate: searchParams.get('closeDate'),
            stage: searchParams.get('stage'),
            allParams: Object.fromEntries(searchParams.entries())
          }));

          console.log('✅ HubSpot user authenticated and data stored');
        } else {
          console.log('⚠️ No contact email found, creating generic HubSpot user');
          
          // Create a generic HubSpot user
          const hubspotUser = {
            id: `hubspot_${Date.now()}`,
            name: 'HubSpot User',
            email: 'hubspot@integration.com',
            provider: 'hubspot',
            createdAt: new Date().toISOString()
          };

          localStorage.setItem('cpq_user', JSON.stringify(hubspotUser));
          localStorage.setItem('cpq_token', `hubspot_${Date.now()}`);
        }

        // Redirect to dashboard
        console.log('🔄 Redirecting to dashboard...');
        navigate('/dashboard', { replace: true });
        
      } catch (error) {
        console.error('❌ Error processing HubSpot redirect:', error);
        // Fallback: redirect to landing page
        navigate('/', { replace: true });
      } finally {
        setIsProcessing(false);
      }
    };

    processHubSpotRedirect();
  }, [navigate, searchParams]);

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Connecting from HubSpot...
          </h2>
          <p className="text-gray-500">
            Please wait while we set up your CPQ session.
          </p>
        </div>
      </div>
    );
  }

  return null; // This should not render as we redirect immediately
};

export default HubSpotIntegrationPage;
