import { useState, useEffect } from 'react';
import { ApprovalWorkflow, ApprovalStep } from '../types/approval';

export const useApprovalWorkflows = () => {
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load workflows from localStorage on mount
  useEffect(() => {
    const savedWorkflows = localStorage.getItem('approval_workflows');
    if (savedWorkflows) {
      try {
        setWorkflows(JSON.parse(savedWorkflows));
      } catch (err) {
        console.error('Error loading workflows from localStorage:', err);
        setError('Failed to load workflows');
      }
    }
  }, []);

  // Save workflows to localStorage whenever workflows change
  useEffect(() => {
    if (workflows.length > 0) {
      localStorage.setItem('approval_workflows', JSON.stringify(workflows));
    }
  }, [workflows]);

  const createWorkflow = (workflowData: Omit<ApprovalWorkflow, 'id' | 'createdAt' | 'updatedAt' | 'currentStep' | 'status'>) => {
    const newWorkflow: ApprovalWorkflow = {
      ...workflowData,
      id: `WF-${Date.now()}`,
      status: 'pending',
      currentStep: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setWorkflows(prev => [newWorkflow, ...prev]);
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
    setWorkflows(prev => prev.filter(workflow => workflow.id !== workflowId));
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
    getWorkflowById,
    getWorkflowsByStatus,
    refreshWorkflows
  };
};
