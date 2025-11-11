import React, { useEffect, useMemo, useState } from 'react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import { BACKEND_URL } from '../config/api';
import { FileText, X, Loader2, ThumbsUp, ThumbsDown, MessageCircle } from 'lucide-react';

const TeamApprovalDashboard: React.FC = () => {
  const { workflows, updateWorkflowStep } = useApprovalWorkflows();
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
  const [hasTakenAction, setHasTakenAction] = useState(false);

  const pendingTeamWorkflows = useMemo(() => {
    return workflows.filter(wf => {
      const step1 = wf.workflowSteps?.find(s => s.step === 1);
      return step1 && step1.role === 'Team Approval' && step1.status === 'pending';
    });
  }, [workflows]);

  const handleApprove = async (workflowId: string) => {
    if (isActing) return;
    setIsActing(true);
    try {
      setHasTakenAction(true);
      await updateWorkflowStep(workflowId, 1, { status: 'approved' });
      // Send email to Technical Team (next step)
      const wf = workflows.find(w => w.id === workflowId);
      const technicalEmail = wf?.workflowSteps?.find(s => s.step === 2)?.email || wf?.workflowSteps?.find(s => s.role === 'Technical Team')?.email;
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
        } catch {}
      }
      alert('✅ Team approval recorded. Technical Team has been notified.');
      // Close modal after action
      setShowDocumentModal(false);
      setSelectedWorkflow(null);
    } catch (e) {
      alert('❌ Failed to approve. Please try again.');
    } finally {
      setIsActing(false);
    }
  };

  const handleDeny = async (workflowId: string) => {
    if (isActing) return;
    setIsActing(true);
    try {
      // Require a reason before denial
      if (!commentText.trim()) {
        setCommentWorkflowId(workflowId);
        setShowCommentModal(true);
        setDenyAfterComment(true);
        return;
      }
      setHasTakenAction(true);
      await updateWorkflowStep(workflowId, 1, { status: 'denied', comments: commentText.trim() });
      alert('🛑 Team denied the request with your comment. The creator will be notified.');
      // Close modal and reset comment state
      setShowDocumentModal(false);
      setSelectedWorkflow(null);
      setCommentText('');
      setCommentWorkflowId(null);
      setShowCommentModal(false);
      setDenyAfterComment(false);
    } catch (e) {
      alert('❌ Failed to deny. Please try again.');
    } finally {
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

  const handleViewWorkflow = async (wf: any) => {
    setSelectedWorkflow(wf);
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

  // Auto-open from email link (?workflow=ID)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const workflowId = urlParams.get('workflow');
    if (!workflowId) return;
    const fromStore = workflows.find(w => w.id === workflowId);
    if (fromStore) {
      handleViewWorkflow(fromStore);
      return;
    }
    // Fallback: fetch specific workflow
    (async () => {
      try {
        const resp = await fetch(`${BACKEND_URL}/api/approval-workflows/${workflowId}`);
        if (resp.ok) {
          const result = await resp.json();
          if (result.success && result.workflow) {
            handleViewWorkflow(result.workflow);
          }
        }
      } catch {}
    })();
  }, [workflows]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Team Approval</h1>
        <p className="text-gray-600 mb-6">Review and approve or deny pending requests before Technical Team review.</p>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left text-sm font-semibold text-gray-700 px-4 py-3">Document ID</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-4 py-3">Client</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-4 py-3">Amount</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingTeamWorkflows.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-gray-500 py-8">No pending Team approvals.</td>
                </tr>
              )}
              {pendingTeamWorkflows.map(wf => (
                <tr key={wf.id} className="border-t">
                  <td className="px-4 py-3 font-mono text-sm text-blue-700">{wf.documentId}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{wf.clientName}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">${(wf.amount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewWorkflow(wf)}
                        className="px-3 py-1.5 text-sm rounded-md bg-teal-600 text-white hover:bg-teal-700"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleApprove(wf.id)}
                        disabled={isActing}
                        className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleDeny(wf.id)}
                        disabled={isActing}
                        className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showDocumentModal && selectedWorkflow && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Document Preview</h2>
                  <p className="text-sm text-gray-500">ID: {selectedWorkflow.documentId}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowDocumentModal(false); setSelectedWorkflow(null); setDocumentPreview(null); }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(95vh-150px)]">
              <div className="bg-gray-100 rounded-lg p-3">
                {isLoadingPreview ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-teal-600" />
                    <p className="text-gray-600 text-sm">Loading document preview...</p>
                  </div>
                ) : documentPreview ? (
                  <iframe src={documentPreview} className="w-full h-[70vh] border-0" title="Document Preview" />
                ) : (
                  <div className="text-center py-8 text-gray-600">No preview available</div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
              <div className="text-sm text-gray-500">Team Approval</div>
              {(() => {
                const latest = workflows.find(w => w.id === selectedWorkflow?.id) || selectedWorkflow;
                const teamStep = latest?.workflowSteps?.find((s: any) => s.step === 1 && s.role === 'Team Approval');
                const isMyTurn = !hasTakenAction && latest?.currentStep === 1 && teamStep?.status === 'pending' && latest?.status !== 'denied';
                return isMyTurn ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(selectedWorkflow.id)}
                      disabled={isActing}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                      Approve
                    </button>
                    <button
                      onClick={() => handleDeny(selectedWorkflow.id)}
                      disabled={isActing}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                      Deny
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
              })()}
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


