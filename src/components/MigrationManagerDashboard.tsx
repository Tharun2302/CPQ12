import React, { useState } from 'react';
import { Clock, User, BarChart3, X, MessageCircle, CheckCircle, AlertCircle, ThumbsUp, ThumbsDown, Eye, FileText, Loader2, Calendar, Server, Users, Mail } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import { BACKEND_URL } from '../config/api';
import { track } from '../analytics/clarity';
import { useLocation } from 'react-router-dom';
import Navigation from './Navigation';

interface MigrationManagerDashboardProps {
  managerEmail?: string;
}

const MigrationManagerDashboard: React.FC<MigrationManagerDashboardProps> = ({ 
  managerEmail = 'migration.manager@cloudfuze.com'
}) => {
  const [activeTab, setActiveTab] = useState('timeline');
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentWorkflowId, setCommentWorkflowId] = useState<string | null>(null);
  const [modalOpenedFromTab, setModalOpenedFromTab] = useState<string>('timeline');
  const [hasTakenAction, setHasTakenAction] = useState<Set<string>>(new Set());
  const [denyAfterComment, setDenyAfterComment] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [numberOfServers, setNumberOfServers] = useState<{ [key: string]: number }>({});
  const [timelineDate, setTimelineDate] = useState<{ [key: string]: string }>({});
  const { workflows, updateWorkflowStep, updateWorkflow } = useApprovalWorkflows();
  
  console.log('MigrationManagerDashboard rendered for:', managerEmail);
  console.log('📊 Available workflows:', workflows.length);

  // Filter workflows that have completed approval phase (Legal Team approved)
  const getMigrationWorkflows = () => {
    return workflows.filter(w => {
      const legalStep = w.workflowSteps?.find((s: any) => s.role === 'Legal Team');
      return legalStep?.status === 'approved' && w.status !== 'denied';
    });
  };

  const tabs = [
    {
      id: 'timeline',
      label: 'Timeline Project',
      icon: Calendar,
      count: getMigrationWorkflows().filter(w => {
        const migrationStep = w.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
        return !migrationStep || migrationStep.status === 'pending';
      }).length
    },
    {
      id: 'migration',
      label: 'Manage Migration',
      icon: Server,
      count: getMigrationWorkflows().filter(w => {
        const migrationStep = w.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
        return migrationStep?.status === 'approved';
      }).length
    },
    { id: 'status', label: 'Migration Status', icon: BarChart3, count: getMigrationWorkflows().length }
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

  const handleSetTimeline = async (workflowId: string) => {
    if (!timelineDate[workflowId]) {
      alert('Please select a timeline date first.');
      return;
    }

    if (isActing) return;
    setIsActing(true);

    try {
      setHasTakenAction(prev => new Set(prev).add(workflowId));
      
      // Add or update Migration Manager step with timeline
      const workflow = workflows.find(w => w.id === workflowId);
      const migrationStep = workflow?.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
      
      if (!migrationStep) {
        // Add new migration step
        const newStep = {
          step: (workflow?.workflowSteps?.length || 0) + 1,
          role: 'Migration Manager',
          email: managerEmail,
          status: 'approved' as const,
          comments: `Timeline Transition: ${timelineDate[workflowId]}`,
          timestamp: new Date().toISOString()
        };
        
        const updatedSteps = [...(workflow?.workflowSteps || []), newStep];
        await updateWorkflow(workflowId, {
          workflowSteps: updatedSteps,
          currentStep: newStep.step,
          status: 'in_progress'
        });
      } else {
        // Update existing step
        await updateWorkflowStep(workflowId, migrationStep.step, {
          status: 'approved',
          comments: `Timeline Transition: ${timelineDate[workflowId]}`
        });
      }

      alert('✅ Timeline transition set successfully!');
      setTimelineDate(prev => {
        const next = { ...prev };
        delete next[workflowId];
        return next;
      });
      closeDocumentModal();
    } catch (error) {
      console.error('❌ Error setting timeline:', error);
      alert('❌ Failed to set timeline. Please try again.');
      setHasTakenAction(prev => {
        const next = new Set(prev);
        next.delete(workflowId);
        return next;
      });
    } finally {
      setIsActing(false);
    }
  };

  const handleSetServerCount = async (workflowId: string) => {
    if (!numberOfServers[workflowId] || numberOfServers[workflowId] <= 0) {
      alert('Please enter a valid number of servers.');
      return;
    }

    if (isActing) return;
    setIsActing(true);

    try {
      setHasTakenAction(prev => new Set(prev).add(workflowId));
      
      const workflow = workflows.find(w => w.id === workflowId);
      const migrationStep = workflow?.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
      
      if (migrationStep) {
        const updatedComments = migrationStep.comments 
          ? `${migrationStep.comments} | Servers: ${numberOfServers[workflowId]}`
          : `Servers: ${numberOfServers[workflowId]}`;
        
        await updateWorkflowStep(workflowId, migrationStep.step, {
          comments: updatedComments
        });
      }

      alert(`✅ Server count (${numberOfServers[workflowId]}) recorded successfully!`);
      setNumberOfServers(prev => {
        const next = { ...prev };
        delete next[workflowId];
        return next;
      });
    } catch (error) {
      console.error('❌ Error setting server count:', error);
      alert('❌ Failed to set server count. Please try again.');
      setHasTakenAction(prev => {
        const next = new Set(prev);
        next.delete(workflowId);
        return next;
      });
    } finally {
      setIsActing(false);
    }
  };

  const handleApproveMigration = async (workflowId: string) => {
    if (isActing) return;
    setIsActing(true);

    try {
      setHasTakenAction(prev => new Set(prev).add(workflowId));
      
      const workflow = workflows.find(w => w.id === workflowId);
      const migrationStep = workflow?.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
      
      if (migrationStep) {
        await updateWorkflowStep(workflowId, migrationStep.step, {
          status: 'approved',
          comments: migrationStep.comments || 'Migration Manager approved'
        });
      }

      // Notify Account Manager
      const accountManagerStep = workflow?.workflowSteps?.find((s: any) => s.role === 'Account Manager');
      if (accountManagerStep?.email) {
        try {
          await fetch(`${BACKEND_URL}/api/send-manager-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              managerEmail: accountManagerStep.email,
              workflowData: {
                documentId: workflow?.documentId,
                documentType: workflow?.documentType,
                clientName: workflow?.clientName,
                amount: workflow?.amount,
                workflowId: workflow?.id
              }
            })
          });
        } catch {}
      }

      alert('✅ Migration Manager approval recorded. Account Manager has been notified.');
      closeDocumentModal();
    } catch (error) {
      console.error('❌ Error approving migration:', error);
      alert('❌ Failed to approve. Please try again.');
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
    const migrationWorkflows = getMigrationWorkflows();
    let filteredWorkflows = migrationWorkflows;

    if (activeTab === 'timeline') {
      filteredWorkflows = migrationWorkflows.filter(w => {
        const migrationStep = w.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
        return !migrationStep || migrationStep.status === 'pending';
      });
    } else if (activeTab === 'migration') {
      filteredWorkflows = migrationWorkflows.filter(w => {
        const migrationStep = w.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
        return migrationStep?.status === 'approved';
      });
    }

    if (filteredWorkflows.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {React.createElement(tabs.find(t => t.id === activeTab)?.icon || Clock, { className: "w-8 h-8 text-gray-400" })}
          </div>
          <p className="text-gray-500 italic text-lg">
            {activeTab === 'timeline' && 'No workflows ready for timeline transition.'}
            {activeTab === 'migration' && 'No migrations to manage.'}
            {activeTab === 'status' && 'No migration workflows found.'}
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
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Timeline</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Migration Manager</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Account Manager</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Customer</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Servers</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkflows.map((workflow) => {
                const migrationStep = workflow.workflowSteps?.find((s: any) => s.role === 'Migration Manager');
                const accountManagerStep = workflow.workflowSteps?.find((s: any) => s.role === 'Account Manager');
                const customerStep = workflow.workflowSteps?.find((s: any) => s.role === 'Customer');
                
                return (
                  <tr key={workflow.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-4 px-4 text-gray-900 font-medium">{workflow.documentId || 'Unknown'}</td>
                    <td className="py-4 px-4 text-gray-700">{workflow.clientName || 'Unknown'}</td>
                    <td className="py-4 px-4 text-gray-600 text-sm">
                      {migrationStep?.comments?.includes('Timeline') 
                        ? migrationStep.comments.split('Timeline Transition: ')[1]?.split(' |')[0] || 'Not set'
                        : 'Not set'}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        migrationStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        migrationStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {migrationStep?.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        accountManagerStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        accountManagerStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {accountManagerStep?.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        customerStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        customerStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {customerStep?.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-gray-600 text-sm">
                      {migrationStep?.comments?.includes('Servers')
                        ? migrationStep.comments.split('Servers: ')[1] || 'Not set'
                        : 'Not set'}
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
          const accountManagerStep = workflow.workflowSteps?.find((s: any) => s.role === 'Account Manager');
          const customerStep = workflow.workflowSteps?.find((s: any) => s.role === 'Customer');
          
          return (
            <div key={workflow.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${getStatusColor(workflow.status)}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{workflow.documentId || 'Unknown Document'}</h3>
                    <p className="text-sm text-gray-500">{workflow.clientName || 'Unknown Client'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">${(workflow.amount || 0).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Migration Manager</label>
                    <div className="mt-1">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                        migrationStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {migrationStep?.status || 'pending'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Account Manager</label>
                    <div className="mt-1">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                        accountManagerStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {accountManagerStep?.status || 'pending'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Customer</label>
                    <div className="mt-1">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                        customerStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {customerStep?.status || 'pending'}
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
    if (path.includes('migration-manager')) return 'migration';
    return 'migration';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation currentTab={getCurrentTab()} />
      
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200 lg:ml-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <Server className="w-6 h-6 text-purple-600" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900">Migration Manager Portal</h1>
            </div>
            <p className="text-xl text-gray-600">Manage timeline transitions and migration approvals</p>
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:ml-64">
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
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Migration Details</h2>
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
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-purple-600" />
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

              {/* Migration Actions */}
              <div className="space-y-6">
                {activeTab === 'timeline' && (
                  <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      Set Timeline Transition
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Timeline Date</label>
                        <input
                          type="date"
                          value={timelineDate[selectedWorkflow.id] || ''}
                          onChange={(e) => setTimelineDate(prev => ({ ...prev, [selectedWorkflow.id]: e.target.value }))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <button
                        onClick={() => handleSetTimeline(selectedWorkflow.id)}
                        disabled={isActing || !timelineDate[selectedWorkflow.id]}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isActing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Setting Timeline...
                          </>
                        ) : (
                          <>
                            <Calendar className="w-4 h-4" />
                            Set Timeline Transition
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'migration' && (
                  <>
                    <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Server className="w-5 h-5 text-purple-600" />
                        Set Number of Servers
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Number of Servers</label>
                          <input
                            type="number"
                            min="1"
                            value={numberOfServers[selectedWorkflow.id] || ''}
                            onChange={(e) => setNumberOfServers(prev => ({ ...prev, [selectedWorkflow.id]: parseInt(e.target.value) || 0 }))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                            placeholder="Enter number of servers"
                          />
                        </div>
                        <button
                          onClick={() => handleSetServerCount(selectedWorkflow.id)}
                          disabled={isActing || !numberOfServers[selectedWorkflow.id] || numberOfServers[selectedWorkflow.id] <= 0}
                          className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isActing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Server className="w-4 h-4" />
                              Set Server Count
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        Approve Migration
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Approve this migration to notify the Account Manager for customer approval.
                      </p>
                      <button
                        onClick={() => handleApproveMigration(selectedWorkflow.id)}
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
                            <ThumbsUp className="w-4 h-4" />
                            Approve Migration
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MigrationManagerDashboard;
