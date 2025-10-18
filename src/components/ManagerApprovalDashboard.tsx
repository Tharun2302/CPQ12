import React, { useState } from 'react';
import { Clock, User, BarChart3, X, MessageCircle, CheckCircle, AlertCircle, ThumbsUp, ThumbsDown, Eye, FileText } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';

interface ManagerApprovalDashboardProps {
  managerEmail?: string;
}

const ManagerApprovalDashboard: React.FC<ManagerApprovalDashboardProps> = ({ 
  managerEmail = 'manager@company.com'
}) => {
  const [activeTab, setActiveTab] = useState('queue');
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentWorkflowId, setCommentWorkflowId] = useState<string | null>(null);
  const { workflows, updateWorkflowStep } = useApprovalWorkflows();
  
  console.log('ManagerApprovalDashboard rendered for:', managerEmail);
  console.log('📊 Available workflows:', workflows.length);
  console.log('📋 Workflows data:', workflows);

  const tabs = [
    { id: 'queue', label: 'My Approval Queue', icon: User, count: workflows.filter(w => w.status === 'pending' && w.currentStep === 1).length },
    { id: 'status', label: 'Workflow Status', icon: BarChart3, count: workflows.length }
  ];


  const handleViewWorkflow = async (workflow: any) => {
    console.log('Viewing workflow:', workflow.id);
    setSelectedWorkflow(workflow);
    setShowDocumentModal(true);
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
        console.log('📧 Sending email to CEO after Technical Team approval...');
        const response = await fetch('http://localhost:3001/api/send-ceo-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ceoEmail: workflow.workflowSteps?.find(step => step.role === 'Legal Team')?.email || 'ceo@company.com',
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
    setCommentWorkflowId(workflowId);
    setCommentText('');
    setShowCommentModal(true);
  };

  const handleSaveComment = async () => {
    if (!commentWorkflowId || !commentText.trim()) {
      alert('Please enter a comment');
      return;
    }

    try {
      console.log('💬 Saving comment for workflow:', commentWorkflowId);
      updateWorkflowStep(commentWorkflowId, 1, { 
        comments: commentText.trim(),
        timestamp: new Date().toISOString()
      });
      
      alert('✅ Comment added successfully!');
      setShowCommentModal(false);
      setCommentText('');
      setCommentWorkflowId(null);
    } catch (error) {
      console.error('❌ Error adding comment:', error);
      alert('❌ Failed to add comment. Please try again.');
    }
  };

  const handleCancelComment = () => {
    setShowCommentModal(false);
    setCommentText('');
    setCommentWorkflowId(null);
  };

  const handleViewDocument = async (workflow: any) => {
    console.log('👁️ Viewing document for workflow:', workflow);
    setSelectedWorkflow(workflow);
    setShowDocumentModal(true);
    
    // Fetch document preview
    if (workflow.documentId) {
      setIsLoadingPreview(true);
      setDocumentPreview(null);
      
      try {
        const response = await fetch(`http://localhost:3001/api/documents/${workflow.documentId}/preview`);
        const result = await response.json();
        
        if (result.success && result.dataUrl) {
          setDocumentPreview(result.dataUrl);
          console.log('✅ Document preview loaded:', result.fileName);
        } else {
          console.log('⚠️ Document not found or no file data');
        }
      } catch (error) {
        console.error('❌ Error fetching document preview:', error);
      } finally {
        setIsLoadingPreview(false);
      }
    }
  };

  const closeDocumentModal = () => {
    setShowDocumentModal(false);
    setSelectedWorkflow(null);
    setDocumentPreview(null);
    setIsLoadingPreview(false);
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
      case 'in_progress': return Clock;
      default: return AlertCircle;
    }
  };

  const renderTabContent = () => {

    // Filter workflows for technical team-specific view
    const filteredWorkflows = workflows.filter(workflow => {
      switch (activeTab) {
        case 'queue': return workflow.status === 'pending' && workflow.currentStep === 1;
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
            {activeTab === 'status' && 'No workflows found.'}
          </p>
        </div>
      );
    }

    // Special handling for Workflow Status tab - show table format
    if (activeTab === 'status') {
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Document</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Client</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Technical Team Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Technical Team Comments</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">CEO Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">CEO Comments</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Client Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Client Comments</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Created</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((workflow) => {
                const createdDate = workflow.createdAt ? new Date(workflow.createdAt) : new Date();
                const technicalTeamStep = workflow.workflowSteps?.find(step => step.role === 'Technical Team');
                const ceoStep = workflow.workflowSteps?.find(step => step.role === 'Legal Team');
                const clientStep = workflow.workflowSteps?.find(step => step.role === 'Client');

      return (
                  <tr key={workflow.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4 text-gray-900 font-medium">
                      {workflow.documentId || 'Unknown Document'}
                    </td>
                    <td className="py-4 px-4 text-gray-700">
                      {workflow.clientName || 'Unknown Client'}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        technicalTeamStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        technicalTeamStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {technicalTeamStep?.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-gray-600 text-sm">
                      {technicalTeamStep?.comments || 'No comments'}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        ceoStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        ceoStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {ceoStep?.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-gray-600 text-sm">
                      {ceoStep?.comments || 'No comments'}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        clientStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        clientStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {clientStep?.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-gray-600 text-sm">
                      {clientStep?.comments || 'No comments'}
                    </td>
                    <td className="py-4 px-4 text-gray-600 text-sm">
                <div>
                        <div>{createdDate.toLocaleDateString('en-GB')}</div>
                        <div className="text-xs text-gray-500">{createdDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                </div>
                    </td>
                    <td className="py-4 px-4">
                      <button
                        onClick={() => handleViewWorkflow(workflow)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                {/* Only show the current step for Technical Team in My Approval Queue */}
                {workflow.workflowSteps
                  .filter((step: any) => step.step === 1 && step.role === 'Technical Team')
                  .map((step: any) => {
                    const StepIcon = getStatusIcon(step.status);
                    const isMyStep = step.step === 1 && step.role === 'Technical Team';
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

              {/* Action Buttons for Technical Team */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleViewDocument(workflow)}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  View Document
                </button>
                {isMyTurn && (
                  <>
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
                  </>
                )}
              </div>
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
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900">Technical Team Approval Portal</h1>
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
          </div>
          
          <div className="p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>

      {/* Document Preview Modal */}
      {showDocumentModal && selectedWorkflow && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Document Preview</h2>
                  <p className="text-sm text-gray-500">ID: {selectedWorkflow.documentId}</p>
                </div>
              </div>
              <button
                onClick={closeDocumentModal}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(95vh-120px)]">
              <div className="bg-gray-100 rounded-lg p-4">
                {isLoadingPreview ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 text-sm">Loading document preview...</p>
                  </div>
                ) : documentPreview ? (
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                      <iframe
                        src={documentPreview}
                        className="w-full h-[85vh] border-0"
                        title="Document Preview"
                      />
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = documentPreview;
                          link.download = `${selectedWorkflow.documentId || 'document'}.pdf`;
                          link.click();
                        }}
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm"
                      >
                        Download PDF
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-32 h-40 bg-white rounded-lg shadow-sm mx-auto mb-4 flex items-center justify-center">
                      <FileText className="w-16 h-16 text-gray-400" />
                    </div>
                    <p className="text-gray-600 text-sm mb-4">
                      Document preview not available
                    </p>
                    <button
                      onClick={() => {
                        if (selectedWorkflow.documentId) {
                          handleViewDocument(selectedWorkflow);
                        }
                      }}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm"
                    >
                      Retry Loading
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={closeDocumentModal}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {showCommentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Add Comment</h2>
                  <p className="text-sm text-gray-500">Add your feedback for this workflow</p>
                </div>
              </div>
              <button
                onClick={handleCancelComment}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Comment
                  </label>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Enter your comment here..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={4}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleCancelComment}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveComment}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Save Comment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerApprovalDashboard;
