import React, { useState } from 'react';
import { RefreshCw, Clock, BarChart3, X, FileCheck, MessageCircle, CheckCircle, AlertCircle, ThumbsUp, ThumbsDown, Crown, Eye, FileText } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';

interface CEOApprovalDashboardProps {
  ceoEmail?: string;
}

const CEOApprovalDashboard: React.FC<CEOApprovalDashboardProps> = ({ 
  ceoEmail = 'ceo@company.com'
}) => {
  const [activeTab, setActiveTab] = useState('queue');
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentWorkflowId, setCommentWorkflowId] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const { workflows, isLoading, updateWorkflowStep } = useApprovalWorkflows();
  
  console.log('CEOApprovalDashboard rendered for:', ceoEmail);
  console.log('📊 Available workflows:', workflows.length);
  console.log('📋 Workflows data:', workflows);

  const tabs = [
    { id: 'queue', label: 'My Approval Queue', icon: Crown, count: workflows.filter(w => (w.status === 'pending' || w.status === 'in_progress') && w.currentStep === 2).length },
    { id: 'pending', label: 'Pending Approvals', icon: Clock, count: workflows.filter(w => w.status === 'pending' || w.status === 'in_progress').length },
    { id: 'status', label: 'Workflow Status', icon: BarChart3, count: workflows.length },
    { id: 'history', label: 'My Approval History', icon: FileCheck, count: workflows.filter(w => w.status === 'approved' || w.status === 'denied').length },
    { id: 'comments', label: 'My Comments', icon: MessageCircle, count: workflows.filter(w => {
      const ceoStep = w.workflowSteps?.find(step => step.role === 'CEO');
      return ceoStep?.comments && ceoStep.comments.trim() !== '';
    }).length }
  ];

  const handleRefresh = () => {
    console.log('Refresh clicked');
  };

  const handleApprove = async (workflowId: string) => {
    console.log('CEO Approving workflow:', workflowId);
    try {
      // Update workflow step
      updateWorkflowStep(workflowId, 2, { status: 'approved' });
      
      // Get workflow data to send Client email
      const workflow = workflows.find(w => w.id === workflowId);
      if (workflow) {
        // Send email to Client
        console.log('📧 Sending email to Client after CEO approval...');
        const response = await fetch('http://localhost:3001/api/send-client-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientEmail: workflow.workflowSteps?.find(step => step.role === 'Client')?.email || 'client@company.com',
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
          alert('✅ Workflow approved successfully!\n📧 Client has been notified for final approval.');
        } else {
          alert('✅ Workflow approved but Client email failed.\nPlease notify Client manually.');
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
    console.log('CEO Denying workflow:', workflowId);
    updateWorkflowStep(workflowId, 2, { status: 'denied' });
  };

  const handleAddComment = (workflowId: string) => {
    console.log('CEO Adding comment to workflow:', workflowId);
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
      console.log('💬 CEO Saving comment for workflow:', commentWorkflowId);
      updateWorkflowStep(commentWorkflowId, 2, { 
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
    console.log('👁️ CEO Viewing document for workflow:', workflow);
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
      case 'in_progress': return RefreshCw;
      default: return AlertCircle;
    }
  };

  const renderTabContent = () => {
    // Handle special tabs that don't filter workflows
    if (activeTab === 'comments') {
      const ceoComments = workflows.filter(workflow => {
        const ceoStep = workflow.workflowSteps?.find(step => step.role === 'CEO');
        return ceoStep?.comments && ceoStep.comments.trim() !== '';
      });

      if (ceoComments.length === 0) {
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

      return (
        <div className="space-y-4">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-purple-800">My Comments ({ceoComments.length})</h3>
            </div>
            <p className="text-purple-600 text-sm mt-1">Comments you've added to approval workflows</p>
          </div>
          
          {ceoComments.map((workflow) => {
            const ceoStep = workflow.workflowSteps?.find(step => step.role === 'CEO');
            return (
              <div key={workflow.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{workflow.documentId}</h4>
                    <p className="text-sm text-gray-500">{workflow.clientName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">${workflow.amount.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">
                      {ceoStep?.timestamp ? new Date(ceoStep.timestamp).toLocaleDateString() : 'Unknown date'}
                    </p>
                  </div>
                </div>
                
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageCircle className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium text-purple-800">Your Comment:</span>
                  </div>
                  <p className="text-gray-700 text-sm italic">"{ceoStep?.comments}"</p>
                </div>
                
                <div className="mt-3 flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    workflow.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    workflow.status === 'approved' ? 'bg-green-100 text-green-800' :
                    workflow.status === 'denied' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {workflow.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    Step {workflow.currentStep} of {workflow.totalSteps}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Filter workflows for CEO-specific view
    const filteredWorkflows = workflows.filter(workflow => {
      switch (activeTab) {
        case 'queue': return (workflow.status === 'pending' || workflow.status === 'in_progress') && workflow.currentStep === 2;
        case 'pending': return workflow.status === 'pending' || workflow.status === 'in_progress';
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
           const isMyTurn = (workflow.status === 'pending' || workflow.status === 'in_progress') && workflow.currentStep === 2;
          
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
                   const isMyStep = step.step === 2 && step.role === 'CEO' && isMyTurn;
                   return (
                     <div key={step.step} className={`flex items-center gap-3 text-sm p-2 rounded ${isMyStep ? 'bg-purple-50 border border-purple-200' : ''}`}>
                       <div className={`p-1 rounded ${getStatusColor(step.status)}`}>
                         <StepIcon className="w-4 h-4" />
                       </div>
                       <span className="font-medium">{step.role}</span>
                       <span className="text-gray-500">{step.email}</span>
                       {isMyStep && <span className="text-purple-600 font-semibold text-xs">(Your Turn)</span>}
                       {step.timestamp && (
                         <span className="text-gray-400 ml-auto">
                           {new Date(step.timestamp).toLocaleDateString()}
                         </span>
                       )}
                     </div>
                   );
                 })}
               </div>

              {/* Action Buttons for CEO */}
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
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
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
          <div className="flex items-center justify-end mb-6">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 text-white"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh Dashboard
            </button>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <Crown className="w-6 h-6 text-purple-600" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900">CEO Approval Portal</h1>
            </div>
            <p className="text-xl text-gray-600">Executive review and approval of document workflows</p>
            <p className="text-sm text-gray-500 mt-1">Logged in as: {ceoEmail}</p>
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
                      ? 'bg-purple-600 text-white shadow-md'
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
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                {React.createElement(tabs.find(t => t.id === activeTab)?.icon || Clock, { className: "w-4 h-4 text-purple-600" })}
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                {tabs.find(t => t.id === activeTab)?.label}
              </h2>
            </div>
            <div className="mt-3 px-4 py-2 bg-purple-50 text-purple-700 rounded-lg text-sm font-medium border border-purple-200">
              CEO Executive Approval Actions
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
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-purple-600" />
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
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
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
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

export default CEOApprovalDashboard;
