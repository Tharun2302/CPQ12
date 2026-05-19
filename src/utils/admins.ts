// Approval-admin helpers.
//
// Admin status is computed server-side (combining a hardcoded bootstrap list,
// the APPROVAL_ADMIN_EMAILS env var, and the DB settings list) and attached to
// the logged-in user as `isApprovalAdmin` in /api/auth/login and /api/auth/me.
//
// To manage the admin list at runtime, use the Approval Admins button on the
// Approval page (mirrors the Exhibits Admins UI). For local bootstrap, edit
// DEFAULT_APPROVAL_ADMINS in server.cjs.

import { getCurrentUser } from './authUtils';

export const isAdmin = (_email?: string | null): boolean => {
  const user = getCurrentUser();
  return Boolean((user as any)?.isApprovalAdmin);
};
