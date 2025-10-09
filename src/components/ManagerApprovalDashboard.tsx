import React, { useState } from 'react';
import { ArrowLeft, RefreshCw, Clock, User, BarChart3, X, FileCheck, MessageCircle, Users, CheckCircle, AlertCircle, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';

interface ManagerApprovalDashboardProps {
  managerEmail?: string;
  onBackToDashboard?: () => void;
}

const ManagerApprovalDashboard: React.FC<ManagerApprovalDashboardProps> = ({ 
  managerEmail = 'manager@company.com',
  onBackToDashboard 
}) => {
  const [activeTab, setActiveTab] = useState('queue');
  const { workflows, isLoading, updateWorkflowStep } = useApprovalWorkflows();
  
  console.log('ManagerApprovalDashboard rendered for:', managerEmail);
  console.log('📊 Available workflows:', workflows.length);
  console.log('📋 Workflows data:', workflows);

  const tabs = [
    { id: 'queue', label: 'My Approval Queue', icon: User, count: workflows.filter(w => w.status === 'pending' && w.currentStep === 1).length },
    { id: 'pending', label: 'Pending Approvals', icon: Clock, count: workflows.filter(w => w.status === 'pending').length },
    { id: 'status', label: 'Workflow Status', icon: BarChart3, count: workflows.length },
    { id: 'history', label: 'My Approval History', icon: FileCheck, count: workflows.filter(w => w.status === 'approved' || w.status === 'denied').length },
    { id: 'comments', label: 'My Comments', icon: MessageCircle, count: 0 }
  ];

  const handleRefresh = () => {
    console.log('Refresh clicked');
  };

  const handleApprove = async (workflowId: string) => {
    console.log('Approving workflow:', workflowId);
    try {
      // Update workflow step
      updateWorkflowStep(workflowId, 1, { status: 'approved' });
      
      // Get workflow data to send CEO email
      const workflow = workflows.find(w => w.id === workflowId);
      if (workflow) {
        // Send email to CEO
        console.log('📧 Sending email to CEO after Manager approval...');
        const response = await fetch('http://localhost:3001/api/send-ceo-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ceoEmail: workflow.workflowSteps?.find(step => step.role === 'CEO')?.email || 'ceo@company.com',
            workflowData: {
              documentId: workflow.documentId,
              documentType: workflow.documentType,
              clientName: workflow.clientName,
              amount: workflow.amount,
              workflowId: workflow.id
            }
          })
        });

        const result = await response.json();
        if (result.success) {
          alert('✅ Workflow approved successfully!\n📧 CEO has been notified for next approval.');
        } else {
          alert('✅ Workflow approved but CEO email failed.\nPlease notify CEO manually.');
        }
      } else {
        alert('✅ Workflow approved successfully!');
      }
    } catch (error) {
      console.error('Error approving workflow:', error);
      alert('❌ Failed to approve workflow. Please try again.');
    }
  };

  const handleDeny = (workflowId: string) => {
    console.log('Denying workflow:', workflowId);
    try {
      updateWorkflowStep(workflowId, 1, { status: 'denied' });
      alert('❌ Workflow denied successfully!');
    } catch (error) {
      console.error('Error denying workflow:', error);
      alert('❌ Failed to deny workflow. Please try again.');
    }
  };

  const handleAddComment = (workflowId: string) => {
    console.log('Adding comment to workflow:', workflowId);
    // TODO: Implement comment logic
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'approved': return 'text-green-600 bg-green-100';
      case 'denied': return 'text-red-600 bg-red-100';
      case 'in_progress': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return Clock;
      case 'approved': return CheckCircle;
      case 'denied': return X;
      case 'in_progress': return RefreshCw;
      default: return AlertCircle;
    }
  };

  const renderTabContent = () => {
    // Handle special tabs that don't filter workflows
    if (activeTab === 'comments') {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 italic text-lg">No comments found.</p>
          <p className="text-gray-400 text-sm mt-2">Your comments will appear here when you add them to workflows.</p>
        </div>
      );
    }

    // Filter workflows for manager-specific view
    const filteredWorkflows = workflows.filter(workflow => {
      switch (activeTab) {
        case 'queue': return workflow.status === 'pending' && workflow.currentStep === 1;
        case 'pending': return workflow.status === 'pending';
        case 'denied': return workflow.status === 'denied';
        case 'history': return workflow.status === 'approved' || workflow.status === 'denied';
        case 'status': return true;
        default: return true;
      }
    });

    if (filteredWorkflows.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {React.createElement(tabs.find(t => t.id === activeTab)?.icon || Clock, { className: "w-8 h-8 text-gray-400" })}
          </div>
          <p className="text-gray-500 italic text-lg">
            {activeTab === 'queue' && 'No items in your approval queue.'}
            {activeTab === 'pending' && 'No pending approvals found.'}
            {activeTab === 'denied' && 'No denied requests found.'}
            {activeTab === 'history' && 'No approval history found.'}
            {activeTab === 'status' && 'No workflows found.'}
          </p>
        </div>
      );
    }

    // Special handling for Workflow Status tab - show overview
    if (activeTab === 'status') {
      const statusCounts = {
        pending: workflows.filter(w => w.status === 'pending').length,
        in_progress: workflows.filter(w => w.status === 'in_progress').length,
        approved: workflows.filter(w => w.status === 'approved').length,
        denied: workflows.filter(w => w.status === 'denied').length
      };

      return (
        <div className="space-y-6">
          {/* Status Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-800">{statusCounts.pending}</p>
                  <p className="text-sm text-yellow-600">Pending</p>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-800">{statusCounts.in_progress}</p>
                  <p className="text-sm text-blue-600">In Progress</p>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-800">{statusCounts.approved}</p>
                  <p className="text-sm text-green-600">Approved</p>
                </div>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <X className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-800">{statusCounts.denied}</p>
                  <p className="text-sm text-red-600">Denied</p>
                </div>
              </div>
            </div>
          </div>

          {/* All Workflows List */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">All Workflows</h3>
            <div className="space-y-3">
              {workflows.map((workflow) => {
                const StatusIcon = getStatusIcon(workflow.status);
                return (
                  <div key={workflow.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${getStatusColor(workflow.status)}`}>
                          <StatusIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{workflow.documentId}</h4>
                          <p className="text-sm text-gray-500">{workflow.clientName}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">${workflow.amount.toLocaleString()}</p>
                        <p className="text-sm text-gray-500">Step {workflow.currentStep} of {workflow.totalSteps}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {filteredWorkflows.map((workflow) => {
          const StatusIcon = getStatusIcon(workflow.status);
          const isMyTurn = workflow.status === 'pending' && workflow.currentStep === 1;
          
          return (
            <div key={workflow.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${getStatusColor(workflow.status)}`}>
                    <StatusIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{workflow.documentId}</h3>
                    <p className="text-sm text-gray-500">{workflow.clientName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">${workflow.amount.toLocaleString()}</p>
                  <p className="text-sm text-gray-500">Step {workflow.currentStep} of {workflow.totalSteps}</p>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                  <span>Progress</span>
                  <span>{Math.round((workflow.currentStep / workflow.totalSteps) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(workflow.currentStep / workflow.totalSteps) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {workflow.workflowSteps.map((step: any) => {
                  const StepIcon = getStatusIcon(step.status);
                  const isMyStep = step.step === 1 && step.role === 'Manager';
                  return (
                    <div key={step.step} className={`flex items-center gap-3 text-sm p-2 rounded ${isMyStep ? 'bg-blue-50 border border-blue-200' : ''}`}>
                      <div className={`p-1 rounded ${getStatusColor(step.status)}`}>
                        <StepIcon className="w-4 h-4" />
                      </div>
                      <span className="font-medium">{step.role}</span>
                      <span className="text-gray-500">{step.email}</span>
                      {isMyStep && <span className="text-blue-600 font-semibold text-xs">(Your Turn)</span>}
                      {step.timestamp && (
                        <span className="text-gray-400 ml-auto">
                          {new Date(step.timestamp).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons for Manager */}
              {isMyTurn && (
                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => handleApprove(workflow.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleDeny(workflow.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Deny
                  </button>
                  <button
                    onClick={() => handleAddComment(workflow.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Add Comment
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={onBackToDashboard}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 text-white"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh Dashboard
            </button>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900">Manager Approval Portal</h1>
            </div>
            <p className="text-xl text-gray-600">Review and approve document workflows</p>
            <p className="text-sm text-gray-500 mt-1">Logged in as: {managerEmail}</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 overflow-x-auto py-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-sm whitespace-nowrap transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                {React.createElement(tabs.find(t => t.id === activeTab)?.icon || Clock, { className: "w-4 h-4 text-blue-600" })}
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                {tabs.find(t => t.id === activeTab)?.label}
              </h2>
            </div>
            <div className="mt-3 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
              Manager Approval Actions
            </div>
          </div>
          
          <div className="p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagerApprovalDashboard;
