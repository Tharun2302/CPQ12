import React, { useEffect, useState } from 'react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import { BACKEND_URL } from '../config/api';
import { FileText, X, Loader2, ThumbsUp, ThumbsDown, MessageCircle, User, BarChart3, Clock, CheckCircle, AlertCircle, Eye } from 'lucide-react';
import { track } from '../analytics/clarity';

const TeamApprovalDashboard: React.FC = () => {
  const { workflows, updateWorkflowStep } = useApprovalWorkflows();
  const [activeTab, setActiveTab] = useState('queue');
  const [isActing, setIsActing] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentWorkflowId, setCommentWorkflowId] = useState<string | null>(null);
  const [denyAfterComment, setDenyAfterComment] = useState(false);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [hasTakenAction, setHasTakenAction] = useState<Set<string>>(new Set());
  const [modalOpenedFromTab, setModalOpenedFromTab] = useState<string>('queue');

  const tabs = [
    { id: 'queue', label: 'My Approval Queue', icon: User, count: workflows.filter(w => (w.status === 'pending' || w.status === 'in_progress') && w.currentStep === 1).length },
    { id: 'status', label: 'Workflow Status', icon: BarChart3, count: workflows.length }
  ];

  const handleApprove = async (workflowId: string) => {
    if (isActing) return;
    if (!workflowId) {
      console.error('❌ No workflowId provided to handleApprove');
      alert('❌ Error: No workflow ID provided. Please try again.');
      return;
    }
    console.log('✅ Approving workflow:', workflowId);
    setIsActing(true);
    try {
      // Mark this specific workflow as acted upon
      setHasTakenAction(prev => new Set(prev).add(workflowId));
      await updateWorkflowStep(workflowId, 1, { status: 'approved' });
      
      // Track approval action
      const wf = workflows.find(w => w.id === workflowId);
      track('approval.action', {
        action: 'approved',
        workflowId: workflowId,
        step: 1,
        role: 'Team Approval',
        clientName: wf?.clientName,
        amount: wf?.amount
      });

      const isOverage = wf?.isOverage === true;

      if (isOverage) {
        // For overage agreement workflows, skip Technical Team approval entirely.
        // Auto-mark the Technical step as approved and notify Legal Team directly.
        try {
          await updateWorkflowStep(workflowId, 2, { status: 'approved', comments: 'Skipped for overage agreement' });
        } catch {
          // Best-effort; do not block approval if this fails
        }

        const legalEmail =
          wf?.workflowSteps?.find(s => s.role === 'Legal Team')?.email ||
          wf?.workflowSteps?.find(s => s.step === 3)?.email;

        if (legalEmail) {
          try {
            await fetch(`${BACKEND_URL}/api/send-ceo-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ceoEmail: legalEmail,
                workflowData: {
                  documentId: wf?.documentId,
                  documentType: wf?.documentType,
                  clientName: wf?.clientName,
                  amount: wf?.amount,
                  workflowId: wf?.id
                }
              })
            });
          } catch {
            // If email fails we still treat approval as valid
          }
        }

        alert('✅ Team approval recorded. Legal Team has been notified (Technical approval skipped for overage).');
      } else {
        // Standard workflows: notify Technical Team for next approval step
        const technicalEmail =
          wf?.workflowSteps?.find(s => s.step === 2)?.email ||
          wf?.workflowSteps?.find(s => s.role === 'Technical Team')?.email;

        if (technicalEmail) {
          try {
            await fetch(`${BACKEND_URL}/api/send-manager-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                managerEmail: technicalEmail,
                workflowData: {
                  documentId: wf?.documentId,
                  documentType: wf?.documentType,
                  clientName: wf?.clientName,
                  amount: wf?.amount,
                  workflowId: wf?.id
                }
              })
            });
          } catch {
            // Ignore email errors here; workflow state is already updated
          }
        }

        alert('✅ Team approval recorded. Technical Team has been notified.');
      }
      // Close modal after action
      closeDocumentModal();
      // Reset acting state to allow next approval
      setIsActing(false);
    } catch (e) {
      console.error('❌ Error approving workflow:', e);
      // Remove from hasTakenAction if approval failed
      setHasTakenAction(prev => {
        const next = new Set(prev);
        next.delete(workflowId);
        return next;
      });
      alert('❌ Failed to approve. Please try again.');
      setIsActing(false);
    }
  };

  const handleDeny = async (workflowId: string) => {
    if (isActing) return;
    if (!workflowId) {
      console.error('❌ No workflowId provided to handleDeny');
      alert('❌ Error: No workflow ID provided. Please try again.');
      return;
    }
    console.log('🛑 Denying workflow:', workflowId);
    setIsActing(true);
    try {
      // Require a reason before denial
      if (!commentText.trim()) {
        setCommentWorkflowId(workflowId);
        setShowCommentModal(true);
        setDenyAfterComment(true);
        setIsActing(false); // Reset since we're not denying yet
        return;
      }
      // Mark this specific workflow as acted upon
      setHasTakenAction(prev => new Set(prev).add(workflowId));
      await updateWorkflowStep(workflowId, 1, { status: 'denied', comments: commentText.trim() });
      alert('🛑 Team denied the request with your comment. The creator will be notified.');
      // Close modal and reset comment state
      closeDocumentModal();
      setCommentText('');
      setCommentWorkflowId(null);
      setShowCommentModal(false);
      setDenyAfterComment(false);
      // Reset acting state to allow next action
      setIsActing(false);
    } catch (e) {
      console.error('❌ Error denying workflow:', e);
      // Remove from hasTakenAction if denial failed
      setHasTakenAction(prev => {
        const next = new Set(prev);
        next.delete(workflowId);
        return next;
      });
      alert('❌ Failed to deny. Please try again.');
      setIsActing(false);
    }
  };

  const handleAddComment = (workflowId: string) => {
    setCommentWorkflowId(workflowId);
    setCommentText('');
    setDenyAfterComment(false);
    setShowCommentModal(true);
  };

  const handleSaveComment = async () => {
    if (isSavingComment) return;
    if (!commentWorkflowId || !commentText.trim()) {
      alert('Please enter a comment');
      return;
    }
    setIsSavingComment(true);
    try {
      if (denyAfterComment) {
        const id = commentWorkflowId;
        setShowCommentModal(false);
        await handleDeny(id);
        setDenyAfterComment(false);
        return;
      }
      await updateWorkflowStep(commentWorkflowId, 1, {
        comments: commentText.trim(),
        timestamp: new Date().toISOString()
      });
      alert('✅ Comment added successfully!');
      setShowCommentModal(false);
      setCommentText('');
      setCommentWorkflowId(null);
    } catch (e) {
      alert('❌ Failed to add comment. Please try again.');
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleViewDocument = async (workflow: any) => {
    console.log('Viewing workflow:', workflow.id);
    setSelectedWorkflow(workflow);
    setModalOpenedFromTab(activeTab);
    setShowDocumentModal(true);
    
    if (!workflow?.documentId) return;
    setIsLoadingPreview(true);
    setDocumentPreview(null);
    
    try {
      console.log('🔄 Fetching document preview for:', workflow.documentId);
      const response = await fetch(`${BACKEND_URL}/api/documents/${workflow.documentId}/preview`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('📄 API Response:', result);
      
      if (result.success && result.dataUrl) {
        setDocumentPreview(result.dataUrl);
        console.log('✅ Document preview loaded successfully:', result.fileName);
      } else {
        console.log('⚠️ Document not found or no file data');
        // Fallback: Try to load document directly
        try {
          const directResponse = await fetch(`${BACKEND_URL}/api/documents/${workflow.documentId}`);
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
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleViewWorkflow = async (wf: any) => {
    setSelectedWorkflow(wf);
    
    // Check if this workflow is pending for Team Approval (step 1)
    const teamStep = wf?.workflowSteps?.find((step: any) => step.step === 1 && step.role === 'Team Approval');
    const isPendingForTeam = wf?.currentStep === 1 && teamStep?.status === 'pending' && wf?.status !== 'denied';
    
    // If it's pending for Team Approval, open from queue tab so approve/deny buttons show
    if (isPendingForTeam) {
      setModalOpenedFromTab('queue');
      setActiveTab('queue'); // Also switch to queue tab
    } else {
      setModalOpenedFromTab('status');
    }
    
    setShowDocumentModal(true);
    if (!wf?.documentId) return;
    setIsLoadingPreview(true);
    setDocumentPreview(null);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/documents/${wf.documentId}/preview`);
      if (resp.ok) {
        const result = await resp.json();
        if (result.success && result.dataUrl) {
          setDocumentPreview(result.dataUrl);
        }
      }
    } catch {}
    finally {
      setIsLoadingPreview(false);
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

  // Auto-open from email link (?workflow=ID)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const workflowId = urlParams.get('workflow');
    if (!workflowId) return;
    
    const fromStore = workflows.find(w => w.id === workflowId);
    if (fromStore) {
      console.log('🔗 Opening document from email link for workflow:', workflowId);
      handleViewWorkflow(fromStore);
      return;
    }
    
    // Fallback: fetch specific workflow if not in store yet
    if (workflows.length > 0) {
      // Workflows are loaded but this one not found
      console.error('❌ Workflow not found in loaded workflows:', workflowId);
    } else {
      // Workflows not loaded yet, fetch this specific workflow directly
      console.log('🔄 Workflows not loaded yet, fetching specific workflow:', workflowId);
      (async () => {
        try {
          const resp = await fetch(`${BACKEND_URL}/api/approval-workflows/${workflowId}`);
          if (resp.ok) {
            const result = await resp.json();
            if (result.success && result.workflow) {
              console.log('📋 Team viewing workflow from API:', result.workflow);
              handleViewWorkflow(result.workflow);
            }
          }
        } catch (error) {
          console.error('❌ Error fetching workflow from email link:', error);
        }
      })();
    }
  }, [workflows]);

  const renderTabContent = () => {
    // Filter workflows for team approval-specific view
    const filteredWorkflows = workflows.filter(workflow => {
      switch (activeTab) {
        case 'queue': return (workflow.status === 'pending' || workflow.status === 'in_progress') && workflow.currentStep === 1;
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
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Team Approval Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Team Approval Comments</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Technical Team Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Legal Team Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Deal Desk Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Created</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((workflow) => {
                const createdDate = workflow.createdAt ? new Date(workflow.createdAt) : new Date();
                const teamStep = workflow.workflowSteps?.find(step => step.role === 'Team Approval');
                const technicalStep = workflow.workflowSteps?.find(step => step.role === 'Technical Team');
                const legalStep = workflow.workflowSteps?.find(step => step.role === 'Legal Team');
                const dealDeskStep = workflow.workflowSteps?.find(step => step.role === 'Deal Desk');

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
                        teamStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        teamStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {teamStep?.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-gray-600 text-sm">
                      {teamStep?.comments || 'No comments'}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        technicalStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        technicalStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {technicalStep?.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        legalStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        legalStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {legalStep?.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        (dealDeskStep?.comments || '').toLowerCase().includes('notified')
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {(dealDeskStep?.comments || '').toLowerCase().includes('notified') ? 'Notified' : 'Pending'}
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
                  <p className="text-lg font-bold text-gray-900">${(workflow.amount || 0).toLocaleString()}</p>
                  <p className="text-sm text-gray-500">Step {workflow.currentStep} of {workflow.totalSteps || 4}</p>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                  <span>Progress</span>
                  <span>{Math.round((workflow.currentStep / (workflow.totalSteps || 4)) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(workflow.currentStep / (workflow.totalSteps || 4)) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {/* Only show the current step for Team Approval in My Approval Queue */}
                {workflow.workflowSteps
                  .filter((step: any) => step.step === 1 && step.role === 'Team Approval')
                  .map((step: any) => {
                    const StepIcon = getStatusIcon(step.status);
                    const isMyStep = step.step === 1 && step.role === 'Team Approval';
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

              {/* Action Buttons for Team Approval - Only View Document */}
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
              <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                <User className="w-6 h-6 text-teal-600" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900">Team Approval Portal</h1>
            </div>
            <p className="text-xl text-gray-600">Review and approve or deny pending requests before Technical Team review</p>
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
                      ? 'bg-teal-600 text-white shadow-md'
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
              <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                {React.createElement(tabs.find(t => t.id === activeTab)?.icon || Clock, { className: "w-4 h-4 text-teal-600" })}
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

            {/* Action Buttons - Only show when opened from "My Approval Queue" tab and it's user's turn */}
            <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 bg-gray-50">
               {modalOpenedFromTab === 'queue' ? (
                 (() => {
                  // Use latest workflow state from store to avoid stale selectedWorkflow after actions
                  const latestWorkflow = workflows.find(w => w.id === selectedWorkflow?.id) || selectedWorkflow;
                  // Check if it's still the user's turn (Team Approval, Step 1, pending status)
                  const teamStep = latestWorkflow?.workflowSteps?.find((step: any) => step.step === 1 && step.role === 'Team Approval');
                  // Check if THIS specific workflow has been acted upon
                  const hasActedOnThis = selectedWorkflow?.id ? hasTakenAction.has(selectedWorkflow.id) : false;
                  const isMyTurn = !hasActedOnThis && latestWorkflow?.currentStep === 1 && teamStep?.status === 'pending' && latestWorkflow?.status !== 'denied';
                   
                   return isMyTurn ? (
                     <div className="flex gap-3">
                       <button
                         onClick={() => {
                           if (!selectedWorkflow?.id) {
                             alert('❌ Error: No workflow ID found. Please close and reopen the document.');
                             return;
                           }
                           handleApprove(selectedWorkflow.id);
                         }}
                         disabled={isActing || hasActedOnThis}
                         className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         {isActing ? (
                           <>
                             <Loader2 className="w-4 h-4 animate-spin" />
                             Approving...
                           </>
                         ) : (
                           <>
                             <ThumbsUp className="w-4 h-4" />
                             Approve
                           </>
                         )}
                       </button>
                       <button
                         onClick={() => {
                           if (!selectedWorkflow?.id) {
                             alert('❌ Error: No workflow ID found. Please close and reopen the document.');
                             return;
                           }
                           if (!commentText.trim()) {
                             alert('⚠️ Please provide a reason for denial before proceeding.');
                             setCommentWorkflowId(selectedWorkflow.id);
                             setShowCommentModal(true);
                            setDenyAfterComment(true);
                           } else {
                             handleDeny(selectedWorkflow.id);
                           }
                         }}
                         disabled={isActing || hasActedOnThis}
                         className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         {isActing ? (
                           <>
                             <Loader2 className="w-4 h-4 animate-spin" />
                             Denying...
                           </>
                         ) : (
                           <>
                             <ThumbsDown className="w-4 h-4" />
                             Deny
                           </>
                         )}
                       </button>
                       <button
                         onClick={() => handleAddComment(selectedWorkflow.id)}
                         className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                       >
                         <MessageCircle className="w-4 h-4" />
                         Add Comment
                       </button>
                     </div>
                   ) : (
                     <div className="text-sm text-gray-500">This workflow is no longer awaiting your approval</div>
                   );
                 })()
               ) : (
                 <div className="text-sm text-gray-500">Viewing from Workflow Status</div>
               )}
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
                  <h2 className="text-xl font-semibold text-gray-900">{denyAfterComment ? 'Provide Reason for Denial' : 'Add Comment'}</h2>
                  <p className="text-sm text-gray-500">{denyAfterComment ? 'This reason will be saved and the request will be denied.' : 'Add your feedback for this workflow'}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowCommentModal(false); setDenyAfterComment(false); }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Comment</label>
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
                onClick={() => { setShowCommentModal(false); setDenyAfterComment(false); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveComment}
                disabled={isSavingComment}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : (denyAfterComment ? 'Save & Deny' : 'Save Comment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamApprovalDashboard;


