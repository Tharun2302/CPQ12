import type { ApprovalStep, ApprovalWorkflow } from '../types/approval';

export type ApprovalLinkRole = 'Team Approval' | 'Technical Team' | 'Legal Team';

export interface ApprovalLinkNotice {
  tone: 'approved' | 'denied';
  message: string;
}

const ROLE_LABELS: Record<string, string> = { 'Team Approval': 'Team Lead' };

const labelFor = (role: string) => ROLE_LABELS[role] ?? role;

function onDate(timestamp?: string): string {
  const date = timestamp ? new Date(timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const formatted = date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return ` on ${formatted}`;
}

/** Explains why an approval email link no longer offers Approve/Deny, or null when this role can still act. */
export function getApprovalLinkNotice(
  workflow: Pick<ApprovalWorkflow, 'status' | 'workflowSteps'> | null | undefined,
  role: ApprovalLinkRole
): ApprovalLinkNotice | null {
  if (!workflow || !Array.isArray(workflow.workflowSteps)) return null;
  const steps: ApprovalStep[] = workflow.workflowSteps;

  const ownStep = steps.find(step => step.role === role);
  if (ownStep?.status === 'approved') {
    return { tone: 'approved', message: `This document is already approved by the ${labelFor(role)}${onDate(ownStep.timestamp)}.` };
  }
  if (ownStep?.status === 'denied') {
    return { tone: 'denied', message: `This document was already denied by the ${labelFor(role)}${onDate(ownStep.timestamp)}.` };
  }
  if (workflow.status === 'denied') {
    const deniedStep = steps.find(step => step.status === 'denied');
    const message = deniedStep
      ? `This document was denied by the ${labelFor(deniedStep.role)}${onDate(deniedStep.timestamp)}.`
      : 'This document was denied.';
    return { tone: 'denied', message };
  }
  if (workflow.status === 'approved') {
    return { tone: 'approved', message: 'This document is already approved.' };
  }
  return null;
}
