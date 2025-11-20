import { useState, useEffect } from 'react';
import { ApprovalWorkflow, ApprovalStep } from '../types/approval';
import { approvalWorkflowServiceMongoDB } from '../services/approvalWorkflowServiceMongoDB';

export const useApprovalWorkflows = () => {
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load workflows from MongoDB on mount
  useEffect(() => {
    loadWorkflowsFromMongoDB();
  }, []);

  const loadWorkflowsFromMongoDB = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('🔄 Loading workflows from MongoDB...');
      const workflows = await approvalWorkflowServiceMongoDB.getAllWorkflows();
      console.log('✅ Successfully loaded workflows from MongoDB:', workflows.length, 'workflows');
      setWorkflows(workflows);
    } catch (err) {
      console.error('❌ Error loading workflows from MongoDB:', err);
      setError('Failed to load workflows from database');
    } finally {
      setIsLoading(false);
    }
  };

  const createWorkflow = async (workflowData: Omit<ApprovalWorkflow, 'id' | 'createdAt' | 'updatedAt' | 'currentStep' | 'status'>) => {
    console.log('🔄 Creating new workflow (duplicates allowed):', workflowData);

    try {
      // Save to MongoDB
      const workflowId = await approvalWorkflowServiceMongoDB.saveWorkflow(workflowData);
      
      const newWorkflow: ApprovalWorkflow = {
        ...workflowData,
        id: workflowId,
        status: 'pending',
        currentStep: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      console.log('✅ New workflow created and saved to MongoDB:', newWorkflow);
      
      // Update local state
      setWorkflows(prev => {
        const updated = [newWorkflow, ...prev];
        console.log('📋 Updated workflows array:', updated.length, 'workflows');
        return updated;
      });
      
      return newWorkflow;
    } catch (error) {
      console.error('❌ Error creating workflow in MongoDB:', error);
      throw error;
    }
  };

  const updateWorkflow = async (workflowId: string, updates: Partial<ApprovalWorkflow>) => {
    try {
      await approvalWorkflowServiceMongoDB.updateWorkflow(workflowId, updates);
      
      setWorkflows(prev => 
        prev.map(workflow => 
          workflow.id === workflowId 
            ? { ...workflow, ...updates, updatedAt: new Date().toISOString() }
            : workflow
        )
      );
    } catch (error) {
      console.error('❌ Error updating workflow in MongoDB:', error);
      throw error;
    }
  };

  const updateWorkflowStep = async (workflowId: string, stepNumber: number, stepUpdates: Partial<ApprovalStep>) => {
    try {
      await approvalWorkflowServiceMongoDB.updateWorkflowStep(workflowId, stepNumber, stepUpdates);
      
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
    } catch (error) {
      console.error('❌ Error updating workflow step in MongoDB:', error);
      throw error;
    }
  };

  const deleteWorkflow = async (workflowId: string) => {
    try {
      await approvalWorkflowServiceMongoDB.deleteWorkflow(workflowId);
      
      console.log('🗑️ Deleting workflow:', workflowId);
      setWorkflows(prev => {
        const filtered = prev.filter(workflow => workflow.id !== workflowId);
        console.log('📋 Workflows after deletion:', filtered.length, 'workflows');
        return filtered;
      });
    } catch (error) {
      console.error('❌ Error deleting workflow from MongoDB:', error);
      throw error;
    }
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
    await loadWorkflowsFromMongoDB();
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
