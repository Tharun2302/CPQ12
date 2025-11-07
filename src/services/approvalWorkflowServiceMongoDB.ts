// MongoDB service for approval workflows
import { ApprovalWorkflow, ApprovalStep } from '../types/approval';
import { BACKEND_URL } from '../config/api';

class ApprovalWorkflowServiceMongoDB {
  private baseUrl = `${BACKEND_URL}/api`;

  // Save workflow to MongoDB
  async saveWorkflow(workflow: Omit<ApprovalWorkflow, 'id' | 'createdAt' | 'updatedAt' | 'currentStep' | 'status'>): Promise<string> {
    try {
      console.log('💾 Saving workflow to MongoDB:', workflow);
      
      const response = await fetch(`${this.baseUrl}/approval-workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(workflow)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save workflow');
      }

      const result = await response.json();
      console.log('✅ Workflow saved to MongoDB:', result.workflowId);
      return result.workflowId;
    } catch (error) {
      console.error('❌ Error saving workflow to MongoDB:', error);
      throw error;
    }
  }

  // Get all workflows from MongoDB
  async getAllWorkflows(): Promise<ApprovalWorkflow[]> {
    try {
      console.log('📄 Fetching workflows from MongoDB...');
      
      const response = await fetch(`${this.baseUrl}/approval-workflows`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch workflows');
      }

      const result = await response.json();
      console.log(`✅ Fetched ${result.workflows.length} workflows from MongoDB`);
      return result.workflows;
    } catch (error) {
      console.error('❌ Error fetching workflows from MongoDB:', error);
      return [];
    }
  }

  // Get workflow by ID
  async getWorkflow(workflowId: string): Promise<ApprovalWorkflow | null> {
    try {
      console.log('📄 Fetching workflow from MongoDB:', workflowId);
      
      const response = await fetch(`${this.baseUrl}/approval-workflows/${workflowId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch workflow');
      }

      const result = await response.json();
      console.log('✅ Workflow fetched from MongoDB:', result.workflow);
      return result.workflow;
    } catch (error) {
      console.error('❌ Error fetching workflow from MongoDB:', error);
      return null;
    }
  }

  // Update workflow in MongoDB
  async updateWorkflow(workflowId: string, updates: Partial<ApprovalWorkflow>): Promise<void> {
    try {
      console.log('📝 Updating workflow in MongoDB:', workflowId, updates);
      
      const response = await fetch(`${this.baseUrl}/approval-workflows/${workflowId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update workflow');
      }

      console.log('✅ Workflow updated in MongoDB');
    } catch (error) {
      console.error('❌ Error updating workflow in MongoDB:', error);
      throw error;
    }
  }

  // Update workflow step in MongoDB
  async updateWorkflowStep(workflowId: string, stepNumber: number, stepUpdates: Partial<ApprovalStep>): Promise<void> {
    try {
      console.log('📝 Updating workflow step in MongoDB:', workflowId, stepNumber, stepUpdates);
      
      const response = await fetch(`${this.baseUrl}/approval-workflows/${workflowId}/step/${stepNumber}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stepUpdates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update workflow step');
      }

      console.log('✅ Workflow step updated in MongoDB');
    } catch (error) {
      console.error('❌ Error updating workflow step in MongoDB:', error);
      throw error;
    }
  }

  // Delete workflow from MongoDB
  async deleteWorkflow(workflowId: string): Promise<void> {
    try {
      console.log('🗑️ Deleting workflow from MongoDB:', workflowId);
      
      const response = await fetch(`${this.baseUrl}/approval-workflows/${workflowId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete workflow');
      }

      console.log('✅ Workflow deleted from MongoDB');
    } catch (error) {
      console.error('❌ Error deleting workflow from MongoDB:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const approvalWorkflowServiceMongoDB = new ApprovalWorkflowServiceMongoDB();
export default approvalWorkflowServiceMongoDB;
