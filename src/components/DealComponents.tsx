import React from 'react';
import { 
  Building, 
  DollarSign, 
  Calendar, 
  Target, 
  UserCheck,
  Hash,
  FileText
} from 'lucide-react';

interface DealPropertyProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<any>;
  iconColor: string;
  bgColor: string;
  borderColor: string;
}

const DealProperty: React.FC<DealPropertyProps> = ({ 
  label, 
  value, 
  icon: Icon, 
  iconColor, 
  bgColor, 
  borderColor 
}) => {
  return (
    <div className={`flex items-center p-6 bg-gradient-to-r ${bgColor} rounded-xl border ${borderColor} shadow-sm hover:shadow-md transition-all duration-200`}>
      <div className={`w-12 h-12 ${iconColor} rounded-lg flex items-center justify-center mr-4`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-gray-500 font-medium mb-1">{label}</p>
        <p className="font-bold text-gray-900 text-xl">{value}</p>
      </div>
    </div>
  );
};

interface DealComponentsProps {
  dealData: {
    dealId: string;
    dealName: string;
    amount: string;
    closeDate?: string;
    stage?: string;
    ownerId?: string;
  } | null;
}

const DealComponents: React.FC<DealComponentsProps> = ({ dealData }) => {
  if (!dealData) {
    return (
      <div className="text-center py-12">
        <Building className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-600 mb-2">No Deal Data Available</h3>
        <p className="text-gray-500">Deal information will appear here when accessed from HubSpot</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deal ID Component */}
        <DealProperty
          label="Deal ID"
          value={dealData.dealId}
          icon={Hash}
          iconColor="bg-blue-500"
          bgColor="from-blue-50 to-indigo-50"
          borderColor="border-blue-200"
        />

        {/* Deal Name Component */}
        <DealProperty
          label="Deal Name"
          value={dealData.dealName}
          icon={FileText}
          iconColor="bg-indigo-500"
          bgColor="from-indigo-50 to-purple-50"
          borderColor="border-indigo-200"
        />

        {/* Amount Component */}
        <DealProperty
          label="Deal Amount"
          value={dealData.amount}
          icon={DollarSign}
          iconColor="bg-green-500"
          bgColor="from-green-50 to-emerald-50"
          borderColor="border-green-200"
        />

        {/* Stage Component */}
        <DealProperty
          label="Deal Stage"
          value={dealData.stage || 'Not Set'}
          icon={Target}
          iconColor="bg-purple-500"
          bgColor="from-purple-50 to-violet-50"
          borderColor="border-purple-200"
        />

        {/* Close Date Component */}
        <DealProperty
          label="Close Date"
          value={dealData.closeDate ? new Date(dealData.closeDate).toLocaleDateString() : 'Not Set'}
          icon={Calendar}
          iconColor="bg-orange-500"
          bgColor="from-orange-50 to-amber-50"
          borderColor="border-orange-200"
        />

        {/* Owner ID Component */}
        <DealProperty
          label="Owner ID"
          value={dealData.ownerId || 'Not Set'}
          icon={UserCheck}
          iconColor="bg-teal-500"
          bgColor="from-teal-50 to-cyan-50"
          borderColor="border-teal-200"
        />
      </div>

      {/* Deal Summary Card */}
      <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl border border-gray-200 p-6">
        <div className="flex items-center mb-4">
          <Building className="w-6 h-6 text-blue-600 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Deal Summary</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Total Properties:</span>
            <span className="ml-2 font-semibold text-gray-900">6</span>
          </div>
          <div>
            <span className="text-gray-500">Last Updated:</span>
            <span className="ml-2 font-semibold text-gray-900">{new Date().toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-500">Status:</span>
            <span className="ml-2 font-semibold text-green-600">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealComponents;
