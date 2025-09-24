import React, { useState, useEffect } from 'react';
import { 
  Building, 
  User, 
  DollarSign,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Settings,
  Hash,
  UserCheck
} from 'lucide-react';

interface DealData {
  dealId: string;
  dealName: string;
  amount: string;
  company?: string;
  companyByContact?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactJobTitle?: string;
  companyDomain?: string;
  companyPhone?: string;
  companyAddress?: string;
}

interface DealDetailsProps {
  dealData?: DealData | null;
  onRefresh?: () => void;
  onUseDealData?: (dealData: DealData) => void;
}

const DealDetails: React.FC<DealDetailsProps> = ({ dealData, onRefresh, onUseDealData }) => {
  const [isLoading] = useState(false);
  const [showSuccessMessage] = useState(false);

  console.log('🔍 DealDetails render - dealData:', dealData);
  console.log('🔍 Company By Contact value:', dealData?.companyByContact);
  console.log('🔍 Company By Contact exists?', !!dealData?.companyByContact);

  if (!dealData) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center">
            <Building className="w-5 h-5 mr-2 text-blue-600" />
            Deal Information
          </h2>
        </div>
        <div className="text-center py-8">
          <Building className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No deal information available</p>
          <p className="text-sm text-gray-400 mt-1">
            Deal details will appear here when accessed from HubSpot
          </p>
        </div>
      </div>
    );
  }

  // Refresh button removed per requirements; keeping onRefresh prop optional for compatibility

  const handleUseDealData = () => {
    console.log('🔍 Use Deal Data button clicked');
    console.log('🔍 onUseDealData function exists:', !!onUseDealData);
    console.log('🔍 dealData exists:', !!dealData);
    console.log('🔍 dealData content:', dealData);
    
    if (onUseDealData && dealData) {
      console.log('✅ Calling onUseDealData with:', dealData);
      onUseDealData(dealData);
    } else {
      console.log('❌ Cannot use deal data - missing function or data');
    }
  };

  return (
    <div className="bg-gradient-to-br from-white to-blue-50/30 rounded-xl shadow-lg border border-blue-100 p-8">
      {showSuccessMessage && (
        <div className="mb-4 p-3 bg-green-100 border border-green-300 rounded-lg">
          <p className="text-sm text-green-800 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Deal data refreshed successfully from HubSpot!
          </p>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center mr-4">
            <Building className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Deal Information</h2>
            <p className="text-gray-600">HubSpot Deal Details</p>
          </div>
        </div>
        {/* Top-right action buttons removed (Refresh, View in HubSpot) */}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deal ID */}
        <div className="flex items-center p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
            <Hash className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Deal ID</p>
            <p className="font-semibold text-gray-900 text-lg">{dealData.dealId}</p>
          </div>
        </div>

        {/* Deal Name */}
        <div className="flex items-center p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
            <Building className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Deal Name</p>
            <p className="font-semibold text-gray-900 text-lg">{dealData.dealName}</p>
          </div>
        </div>

        {/* Amount */}
        <div className="flex items-center p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-4">
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Amount</p>
            <p className="font-semibold text-gray-900 text-lg">{dealData.amount}</p>
          </div>
        </div>

      </div>

      {/* Enhanced Contact & Company Information - Always Show */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-green-600" />
          Contact & Company Information
        </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contact Name - Always Show */}
            <div className="flex items-center p-4 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl border border-teal-100">
              <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center mr-4">
                <User className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Contact Name</p>
                <p className="font-semibold text-gray-900 text-lg">{dealData.contactName || 'Not Available'}</p>
              </div>
            </div>

            {/* Contact Email - Always Show */}
            <div className="flex items-center p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <div className="w-5 h-5 text-blue-600 text-center text-xs font-bold">@</div>
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Contact Email</p>
                <p className="font-semibold text-gray-900 text-lg">{dealData.contactEmail || 'Not Available'}</p>
              </div>
            </div>

            {/* Company Name - Always Show */}
            <div className="flex items-center p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl border border-amber-100">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mr-4">
                <Building className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Company Name</p>
                <p className="font-semibold text-gray-900 text-lg">{dealData.companyByContact || 'Not Available'}</p>
              </div>
            </div>
          </div>
        </div>

      {/* Use Deal Data Button */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Last updated: {new Date().toLocaleString()}
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={handleUseDealData}
              className="flex items-center px-6 py-3 text-sm bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg"
            >
              <Settings className="w-4 h-4 mr-2" />
              Use Deal Data
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealDetails;