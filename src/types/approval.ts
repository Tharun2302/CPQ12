export interface ApprovalWorkflow {
  id: string;
  documentId: string;
  documentType: string;
  clientName: string;
  amount: number;
  // Email address of the user who initiated the workflow
  creatorEmail?: string;
  // Optional flag to indicate special handling (e.g. overage agreement workflows)
  isOverage?: boolean;
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
  // For Team Approval: SMB/AM/ENT label (or other step-specific info)
  group?: string;
  comments?: string;
  timestamp?: string;
}

export interface ApprovalWorkflowState {
  workflows: ApprovalWorkflow[];
  isLoading: boolean;
  error: string | null;
}
