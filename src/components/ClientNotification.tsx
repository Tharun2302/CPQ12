import React, { useState, useEffect } from 'react';
import { CheckCircle, X, MessageCircle, FileText, DollarSign, User, Eye, Download } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';

interface ClientNotificationProps {
}

const ClientNotification: React.FC<ClientNotificationProps> = () => {
  const [workflow, setWorkflow] = useState<any>(null);
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [hasTakenAction, setHasTakenAction] = useState(false);
  const { workflows, updateWorkflowStep, updateWorkflow } = useApprovalWorkflows();
  
  // Get workflow ID from URL parameters and auto-open document preview
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const workflowId = urlParams.get('workflow');
    
    console.log('🔍 ClientNotification useEffect - workflowId:', workflowId);
    console.log('🔍 ClientNotification useEffect - workflows.length:', workflows.length);
    console.log('🔍 ClientNotification useEffect - current workflow:', workflow);
    
    if (workflowId && !workflow) {
      // Only fetch if we don't already have a workflow
      // First try to find in loaded workflows
      const foundWorkflow = workflows.find(w => w.id === workflowId);
      if (foundWorkflow) {
        setWorkflow(foundWorkflow);
        setHasAutoOpened(false); // Reset auto-open flag for new workflow
        console.log('📋 Client viewing workflow from loaded data:', foundWorkflow);
      } else if (workflows.length > 0) {
        // If workflows are loaded but this one not found, it doesn't exist
        console.error('❌ Workflow not found in loaded workflows:', workflowId);
        console.error('❌ Available workflow IDs:', workflows.map(w => w.id));
      } else {
        // If workflows not loaded yet, fetch this specific workflow directly
        console.log('🔄 Workflows not loaded yet, fetching specific workflow:', workflowId);
        fetchSpecificWorkflow(workflowId);
      }
    }
  }, [workflows, workflow]);

  const fetchSpecificWorkflow = async (workflowId: string) => {
    try {
      console.log('📄 Fetching specific workflow from API:', workflowId);
      const response = await fetch(`http://localhost:3001/api/approval-workflows/${workflowId}`);
      
      console.log('📄 API Response status:', response.status);
      console.log('📄 API Response ok:', response.ok);
      
      if (response.ok) {
        const result = await response.json();
        console.log('📄 API Response result:', result);
        
        if (result.success && result.workflow) {
          setWorkflow(result.workflow);
          setHasAutoOpened(false); // Reset auto-open flag for new workflow
          console.log('📋 Client viewing workflow from API:', result.workflow);
        } else {
          console.error('❌ Workflow not found in API response:', workflowId);
          console.error('❌ API Response:', result);
        }
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to fetch workflow from API:', response.status);
        console.error('❌ Error response:', errorText);
      }
    } catch (error) {
      console.error('❌ Error fetching specific workflow:', error);
    }
  };

  // Auto-open document preview when workflow is loaded from Gmail link
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const workflowId = urlParams.get('workflow');
    
    if (workflow && workflowId && !showDocumentPreview && !hasAutoOpened) {
      console.log('🔗 Auto-opening document preview from Gmail link for workflow:', workflowId);
      setHasAutoOpened(true); // Mark as auto-opened to prevent reopening
      // Use setTimeout to ensure the component is fully rendered
      setTimeout(() => {
        handleViewDocument();
      }, 100);
    }
  }, [workflow, showDocumentPreview, hasAutoOpened]);

  const handleApprove = async () => {
    if (!workflow) return;
    
    setIsLoading(true);
    try {
      console.log('✅ Client approving workflow:', workflow.id);
      setHasTakenAction(true);
      // Optimistically update local workflow so buttons hide immediately
      setWorkflow((prev: any) => prev ? {
        ...prev,
        status: 'approved',
        currentStep: 4,
        workflowSteps: prev.workflowSteps?.map((s: any) => 
          s.step === 3 && s.role === 'Client' 
            ? { ...s, status: 'approved', comments: comment || 'Approved by client', timestamp: new Date().toISOString() } 
            : s
        )
      } : prev);
      await updateWorkflowStep(workflow.id, 3, { 
        status: 'approved',
        comments: comment || 'Approved by client'
      });
      
      // Update workflow status to approved since all steps are complete
      await updateWorkflow(workflow.id, { 
        status: 'approved',
        currentStep: 4 // Move to Deal Desk step
      });
      
      // Send email to Deal Desk after client approval
      try {
        console.log('📧 Sending email to Deal Desk after client approval...');
        console.log('📧 Workflow data:', workflow);
        console.log('📧 Deal Desk email:', workflow.workflowSteps?.find((step: any) => step.role === 'Deal Desk')?.email);
        
        const dealDeskEmail = workflow.workflowSteps?.find((step: any) => step.role === 'Deal Desk')?.email || 'dealdesk@company.com';
        console.log('📧 Using Deal Desk email:', dealDeskEmail);
        
        const response = await fetch('http://localhost:3001/api/send-deal-desk-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dealDeskEmail: dealDeskEmail,
            workflowData: {
              documentId: workflow.documentId,
              documentType: workflow.documentType,
              clientName: workflow.clientName,
              amount: workflow.amount,
              workflowId: workflow.id
            }
          })
        });

        console.log('📧 Deal Desk email response status:', response.status);
        const result = await response.json();
        console.log('📧 Deal Desk email response:', result);
        
        if (result.success) {
          console.log('✅ Deal Desk email sent successfully');
        } else {
          console.log('⚠️ Deal Desk email failed, but workflow is complete');
          console.log('⚠️ Error details:', result.error || result.message);
        }
      } catch (emailError) {
        console.error('❌ Error sending Deal Desk email:', emailError);
      }
      
      alert('✅ Request approved successfully!\n\nYour approval has been recorded and Deal Desk has been notified. The workflow is now complete.');
      
      // Reset form and refresh page
      setComment('');
      // Refresh the page to get updated workflow status
      window.location.reload();
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
      setHasTakenAction(true);
      // Optimistically update local workflow so buttons hide immediately
      setWorkflow((prev: any) => prev ? {
        ...prev,
        status: 'denied',
        workflowSteps: prev.workflowSteps?.map((s: any) => 
          s.step === 3 && s.role === 'Client' 
            ? { ...s, status: 'denied', comments: comment, timestamp: new Date().toISOString() } 
            : s
        )
      } : prev);
      await updateWorkflowStep(workflow.id, 3, { 
        status: 'denied',
        comments: comment
      });
      
      alert('❌ Request denied.\n\nYour decision has been recorded and the workflow is now closed.');
      
      // Reset form and refresh page
      setComment('');
      // Refresh the page to get updated workflow status
      window.location.reload();
    } catch (error) {
      console.error('❌ Error denying workflow:', error);
      alert('❌ Failed to deny request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };


  const handleViewDocument = async () => {
    if (!workflow?.documentId) {
      alert('❌ No document available for preview.');
      return;
    }

    setIsLoadingDocument(true);
    try {
      console.log('📄 Fetching document for preview:', workflow.documentId);
      
      // Try preview API first
      try {
        const previewResponse = await fetch(`http://localhost:3001/api/documents/${workflow.documentId}/preview`);
        if (previewResponse.ok) {
          const result = await previewResponse.json();
          if (result.success && result.dataUrl) {
            setDocumentPreviewUrl(result.dataUrl);
            setShowDocumentPreview(true);
            console.log('✅ Document preview loaded successfully:', result.fileName);
            return;
          }
        }
      } catch (previewError) {
        console.log('⚠️ Preview API failed, trying direct method:', previewError);
      }
      
      // Fallback: Fetch document directly
      const response = await fetch(`http://localhost:3001/api/documents/${workflow.documentId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch document');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setDocumentPreviewUrl(url);
      setShowDocumentPreview(true);
      
      console.log('✅ Document loaded for preview via direct method');
    } catch (error) {
      console.error('❌ Error loading document:', error);
      alert('❌ Failed to load document preview. Please try again.');
    } finally {
      setIsLoadingDocument(false);
    }
  };

  const handleDownloadDocument = async () => {
    if (!workflow?.documentId) {
      alert('❌ No document available for download.');
      return;
    }

    try {
      console.log('📥 Downloading document:', workflow.documentId);
      
      const response = await fetch(`http://localhost:3001/api/documents/${workflow.documentId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch document');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `${workflow.documentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('✅ Document downloaded');
    } catch (error) {
      console.error('❌ Error downloading document:', error);
      alert('❌ Failed to download document. Please try again.');
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

  const clientStep = workflow.workflowSteps?.find((step: any) => step.role === 'Client');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-8 py-6 lg:py-8">
          <div className="mb-4 lg:mb-6">
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 lg:gap-3 mb-2">
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 lg:w-6 lg:h-6 text-green-600" />
              </div>
              <h1 className="text-2xl lg:text-4xl font-bold text-gray-900">Client Approval</h1>
            </div>
            <p className="text-lg lg:text-xl text-gray-600">Review and approve your request</p>
            <p className="text-xs lg:text-sm text-gray-500 mt-1">Client: {workflow.clientName}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-8 py-4 lg:py-8">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          {/* Document Details */}
          <div className="px-4 lg:px-6 py-4 lg:py-5 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="w-6 h-6 lg:w-8 lg:h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-3 h-3 lg:w-4 lg:h-4 text-blue-600" />
              </div>
              <h2 className="text-lg lg:text-xl font-semibold text-gray-900">Document Details</h2>
            </div>
          </div>
          
          <div className="p-4 lg:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-8">
              {/* Document Information */}
              <div className="space-y-4">
                <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-3 lg:mb-4 border-b border-gray-200 pb-2">Document Information</h3>
                
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
              

              {/* Approval Status - Second Column */}
              <div className="space-y-2">
                <h3 className="text-sm lg:text-base font-semibold text-gray-900 mb-2 border-b border-gray-200 pb-1">Your Approval</h3>
                <div className="space-y-1">
                {/* Only show the client's own approval step */}
                <div className="p-2 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center gap-2">
                    <span className="text-sm flex-shrink-0">👤</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900">Your Approval</p>
                      <p className="text-xs text-gray-500 truncate">{clientStep?.email || 'client@company.com'}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        {clientStep?.status || 'pending'}
                      </span>
                      <p className="text-xs text-green-600 font-semibold">(Your Turn)</p>
                    </div>
                  </div>
                  {clientStep?.comments && (
                    <p className="text-xs text-gray-500 mt-1 pl-4">"{clientStep.comments}"</p>
                  )}
                </div>
                </div>
              </div>
            </div>

            {/* Document Preview Buttons */}
            <div className="mb-4 lg:mb-6 p-3 lg:p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm lg:text-base font-semibold text-gray-900 mb-2 lg:mb-3">Document Preview</h4>
              <p className="text-xs lg:text-sm text-gray-600 mb-3 lg:mb-4">Review the document before making your decision:</p>
              <div className="flex flex-col sm:flex-row gap-2 lg:gap-3 justify-center">
                <button
                  onClick={handleViewDocument}
                  disabled={isLoadingDocument}
                  className="flex items-center justify-center gap-2 px-4 lg:px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium text-sm lg:text-base"
                >
                  <Eye className="w-4 h-4" />
                  {isLoadingDocument ? 'Loading...' : 'View Document'}
                </button>
                
                <button
                  onClick={handleDownloadDocument}
                  className="flex items-center justify-center gap-2 px-4 lg:px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors font-medium text-sm lg:text-base"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
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
              name="comment"
                placeholder="Add your comments about this request..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                rows={4}
              />
            </div>


            {/* Action Buttons - Only show if workflow is still pending */}
            {(() => {
              // Check if it's still the client's turn (Step 3, pending status)
              const isMyTurn = !hasTakenAction && workflow?.currentStep === 3 && 
                workflow?.workflowSteps?.find((step: any) => step.step === 3 && step.role === 'Client')?.status === 'pending' && workflow?.status !== 'denied';
              
              return isMyTurn ? (
                <div className="flex flex-row gap-3 justify-center">
                  <button
                    onClick={handleApprove}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 px-6 lg:px-8 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors font-semibold text-sm lg:text-base"
                  >
                    <CheckCircle className="w-4 lg:w-5 h-4 lg:h-5" />
                    {isLoading ? 'Processing...' : 'Approve Request'}
                  </button>
                  
                  <button
                    onClick={handleDeny}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 px-6 lg:px-8 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors font-semibold text-sm lg:text-base"
                  >
                    <X className="w-4 lg:w-5 h-4 lg:h-5" />
                    {isLoading ? 'Processing...' : 'Deny Request'}
                  </button>
                </div>
              ) : (
                <div className="text-center p-6 bg-gray-50 rounded-lg">
                  <div className="text-lg font-semibold text-gray-700 mb-2">
                    {workflow?.workflowSteps?.find((step: any) => step.step === 3 && step.role === 'Client')?.status === 'approved' 
                      ? '✅ Request Already Approved' 
                      : '❌ Request Already Processed'}
                  </div>
                  <div className="text-sm text-gray-500">
                    This workflow has already been processed and is no longer awaiting your action.
                  </div>
                </div>
              );
            })()}

            {/* Instructions */}
            <div className="mt-6 lg:mt-8 p-3 lg:p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm lg:text-base font-semibold text-blue-900 mb-2">Instructions:</h4>
              <ul className="text-xs lg:text-sm text-blue-800 space-y-1">
                <li>• <strong>Approve:</strong> Click "Approve Request" to accept this request</li>
                <li>• <strong>Deny:</strong> Click "Deny Request" to reject this request (comments required)</li>
                <li>• <strong>Comments:</strong> Add any feedback or notes about your decision</li>
                <li>• <strong>Final Decision:</strong> Once you approve or deny, the workflow will be completed</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Document Preview Modal */}
      {showDocumentPreview && documentPreviewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-6xl h-5/6 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Document Preview</h3>
              <button
                onClick={() => {
                  setShowDocumentPreview(false);
                  setHasAutoOpened(true); // Mark as manually closed to prevent auto-reopening
                  if (documentPreviewUrl) {
                    URL.revokeObjectURL(documentPreviewUrl);
                    setDocumentPreviewUrl(null);
                  }
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 p-4" style={{ height: 'calc(100% - 120px)' }}>
              <iframe
                src={documentPreviewUrl}
                className="w-full h-full border-0 rounded-lg"
                title="Document Preview"
              />
            </div>
            {/* Action Buttons - Only show if workflow is still pending */}
            <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-200 bg-gray-50">
              {(() => {
                // Check if it's still the client's turn (Step 3, pending status)
                const isMyTurn = !hasTakenAction && workflow?.currentStep === 3 && 
                  workflow?.workflowSteps?.find((step: any) => step.step === 3 && step.role === 'Client')?.status === 'pending' && workflow?.status !== 'denied';
                
                return isMyTurn ? (
                  <div className="flex gap-3">
                    <button
                      onClick={handleApprove}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={handleDeny}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Deny
                    </button>
                    <button
                      onClick={() => {
                        const commentInput = document.querySelector('textarea[name="comment"]') as HTMLTextAreaElement;
                        if (commentInput) {
                          commentInput.focus();
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
              })()}
              <button
                onClick={() => {
                  setShowDocumentPreview(false);
                  setHasAutoOpened(true); // Mark as manually closed to prevent auto-reopening
                  if (documentPreviewUrl) {
                    URL.revokeObjectURL(documentPreviewUrl);
                    setDocumentPreviewUrl(null);
                  }
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientNotification;
