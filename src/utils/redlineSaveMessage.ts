// Wording shown after "Edit for RedLine" saves, shared by the Approval dashboard and Documents page.
export interface RedlineSaveResult {
  updatedDuringApproval?: boolean;
  notifiedApprover?: { role?: string } | null;
}

const ROLE_LABELS: Record<string, string> = {
  'Team Approval': 'Team Lead',
  'Technical Team': 'Tech',
  'Legal Team': 'Legal',
};

function roleLabel(roles: string): string {
  return roles.split(', ').map(r => ROLE_LABELS[r] || r).join(', ');
}

export function redlineSaveMessage(result: RedlineSaveResult): string {
  if (!result.updatedDuringApproval) return 'Redline saved — document updated';
  const base = 'Document updated — the remaining approvers will review the new version.';
  const role = result.notifiedApprover?.role;
  if (role) return `${base} An email with the new version is on its way to ${roleLabel(role)}.`;
  return `${base} No email was sent to the current approver because no email address is saved for that step.`;
}
