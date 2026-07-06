import React from 'react';

const ApprovalDashboardTest: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Approval Tracking Test</h1>
        <p className="text-gray-600 text-lg">This is a test page to verify routing works.</p>
        <button 
          onClick={() => window.location.href = '/approval'}
          className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Back to Approval Workflow
        </button>
      </div>
    </div>
  );
};

export default ApprovalDashboardTest;
