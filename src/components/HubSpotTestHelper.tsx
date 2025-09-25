import React, { useState } from 'react';
import { Copy, ExternalLink, TestTube } from 'lucide-react';

const HubSpotTestHelper: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState('http://localhost:5173');
  const [contactId, setContactId] = useState('12345');
  const [dealId, setDealId] = useState('67890');
  const [companyName, setCompanyName] = useState('Acme Corp');
  const [contactName, setContactName] = useState('John Smith');
  const [contactEmail, setContactEmail] = useState('john@acme.com');
  const [dealAmount, setDealAmount] = useState('50000');

  const generateTestUrl = () => {
    const params = new URLSearchParams();
    
    if (contactId) params.set('hs_contact_id', contactId);
    if (dealId) params.set('hs_deal_id', dealId);
    if (companyName) params.set('hs_company', companyName);
    if (contactName) params.set('hs_contact_name', contactName);
    if (contactEmail) params.set('hs_contact_email', contactEmail);
    if (dealAmount) params.set('hs_deal_amount', dealAmount);
    
    // Add hubspot parameter to indicate source
    params.set('hubspot', 'true');
    
    return `${baseUrl}?${params.toString()}`;
  };

  const testUrl = generateTestUrl();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(testUrl);
      alert('URL copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const openTestUrl = () => {
    window.open(testUrl, '_blank');
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      <div className="flex items-center space-x-2 mb-6">
        <TestTube className="h-6 w-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900">HubSpot Integration Test Helper</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Configuration */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-700">Test Parameters</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Base URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact ID
            </label>
            <input
              type="text"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deal ID
            </label>
            <input
              type="text"
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Name
            </label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Email
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deal Amount
            </label>
            <input
              type="text"
              value={dealAmount}
              onChange={(e) => setDealAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Generated URL */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-700">Generated Test URL</h3>
          
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">This URL simulates coming from HubSpot:</p>
            <code className="text-xs text-gray-800 break-all">{testUrl}</code>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={copyToClipboard}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Copy className="h-4 w-4" />
              <span>Copy URL</span>
            </button>
            
            <button
              onClick={openTestUrl}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Test URL</span>
            </button>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">How to Test:</h4>
            <ol className="text-sm text-blue-800 space-y-1">
              <li>1. Click "Test URL" to open in new tab</li>
              <li>2. You should see "Connecting from HubSpot..." loading screen</li>
              <li>3. You'll be automatically logged in and redirected to dashboard</li>
              <li>4. Check browser console for debug logs</li>
            </ol>
          </div>

          <div className="bg-yellow-50 p-4 rounded-lg">
            <h4 className="font-semibold text-yellow-900 mb-2">For Real HubSpot Integration:</h4>
            <p className="text-sm text-yellow-800">
              In your HubSpot deal, add a custom action button with this URL pattern:
              <br />
              <code className="text-xs bg-yellow-100 px-2 py-1 rounded">
                https://yourdomain.com?hubspot=true&hs_contact_id={'{'}{'{'}contact.id{'}'}{'}'}&hs_deal_id={'{'}{'{'}deal.id{'}'}{'}'}
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HubSpotTestHelper;
