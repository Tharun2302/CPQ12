// Authentication types for the CPQ application

export type AuthProvider = 'email' | 'microsoft';

export interface User {
  id: string;
  name: string;
  email: string;
  provider: AuthProvider;
  createdAt: string;
  /** Role for permissions; e.g. 'viewer' | 'exhibit_admin'. Only exhibit_admin can add/edit/delete exhibits. */
  role?: string;
  /** True if the user can edit Team Approval Settings and manage the approval-admin list. Computed server-side. */
  isApprovalAdmin?: boolean;
  /** True if the user can use Edit for RedLine on any agreement. Server-computed hint; the server re-checks. */
  isRedlineAdmin?: boolean;
  /** True if the Documents page lists every document instead of only the user's own. Server-computed hint. */
  isDocumentAdmin?: boolean;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loginWithMicrosoft: () => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}
