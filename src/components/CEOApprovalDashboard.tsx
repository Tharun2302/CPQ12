import React, { useState, useEffect } from 'react';
import { Clock, BarChart3, X, MessageCircle, CheckCircle, AlertCircle, ThumbsUp, ThumbsDown, Crown, Eye, FileText } from 'lucide-react';
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
  const [modalOpenedFromTab, setModalOpenedFromTab] = useState<string>('queue');
  const [hasTakenAction, setHasTakenAction] = useState(false);
  const [denyAfterComment, setDenyAfterComment] = useState(false);
  const { workflows, updateWorkflowStep } = useApprovalWorkflows();
  
  console.log('CEOApprovalDashboard rendered for:', ceoEmail);
  console.log('📊 Available workflows:', workflows.length);
  console.log('📋 Workflows data:', workflows);

  // Auto-open document preview when coming from Gmail link
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const workflowId = urlParams.get('workflow');
    
    if (workflowId) {
      // First try to find in loaded workflows
      const foundWorkflow = workflows.find(w => w.id === workflowId);
      if (foundWorkflow) {
        console.log('🔗 Opening document preview from Gmail link for workflow:', workflowId);
        handleViewDocument(foundWorkflow);
      } else if (workflows.length > 0) {
        // If workflows are loaded but this one not found, it doesn't exist
        console.error('❌ Workflow not found in loaded workflows:', workflowId);
      } else {
        // If workflows not loaded yet, fetch this specific workflow directly
        console.log('🔄 Workflows not loaded yet, fetching specific workflow:', workflowId);
        fetchSpecificWorkflow(workflowId);
      }
    }
  }, [workflows]);

  const fetchSpecificWorkflow = async (workflowId: string) => {
    try {
      console.log('📄 Fetching specific workflow from API:', workflowId);
      const response = await fetch(`http://localhost:3001/api/approval-workflows/${workflowId}`);
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.workflow) {
          console.log('📋 CEO viewing workflow from API:', result.workflow);
          // Auto-open document preview when coming from Gmail link
          console.log('🔗 Auto-opening document preview from Gmail link for workflow:', workflowId);
          handleViewDocument(result.workflow);
        } else {
          console.error('❌ Workflow not found in API response:', workflowId);
        }
      } else {
        console.error('❌ Failed to fetch workflow from API:', response.status);
      }
    } catch (error) {
      console.error('❌ Error fetching specific workflow:', error);
    }
  };

  const tabs = [
    { id: 'queue', label: 'My Approval Queue', icon: Crown, count: workflows.filter(w => (w.status === 'pending' || w.status === 'in_progress') && w.currentStep === 2).length },
    { id: 'status', label: 'Workflow Status', icon: BarChart3, count: workflows.length }
  ];


  const handleViewWorkflow = async (workflow: any) => {
    console.log('Viewing workflow:', workflow.id);
    setSelectedWorkflow(workflow);
    setModalOpenedFromTab('status'); // Track that modal was opened from status tab
    setShowDocumentModal(true);
    
    // Fetch document preview (same as handleViewDocument)
    if (workflow.documentId) {
      setIsLoadingPreview(true);
      setDocumentPreview(null);
      
      try {
        console.log('🔄 Fetching document preview for:', workflow.documentId);
        const response = await fetch(`http://localhost:3001/api/documents/${workflow.documentId}/preview`);
        
        console.log('📡 Response status:', response.status);
        console.log('📡 Response ok:', response.ok);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📄 API Response:', result);
        
        if (result.success && result.dataUrl) {
          setDocumentPreview(result.dataUrl);
          console.log('✅ Document preview loaded successfully:', result.fileName);
          console.log('📄 Data URL length:', result.dataUrl.length);
        } else {
          console.log('⚠️ Document not found or no file data');
          console.log('📄 Result:', result);
          
          // Fallback: Try to load document directly
          console.log('🔄 Trying fallback method...');
          try {
            const directResponse = await fetch(`http://localhost:3001/api/documents/${workflow.documentId}`);
            if (directResponse.ok) {
              const blob = await directResponse.blob();
              const url = URL.createObjectURL(blob);
              setDocumentPreview(url);
              console.log('✅ Document loaded via fallback method');
            }
          } catch (fallbackError) {
            console.error('❌ Fallback method also failed:', fallbackError);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching document preview:', error);
        console.error('❌ Error details:', (error as Error).message);
      } finally {
        setIsLoadingPreview(false);
      }
    } else {
      console.log('⚠️ No documentId in workflow');
    }
  };

  const handleApprove = async (workflowId: string) => {
    console.log('Legal Team Approving workflow:', workflowId);
    try {
      setHasTakenAction(true);
      // Update workflow step
      await updateWorkflowStep(workflowId, 2, { status: 'approved' });
      // Optimistically reflect status in modal
      setSelectedWorkflow((prev: any) => prev ? {
        ...prev,
        status: 'in_progress',
        currentStep: 3,
        workflowSteps: prev.workflowSteps?.map((s: any) => s.step === 2 && s.role === 'Legal Team' ? { ...s, status: 'approved', timestamp: new Date().toISOString() } : s)
      } : prev);
      
      // Get workflow data to send Client email
      const workflow = workflows.find(w => w.id === workflowId);
      if (workflow) {
        // Send email to Client
        console.log('📧 Sending email to Client after Legal Team approval...');
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
      
      // Close modal - state is already updated by updateWorkflowStep
      closeDocumentModal();
    } catch (error) {
      console.error('Error approving workflow:', error);
      alert('❌ Failed to approve workflow. Please try again.');
    }
  };

  const handleDeny = async (workflowId: string) => {
    console.log('Legal Team Denying workflow:', workflowId);
    
    // Check if comment is provided
    if (!commentText.trim()) {
      alert('⚠️ Please provide a reason for denial before proceeding.');
      setCommentWorkflowId(workflowId);
      setShowCommentModal(true);
      return;
    }
    
    try {
      setHasTakenAction(true);
      await updateWorkflowStep(workflowId, 2, { 
        status: 'denied',
        comments: commentText.trim()
      });
      // Optimistically reflect status locally so buttons hide immediately
      setSelectedWorkflow((prev: any) => prev ? {
        ...prev,
        status: 'denied',
        workflowSteps: prev.workflowSteps?.map((s: any) => s.step === 2 && s.role === 'Legal Team' ? { ...s, status: 'denied', comments: commentText.trim(), timestamp: new Date().toISOString() } : s)
      } : prev);
      alert('❌ Workflow denied successfully!');
      
      // Reset comment and close modals - state is already updated by updateWorkflowStep
      setCommentText('');
      setCommentWorkflowId(null);
      setShowCommentModal(false);
      closeDocumentModal();
    } catch (error) {
      console.error('Error denying workflow:', error);
      alert('❌ Failed to deny workflow. Please try again.');
    }
  };

  const handleAddComment = (workflowId: string) => {
    console.log('Legal Team Adding comment to workflow:', workflowId);
    setCommentWorkflowId(workflowId);
    setCommentText('');
    setShowCommentModal(true);
    setDenyAfterComment(false);
  };

  const handleSaveComment = async () => {
    if (!commentWorkflowId || !commentText.trim()) {
      alert('Please enter a comment');
      return;
    }

    try {
      if (denyAfterComment) {
        const id = commentWorkflowId;
        setShowCommentModal(false);
        await handleDeny(id);
        setDenyAfterComment(false);
        return;
      }

      console.log('💬 Legal Team Saving comment for workflow:', commentWorkflowId);
      updateWorkflowStep(commentWorkflowId, 2, { 
        comments: commentText.trim(),
        timestamp: new Date().toISOString()
      });
      // Optimistically reflect the new comment locally without changing status
      setSelectedWorkflow((prev: any) => prev && prev.id === commentWorkflowId ? {
        ...prev,
        workflowSteps: prev.workflowSteps?.map((s: any) =>
          s.step === 2 && s.role === 'Legal Team'
            ? { ...s, comments: commentText.trim(), timestamp: new Date().toISOString() }
            : s
        )
      } : prev);
      
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
    setDenyAfterComment(false);
  };

  const handleViewDocument = async (workflow: any) => {
    console.log('👁️ Legal Team Viewing document for workflow:', workflow);
    setSelectedWorkflow(workflow);
    setModalOpenedFromTab('queue'); // Track that modal was opened from queue tab
    setShowDocumentModal(true);
    
    // Fetch document preview
    if (workflow.documentId) {
      setIsLoadingPreview(true);
      setDocumentPreview(null);
      
      try {
        console.log('🔄 Fetching document preview for:', workflow.documentId);
        const response = await fetch(`http://localhost:3001/api/documents/${workflow.documentId}/preview`);
        
        console.log('📡 Response status:', response.status);
        console.log('📡 Response ok:', response.ok);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📄 API Response:', result);
        
        if (result.success && result.dataUrl) {
          setDocumentPreview(result.dataUrl);
          console.log('✅ Document preview loaded successfully:', result.fileName);
          console.log('📄 Data URL length:', result.dataUrl.length);
        } else {
          console.log('⚠️ Document not found or no file data');
          console.log('📄 Result:', result);
          
          // Fallback: Try to load document directly
          console.log('🔄 Trying fallback method...');
          try {
            const directResponse = await fetch(`http://localhost:3001/api/documents/${workflow.documentId}`);
            if (directResponse.ok) {
              const blob = await directResponse.blob();
              const url = URL.createObjectURL(blob);
              setDocumentPreview(url);
              console.log('✅ Document loaded via fallback method');
            }
          } catch (fallbackError) {
            console.error('❌ Fallback method also failed:', fallbackError);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching document preview:', error);
        console.error('❌ Error details:', (error as Error).message);
      } finally {
        setIsLoadingPreview(false);
      }
    } else {
      console.log('⚠️ No documentId in workflow');
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

    // Filter workflows for Legal Team-specific view
    const filteredWorkflows = workflows.filter(workflow => {
      switch (activeTab) {
        case 'queue': return (workflow.status === 'pending' || workflow.status === 'in_progress') && workflow.currentStep === 2;
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
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Legal Team Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Legal Team Comments</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Client Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Client Comments</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Deal Desk Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Created</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((workflow) => {
                const createdDate = workflow.createdAt ? new Date(workflow.createdAt) : new Date();
                const technicalTeamStep = workflow.workflowSteps?.find(step => step.role === 'Technical Team');
                const legalTeamStep = workflow.workflowSteps?.find(step => step.role === 'Legal Team');
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
                        legalTeamStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        legalTeamStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {legalTeamStep?.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-gray-600 text-sm">
                      {legalTeamStep?.comments || 'No comments'}
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
                    <td className="py-4 px-4">
                      <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Notified
                      </span>
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
                  <p className="text-sm text-gray-500">Step {workflow.currentStep} of 3</p>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                  <span>Progress</span>
                  <span>{Math.round((workflow.currentStep / 3) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(workflow.currentStep / 3) * 100}%` }}
                  ></div>
                </div>
              </div>

               <div className="space-y-2 mb-4">
                 {/* Only show the current step for Legal Team in My Approval Queue */}
                 {workflow.workflowSteps
                   .filter((step: any) => step.step === 2 && step.role === 'Legal Team')
                   .map((step: any) => {
                     const StepIcon = getStatusIcon(step.status);
                     const isMyStep = step.step === 2 && step.role === 'Legal Team' && isMyTurn;
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

              {/* Action Buttons for Legal Team - Only View Document */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleViewDocument(workflow)}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  View Document
                </button>
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
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <Crown className="w-6 h-6 text-purple-600" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900">Legal Team Approval Portal</h1>
            </div>
            <p className="text-xl text-gray-600">Legal review and approval of document workflows</p>
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
            
            <div className="p-6 overflow-y-auto max-h-[calc(95vh-200px)]">
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
                        className="w-full h-[70vh] border-0"
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

            {/* Action Buttons - Only show when opened from "My Approval Queue" tab */}
            <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 bg-gray-50">
               {modalOpenedFromTab === 'queue' ? (
                 (() => {
                 // Use latest workflow state from store to avoid stale selectedWorkflow after actions
                 const latestWorkflow = workflows.find(w => w.id === selectedWorkflow?.id) || selectedWorkflow;
                 // Check if it's still the user's turn (Legal Team, Step 2, pending status)
                 const legalStep = latestWorkflow?.workflowSteps?.find((step: any) => step.step === 2 && step.role === 'Legal Team');
                 const isMyTurn = !hasTakenAction && latestWorkflow?.currentStep === 2 && legalStep?.status === 'pending' && latestWorkflow?.status !== 'denied';
                   
                   return isMyTurn ? (
                     <div className="flex gap-3">
                       <button
                         onClick={() => handleApprove(selectedWorkflow.id)}
                         className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                       >
                         <ThumbsUp className="w-4 h-4" />
                         Approve
                       </button>
                       <button
                         onClick={() => {
                           if (!commentText.trim()) {
                             alert('⚠️ Please provide a reason for denial before proceeding.');
                             setCommentWorkflowId(selectedWorkflow.id);
                             setShowCommentModal(true);
                            setDenyAfterComment(true);
                           } else {
                             handleDeny(selectedWorkflow.id);
                           }
                         }}
                         className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                       >
                         <ThumbsDown className="w-4 h-4" />
                         Deny
                       </button>
                       <button
                         onClick={() => handleAddComment(selectedWorkflow.id)}
                         className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                       >
                         <MessageCircle className="w-4 h-4" />
                         Add Comment
                       </button>
                     </div>
                   ) : (
                     <div className="text-sm text-gray-500">
                       This workflow is no longer awaiting your approval
                     </div>
                   );
                 })()
               ) : (
                 <div className="text-sm text-gray-500">
                   Read-only view from Workflow Status
                 </div>
               )}
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
                  <h2 className="text-xl font-semibold text-gray-900">{denyAfterComment ? 'Provide Reason for Denial' : 'Add Comment'}</h2>
                  <p className="text-sm text-gray-500">{denyAfterComment ? 'This reason will be saved and the request will be denied.' : 'Add your feedback for this workflow'}</p>
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
                {denyAfterComment ? 'Save & Deny' : 'Save Comment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CEOApprovalDashboard;
