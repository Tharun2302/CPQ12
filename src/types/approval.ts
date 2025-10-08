export interface ApprovalWorkflow {
  id: string;
  documentId: string;
  documentType: string;
  clientName: string;
  amount: number;
  status: 'pending' | 'approved' | 'denied' | 'in_progress';
  currentStep: number;
  totalSteps: number;
  workflowSteps: ApprovalStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalStep {
  step: number;
  role: string;
  email: string;
  status: 'pending' | 'approved' | 'denied';
  comments?: string;
  timestamp?: string;
}

export interface ApprovalWorkflowState {
  workflows: ApprovalWorkflow[];
  isLoading: boolean;
  error: string | null;
}
