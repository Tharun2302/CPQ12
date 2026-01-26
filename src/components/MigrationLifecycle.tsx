import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  Clock, 
  X, 
  ArrowRight, 
  Server, 
  UserCheck, 
  Building, 
  Users,
  FileCheck,
  Send,
  Play,
  RefreshCw
} from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import { useLocation, useNavigate } from 'react-router-dom';
import Navigation from './Navigation';

interface MigrationLifecycleWorkflow {
  id: string;
  dealId?: string;
  dealName?: string;
  clientName: string;
  companyName: string;
  accountManagerEmail: string;
  customerEmail: string;
  migrationManagerEmail: string;
  status: 'pending' | 'migration_manager_approval' | 'account_manager_approval' | 'customer_approval' | 'infrastructure_phase' | 'qa_phase' | 'completed' | 'denied';
  currentStep: number;
  numberOfServers?: number;
  serversBuilt?: number;
  qaStatus?: 'pending' | 'passed' | 'failed';
  createdAt: string;
  updatedAt: string;
  steps: WorkflowStep[];
}

interface WorkflowStep {
  step: number;
  name: string;
  role: string;
  email: string;
  status: 'pending' | 'approved' | 'denied';
  comments?: string;
  timestamp?: string;
}

const MigrationLifecycle: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<MigrationLifecycleWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<MigrationLifecycleWorkflow | null>(null);
  
  // Form state for creating new workflow
  const [formData, setFormData] = useState({
    dealId: '',
    dealName: '',
    clientName: '',
    companyName: '',
    accountManagerEmail: 'anushreddydasari@gmail.com',
    customerEmail: '',
    migrationManagerEmail: 'anushreddydasari@gmail.com',
  });

  const getCurrentTab = () => {
    const path = location.pathname;
    if (path.includes('migration-lifecycle')) return 'migration-lifecycle';
    return 'migration-lifecycle';
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/migration-lifecycle/workflows`);
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data.workflows || []);
      }
    } catch (error) {
      console.error('Error loading workflows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWorkflow = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/migration-lifecycle/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          // All emails go to anushreddydasari@gmail.com as requested
          accountManagerEmail: 'anushreddydasari@gmail.com',
          migrationManagerEmail: 'anushreddydasari@gmail.com',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        alert('✅ Migration Lifecycle workflow created successfully!');
        setShowCreateModal(false);
        setFormData({
          dealId: '',
          dealName: '',
          clientName: '',
          companyName: '',
          accountManagerEmail: 'anushreddydasari@gmail.com',
          customerEmail: '',
          migrationManagerEmail: 'anushreddydasari@gmail.com',
        });
        loadWorkflows();
      } else {
        const error = await response.json();
        alert(`Failed to create workflow: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating workflow:', error);
      alert('Failed to create workflow. Please try again.');
    }
  };

  const handleApproveStep = async (workflowId: string, stepNumber: number) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/migration-lifecycle/workflows/${workflowId}/steps/${stepNumber}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        alert('✅ Step approved successfully!');
        loadWorkflows();
      } else {
        const error = await response.json();
        alert(`Failed to approve: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error approving step:', error);
      alert('Failed to approve step. Please try again.');
    }
  };

  const handleUpdateServers = async (workflowId: string, numberOfServers: number) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/migration-lifecycle/workflows/${workflowId}/servers`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ numberOfServers }),
      });

      if (response.ok) {
        alert('✅ Number of servers updated!');
        loadWorkflows();
      }
    } catch (error) {
      console.error('Error updating servers:', error);
    }
  };

  const handleUpdateServersBuilt = async (workflowId: string, serversBuilt: number) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/migration-lifecycle/workflows/${workflowId}/servers-built`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serversBuilt }),
      });

      if (response.ok) {
        alert('✅ Servers built count updated!');
        loadWorkflows();
      }
    } catch (error) {
      console.error('Error updating servers built:', error);
    }
  };

  const handleQAStatus = async (workflowId: string, qaStatus: 'passed' | 'failed') => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/migration-lifecycle/workflows/${workflowId}/qa`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ qaStatus }),
      });

      if (response.ok) {
        alert(`✅ QA status updated to ${qaStatus}!`);
        loadWorkflows();
      }
    } catch (error) {
      console.error('Error updating QA status:', error);
    }
  };

  const getStepStatus = (step: WorkflowStep) => {
    if (step.status === 'approved') return 'approved';
    if (step.status === 'denied') return 'denied';
    return 'pending';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'denied':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const workflowSteps = [
    { step: 1, name: 'Migration Manager Approval', role: 'Migration Manager', icon: UserCheck },
    { step: 2, name: 'Account Manager Approval', role: 'Account Manager', icon: Building },
    { step: 3, name: 'Customer OK', role: 'Customer', icon: Users },
    { step: 4, name: 'Migration Manager - No. of Servers', role: 'Migration Manager', icon: Server },
    { step: 5, name: 'Infrateam - Servers Built', role: 'Infrateam', icon: Server },
    { step: 6, name: 'QA', role: 'QA', icon: FileCheck },
    { step: 7, name: 'Migration Manager - Final', role: 'Migration Manager', icon: UserCheck },
    { step: 8, name: 'End (Infra)', role: 'Completed', icon: CheckCircle },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation currentTab={getCurrentTab()} />
      
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200 ml-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Migration Lifecycle Management</h1>
              <p className="text-xl text-gray-600 mt-2">Manage migration approval workflow and infrastructure lifecycle</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md font-semibold"
            >
              <Play className="w-5 h-5" />
              Start New Workflow
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 ml-64">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-md">
            <Server className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Migration Workflows</h3>
            <p className="text-gray-600 mb-4">Start a new migration lifecycle workflow to begin tracking.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Create Workflow
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {workflows.map((workflow) => {
              const completedSteps = workflow.steps?.filter(s => s.status === 'approved').length || 0;
              const totalSteps = workflow.steps?.length || 8;
              const progressPercentage = (completedSteps / totalSteps) * 100;
              const currentStepInfo = workflowSteps.find(s => s.step === workflow.currentStep);
              
              return (
                <div key={workflow.id} className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 px-6 py-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-white mb-1">{workflow.dealName || workflow.clientName}</h3>
                        <p className="text-indigo-100 text-sm">
                          {workflow.companyName} • {workflow.clientName}
                        </p>
                        {workflow.dealId && (
                          <p className="text-indigo-200 text-xs mt-1">Deal ID: {workflow.dealId}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        {currentStepInfo && workflow.currentStep <= 8 && (
                          <button
                            onClick={() => handleApproveStep(workflow.id, workflow.currentStep)}
                            className="px-5 py-2.5 bg-white text-purple-600 rounded-lg hover:bg-purple-50 transition-all font-bold text-sm shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                          >
                            {currentStepInfo.name.toUpperCase()}
                          </button>
                        )}
                        <span className={`px-4 py-2 rounded-lg text-xs font-bold ${getStatusColor(workflow.status)}`}>
                          {workflow.status.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-indigo-100 mb-2">
                        <span>Progress: {completedSteps} of {totalSteps} steps completed</span>
                        <span>{Math.round(progressPercentage)}%</span>
                      </div>
                      <div className="w-full bg-indigo-400/30 rounded-full h-2.5">
                        <div 
                          className="bg-white h-2.5 rounded-full transition-all duration-500"
                          style={{ width: `${progressPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Workflow Steps */}
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {workflowSteps.map((stepInfo, index) => {
                        const step = workflow.steps?.find(s => s.step === stepInfo.step);
                        const StepIcon = stepInfo.icon;
                        const isActive = workflow.currentStep === stepInfo.step;
                        const isCompleted = step?.status === 'approved' || (workflow.currentStep > stepInfo.step);
                        const isPending = !isActive && !isCompleted;
                        
                        return (
                          <div
                            key={stepInfo.step}
                            className={`relative flex flex-col items-start p-5 rounded-xl border-2 transition-all h-full ${
                              isActive
                                ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-indigo-50 shadow-lg'
                                : isCompleted
                                ? 'border-green-300 bg-green-50/50'
                                : 'border-gray-200 bg-gray-50/50'
                            }`}
                          >
                            {/* Step Header */}
                            <div className="flex items-start gap-3 w-full mb-3">
                              {/* Step Number Badge */}
                              <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${
                                isCompleted
                                  ? 'bg-gradient-to-br from-green-500 to-green-600'
                                  : isActive
                                  ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
                                  : 'bg-gray-300'
                              }`}>
                                {isCompleted ? (
                                  <CheckCircle className="w-6 h-6 text-white" />
                                ) : (
                                  <StepIcon className={`w-6 h-6 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                                )}
                              </div>
                              
                              {/* Step Title and Role */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <h4 className={`font-bold text-sm ${
                                    isActive ? 'text-purple-900' : isCompleted ? 'text-green-900' : 'text-gray-700'
                                  }`}>
                                    {stepInfo.name}
                                  </h4>
                                  {isActive && (
                                    <span className="px-2 py-0.5 bg-purple-200 text-purple-800 rounded-md text-xs font-semibold animate-pulse">
                                      ACTIVE
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600">{stepInfo.role}</p>
                              </div>
                            </div>
                            
                            {/* Step Content */}
                            <div className="w-full space-y-3">
                              {/* Step-specific inputs */}
                              {stepInfo.step === 4 && isActive && (
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-gray-700 block">Number of Servers:</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="number"
                                      min="1"
                                      placeholder="Enter number"
                                      value={workflow.numberOfServers || ''}
                                      onChange={(e) => {
                                        const value = parseInt(e.target.value);
                                        if (!isNaN(value) && value > 0) {
                                          handleUpdateServers(workflow.id, value);
                                        }
                                      }}
                                      className="flex-1 px-3 py-2 border-2 border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    />
                                    {workflow.numberOfServers && workflow.numberOfServers > 0 && (
                                      <button
                                        onClick={() => handleApproveStep(workflow.id, 4)}
                                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all text-sm font-bold shadow-md hover:shadow-lg"
                                      >
                                        Approve
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                              {stepInfo.step === 5 && isActive && (
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-gray-700 block">Servers Built:</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="number"
                                      min="1"
                                      placeholder="Enter number"
                                      value={workflow.serversBuilt || ''}
                                      onChange={(e) => {
                                        const value = parseInt(e.target.value);
                                        if (!isNaN(value) && value > 0) {
                                          handleUpdateServersBuilt(workflow.id, value);
                                        }
                                      }}
                                      className="flex-1 px-3 py-2 border-2 border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    />
                                    {workflow.serversBuilt && workflow.serversBuilt > 0 && (
                                      <button
                                        onClick={() => handleApproveStep(workflow.id, 5)}
                                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all text-sm font-bold shadow-md hover:shadow-lg"
                                      >
                                        Approve
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Status and Timestamp */}
                              {step?.status === 'approved' && (
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                  <span className="text-xs font-semibold text-green-800">Approved</span>
                                </div>
                              )}
                              {step?.status === 'denied' && (
                                <div className="flex items-center gap-2">
                                  <X className="w-4 h-4 text-red-600" />
                                  <span className="text-xs font-semibold text-red-800">Denied</span>
                                </div>
                              )}
                              {step?.timestamp && (
                                <p className="text-xs text-gray-500">
                                  ✓ {new Date(step.timestamp).toLocaleString()}
                                </p>
                              )}
                              {step?.comments && (
                                <p className="text-xs text-gray-600 italic">💬 {step.comments}</p>
                              )}
                              
                              {/* Action Buttons */}
                              <div className="pt-2">
                                {isActive && step?.status === 'pending' && stepInfo.step !== 4 && stepInfo.step !== 5 && stepInfo.step !== 6 && (
                                  <button
                                    onClick={() => handleApproveStep(workflow.id, stepInfo.step)}
                                    className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all text-sm font-bold shadow-md hover:shadow-lg"
                                  >
                                    Approve
                                  </button>
                                )}
                                {stepInfo.step === 6 && isActive && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleQAStatus(workflow.id, 'passed')}
                                      className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all text-sm font-bold shadow-md hover:shadow-lg"
                                    >
                                      ✓ Pass
                                    </button>
                                    <button
                                      onClick={() => handleQAStatus(workflow.id, 'failed')}
                                      className="flex-1 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all text-sm font-bold shadow-md hover:shadow-lg"
                                    >
                                      ✗ Fail
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Workflow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">Start Migration Lifecycle Workflow</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Deal ID</label>
                <input
                  type="text"
                  value={formData.dealId}
                  onChange={(e) => setFormData({ ...formData, dealId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., TEST-12345"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Deal Name</label>
                <input
                  type="text"
                  value={formData.dealName}
                  onChange={(e) => setFormData({ ...formData, dealName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., Cloud Migration Project"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Client Name *</label>
                <input
                  type="text"
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company Name *</label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Customer Email *</label>
                <input
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> All approval emails (Migration Manager, Account Manager) will be sent to: <strong>anushreddydasari@gmail.com</strong>
                </p>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkflow}
                disabled={!formData.clientName || !formData.companyName || !formData.customerEmail}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MigrationLifecycle;
