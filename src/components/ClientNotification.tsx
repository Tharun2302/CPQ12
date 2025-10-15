import React, { useState, useEffect } from 'react';
import { CheckCircle, X, MessageCircle, FileText, DollarSign, Calendar, User } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';

interface ClientNotificationProps {
}

const ClientNotification: React.FC<ClientNotificationProps> = () => {
  const [workflow, setWorkflow] = useState<any>(null);
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { workflows, updateWorkflowStep } = useApprovalWorkflows();
  
  // Get workflow ID from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const workflowId = urlParams.get('workflow');
    
    if (workflowId) {
      const foundWorkflow = workflows.find(w => w.id === workflowId);
      if (foundWorkflow) {
        setWorkflow(foundWorkflow);
        console.log('📋 Client viewing workflow:', foundWorkflow);
      } else {
        console.error('❌ Workflow not found:', workflowId);
      }
    }
  }, [workflows]);

  const handleApprove = async () => {
    if (!workflow) return;
    
    setIsLoading(true);
    try {
      console.log('✅ Client approving workflow:', workflow.id);
      updateWorkflowStep(workflow.id, 3, { 
        status: 'approved',
        comments: comment || 'Approved by client'
      });
      
      alert('✅ Request approved successfully!\n\nYour approval has been recorded and the workflow is now complete.');
      
      // Reset form
      setComment('');
    } catch (error) {
      console.error('❌ Error approving workflow:', error);
      alert('❌ Failed to approve request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeny = async () => {
    if (!workflow) return;
    
    if (!comment.trim()) {
      alert('⚠️ Please provide a reason for denial before proceeding.');
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('❌ Client denying workflow:', workflow.id);
      updateWorkflowStep(workflow.id, 3, { 
        status: 'denied',
        comments: comment
      });
      
      alert('❌ Request denied.\n\nYour decision has been recorded and the workflow is now closed.');
      
      // Reset form
      setComment('');
    } catch (error) {
      console.error('❌ Error denying workflow:', error);
      alert('❌ Failed to deny request. Please try again.');
    } finally {
      setIsLoading(false);
    }
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
      case 'pending': return '⏳';
      case 'approved': return '✅';
      case 'denied': return '❌';
      case 'in_progress': return '🔄';
      default: return '❓';
    }
  };

  if (!workflow) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Workflow Not Found</h1>
          <p className="text-gray-600 mb-4">The requested workflow could not be found or has expired.</p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  const managerStep = workflow.workflowSteps?.find((step: any) => step.role === 'Manager');
  const ceoStep = workflow.workflowSteps?.find((step: any) => step.role === 'CEO');
  const clientStep = workflow.workflowSteps?.find((step: any) => step.role === 'Client');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-green-600" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900">Client Approval</h1>
            </div>
            <p className="text-xl text-gray-600">Review and approve your request</p>
            <p className="text-sm text-gray-500 mt-1">Client: {workflow.clientName}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          {/* Document Details */}
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Document Details</h2>
            </div>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Document ID</p>
                    <p className="font-semibold text-gray-900">{workflow.documentId}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Client Name</p>
                    <p className="font-semibold text-gray-900">{workflow.clientName}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Amount</p>
                    <p className="font-semibold text-gray-900">${(workflow.amount || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Created</p>
                    <p className="font-semibold text-gray-900">
                      {workflow.createdAt ? new Date(workflow.createdAt).toLocaleDateString() : 'Unknown'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center">
                    <span className="text-gray-400">📄</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Document Type</p>
                    <p className="font-semibold text-gray-900">{workflow.documentType || 'PDF'}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center">
                    <span className="text-gray-400">📊</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Progress</p>
                    <p className="font-semibold text-gray-900">
                      Step {workflow.currentStep || 3} of {workflow.totalSteps || 3}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Approval Status */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Approval Status</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getStatusIcon(managerStep?.status || 'pending')}</span>
                    <div>
                      <p className="font-semibold text-gray-900">Manager Approval</p>
                      <p className="text-sm text-gray-500">{managerStep?.email || 'manager@company.com'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(managerStep?.status || 'pending')}`}>
                      {managerStep?.status || 'pending'}
                    </span>
                    {managerStep?.comments && (
                      <p className="text-xs text-gray-500 mt-1">"{managerStep.comments}"</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getStatusIcon(ceoStep?.status || 'pending')}</span>
                    <div>
                      <p className="font-semibold text-gray-900">CEO Approval</p>
                      <p className="text-sm text-gray-500">{ceoStep?.email || 'ceo@company.com'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ceoStep?.status || 'pending')}`}>
                      {ceoStep?.status || 'pending'}
                    </span>
                    {ceoStep?.comments && (
                      <p className="text-xs text-gray-500 mt-1">"{ceoStep.comments}"</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">👤</span>
                    <div>
                      <p className="font-semibold text-gray-900">Your Approval</p>
                      <p className="text-sm text-gray-500">{clientStep?.email || 'client@company.com'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      {clientStep?.status || 'pending'}
                    </span>
                    <p className="text-xs text-green-600 mt-1 font-semibold">(Your Turn)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-8">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                <span>Overall Progress</span>
                <span>{Math.round(((workflow.currentStep || 3) / (workflow.totalSteps || 3)) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-green-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${((workflow.currentStep || 3) / (workflow.totalSteps || 3)) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Comment Section */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MessageCircle className="w-4 h-4 inline mr-1" />
                Comments (Optional for approval, Required for denial)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add your comments about this request..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                rows={4}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleApprove}
                disabled={isLoading}
                className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors font-semibold"
              >
                <CheckCircle className="w-5 h-5" />
                {isLoading ? 'Processing...' : 'Approve Request'}
              </button>
              
              <button
                onClick={handleDeny}
                disabled={isLoading}
                className="flex items-center gap-2 px-8 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors font-semibold"
              >
                <X className="w-5 h-5" />
                {isLoading ? 'Processing...' : 'Deny Request'}
              </button>
            </div>

            {/* Instructions */}
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">Instructions:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>Approve:</strong> Click "Approve Request" to accept this request</li>
                <li>• <strong>Deny:</strong> Click "Deny Request" to reject this request (comments required)</li>
                <li>• <strong>Comments:</strong> Add any feedback or notes about your decision</li>
                <li>• <strong>Final Decision:</strong> Once you approve or deny, the workflow will be completed</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientNotification;
