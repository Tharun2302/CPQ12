export type TechSignInReason =
  | 'NOT_SIGNED_IN'
  | 'NOT_VERIFIED'
  | 'WRONG_TENANT'
  | 'NOT_ON_LIST'
  | 'NOT_CONFIGURED';

export interface TechSignInStatus {
  success?: boolean;
  signedIn: boolean;
  verified: boolean;
  allowed: boolean;
  enforced: boolean;
  name?: string;
  email?: string;
  reason?: TechSignInReason;
}

export const TECH_SIGNIN_ERROR_CODES = ['TECH_SIGNIN_REQUIRED', 'TECH_NOT_AUTHORIZED'];

export function describeIdentity(status: Pick<TechSignInStatus, 'name' | 'email'>): string {
  if (status.name && status.email) return `${status.name} (${status.email})`;
  return status.email || status.name || 'an unknown account';
}

export function techSignInReasonMessage(status: TechSignInStatus): string {
  switch (status.reason) {
    case 'NOT_ON_LIST':
      return `You're signed in as ${describeIdentity(status)}, but you're not on the Technical approver list.`;
    case 'NOT_VERIFIED':
      return 'We could not verify your Microsoft sign-in. Please sign in again with Microsoft.';
    case 'WRONG_TENANT':
      return 'This Microsoft account is not part of CloudFuze. Please sign in with your CloudFuze account.';
    case 'NOT_CONFIGURED':
      return 'Technical approvers have not been configured yet. Please contact your administrator.';
    default:
      return 'Sign in with your CloudFuze Microsoft account to review and approve this request.';
  }
}

// Lets the portal show the server's explanation instead of a generic "failed" alert
export function techSignInErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const { code } = error as Error & { code?: string };
  return code && TECH_SIGNIN_ERROR_CODES.includes(code) ? error.message : null;
}
