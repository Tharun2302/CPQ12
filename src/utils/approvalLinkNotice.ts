import type { ApprovalStep, ApprovalWorkflow } from '../types/approval';

export type ApprovalLinkRole = 'Team Approval' | 'Technical Team' | 'Legal Team';

export interface ApprovalLinkNotice {
  tone: 'approved' | 'denied';
  message: string;
}

const ROLE_LABELS: Record<string, string> = { 'Team Approval': 'Team Lead' };

const labelFor = (role: string) => ROLE_LABELS[role] ?? role;

// actedBy is recorded only from a verified sign-in, so older steps and shared mailboxes name just the team
function byWhom(step: ApprovalStep): string {
  const actor = step.actedBy?.name || step.actedBy?.email;
  return `the ${labelFor(step.role)}${actor ? ` (${actor})` : ''}`;
}

// Approvers only deny through their own step, so a denied workflow with no denied step was cancelled by the requester
export const APPROVAL_CANCELLED_MESSAGE = 'This approval was cancelled by the requester.';

// The portal link already passed its token check, so a missing workflow was deleted after the email went out
export const APPROVAL_DELETED_NOTICE: ApprovalLinkNotice = {
  tone: 'denied',
  message: 'This approval request was deleted by the requester.',
};

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
    return { tone: 'approved', message: `This document is already approved by ${byWhom(ownStep)}${onDate(ownStep.timestamp)}.` };
  }
  if (ownStep?.status === 'denied') {
    return { tone: 'denied', message: `This document was already denied by ${byWhom(ownStep)}${onDate(ownStep.timestamp)}.` };
  }
  if (workflow.status === 'denied') {
    const deniedStep = steps.find(step => step.status === 'denied');
    const message = deniedStep
      ? `This document was denied by ${byWhom(deniedStep)}${onDate(deniedStep.timestamp)}.`
      : APPROVAL_CANCELLED_MESSAGE;
    return { tone: 'denied', message };
  }
  if (workflow.status === 'approved') {
    return { tone: 'approved', message: 'This document is already approved.' };
  }
  return null;
}
