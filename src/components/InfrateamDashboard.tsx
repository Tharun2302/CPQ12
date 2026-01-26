import React, { useState, useEffect } from 'react';
import { Clock, User, BarChart3, X, MessageCircle, CheckCircle, AlertCircle, ThumbsUp, Eye, FileText, Loader2, Server, TestTube } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import { BACKEND_URL } from '../config/api';
import { track } from '../analytics/clarity';
import { useLocation } from 'react-router-dom';
import Navigation from './Navigation';

interface InfrateamDashboardProps {
  teamEmail?: string;
}

const InfrateamDashboard: React.FC<InfrateamDashboardProps> = ({ 
  teamEmail = 'infrateam@cloudfuze.com'
}) => {
  const [activeTab, setActiveTab] = useState('servers');
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentWorkflowId, setCommentWorkflowId] = useState<string | null>(null);
  const [modalOpenedFromTab, setModalOpenedFromTab] = useState<string>('servers');
  const [hasTakenAction, setHasTakenAction] = useState<Set<string>>(new Set());
  const [isActing, setIsActing] = useState(false);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [serversBuilt, setServersBuilt] = useState<{ [key: string]: number }>({});
  const { workflows, updateWorkflowStep, updateWorkflow } = useApprovalWorkflows();
  
  console.log('InfrateamDashboard rendered for:', teamEmail);
  console.log('📊 Available workflows:', workflows.length);

  // Filter workflows that have Migration Manager approval and server count set
  const getInfrateamWorkflows = () => {
    return workflows.filter(w => {
      const migrationStep = w.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
      return migrationStep?.status === 'approved' && 
             migrationStep?.comments?.includes('Servers') &&
             w.status !== 'denied';
    });
  };

  const tabs = [
    {
      id: 'servers',
      label: 'Build Servers',
      icon: Server,
      count: getInfrateamWorkflows().filter(w => {
        const infrateamStep = w.workflowSteps?.find((s: any) => s.role === 'Infrateam');
        return !infrateamStep || infrateamStep.status === 'pending';
      }).length
    },
    {
      id: 'qa',
      label: 'QA Testing',
      icon: TestTube,
      count: getInfrateamWorkflows().filter(w => {
        const infrateamStep = w.workflowSteps?.find((s: any) => s.role === 'Infrateam');
        const qaStep = w.workflowSteps?.find((s: any) => s.role === 'QA');
        return infrateamStep?.status === 'approved' && (!qaStep || qaStep.status === 'pending');
      }).length
    },
    { id: 'status', label: 'Infrastructure Status', icon: BarChart3, count: getInfrateamWorkflows().length }
  ];

  const handleViewWorkflow = async (workflow: any) => {
    console.log('Viewing workflow:', workflow.id);
    setSelectedWorkflow(workflow);
    setModalOpenedFromTab(activeTab);
    setShowDocumentModal(true);
    
    if (workflow.documentId) {
      setIsLoadingPreview(true);
      setDocumentPreview(null);
      
      try {
        const response = await fetch(`${BACKEND_URL}/api/documents/${workflow.documentId}/preview`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.dataUrl) {
            setDocumentPreview(result.dataUrl);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching document preview:', error);
      } finally {
        setIsLoadingPreview(false);
      }
    }
  };

  const handleMarkServersBuilt = async (workflowId: string) => {
    if (!serversBuilt[workflowId] || serversBuilt[workflowId] <= 0) {
      alert('Please enter the number of servers built.');
      return;
    }

    if (isActing) return;
    setIsActing(true);

    try {
      setHasTakenAction(prev => new Set(prev).add(workflowId));
      
      const workflow = workflows.find(w => w.id === workflowId);
      const migrationStep = workflow?.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
      const expectedServers = migrationStep?.comments?.includes('Servers')
        ? parseInt(migrationStep.comments.split('Servers: ')[1]) || 0
        : 0;

      if (serversBuilt[workflowId] !== expectedServers) {
        const confirm = window.confirm(
          `You entered ${serversBuilt[workflowId]} servers, but Migration Manager specified ${expectedServers}. Continue anyway?`
        );
        if (!confirm) {
          setIsActing(false);
          return;
        }
      }

      // Add or update Infrateam step
      const infrateamStep = workflow?.workflowSteps?.find((s: any) => s.role === 'Infrateam');
      
      if (!infrateamStep) {
        const newStep = {
          step: (workflow?.workflowSteps?.length || 0) + 1,
          role: 'Infrateam',
          email: teamEmail,
          status: 'approved' as const,
          comments: `Servers built: ${serversBuilt[workflowId]}`,
          timestamp: new Date().toISOString()
        };
        
        const updatedSteps = [...(workflow?.workflowSteps || []), newStep];
        await updateWorkflow(workflowId, {
          workflowSteps: updatedSteps,
          currentStep: newStep.step,
          status: 'in_progress'
        });
      } else {
        await updateWorkflowStep(workflowId, infrateamStep.step, {
          status: 'approved',
          comments: `Servers built: ${serversBuilt[workflowId]}`
        });
      }

      alert(`✅ ${serversBuilt[workflowId]} servers marked as built successfully!`);
      setServersBuilt(prev => {
        const next = { ...prev };
        delete next[workflowId];
        return next;
      });
      closeDocumentModal();
    } catch (error) {
      console.error('❌ Error marking servers built:', error);
      alert('❌ Failed to mark servers built. Please try again.');
      setHasTakenAction(prev => {
        const next = new Set(prev);
        next.delete(workflowId);
        return next;
      });
    } finally {
      setIsActing(false);
    }
  };

  const handleApproveQA = async (workflowId: string) => {
    if (isActing) return;
    setIsActing(true);

    try {
      setHasTakenAction(prev => new Set(prev).add(workflowId));
      
      const workflow = workflows.find(w => w.id === workflowId);
      const qaStep = workflow?.workflowSteps?.find((s: any) => s.role === 'QA');
      
      if (!qaStep) {
        const newStep = {
          step: (workflow?.workflowSteps?.length || 0) + 1,
          role: 'QA',
          email: teamEmail,
          status: 'approved' as const,
          comments: commentText || 'QA testing passed',
          timestamp: new Date().toISOString()
        };
        
        const updatedSteps = [...(workflow?.workflowSteps || []), newStep];
        await updateWorkflow(workflowId, {
          workflowSteps: updatedSteps,
          currentStep: newStep.step,
          status: 'in_progress'
        });
      } else {
        await updateWorkflowStep(workflowId, qaStep.step, {
          status: 'approved',
          comments: commentText || qaStep.comments || 'QA testing passed'
        });
      }

      // Notify Migration Manager that QA is complete
      const migrationStep = workflow?.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
      if (migrationStep?.email) {
        try {
          await fetch(`${BACKEND_URL}/api/send-manager-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              managerEmail: migrationStep.email,
              workflowData: {
                documentId: workflow?.documentId,
                documentType: workflow?.documentType,
                clientName: workflow?.clientName,
                amount: workflow?.amount,
                workflowId: workflow?.id,
                message: 'QA testing completed. Infrastructure is ready.'
              }
            })
          });
        } catch {}
      }

      alert('✅ QA testing approved. Migration Manager has been notified.');
      setCommentText('');
      closeDocumentModal();
    } catch (error) {
      console.error('❌ Error approving QA:', error);
      alert('❌ Failed to approve QA. Please try again.');
      setHasTakenAction(prev => {
        const next = new Set(prev);
        next.delete(workflowId);
        return next;
      });
    } finally {
      setIsActing(false);
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

  const renderTabContent = () => {
    const infrateamWorkflows = getInfrateamWorkflows();
    let filteredWorkflows = infrateamWorkflows;

    if (activeTab === 'servers') {
      filteredWorkflows = infrateamWorkflows.filter(w => {
        const infrateamStep = w.workflowSteps?.find((s: any) => s.role === 'Infrateam');
        return !infrateamStep || infrateamStep.status === 'pending';
      });
    } else if (activeTab === 'qa') {
      filteredWorkflows = infrateamWorkflows.filter(w => {
        const infrateamStep = w.workflowSteps?.find((s: any) => s.role === 'Infrateam');
        const qaStep = w.workflowSteps?.find((s: any) => s.role === 'QA');
        return infrateamStep?.status === 'approved' && (!qaStep || qaStep.status === 'pending');
      });
    }

    if (filteredWorkflows.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {React.createElement(tabs.find(t => t.id === activeTab)?.icon || Clock, { className: "w-8 h-8 text-gray-400" })}
          </div>
          <p className="text-gray-500 italic text-lg">
            {activeTab === 'servers' && 'No servers to build at this time.'}
            {activeTab === 'qa' && 'No QA testing pending.'}
            {activeTab === 'status' && 'No infrastructure workflows found.'}
          </p>
        </div>
      );
    }

    if (activeTab === 'status') {
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Document</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Client</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Expected Servers</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Servers Built</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Infrateam Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">QA Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkflows.map((workflow) => {
                const migrationStep = workflow.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
                const infrateamStep = workflow.workflowSteps?.find((s: any) => s.role === 'Infrateam');
                const qaStep = workflow.workflowSteps?.find((s: any) => s.role === 'QA');
                
                const expectedServers = migrationStep?.comments?.includes('Servers')
                  ? migrationStep.comments.split('Servers: ')[1] || 'Not set'
                  : 'Not set';
                
                const builtServers = infrateamStep?.comments?.includes('Servers built')
                  ? infrateamStep.comments.split('Servers built: ')[1] || 'Not set'
                  : 'Not set';
                
                return (
                  <tr key={workflow.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4 text-gray-900 font-medium">{workflow.documentId || 'Unknown'}</td>
                    <td className="py-4 px-4 text-gray-700">{workflow.clientName || 'Unknown'}</td>
                    <td className="py-4 px-4 text-gray-600 text-sm">{expectedServers}</td>
                    <td className="py-4 px-4 text-gray-600 text-sm">{builtServers}</td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        infrateamStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        infrateamStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {infrateamStep?.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        qaStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        qaStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {qaStep?.status || 'pending'}
                      </span>
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
          const migrationStep = workflow.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
          const infrateamStep = workflow.workflowSteps?.find((s: any) => s.role === 'Infrateam');
          const qaStep = workflow.workflowSteps?.find((s: any) => s.role === 'QA');
          
          const expectedServers = migrationStep?.comments?.includes('Servers')
            ? migrationStep.comments.split('Servers: ')[1] || 'Not set'
            : 'Not set';
          
          return (
            <div key={workflow.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${getStatusColor(workflow.status)}`}>
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{workflow.documentId || 'Unknown Document'}</h3>
                    <p className="text-sm text-gray-500">{workflow.clientName || 'Unknown Client'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-700">Expected: {expectedServers} servers</p>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Infrateam</label>
                    <div className="mt-1">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                        infrateamStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {infrateamStep?.status || 'pending'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">QA</label>
                    <div className="mt-1">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                        qaStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {qaStep?.status || 'pending'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleViewWorkflow(workflow)}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  View Details
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const location = useLocation();
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path.includes('infrateam')) return 'infrateam';
    return 'infrateam';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation currentTab={getCurrentTab()} />
      
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200 lg:ml-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                <Server className="w-6 h-6 text-orange-600" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900">Infrateam Portal</h1>
            </div>
            <p className="text-xl text-gray-600">Build servers and perform QA testing</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200 shadow-sm lg:ml-64">
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
                      ? 'bg-orange-600 text-white shadow-md'
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:ml-64">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                {React.createElement(tabs.find(t => t.id === activeTab)?.icon || Clock, { className: "w-4 h-4 text-orange-600" })}
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
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Infrastructure Details</h2>
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
              {/* Document Preview */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Preview</h3>
                <div className="bg-gray-100 rounded-lg p-4">
                  {isLoadingPreview ? (
                    <div className="text-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-orange-600" />
                      <p className="text-gray-600 text-sm">Loading document preview...</p>
                    </div>
                  ) : documentPreview ? (
                    <iframe
                      src={documentPreview}
                      className="w-full h-[60vh] border-0 rounded"
                      title="Document Preview"
                    />
                  ) : (
                    <div className="text-center py-8">
                      <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 text-sm">Document preview not available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Infrastructure Actions */}
              <div className="space-y-6">
                {activeTab === 'servers' && (
                  <div className="bg-orange-50 rounded-lg p-6 border border-orange-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Server className="w-5 h-5 text-orange-600" />
                      Mark Servers Built
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Number of Servers Built
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={serversBuilt[selectedWorkflow.id] || ''}
                          onChange={(e) => setServersBuilt(prev => ({ ...prev, [selectedWorkflow.id]: parseInt(e.target.value) || 0 }))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                          placeholder="Enter number of servers built"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Expected: {(() => {
                            const migrationStep = selectedWorkflow.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
                            return migrationStep?.comments?.includes('Servers')
                              ? migrationStep.comments.split('Servers: ')[1] || 'Not specified'
                              : 'Not specified';
                          })()} servers
                        </p>
                      </div>
                      <button
                        onClick={() => handleMarkServersBuilt(selectedWorkflow.id)}
                        disabled={isActing || !serversBuilt[selectedWorkflow.id] || serversBuilt[selectedWorkflow.id] <= 0}
                        className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isActing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Server className="w-4 h-4" />
                            Mark Servers Built
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'qa' && (
                  <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <TestTube className="w-5 h-5 text-green-600" />
                      Approve QA Testing
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">QA Comments (Optional)</label>
                        <textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Enter QA testing notes..."
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                          rows={4}
                        />
                      </div>
                      <button
                        onClick={() => handleApproveQA(selectedWorkflow.id)}
                        disabled={isActing}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isActing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Approve QA Testing
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InfrateamDashboard;
