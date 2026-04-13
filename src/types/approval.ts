export interface ApprovalWorkflow {
  id: string;
  documentId: string;
  documentType: string;
  clientName: string;
  amount: number;
  // Email address of the user who initiated the workflow
  creatorEmail?: string;
  // Display name of the user who requested the approval (e.g. for "Requested by" in emails and dashboards)
  creatorName?: string;
  // Optional flag to indicate special handling (e.g. overage agreement workflows)
  isOverage?: boolean;
  // E-sign document id when agreement was sent via "Add e-sign fields first" flow
  esignDocumentId?: string;
  // Auto-reminder: number of days between reminder emails (0 or undefined = disabled)
  reminderDays?: number;
  // ISO timestamp of the last auto-reminder sent (null = never sent)
  lastReminderSentAt?: string | null;
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
