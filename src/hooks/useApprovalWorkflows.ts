import { useState, useEffect } from 'react';
import { ApprovalWorkflow, ApprovalStep } from '../types/approval';

export const useApprovalWorkflows = () => {
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load workflows from localStorage on mount
  useEffect(() => {
    console.log('🔄 Loading workflows from localStorage on mount...');
    const savedWorkflows = localStorage.getItem('approval_workflows');
    console.log('📦 Raw localStorage data on mount:', savedWorkflows);
    
    if (savedWorkflows) {
      try {
        const parsed = JSON.parse(savedWorkflows);
        console.log('✅ Successfully loaded workflows:', parsed.length, 'workflows');
        console.log('📋 Loaded workflows data:', parsed);
        setWorkflows(parsed);
      } catch (err) {
        console.error('❌ Error loading workflows from localStorage:', err);
        setError('Failed to load workflows');
      }
    } else {
      console.log('⚠️ No workflows found in localStorage on mount');
    }
  }, []);

  // Save workflows to localStorage whenever workflows change
  useEffect(() => {
    console.log('💾 Saving workflows to localStorage:', workflows.length, 'workflows');
    if (workflows.length > 0) {
      localStorage.setItem('approval_workflows', JSON.stringify(workflows));
      console.log('✅ Workflows saved to localStorage');
    } else {
      console.log('⚠️ No workflows to save');
    }
  }, [workflows]);

  const createWorkflow = (workflowData: Omit<ApprovalWorkflow, 'id' | 'createdAt' | 'updatedAt' | 'currentStep' | 'status'>) => {
    console.log('🔄 Creating new workflow:', workflowData);
    
    // Check for duplicate workflows based on documentId and clientName
    const existingWorkflow = workflows.find(w => 
      w.documentId === workflowData.documentId && 
      w.clientName === workflowData.clientName &&
      w.status === 'pending'
    );
    
    if (existingWorkflow) {
      console.log('⚠️ Duplicate workflow detected:', existingWorkflow.id);
      console.log('📋 Existing workflow:', existingWorkflow);
      console.log('🔄 New workflow data:', workflowData);
      alert(`A pending workflow already exists for this document:\n\nDocument: ${workflowData.documentId}\nClient: ${workflowData.clientName}\n\nPlease delete the existing workflow first or use a different document.`);
      return existingWorkflow;
    }
    
    const newWorkflow: ApprovalWorkflow = {
      ...workflowData,
      id: `WF-${Date.now()}`,
      status: 'pending',
      currentStep: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log('✅ New workflow created:', newWorkflow);
    setWorkflows(prev => {
      const updated = [newWorkflow, ...prev];
      console.log('📋 Updated workflows array:', updated.length, 'workflows');
      return updated;
    });
    return newWorkflow;
  };

  const updateWorkflow = (workflowId: string, updates: Partial<ApprovalWorkflow>) => {
    setWorkflows(prev => 
      prev.map(workflow => 
        workflow.id === workflowId 
          ? { ...workflow, ...updates, updatedAt: new Date().toISOString() }
          : workflow
      )
    );
  };

  const updateWorkflowStep = (workflowId: string, stepNumber: number, stepUpdates: Partial<ApprovalStep>) => {
    setWorkflows(prev => 
      prev.map(workflow => {
        if (workflow.id === workflowId) {
          const updatedSteps = workflow.workflowSteps.map(step =>
            step.step === stepNumber 
              ? { ...step, ...stepUpdates, timestamp: new Date().toISOString() }
              : step
          );

          // Update current step and status based on step updates
          let newCurrentStep = workflow.currentStep;
          let newStatus = workflow.status;

          if (stepUpdates.status === 'approved') {
            if (stepNumber < workflow.totalSteps) {
              newCurrentStep = stepNumber + 1;
              newStatus = 'in_progress';
            } else {
              newStatus = 'approved';
            }
          } else if (stepUpdates.status === 'denied') {
            newStatus = 'denied';
          }

          return {
            ...workflow,
            workflowSteps: updatedSteps,
            currentStep: newCurrentStep,
            status: newStatus,
            updatedAt: new Date().toISOString()
          };
        }
        return workflow;
      })
    );
  };

  const deleteWorkflow = (workflowId: string) => {
    console.log('🗑️ Deleting workflow:', workflowId);
    setWorkflows(prev => {
      const filtered = prev.filter(workflow => workflow.id !== workflowId);
      console.log('📋 Workflows after deletion:', filtered.length, 'workflows');
      return filtered;
    });
  };

  const removeDuplicateWorkflows = () => {
    console.log('🔍 Checking for duplicate workflows...');
    const seen = new Set();
    const duplicates: string[] = [];
    
    const uniqueWorkflows = workflows.filter(workflow => {
      const key = `${workflow.documentId}-${workflow.clientName}-${workflow.status}`;
      if (seen.has(key)) {
        duplicates.push(workflow.id);
        return false;
      }
      seen.add(key);
      return true;
    });
    
    if (duplicates.length > 0) {
      console.log('⚠️ Found duplicate workflows:', duplicates);
      setWorkflows(uniqueWorkflows);
      console.log('✅ Removed duplicate workflows. Remaining:', uniqueWorkflows.length);
      alert(`Removed ${duplicates.length} duplicate workflow(s). Remaining: ${uniqueWorkflows.length}`);
    } else {
      console.log('✅ No duplicate workflows found');
      alert('No duplicate workflows found.');
    }
  };

  const getWorkflowById = (workflowId: string) => {
    return workflows.find(workflow => workflow.id === workflowId);
  };

  const getWorkflowsByStatus = (status: ApprovalWorkflow['status']) => {
    return workflows.filter(workflow => workflow.status === status);
  };

  const refreshWorkflows = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      // In a real app, you would fetch from your API here
    } catch (err) {
      setError('Failed to refresh workflows');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    workflows,
    isLoading,
    error,
    createWorkflow,
    updateWorkflow,
    updateWorkflowStep,
    deleteWorkflow,
    removeDuplicateWorkflows,
    getWorkflowById,
    getWorkflowsByStatus,
    refreshWorkflows
  };
};
