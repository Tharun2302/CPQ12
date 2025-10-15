import React, { useState } from 'react';
import { RefreshCw, Clock, BarChart3, X, FileCheck, CheckCircle, AlertCircle, Trash2, Eye, FileText } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';

interface ApprovalDashboardProps {
}

const ApprovalDashboard: React.FC<ApprovalDashboardProps> = () => {
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const { workflows, deleteWorkflow } = useApprovalWorkflows();
  
  console.log('ApprovalDashboard rendered');
  console.log('📊 Available workflows:', workflows.length);
  console.log('📋 Workflows data:', workflows);

  const tabs = [
    { id: 'pending', label: 'Pending Approvals', icon: Clock, count: workflows.filter(w => w && w.status === 'pending').length },
    { id: 'status', label: 'Workflow Status', icon: BarChart3, count: workflows.length },
    { id: 'denied', label: 'Denied Requests', icon: X, count: workflows.filter(w => w && w.status === 'denied').length },
    { id: 'history', label: 'Approval History', icon: FileCheck, count: workflows.filter(w => w && w.status === 'approved').length }
  ];




  const handleDeleteWorkflow = (workflowId: string, workflowName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete this workflow?\n\nDocument: ${workflowName}\nID: ${workflowId}\n\nThis action cannot be undone.`
    );
    
    if (confirmed) {
      try {
        console.log('🗑️ Deleting workflow:', workflowId);
        deleteWorkflow(workflowId);
        console.log('✅ Workflow deleted successfully');
        alert('Workflow deleted successfully!');
      } catch (error) {
        console.error('❌ Error deleting workflow:', error);
        alert('Failed to delete workflow. Please try again.');
      }
    }
  };


  const handleViewWorkflow = async (workflow: any) => {
    console.log('👁️ Viewing workflow:', workflow);
    setSelectedWorkflow(workflow);
    setShowWorkflowModal(true);
    
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

  const closeWorkflowModal = () => {
    setShowWorkflowModal(false);
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

     // Special handling for Workflow Status tab - show table format
     if (activeTab === 'status') {
       return (
         <div className="overflow-x-auto">
           <table className="w-full border-collapse">
             <thead>
               <tr className="border-b border-gray-200 bg-gray-50">
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Document</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Client</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Manager Status</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Manager Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">CEO Status</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">CEO Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Client Status</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Client Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Created</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
               </tr>
             </thead>
             <tbody>
               {workflows.filter(w => w).map((workflow) => {
                 const createdDate = workflow.createdAt ? new Date(workflow.createdAt) : new Date();
                 const managerStep = workflow.workflowSteps?.find(step => step.role === 'Manager');
                 const ceoStep = workflow.workflowSteps?.find(step => step.role === 'CEO');
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
                         managerStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                         managerStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                         'bg-yellow-100 text-yellow-800'
                       }`}>
                         {managerStep?.status || 'pending'}
                       </span>
                     </td>
                     <td className="py-4 px-4 text-gray-600 text-sm">
                       {managerStep?.comments || 'No comments'}
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

     // Special handling for Approval History tab - show table format
     if (activeTab === 'history') {
       const completedWorkflows = workflows.filter(workflow => 
         workflow && workflow.status === 'approved'
       );

       if (completedWorkflows.length === 0) {
         return (
           <div className="text-center py-12">
             <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
               <FileCheck className="w-8 h-8 text-gray-400" />
             </div>
             <p className="text-gray-500 italic text-lg">No approval history found.</p>
           </div>
         );
       }

       return (
         <div className="overflow-x-auto">
           <table className="w-full border-collapse">
             <thead>
               <tr className="border-b border-gray-200 bg-gray-50">
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Document</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Client</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Final Status</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Manager Decision</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">CEO Decision</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Manager Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">CEO Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Client Decision</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Client Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Completed</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Action</th>
               </tr>
             </thead>
             <tbody>
               {completedWorkflows.map((workflow) => {
                 const completedDate = workflow.updatedAt ? new Date(workflow.updatedAt) : new Date();
                 const managerStep = workflow.workflowSteps?.find(step => step.role === 'Manager');
                 const ceoStep = workflow.workflowSteps?.find(step => step.role === 'CEO');
                 const clientStep = workflow.workflowSteps?.find(step => step.role === 'Client');
                 
                 // Determine final status based on workflow completion
                 const finalStatus = workflow.status === 'approved' ? 'accepted_by_client' : workflow.status;
                 
                 return (
                   <tr key={workflow.id} className="border-b border-gray-100 hover:bg-gray-50">
                     <td className="py-4 px-4 text-gray-900 font-medium">
                       {workflow.documentId || 'Unknown Document'}
                     </td>
                     <td className="py-4 px-4 text-gray-700">
                       {workflow.clientName || 'Unknown Client'}
                     </td>
                     <td className="py-4 px-4 text-gray-700">
                       {finalStatus}
                     </td>
                     <td className="py-4 px-4">
                       <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                         managerStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                         managerStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                         'bg-yellow-100 text-yellow-800'
                       }`}>
                         {managerStep?.status || 'pending'}
                       </span>
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
                       {managerStep?.comments ? (
                         <span className="inline-flex px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                           [{managerStep.comments}]
                         </span>
                       ) : (
                         'No comments'
                       )}
                     </td>
                     <td className="py-4 px-4 text-gray-600 text-sm">
                       {ceoStep?.comments ? (
                         <span className="inline-flex px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                           [{ceoStep.comments}]
                         </span>
                       ) : (
                         'No comments'
                       )}
                     </td>
                     <td className="py-4 px-4 text-gray-700">
                       {clientStep?.status || 'pending'}
                     </td>
                     <td className="py-4 px-4 text-gray-600 text-sm">
                       {clientStep?.comments ? (
                         <span className="inline-flex px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
                           [{clientStep.comments}]
                         </span>
                       ) : (
                         'No comments'
                       )}
                     </td>
                     <td className="py-4 px-4 text-gray-600 text-sm">
                       <div>
                         <div>{completedDate.toLocaleDateString('en-GB')}</div>
                         <div className="text-xs text-gray-500">{completedDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
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

     // Filter workflows for other tabs
     const filteredWorkflows = workflows.filter(workflow => {
       if (!workflow || !workflow.status) return false;
       switch (activeTab) {
         case 'pending': return workflow.status === 'pending';
         case 'denied': return workflow.status === 'denied';
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
             {activeTab === 'pending' && 'No pending approvals found.'}
             {activeTab === 'denied' && 'No denied requests found.'}
           </p>
         </div>
       );
     }

     // Special table format for pending approvals
     if (activeTab === 'pending') {
       return (
         <div className="overflow-x-auto">
           <table className="w-full border-collapse">
             <thead>
               <tr className="border-b border-gray-200">
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Document</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Client</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Type</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Manager Status</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Manager Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">CEO Status</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">CEO Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Client Status</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Client Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Created</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
               </tr>
             </thead>
             <tbody>
               {filteredWorkflows.map((workflow) => {
                 const createdDate = workflow.createdAt ? new Date(workflow.createdAt) : new Date();
                 const managerStep = workflow.workflowSteps?.find(step => step.role === 'Manager');
                 const ceoStep = workflow.workflowSteps?.find(step => step.role === 'CEO');
                 const clientStep = workflow.workflowSteps?.find(step => step.role === 'Client');
                 
                 return (
                   <tr key={workflow.id} className="border-b border-gray-100 hover:bg-gray-50">
                     <td className="py-4 px-4 text-gray-900 font-medium">
                       {workflow.documentId || 'Unknown Document'}
                     </td>
                     <td className="py-4 px-4 text-gray-700">
                       {workflow.clientName || 'Unknown Client'}
                     </td>
                     <td className="py-4 px-4 text-gray-700">
                       {workflow.documentType || 'PDF'}
                     </td>
                     <td className="py-4 px-4">
                       <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                         {managerStep?.status || 'pending'}
                       </span>
                     </td>
                     <td className="py-4 px-4 text-gray-600 text-sm">
                       {managerStep?.comments || 'No comments'}
                     </td>
                     <td className="py-4 px-4">
                       <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                         {ceoStep?.status || 'pending'}
                       </span>
                     </td>
                     <td className="py-4 px-4 text-gray-600 text-sm">
                       {ceoStep?.comments || 'No comments'}
                     </td>
                     <td className="py-4 px-4">
                       <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
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
           const StatusIcon = getStatusIcon(workflow.status || 'pending');
           return (
             <div key={workflow.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
               <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-3">
                   <div className={`p-2 rounded-lg ${getStatusColor(workflow.status || 'pending')}`}>
                     <StatusIcon className="w-5 h-5" />
                   </div>
                   <div>
                     <h3 className="font-semibold text-gray-900">{workflow.documentId || 'Unknown Document'}</h3>
                     <p className="text-sm text-gray-500">{workflow.clientName || 'Unknown Client'}</p>
                   </div>
                 </div>
                 <div className="flex items-center gap-3">
                   <div className="text-right">
                     <p className="text-lg font-bold text-gray-900">${(workflow.amount || 0).toLocaleString()}</p>
                     <p className="text-sm text-gray-500">Step {workflow.currentStep || 1} of {workflow.totalSteps || 3}</p>
                   </div>
                   <button
                     onClick={() => handleDeleteWorkflow(workflow.id, workflow.documentId || 'Unknown Document')}
                     className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                     title="Delete workflow"
                   >
                     <Trash2 className="w-5 h-5" />
                   </button>
                 </div>
               </div>
               
               <div className="mb-4">
                 <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                   <span>Progress</span>
                   <span>{Math.round(((workflow.currentStep || 1) / (workflow.totalSteps || 3)) * 100)}%</span>
                 </div>
                 <div className="w-full bg-gray-200 rounded-full h-2">
                   <div 
                     className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                     style={{ width: `${((workflow.currentStep || 1) / (workflow.totalSteps || 3)) * 100}%` }}
                   ></div>
                 </div>
               </div>

               <div className="space-y-2">
                   {(workflow.workflowSteps || []).map((step: any) => {
                   const StepIcon = getStatusIcon(step.status);
                   return (
                     <div key={step.step} className="flex items-center gap-3 text-sm">
                       <div className={`p-1 rounded ${getStatusColor(step.status)}`}>
                         <StepIcon className="w-4 h-4" />
                       </div>
                       <span className="font-medium">{step.role || 'Unknown'}</span>
                       <span className="text-gray-500">{step.email || 'No email'}</span>
                       {step.timestamp && (
                         <span className="text-gray-400 ml-auto">
                           {new Date(step.timestamp).toLocaleDateString()}
                         </span>
                       )}
                     </div>
                   );
                 })}
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
          <div className="mb-6">
          </div>
          
           <div className="text-center">
             <div className="flex items-center justify-center gap-3 mb-2">
               <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                 <FileCheck className="w-6 h-6 text-blue-600" />
               </div>
               <h1 className="text-4xl font-bold text-gray-900">Admin Approval Tracking</h1>
             </div>
             <p className="text-xl text-gray-600">Manage document approvals and workflow status</p>
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
            <div className="mt-3 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
              Documents Awaiting Approval
            </div>
          </div>
          
          <div className="p-6">
            {renderTabContent()}
          </div>
         </div>
       </div>

       {/* Workflow Details Modal */}
       {showWorkflowModal && selectedWorkflow && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden">
             <div className="flex items-center justify-between p-6 border-b border-gray-200">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                   <FileCheck className="w-5 h-5 text-blue-600" />
                 </div>
                 <div>
                   <h2 className="text-xl font-semibold text-gray-900">Workflow Details</h2>
                   <p className="text-sm text-gray-500">ID: {selectedWorkflow.id}</p>
                 </div>
               </div>
               <button
                 onClick={closeWorkflowModal}
                 className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
               >
                 <X className="w-5 h-5" />
               </button>
             </div>
             
             <div className="p-6 overflow-y-auto max-h-[calc(95vh-120px)]">
               <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                 {/* Basic Information */}
                 <div className="space-y-4">
                   <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
                   <div className="space-y-3">
                     <div>
                       <label className="text-sm font-medium text-gray-600">Document ID</label>
                       <p className="text-gray-900">{selectedWorkflow.documentId || 'Unknown'}</p>
                     </div>
                     <div>
                       <label className="text-sm font-medium text-gray-600">Client Name</label>
                       <p className="text-gray-900">{selectedWorkflow.clientName || 'Unknown'}</p>
                     </div>
                     <div>
                       <label className="text-sm font-medium text-gray-600">Document Type</label>
                       <p className="text-gray-900">{selectedWorkflow.documentType || 'PDF'}</p>
                     </div>
                     <div>
                       <label className="text-sm font-medium text-gray-600">Amount</label>
                       <p className="text-gray-900 font-semibold">${(selectedWorkflow.amount || 0).toLocaleString()}</p>
                     </div>
                     <div>
                       <label className="text-sm font-medium text-gray-600">Status</label>
                       <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                         selectedWorkflow.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                         selectedWorkflow.status === 'approved' ? 'bg-green-100 text-green-800' :
                         selectedWorkflow.status === 'denied' ? 'bg-red-100 text-red-800' :
                         'bg-gray-100 text-gray-800'
                       }`}>
                         {selectedWorkflow.status || 'pending'}
                       </span>
                     </div>
                   </div>
                 </div>

                 {/* Workflow Progress */}
                 <div className="space-y-4">
                   <h3 className="text-lg font-semibold text-gray-900">Workflow Progress</h3>
                   <div className="space-y-3">
                     <div>
                       <label className="text-sm font-medium text-gray-600">Current Step</label>
                       <p className="text-gray-900">Step {selectedWorkflow.currentStep || 1} of {selectedWorkflow.totalSteps || 3}</p>
                     </div>
                     <div>
                       <label className="text-sm font-medium text-gray-600">Progress</label>
                       <div className="mt-2">
                         <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                           <span>Completion</span>
                           <span>{Math.round(((selectedWorkflow.currentStep || 1) / (selectedWorkflow.totalSteps || 3)) * 100)}%</span>
                         </div>
                         <div className="w-full bg-gray-200 rounded-full h-2">
                           <div 
                             className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                             style={{ width: `${((selectedWorkflow.currentStep || 1) / (selectedWorkflow.totalSteps || 3)) * 100}%` }}
                           ></div>
                         </div>
                       </div>
                     </div>
                     <div>
                       <label className="text-sm font-medium text-gray-600">Created</label>
                       <p className="text-gray-900">
                         {selectedWorkflow.createdAt ? new Date(selectedWorkflow.createdAt).toLocaleString() : 'Unknown'}
                       </p>
                     </div>
                     <div>
                       <label className="text-sm font-medium text-gray-600">Last Updated</label>
                       <p className="text-gray-900">
                         {selectedWorkflow.updatedAt ? new Date(selectedWorkflow.updatedAt).toLocaleString() : 'Unknown'}
                       </p>
                     </div>
                   </div>
                 </div>

                 {/* Approval Steps - Small Third Column */}
                 <div className="space-y-4">
                   <h3 className="text-lg font-semibold text-gray-900">Approval Steps</h3>
                   <div className="space-y-2">
                     {(selectedWorkflow.workflowSteps || []).map((step: any, index: number) => {
                       const StepIcon = getStatusIcon(step.status);
                       return (
                         <div key={step.step || index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                           <div className={`p-1.5 rounded-lg ${getStatusColor(step.status)}`}>
                             <StepIcon className="w-4 h-4" />
                           </div>
                           <div className="flex-1 min-w-0">
                             <div className="flex items-center justify-between">
                               <h4 className="font-medium text-gray-900 text-sm truncate">{step.role || 'Unknown Role'}</h4>
                               <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                 step.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                 step.status === 'approved' ? 'bg-green-100 text-green-800' :
                                 step.status === 'denied' ? 'bg-red-100 text-red-800' :
                                 'bg-gray-100 text-gray-800'
                               }`}>
                                 {step.status || 'pending'}
                               </span>
                             </div>
                             <p className="text-xs text-gray-600 mt-1 truncate">{step.email || 'No email provided'}</p>
                             {step.comments && (
                               <p className="text-xs text-gray-500 mt-1 italic truncate">"{step.comments}"</p>
                             )}
                             {step.timestamp && (
                               <p className="text-xs text-gray-400 mt-1">
                                 {new Date(step.timestamp).toLocaleString()}
                               </p>
                             )}
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 </div>

                 {/* Document Preview Section */}
                 <div className="lg:col-span-2">
                 <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Preview</h3>
                 
                 <div className="bg-gray-100 rounded-lg p-4">
                   {isLoadingPreview ? (
                     <div className="text-center py-8">
                       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
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
                             // Download the PDF file
                             const link = document.createElement('a');
                             link.href = documentPreview;
                             link.download = `${selectedWorkflow.documentId || 'document'}.pdf`;
                             link.click();
                           }}
                           className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
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
                           // Try to fetch document again
                           if (selectedWorkflow.documentId) {
                             handleViewWorkflow(selectedWorkflow);
                           }
                         }}
                         className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                       >
                         Retry Loading
                       </button>
                     </div>
                   )}
                 </div>
               </div>
             </div>
           </div>

             <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
               <button
                 onClick={closeWorkflowModal}
                 className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
               >
                 Close
               </button>
               <button
                 onClick={() => {
                   handleDeleteWorkflow(selectedWorkflow.id, selectedWorkflow.documentId || 'Unknown Document');
                   closeWorkflowModal();
                 }}
                 className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
               >
                 Delete Workflow
               </button>
             </div>
           </div>
         </div>
       )}
     </div>
   );
 };
 
 export default ApprovalDashboard;
