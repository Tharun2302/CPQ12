import React, { useState } from 'react';
import { RefreshCw, Clock, BarChart3, X, FileCheck, CheckCircle, AlertCircle, Trash2, Eye, FileText, Loader2 } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import { BACKEND_URL } from '../config/api';

interface ApprovalDashboardProps {
}

const ApprovalDashboard: React.FC<ApprovalDashboardProps> = () => {
  const [activeTab, setActiveTab] = useState('status');
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isDeleting, setIsDeleting] = useState(false);
  const { workflows, deleteWorkflow } = useApprovalWorkflows();
  
  console.log('ApprovalDashboard rendered');
  console.log('📊 Available workflows:', workflows.length);
  console.log('📋 Workflows data:', workflows);

  const tabs = [
    { id: 'status', label: 'Workflow Status', icon: BarChart3, count: workflows.length },
    { id: 'history', label: 'Approval History', icon: FileCheck, count: workflows.filter(w => w && w.status === 'approved').length }
  ];

  // Filter workflows based on selected filters
  const getFilteredWorkflows = () => {
    let filtered = workflows.filter(w => w);

    // Apply status filter
    if (statusFilter === 'denied') {
      filtered = filtered.filter(w => w.status === 'denied');
    } else if (statusFilter === 'approved') {
      filtered = filtered.filter(w => w.status === 'approved');
    } else if (statusFilter === 'pending') {
      filtered = filtered.filter(w => w.status === 'pending' || w.status === 'in_progress');
    }

    // Apply role filter
    if (roleFilter === 'team_approved') {
      filtered = filtered.filter(w => {
        const teamStep = w.workflowSteps?.find(step => step.role === 'Team Approval');
        return teamStep?.status === 'approved';
      });
    } else if (roleFilter === 'team_denied') {
      filtered = filtered.filter(w => {
        const teamStep = w.workflowSteps?.find(step => step.role === 'Team Approval');
        return teamStep?.status === 'denied';
      });
    } else if (roleFilter === 'team_pending') {
      filtered = filtered.filter(w => {
        const teamStep = w.workflowSteps?.find(step => step.role === 'Team Approval');
        return teamStep?.status === 'pending';
      });
    } else if (roleFilter === 'role1_approved') {
      filtered = filtered.filter(w => {
        const role1Step = w.workflowSteps?.find(step => step.role === 'Technical Team');
        return role1Step?.status === 'approved';
      });
    } else if (roleFilter === 'role1_denied') {
      filtered = filtered.filter(w => {
        const role1Step = w.workflowSteps?.find(step => step.role === 'Technical Team');
        return role1Step?.status === 'denied';
      });
    } else if (roleFilter === 'role1_pending') {
      filtered = filtered.filter(w => {
        const role1Step = w.workflowSteps?.find(step => step.role === 'Technical Team');
        return role1Step?.status === 'pending';
      });
    } else if (roleFilter === 'role2_approved') {
      filtered = filtered.filter(w => {
        const role2Step = w.workflowSteps?.find(step => step.role === 'Legal Team');
        return role2Step?.status === 'approved';
      });
    } else if (roleFilter === 'role2_denied') {
      filtered = filtered.filter(w => {
        const role2Step = w.workflowSteps?.find(step => step.role === 'Legal Team');
        return role2Step?.status === 'denied';
      });
    } else if (roleFilter === 'role2_pending') {
      filtered = filtered.filter(w => {
        const role2Step = w.workflowSteps?.find(step => step.role === 'Legal Team');
        return role2Step?.status === 'pending';
      });
    }

    return filtered;
  };




  const handleDeleteWorkflow = async (workflowId: string, workflowName: string) => {
    if (isDeleting) return; // Prevent double-clicks
    
    const confirmed = window.confirm(
      `Are you sure you want to delete this workflow?\n\nDocument: ${workflowName}\nID: ${workflowId}\n\nThis action cannot be undone.`
    );
    
    if (confirmed) {
      setIsDeleting(true);
      try {
        console.log('🗑️ Deleting workflow:', workflowId);
        await deleteWorkflow(workflowId);
        console.log('✅ Workflow deleted successfully');
        alert('Workflow deleted successfully!');
      } catch (error) {
        console.error('❌ Error deleting workflow:', error);
        alert('Failed to delete workflow. Please try again.');
      } finally {
        setIsDeleting(false);
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
      setPreviewError(null);
      
      try {
        console.log('🔄 Fetching document preview for:', workflow.documentId);
        const response = await fetch(`${BACKEND_URL}/api/documents/${workflow.documentId}/preview`);
        
        console.log('📡 Response status:', response.status);
        console.log('📡 Response ok:', response.ok);
        
        if (!response.ok) {
          // If 404 or other error, try fallback method
          if (response.status === 404) {
            console.log('⚠️ Preview endpoint returned 404, trying fallback method...');
            throw new Error(`HTTP error! status: ${response.status}`);
          } else {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
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
            const directResponse = await fetch(`${BACKEND_URL}/api/documents/${workflow.documentId}`);
            if (directResponse.ok) {
              const blob = await directResponse.blob();
              const url = URL.createObjectURL(blob);
              setDocumentPreview(url);
              console.log('✅ Document loaded via fallback method');
            } else {
              console.log('⚠️ Fallback method also returned error:', directResponse.status);
              setPreviewError(`Document not found (Status: ${directResponse.status})`);
            }
          } catch (fallbackError) {
            console.error('❌ Fallback method also failed:', fallbackError);
            setPreviewError('Failed to load document. The document may not exist in the system.');
          }
        }
      } catch (error) {
        console.error('❌ Error fetching document preview:', error);
        console.error('❌ Error details:', (error as Error).message);
        
        // Fallback: Try to load document directly if preview endpoint failed
        if ((error as Error).message.includes('404') || (error as Error).message.includes('HTTP error')) {
          console.log('🔄 Attempting direct document fetch as fallback...');
          try {
            const directResponse = await fetch(`${BACKEND_URL}/api/documents/${workflow.documentId}`);
            if (directResponse.ok) {
              const blob = await directResponse.blob();
              const url = URL.createObjectURL(blob);
              setDocumentPreview(url);
              setPreviewError(null);
              console.log('✅ Document loaded via direct fallback method');
            } else {
              console.log('⚠️ Direct fallback also failed with status:', directResponse.status);
              setPreviewError(`Document not found. The document with ID "${workflow.documentId}" may not exist in the system.`);
            }
          } catch (fallbackError) {
            console.error('❌ Direct fallback method also failed:', fallbackError);
            setPreviewError('Unable to load document. Please check if the document exists and try again.');
          }
        } else {
          setPreviewError('An error occurred while loading the document. Please try again.');
        }
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
    setPreviewError(null);
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
       const filteredWorkflows = getFilteredWorkflows();
       return (
         <div>
           {/* Filter Controls */}
           <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
             <div className="flex flex-col sm:flex-row gap-3">
               <div className="flex-1">
                 <label className="block text-sm font-medium text-gray-700 mb-2">
                   Filter by Status:
                 </label>
                 <select
                   value={statusFilter}
                   onChange={(e) => setStatusFilter(e.target.value)}
                   className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm font-medium"
                 >
                   <option value="all">All Statuses</option>
                   <option value="pending">Pending/In Progress</option>
                   <option value="approved">Approved</option>
                   <option value="denied">Denied</option>
                 </select>
               </div>
               
               <div className="flex-1">
                 <label className="block text-sm font-medium text-gray-700 mb-2">
                   Filter by Role Approval:
                 </label>
                 <select
                   value={roleFilter}
                   onChange={(e) => setRoleFilter(e.target.value)}
                   className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm font-medium"
                 >
                   <option value="all">All Roles</option>
                   <optgroup label="Team Approval">
                     <option value="team_approved">Team Approved</option>
                     <option value="team_denied">Team Denied</option>
                     <option value="team_pending">Team Pending</option>
                   </optgroup>
                   <optgroup label="Technical Team">
                     <option value="role1_approved">Technical Team Approved</option>
                     <option value="role1_denied">Technical Team Denied</option>
                     <option value="role1_pending">Technical Team Pending</option>
                   </optgroup>
                  <optgroup label="Legal Team">
                     <option value="role2_approved">Legal Team Approved</option>
                     <option value="role2_denied">Legal Team Denied</option>
                     <option value="role2_pending">Legal Team Pending</option>
                   </optgroup>
                 </select>
               </div>
               
               <div className="flex items-end">
                 <button
                   onClick={() => {
                     setStatusFilter('all');
                     setRoleFilter('all');
                   }}
                   className="px-6 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 shadow-sm"
                 >
                   Clear Filters
                 </button>
               </div>
             </div>
             
             <div className="mt-3 flex items-center justify-between">
               <div className="text-sm text-gray-600">
                 <span className="text-blue-600 font-semibold">{filteredWorkflows.length}</span> of <span className="font-medium">{workflows.length}</span> workflows
                 {(statusFilter !== 'all' || roleFilter !== 'all') && (
                   <span className="ml-2 text-green-600">
                     (filtered)
                   </span>
                 )}
               </div>
               {(statusFilter !== 'all' || roleFilter !== 'all') && (
                 <div className="flex items-center gap-2">
                   {statusFilter !== 'all' && (
                     <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                       Status: {statusFilter === 'pending' ? 'Pending/In Progress' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                     </span>
                   )}
                   {roleFilter !== 'all' && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full font-medium">
                      Role: {roleFilter.replace('role1_', 'Technical Team ').replace('role2_', 'Legal Team ').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                   )}
                 </div>
               )}
             </div>
           </div>
           
           <div className="overflow-x-auto w-full">
           <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm min-w-full">
             <thead>
               <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
                 <th className="text-left py-4 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Document</th>
                 <th className="text-left py-4 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Client</th>
                  <th className="text-left py-4 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Team Status</th>
                  <th className="text-left py-4 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Team Comments</th>
                 <th className="text-left py-4 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Technical Team Status</th>
                 <th className="text-left py-4 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Technical Team Comments</th>
                 <th className="text-left py-4 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Legal Team Status</th>
                <th className="text-left py-4 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Legal Team Comments</th>
                <th className="text-left py-4 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Deal Desk Status</th>
                 <th className="text-left py-4 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Created</th>
                 <th className="text-left py-4 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Actions</th>
               </tr>
             </thead>
             <tbody>
               {filteredWorkflows.map((workflow) => {
                 const createdDate = workflow.createdAt ? new Date(workflow.createdAt) : new Date();
                  const teamStep = workflow.workflowSteps?.find(step => step.role === 'Team Approval');
                 const technicalTeamStep = workflow.workflowSteps?.find(step => step.role === 'Technical Team');
                 const legalTeamStep = workflow.workflowSteps?.find(step => step.role === 'Legal Team');
                 const dealDeskStep = workflow.workflowSteps?.find(step => step.role === 'Deal Desk');
                 
                 return (
                   <tr key={workflow.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors duration-200">
                     <td className="py-4 px-6 text-gray-900 font-semibold">
                       <span className="text-blue-600 font-mono text-sm">{workflow.documentId || 'Unknown Document'}</span>
                     </td>
                     <td className="py-4 px-6 text-gray-700 font-medium">
                       {workflow.clientName || 'Unknown Client'}
                     </td>
                   <td className="py-4 px-6">
                     <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold ${
                       teamStep?.status === 'approved' ? 'bg-green-100 text-green-800 border border-green-200' :
                       teamStep?.status === 'denied' ? 'bg-red-100 text-red-800 border border-red-200' :
                       'bg-yellow-100 text-yellow-800 border border-yellow-200'
                     }`}>
                       {teamStep?.status || 'pending'}
                     </span>
                   </td>
                   <td className="py-4 px-6 text-gray-600 text-sm">
                     {teamStep
                       ? [teamStep.group, teamStep.comments].filter(Boolean).join(' - ') || 'No comments'
                       : 'No comments'}
                   </td>
                     <td className="py-4 px-6">
                       <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold ${
                         technicalTeamStep?.status === 'approved' ? 'bg-green-100 text-green-800 border border-green-200' :
                         technicalTeamStep?.status === 'denied' ? 'bg-red-100 text-red-800 border border-red-200' :
                         'bg-yellow-100 text-yellow-800 border border-yellow-200'
                       }`}>
                         {technicalTeamStep?.status || 'pending'}
                       </span>
                     </td>
                     <td className="py-4 px-6 text-gray-600 text-sm">
                       {technicalTeamStep?.comments || 'No comments'}
                     </td>
                     <td className="py-4 px-6">
                       <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold ${
                         legalTeamStep?.status === 'approved' ? 'bg-green-100 text-green-800 border border-green-200' :
                         legalTeamStep?.status === 'denied' ? 'bg-red-100 text-red-800 border border-red-200' :
                         'bg-yellow-100 text-yellow-800 border border-yellow-200'
                       }`}>
                         {legalTeamStep?.status || 'pending'}
                       </span>
                     </td>
                     <td className="py-4 px-6 text-gray-600 text-sm">
                       {legalTeamStep?.comments || 'No comments'}
                     </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold ${
                        (dealDeskStep?.comments || '').toLowerCase().includes('notified')
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                      }`}>
                        {(dealDeskStep?.comments || '').toLowerCase().includes('notified') ? 'Notified' : 'Pending'}
                      </span>
                    </td>
                     <td className="py-4 px-6 text-gray-600 text-sm">
                       <div>
                         <div>{createdDate.toLocaleDateString('en-GB')}</div>
                         <div className="text-xs text-gray-500">{createdDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                       </div>
                     </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewWorkflow(workflow)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                      </div>
                    </td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
           </div>
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
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Technical Team Decision</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Legal Team Decision</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Deal Desk Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Technical Team Comments</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Legal Team Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Completed</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Action</th>
               </tr>
             </thead>
             <tbody>
               {completedWorkflows.map((workflow) => {
                 const completedDate = workflow.updatedAt ? new Date(workflow.updatedAt) : new Date();
                const technicalTeamStep = workflow.workflowSteps?.find(step => step.role === 'Technical Team');
                const legalTeamStep = workflow.workflowSteps?.find(step => step.role === 'Legal Team');
                const dealDeskStep = workflow.workflowSteps?.find(step => step.role === 'Deal Desk');
                 
                 
                 return (
                   <tr key={workflow.id} className="border-b border-gray-100 hover:bg-gray-50">
                     <td className="py-4 px-6 text-gray-900 font-medium">
                       {workflow.documentId || 'Unknown Document'}
                     </td>
                     <td className="py-4 px-6 text-gray-700">
                       {workflow.clientName || 'Unknown Client'}
                     </td>
                     <td className="py-4 px-6">
                       <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                         technicalTeamStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                         technicalTeamStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                         'bg-yellow-100 text-yellow-800'
                       }`}>
                         {technicalTeamStep?.status || 'pending'}
                       </span>
                     </td>
                     <td className="py-4 px-6">
                       <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                         legalTeamStep?.status === 'approved' ? 'bg-green-100 text-green-800' :
                         legalTeamStep?.status === 'denied' ? 'bg-red-100 text-red-800' :
                         'bg-yellow-100 text-yellow-800'
                       }`}>
                         {legalTeamStep?.status || 'pending'}
                       </span>
                     </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        (dealDeskStep?.comments || '').toLowerCase().includes('notified')
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {(dealDeskStep?.comments || '').toLowerCase().includes('notified') ? 'Notified' : 'Pending'}
                      </span>
                    </td>
                     <td className="py-4 px-6 text-gray-600 text-sm">
                       {technicalTeamStep?.comments ? (
                         <span className="inline-flex px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                           [{technicalTeamStep.comments}]
                         </span>
                       ) : (
                         'No comments'
                       )}
                     </td>
                     <td className="py-4 px-6 text-gray-600 text-sm">
                       {legalTeamStep?.comments ? (
                         <span className="inline-flex px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                           [{legalTeamStep.comments}]
                         </span>
                       ) : (
                         'No comments'
                       )}
                     </td>
                    
                     <td className="py-4 px-6 text-gray-600 text-sm">
                       <div>
                         <div>{completedDate.toLocaleDateString('en-GB')}</div>
                         <div className="text-xs text-gray-500">{completedDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                       </div>
                     </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewWorkflow(workflow)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                      </div>
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
           </p>
         </div>
       );
     }

     // Special table format for pending approvals
     if (false) { // Removed pending tab
       return (
         <div className="overflow-x-auto">
           <table className="w-full border-collapse">
             <thead>
              <tr className="border-b border-gray-200">
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Document</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Client</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Type</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Technical Team Status</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Technical Team Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Legal Team Status</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Legal Team Comments</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Created</th>
                 <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
               </tr>
             </thead>
             <tbody>
               {filteredWorkflows.map((workflow) => {
                 const createdDate = workflow.createdAt ? new Date(workflow.createdAt) : new Date();
                const technicalTeamStep = workflow.workflowSteps?.find(step => step.role === 'Technical Team');
                const legalTeamStep = workflow.workflowSteps?.find(step => step.role === 'Legal Team');
                 
                 return (
                   <tr key={workflow.id} className="border-b border-gray-100 hover:bg-gray-50">
                     <td className="py-4 px-6 text-gray-900 font-medium">
                       {workflow.documentId || 'Unknown Document'}
                     </td>
                     <td className="py-4 px-6 text-gray-700">
                       {workflow.clientName || 'Unknown Client'}
                     </td>
                     <td className="py-4 px-6 text-gray-700">
                       {workflow.documentType || 'PDF'}
                     </td>
                     <td className="py-4 px-6">
                       <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                         {technicalTeamStep?.status || 'pending'}
                       </span>
                     </td>
                     <td className="py-4 px-6 text-gray-600 text-sm">
                       {technicalTeamStep?.comments || 'No comments'}
                     </td>
                     <td className="py-4 px-6">
                       <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                         {legalTeamStep?.status || 'pending'}
                       </span>
                     </td>
                     <td className="py-4 px-6 text-gray-600 text-sm">
                       {legalTeamStep?.comments || 'No comments'}
                     </td>
                    
                     <td className="py-4 px-6 text-gray-600 text-sm">
                       <div>
                         <div>{createdDate.toLocaleDateString('en-GB')}</div>
                         <div className="text-xs text-gray-500">{createdDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                       </div>
                     </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewWorkflow(workflow)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                      </div>
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
                   <span>{Math.round(((workflow.currentStep || 1) / 3) * 100)}%</span>
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
    <div className="h-screen bg-gray-50 w-full flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-2">
        </div>
      </div>

      {/* Clean Sub-Navigation Tabs */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex space-x-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-6 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all duration-300 border-0 ${
                    isActive
                      ? 'bg-sky-200 text-sky-800 shadow-lg transform scale-105'
                      : 'bg-white text-gray-700 hover:bg-gray-100 hover:shadow-md'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      isActive 
                        ? 'bg-white/30 text-white border border-white/40' 
                        : 'bg-sky-200 text-sky-800 border border-sky-300'
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
      <div className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-4 overflow-hidden">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden w-full h-full flex flex-col">
          
          <div className="flex-1 p-6 overflow-auto">
            {renderTabContent()}
          </div>
         </div>
       </div>

       {/* Enhanced Workflow Details Modal */}
       {showWorkflowModal && selectedWorkflow && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
           <div className="bg-white rounded-2xl shadow-2xl border border-gray-200/50 max-w-7xl w-full max-h-[95vh] overflow-hidden transform transition-all duration-300 scale-100">
             {/* Enhanced Header */}
             <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-blue-50/30">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                   <FileCheck className="w-6 h-6 text-white" />
                 </div>
                 <div>
                   <h2 className="text-xl font-bold text-gray-900">Workflow Details</h2>
                   <p className="text-sm text-gray-600 font-mono mt-0.5">ID: {selectedWorkflow.id}</p>
                 </div>
               </div>
               <button
                 onClick={closeWorkflowModal}
                 className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-gray-300"
                 aria-label="Close modal"
               >
                 <X className="w-5 h-5" />
               </button>
             </div>
             
             <div className="p-6 overflow-y-auto max-h-[calc(95vh-200px)]">
               {/* Enhanced Top Section - 4 Column Grid for Information */}
               <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
                 {/* Enhanced Basic Information Card */}
                 <div className="space-y-4 bg-gradient-to-br from-gray-50 to-white rounded-xl p-5 border border-gray-200 shadow-sm">
                   <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                     <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                     Basic Information
                   </h3>
                   <div className="space-y-4">
                     <div>
                       <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Document ID</label>
                       <p className="text-gray-900 font-medium mt-1">{selectedWorkflow.documentId || 'Unknown'}</p>
                     </div>
                     <div>
                       <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client Name</label>
                       <p className="text-gray-900 font-semibold text-base mt-1">{selectedWorkflow.clientName || 'Unknown'}</p>
                     </div>
                     <div>
                       <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Document Type</label>
                       <p className="text-gray-900 font-medium mt-1">{selectedWorkflow.documentType || 'PDF'} Agreement</p>
                     </div>
                     <div>
                       <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</label>
                       <p className="text-gray-900 font-bold text-lg mt-1">${(selectedWorkflow.amount || 0).toLocaleString()}</p>
                     </div>
                     <div>
                       <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Status</label>
                       <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold border ${
                         selectedWorkflow.status === 'pending' || selectedWorkflow.status === 'in_progress' 
                           ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                         selectedWorkflow.status === 'approved' 
                           ? 'bg-green-100 text-green-800 border-green-200' :
                         selectedWorkflow.status === 'denied' 
                           ? 'bg-red-100 text-red-800 border-red-200' :
                         'bg-gray-100 text-gray-800 border-gray-200'
                       }`}>
                         {selectedWorkflow.status || 'pending'}
                       </span>
                     </div>
                   </div>
                 </div>

                 {/* Enhanced Workflow Progress Card */}
                 <div className="space-y-4 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 rounded-xl p-5 border border-blue-200/50 shadow-sm">
                   <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                     <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                     Workflow Progress
                   </h3>
                   <div className="space-y-4">
                     <div>
                       <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Step</label>
                       <p className="text-gray-900 font-semibold mt-1">Step {selectedWorkflow.currentStep || 1} of {selectedWorkflow.totalSteps || 3}</p>
                     </div>
                     <div>
                       <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Progress</label>
                       <div className="mt-2">
                         <div className="flex items-center justify-between text-sm font-semibold text-gray-700 mb-2">
                           <span>Completion</span>
                           <span className="text-indigo-600">{Math.round(((selectedWorkflow.currentStep || 1) / (selectedWorkflow.totalSteps || 3)) * 100)}%</span>
                         </div>
                         <div className="w-full bg-gray-200 rounded-full h-3 shadow-inner">
                           <div 
                             className="bg-gradient-to-r from-blue-600 to-indigo-600 h-3 rounded-full transition-all duration-500 shadow-sm"
                             style={{ width: `${((selectedWorkflow.currentStep || 1) / (selectedWorkflow.totalSteps || 3)) * 100}%` }}
                           ></div>
                         </div>
                       </div>
                     </div>
                     <div>
                       <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</label>
                       <p className="text-gray-900 font-medium text-sm mt-1">
                         {selectedWorkflow.createdAt ? new Date(selectedWorkflow.createdAt).toLocaleString() : 'Unknown'}
                       </p>
                     </div>
                     <div>
                       <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Updated</label>
                       <p className="text-gray-900 font-medium text-sm mt-1">
                         {selectedWorkflow.updatedAt ? new Date(selectedWorkflow.updatedAt).toLocaleString() : 'Unknown'}
                       </p>
                     </div>
                   </div>
                 </div>

                 {/* Enhanced Approval Steps Card */}
                 <div className="space-y-4 bg-gradient-to-br from-purple-50/50 to-pink-50/50 rounded-xl p-5 border border-purple-200/50 shadow-sm lg:col-span-2">
                   <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                     <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                     Approval Steps
                   </h3>
                   <div className="space-y-3">
                     {(selectedWorkflow.workflowSteps || []).filter((step: any) => step.role !== 'E-signed').map((step: any, index: number) => {
                       const StepIcon = getStatusIcon(step.status);
                       return (
                         <div key={step.step || index} className="flex items-center gap-3 p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300">
                           <div className={`p-2 rounded-lg shadow-sm ${getStatusColor(step.status)}`}>
                             <StepIcon className="w-5 h-5" />
                           </div>
                           <div className="flex-1 min-w-0">
                             <div className="flex items-center justify-between mb-1">
                               <h4 className="font-semibold text-gray-900 text-sm truncate">{step.role || 'Unknown Role'}</h4>
                               <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                 step.status === 'pending' 
                                   ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                 step.status === 'approved' 
                                   ? 'bg-green-100 text-green-800 border-green-200' :
                                 step.status === 'denied' 
                                   ? 'bg-red-100 text-red-800 border-red-200' :
                                 'bg-gray-100 text-gray-800 border-gray-200'
                               }`}>
                                 {step.status || 'pending'}
                               </span>
                             </div>
                             <p className="text-xs text-gray-600 mt-1 truncate font-medium">{step.email || 'No email provided'}</p>
                             {step.comments && (
                               <p className="text-xs text-gray-500 mt-2 italic bg-gray-50 px-2 py-1 rounded border border-gray-200">
                                 "{step.comments}"
                               </p>
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
               </div>

               {/* Enhanced Document Preview Section */}
               <div className="w-full mt-6">
                 <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                   <FileText className="w-5 h-5 text-blue-600" />
                   Document Preview
                 </h3>
                 
                 <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 shadow-inner">
                   {isLoadingPreview ? (
                     <div className="text-center py-12">
                       <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
                         <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
                       </div>
                       <p className="text-gray-700 font-medium">Loading document preview...</p>
                       <p className="text-gray-500 text-sm mt-2">Please wait</p>
                     </div>
                   ) : documentPreview ? (
                     <div className="space-y-4">
                       <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
                         <iframe
                           src={documentPreview}
                           className="w-full h-[70vh] border-0"
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
                           className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105"
                         >
                           <FileText className="w-4 h-4" />
                           Download PDF
                         </button>
                       </div>
                     </div>
                   ) : (
                     <div className="text-center py-12">
                       <div className="w-40 h-48 bg-white rounded-xl shadow-md mx-auto mb-6 flex items-center justify-center border-2 border-dashed border-gray-300">
                         <FileText className="w-20 h-20 text-gray-300" />
                       </div>
                       <p className="text-gray-700 font-medium text-base mb-2">
                         Document preview not available
                       </p>
                       {previewError ? (
                         <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                           <div className="flex items-start gap-3">
                             <div className="flex-shrink-0">
                               <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                             </div>
                             <div className="flex-1">
                               <p className="text-red-800 font-semibold text-sm mb-2">
                                 Document Not Found
                               </p>
                               <p className="text-red-700 text-sm mb-3">
                                 {previewError}
                               </p>
                               <div className="bg-white rounded border border-red-200 p-3 space-y-2">
                                 <div className="text-xs">
                                   <span className="font-semibold text-gray-700">Document ID:</span>
                                   <span className="font-mono text-gray-900 ml-2">{selectedWorkflow.documentId}</span>
                                 </div>
                                 {selectedWorkflow.clientName && (
                                   <div className="text-xs">
                                     <span className="font-semibold text-gray-700">Client:</span>
                                     <span className="text-gray-900 ml-2">{selectedWorkflow.clientName}</span>
                                   </div>
                                 )}
                                 {selectedWorkflow.amount && (
                                   <div className="text-xs">
                                     <span className="font-semibold text-gray-700">Amount:</span>
                                     <span className="text-gray-900 ml-2">${(selectedWorkflow.amount || 0).toLocaleString()}</span>
                                   </div>
                                 )}
                               </div>
                               <div className="mt-3 space-y-2">
                                 <p className="text-red-600 text-xs font-semibold">
                                   Possible causes:
                                 </p>
                                 <ul className="text-red-600 text-xs space-y-1 ml-4 list-disc">
                                   <li>The document may not have been saved when the workflow was created</li>
                                   <li>The document may have been deleted from the database</li>
                                   <li>There may be a mismatch between the workflow document ID and the saved document</li>
                                 </ul>
                                 <p className="text-red-600 text-xs mt-2 italic">
                                   💡 Tip: Check the "Documents" page to see if this document exists. If not, you may need to recreate the workflow with a valid document.
                                 </p>
                               </div>
                             </div>
                           </div>
                         </div>
                       ) : (
                         <p className="text-gray-500 text-sm mb-6">
                           The document could not be loaded. Please try again.
                         </p>
                       )}
                       <button
                         onClick={() => {
                           // Try to fetch document again
                           if (selectedWorkflow.documentId) {
                             handleViewWorkflow(selectedWorkflow);
                           }
                         }}
                         className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 transform hover:scale-105 mx-auto"
                       >
                         <RefreshCw className="w-4 h-4" />
                         Retry Loading
                       </button>
                     </div>
                   )}
                 </div>
               </div>
             </div>

             {/* Enhanced Footer */}
             <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50">
               <button
                 onClick={closeWorkflowModal}
                 className="px-6 py-3 text-gray-700 font-semibold border-2 border-gray-300 rounded-lg hover:bg-gray-100 hover:border-gray-400 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gray-300"
               >
                 Close
               </button>
               <button
                 onClick={async () => {
                   await handleDeleteWorkflow(selectedWorkflow.id, selectedWorkflow.documentId || 'Unknown Document');
                   closeWorkflowModal();
                 }}
                 disabled={isDeleting}
                 className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:from-red-700 hover:to-red-800 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
               >
                 {isDeleting ? (
                   <>
                     <Loader2 className="w-5 h-5 animate-spin" />
                     <span>Deleting...</span>
                   </>
                 ) : (
                   <>
                     <Trash2 className="w-5 h-5" />
                     <span>Delete Workflow</span>
                   </>
                 )}
               </button>
             </div>
           </div>
         </div>
       )}
     </div>
   );
 };
 
 export default ApprovalDashboard;
